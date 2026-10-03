use super::{config::Configuration, constants::*, evidence::CriterionResult, plan::*};
use crate::{Error, Result};
use orly_decision::{DecisionEnvelope, Question};
use orly_fs::digest::ContentDigest;
use std::collections::{BTreeMap, BTreeSet};
pub struct PlanCompiler<'a> {
    pub configuration: &'a Configuration,
    pub snapshot: &'a str,
    pub facts: &'a BTreeMap<String, bool>,
    pub questions: &'a BTreeMap<String, Question>,
    pub decisions: &'a BTreeMap<String, DecisionEnvelope>,
    pub capabilities: &'a BTreeSet<String>,
    pub pack_digests: &'a BTreeMap<String, String>,
    pub question_inputs: &'a BTreeMap<String, String>,
}

impl PlanCompiler<'_> {
    pub fn compile(&self, policy: &Policy) -> Result<DecisionPlan> {
        let config = self.configuration;
        let snapshot = self.snapshot;
        let decisions = self.decisions;
        config.validate()?;
        self.validate_decisions()?;
        if policy.version != WIRE_VERSION || policy.nodes.len() > MAX_PLAN_NODES {
            return Err(Error::Invalid(
                "policy version or node budget invalid".into(),
            ));
        }
        let sorted = policy.ordered_nodes()?;
        let mut nodes = vec![
            PlanNode::safety(SNAPSHOT_CHECK),
            PlanNode::safety(PAYLOAD_CHECK),
        ];
        for node in sorted {
            if [SNAPSHOT_CHECK, PAYLOAD_CHECK].contains(&node.id.as_str()) {
                return Err(Error::Invalid(
                    "core safety identity cannot be overridden".into(),
                ));
            }
            let action = self.compile_action(node)?;
            let mut dependencies = node.dependencies.clone();
            dependencies.extend([SNAPSHOT_CHECK.into(), PAYLOAD_CHECK.into()]);
            nodes.push(PlanNode {
                id: node.id.clone(),
                dependencies,
                required: node.required && !matches!(node.action, Action::Select { .. }),
                action,
            });
        }
        let mut plan = DecisionPlan {
            version: WIRE_VERSION,
            snapshot_digest: snapshot.into(),
            configuration_digest: config.digest()?,
            policy_digest: ContentDigest::identity(policy)?,
            decisions_digest: ContentDigest::identity(decisions)?,
            pack_digests: self.pack_digests.to_owned(),
            nodes,
            digest: String::new(),
        };
        plan.digest = plan.compute_digest()?;
        Ok(plan)
    }
}

impl PlanNode {
    fn safety(id: &str) -> Self {
        Self {
            id: id.into(),
            dependencies: BTreeSet::new(),
            required: true,
            action: CompiledAction::Check {
                capability: id.into(),
            },
        }
    }
}

impl PlanCompiler<'_> {
    fn validate_decisions(&self) -> Result<()> {
        for (identity, question) in self.questions {
            question.validate()?;
            if identity != &question.id {
                return Err(Error::Invalid(UNKNOWN_QUESTION.into()));
            }
        }
        for (identity, envelope) in self.decisions {
            let question = self
                .questions
                .get(identity)
                .ok_or_else(|| Error::Invalid(UNKNOWN_QUESTION.into()))?;
            let input = self
                .question_inputs
                .get(identity)
                .ok_or_else(|| Error::Invalid(MISSING_QUESTION_INPUT.into()))?;
            envelope.validate(question, input)?;
        }
        Ok(())
    }
    fn compile_action(&self, node: &PolicyNode) -> Result<CompiledAction> {
        let facts = self.facts;
        let questions = self.questions;
        let decisions = self.decisions;
        let capabilities = self.capabilities;
        match &node.action {
            Action::Command { command_id } => self.command_action(command_id),
            Action::Check { capability, inputs } => {
                if !capabilities.contains(capability) {
                    return Err(Error::Invalid("unknown exact capability".into()));
                }
                if inputs.iter().any(|input| facts.get(input) != Some(&true)) {
                    return Ok(CompiledAction::Resolved {
                        result: CriterionResult::failed(REQUIRED_INPUT_MISSING),
                    });
                }
                Ok(CompiledAction::Check {
                    capability: capability.clone(),
                })
            }
            Action::Select {
                question_id,
                condition,
                on_true,
                on_false,
            } => {
                self.command_action(on_true)?;
                self.command_action(on_false)?;
                let question = questions
                    .get(question_id)
                    .ok_or_else(|| Error::Invalid(UNKNOWN_QUESTION.into()))?;
                condition.validate(question)?;
                let Some(envelope) = decisions.get(question_id) else {
                    return Ok(CompiledAction::Unresolved {
                        question_id: question_id.clone(),
                    });
                };
                match condition.evaluate(&envelope.answer)? {
                    Some(true) => self.command_action(on_true),
                    Some(false) => self.command_action(on_false),
                    None => Ok(CompiledAction::Unresolved {
                        question_id: question_id.clone(),
                    }),
                }
            }
        }
    }
    fn command_action(&self, id: &str) -> Result<CompiledAction> {
        if !self.configuration.commands.contains_key(id) {
            return Err(Error::Invalid("unknown command identifier".into()));
        }
        Ok(CompiledAction::Command {
            command_id: id.into(),
        })
    }
}

impl Policy {
    fn ordered_nodes(&self) -> Result<Vec<&PolicyNode>> {
        let mut graph = petgraph::graph::DiGraph::new();
        let mut indices = BTreeMap::new();
        let mut ordered: Vec<_> = self.nodes.iter().collect();
        ordered.sort_by(|a, b| a.id.cmp(&b.id));
        for node in &ordered {
            if node.id.is_empty()
                || indices
                    .insert(node.id.as_str(), graph.add_node(*node))
                    .is_some()
            {
                return Err(Error::Invalid(INVALID_PLAN_NODE.into()));
            }
        }
        for node in &ordered {
            for dependency in &node.dependencies {
                let source = indices
                    .get(dependency.as_str())
                    .ok_or_else(|| Error::Invalid(UNKNOWN_PLAN_DEPENDENCY.into()))?;
                graph.add_edge(*source, indices[node.id.as_str()], ());
            }
        }
        petgraph::algo::toposort(&graph, None)
            .map(|indices| indices.into_iter().map(|index| graph[index]).collect())
            .map_err(|_| Error::Invalid(CYCLIC_PLAN.into()))
    }
}
