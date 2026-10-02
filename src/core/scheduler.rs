use super::{
    config::CommandSpec,
    constants::{MAX_COMMAND_PARALLELISM, UNAVAILABLE_CODE},
    evidence::{CriterionResult, EvidencePacket},
    execution::EvaluationContext,
    plan::*,
    runner::{CommandRunner, Execution},
};
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use orly_fs::path::ResourceId;
use std::collections::{BTreeMap, BTreeSet};

#[path = "scheduler_graph.rs"]
mod graph;

pub struct PlanExecutor<'a> {
    context: &'a EvaluationContext,
    runner: &'a dyn CommandRunner,
}
impl<'a> PlanExecutor<'a> {
    pub fn new(context: &'a EvaluationContext, runner: &'a dyn CommandRunner) -> Self {
        Self { context, runner }
    }
    pub fn batches<'p>(&self, plan: &'p DecisionPlan) -> Result<Vec<Vec<&'p str>>> {
        self.schedule(plan, |_| {})
    }
    #[cfg(feature = "test-util")]
    pub fn batches_observed<'p>(
        &self,
        plan: &'p DecisionPlan,
        observe: impl FnMut(&str),
    ) -> Result<Vec<Vec<&'p str>>> {
        self.schedule(plan, observe)
    }
    fn schedule<'p>(
        &self,
        plan: &'p DecisionPlan,
        mut observe: impl FnMut(&str),
    ) -> Result<Vec<Vec<&'p str>>> {
        graph::BatchSchedule::new(self, plan, &mut observe)?.run(&mut observe)
    }
    fn resources(&self, node: &PlanNode) -> Result<Option<&'a BTreeSet<ResourceId>>> {
        match &node.action {
            CompiledAction::Command { command_id } => self
                .context
                .configuration
                .commands
                .get(command_id)
                .map(|command| Some(&command.resources))
                .ok_or_else(|| Error::Invalid("unknown command".into())),
            _ => Ok(None),
        }
    }
    fn execute_batch<'p>(
        &self,
        work: Vec<(&'p str, String, &'p CommandSpec)>,
    ) -> Result<Vec<(Vec<&'p str>, String, Execution)>> {
        let mut unique: BTreeMap<String, (Vec<&str>, &CommandSpec)> = BTreeMap::new();
        for (id, key, spec) in work {
            unique
                .entry(key)
                .or_insert_with(|| (Vec::new(), spec))
                .0
                .push(id);
        }
        std::thread::scope(|scope| {
            let handles: Vec<_> = unique
                .into_iter()
                .map(|(key, (ids, spec))| {
                    scope.spawn(move || {
                        self.runner
                            .run(self.context, spec)
                            .map(|run| (ids, key, run))
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| {
                    handle
                        .join()
                        .map_err(|_| Error::Invalid("command thread panicked".into()))?
                })
                .collect()
        })
    }
    fn resolve(&self, node: &PlanNode) -> Result<CriterionResult> {
        let context = self.context;
        match &node.action {
            CompiledAction::Check { capability } if capability == SNAPSHOT_CHECK => {
                context.validate_current()?;
                Ok(CriterionResult::passed(CHECK_PASSED))
            }
            CompiledAction::Check { capability } if capability == PAYLOAD_CHECK => {
                super::payload::Payload::embedded()?.validate()?;
                Ok(CriterionResult::passed(CHECK_PASSED))
            }
            CompiledAction::Check { capability } => context
                .capabilities
                .check(capability)
                .map(|check| check.evaluate(context))
                .unwrap_or_else(|| Ok(CriterionResult::failed(UNAVAILABLE_CODE))),
            CompiledAction::Resolved { result } => Ok(result.to_owned()),
            CompiledAction::Unresolved { .. } => Ok(CriterionResult::reported(SEMANTIC_UNRESOLVED)),
            CompiledAction::Command { .. } => Err(Error::Invalid("command requires runner".into())),
        }
    }
}

impl PlanExecutor<'_> {
    pub fn run(&self, plan: &DecisionPlan) -> Result<EvidencePacket> {
        let context = self.context;
        context.validate_current()?;
        plan.validate(
            &context.snapshot.digest()?,
            &context.configuration.digest()?,
        )?;
        let mut state = ExecutionState {
            executor: self,
            nodes: plan
                .nodes
                .iter()
                .map(|node| (node.id.as_str(), node))
                .collect(),
            evidence: EvidencePacket::new(
                plan.snapshot_digest.to_owned(),
                plan.configuration_digest.to_owned(),
            ),
            cache: BTreeMap::new(),
        };
        state.evidence.required.extend(
            plan.nodes
                .iter()
                .filter(|node| node.required)
                .map(|node| node.id.to_owned()),
        );
        for batch in self.batches(plan)? {
            state.run_batch(batch)?;
        }
        Ok(state.evidence)
    }
}

struct ExecutionState<'a> {
    executor: &'a PlanExecutor<'a>,
    nodes: BTreeMap<&'a str, &'a PlanNode>,
    evidence: EvidencePacket,
    cache: BTreeMap<String, CriterionResult>,
}
impl<'a> ExecutionState<'a> {
    fn run_batch(&mut self, batch: Vec<&'a str>) -> Result<()> {
        let mut work = Vec::new();
        for id in batch {
            let node = self
                .nodes
                .get(id)
                .ok_or_else(|| Error::Invalid("missing planned node".into()))?;
            if node.dependencies.iter().any(|d| {
                !matches!(
                    self.evidence.results.get(d),
                    Some(CriterionResult::Passed { .. })
                )
            }) {
                let result = if node.required {
                    CriterionResult::failed(DEPENDENCY_BLOCKED)
                } else {
                    CriterionResult::reported(DEPENDENCY_BLOCKED)
                };
                self.evidence.results.insert(id.to_owned(), result);
                continue;
            }
            match &node.action {
                CompiledAction::Command { command_id } => {
                    let spec = &self.executor.context.configuration.commands[command_id];
                    let key = ContentDigest::identity(spec)?;
                    if let Some(result) = self.cache.get(&key) {
                        self.record(id, result.to_owned());
                    } else {
                        work.push((id, key, spec));
                    }
                }
                _ => self.record(id, self.executor.resolve(node)?),
            }
        }
        for (ids, key, execution) in self.executor.execute_batch(work)? {
            for id in ids {
                self.record(id, execution.invocation.result.to_owned());
            }
            self.cache
                .insert(key, execution.invocation.result.to_owned());
            self.evidence.invocations.insert(
                execution.invocation.identity.to_owned(),
                execution.invocation,
            );
        }
        Ok(())
    }
    fn record(&mut self, id: &str, result: CriterionResult) {
        self.evidence.results.insert(id.to_owned(), result);
    }
}
