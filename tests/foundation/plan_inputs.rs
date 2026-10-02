use crate::support::Repository;
use orly::{
    Error, Result,
    core::{
        config::Configuration,
        constants::{MAX_PLAN_NODES, WIRE_VERSION},
        plan::{
            Action, CompiledAction, Condition, DecisionPlan, PlanCompiler, Policy, PolicyNode,
            SNAPSHOT_CHECK,
        },
    },
};
use orly_decision::{Answer, DecisionEnvelope, Primitive, Question};
use std::collections::{BTreeMap, BTreeSet};

const QUESTION: &str = "project.test.choice";
const SNAPSHOT: &str = "captured-snapshot";

struct PlanFixture {
    configuration: Configuration,
    questions: BTreeMap<String, Question>,
    decisions: BTreeMap<String, DecisionEnvelope>,
    inputs: BTreeMap<String, String>,
}
impl PlanFixture {
    fn new() -> Result<Self> {
        let question = Question {
            primitive: Primitive::Choice {},
            id: QUESTION.into(),
            version: "1.0.0".into(),
            builder: "project.files".into(),
            builder_version: "1.0.0".into(),
            model_version: "fixture-model".into(),
            candidates: vec!["a".into(), "b".into()],
            rule_section: "docs/rules.md#choice".into(),
        };
        let answer = DecisionEnvelope {
            version: WIRE_VERSION,
            question_id: QUESTION.into(),
            question_version: "1.0.0".into(),
            builder_version: "1.0.0".into(),
            model_version: "fixture-model".into(),
            input_digest: SNAPSHOT.into(),
            assessment_id: "recorded-answer".into(),
            answer: Answer::Choice {
                probabilities: BTreeMap::from([("a".into(), 0.9), ("b".into(), 0.1)]),
            },
        };
        Ok(Self {
            configuration: Repository::configuration(Repository::command(&["/usr/bin/true"]))?,
            questions: BTreeMap::from([(QUESTION.into(), question)]),
            decisions: BTreeMap::from([(QUESTION.into(), answer)]),
            inputs: BTreeMap::from([(QUESTION.into(), SNAPSHOT.into())]),
        })
    }
    fn compile(&self) -> Result<DecisionPlan> {
        PlanCompiler {
            configuration: &self.configuration,
            snapshot: SNAPSHOT,
            facts: &BTreeMap::new(),
            questions: &self.questions,
            decisions: &self.decisions,
            capabilities: &BTreeSet::new(),
            pack_digests: &BTreeMap::new(),
            question_inputs: &self.inputs,
        }
        .compile(&Policy {
            version: WIRE_VERSION,
            nodes: vec![PolicyNode {
                id: "job".into(),
                dependencies: BTreeSet::new(),
                required: true,
                action: Action::Command {
                    command_id: "conform".into(),
                },
            }],
        })
    }
    fn validate(&self, plan: &DecisionPlan) -> Result<()> {
        plan.validate(SNAPSHOT, &self.configuration.digest()?)
    }
}

#[test]
fn resealed_imported_plans_refuse_invalid_graphs_and_limits() -> Result<()> {
    let fixture = PlanFixture::new()?;
    let valid = fixture.compile()?;
    fixture.validate(&valid)?;
    for fault in [
        "version",
        "empty",
        "duplicate",
        "unknown",
        "cycle",
        "budget",
    ] {
        let mut plan = valid.clone();
        match fault {
            "version" => plan.version += 1,
            "empty" => plan.nodes.last_mut().unwrap().id.clear(),
            "duplicate" => plan.nodes.push(plan.nodes.last().unwrap().clone()),
            "unknown" => {
                plan.nodes
                    .last_mut()
                    .unwrap()
                    .dependencies
                    .insert("absent".into());
            }
            "cycle" => {
                plan.nodes
                    .last_mut()
                    .unwrap()
                    .dependencies
                    .insert("job".into());
            }
            "budget" => {
                let node = plan.nodes.last().unwrap().clone();
                for index in 0..MAX_PLAN_NODES {
                    let mut extra = node.clone();
                    extra.id = format!("extra-{index}");
                    plan.nodes.push(extra);
                }
            }
            _ => unreachable!(),
        }
        plan.digest = plan.compute_digest()?;
        assert!(
            matches!(fixture.validate(&plan), Err(Error::Invalid(_))),
            "{fault}"
        );
    }
    Ok(())
}

#[test]
fn resealed_imported_plans_cannot_remove_or_replace_core_safety() -> Result<()> {
    let fixture = PlanFixture::new()?;
    for fault in ["missing", "optional", "action", "prerequisite", "bypass"] {
        let mut plan = fixture.compile()?;
        let index = plan
            .nodes
            .iter()
            .position(|node| node.id == SNAPSHOT_CHECK)
            .unwrap();
        match fault {
            "missing" => {
                plan.nodes.remove(index);
            }
            "optional" => plan.nodes[index].required = false,
            "action" => {
                plan.nodes[index].action = CompiledAction::Command {
                    command_id: "conform".into(),
                }
            }
            "prerequisite" => {
                plan.nodes[index].dependencies.insert("job".into());
            }
            "bypass" => {
                plan.nodes
                    .last_mut()
                    .unwrap()
                    .dependencies
                    .remove(SNAPSHOT_CHECK);
            }
            _ => unreachable!(),
        }
        plan.digest = plan.compute_digest()?;
        assert!(
            matches!(fixture.validate(&plan), Err(Error::Invalid(_))),
            "{fault}"
        );
    }
    Ok(())
}

#[test]
fn valid_plan_identity_refuses_changed_inputs_and_unsealed_edits() -> Result<()> {
    let fixture = PlanFixture::new()?;
    let mut plan = fixture.compile()?;
    assert!(matches!(
        plan.validate("different", &fixture.configuration.digest()?),
        Err(Error::Stale)
    ));
    assert!(matches!(
        plan.validate(SNAPSHOT, "different"),
        Err(Error::Stale)
    ));
    plan.nodes.last_mut().unwrap().required = false;
    assert!(matches!(fixture.validate(&plan), Err(Error::Stale)));
    Ok(())
}

#[test]
fn unused_supplied_decisions_are_validated_before_plan_identity_is_computed() -> Result<()> {
    for fault in [
        "unknown",
        "missing-input",
        "stale",
        "empty-assessment",
        "candidate",
        "primitive",
        "nonfinite",
    ] {
        let mut fixture = PlanFixture::new()?;
        match fault {
            "unknown" => {
                let envelope = fixture.decisions.remove(QUESTION).unwrap();
                fixture.decisions.insert("project.absent".into(), envelope);
            }
            "missing-input" => {
                fixture.inputs.clear();
            }
            "stale" => {
                fixture.decisions.get_mut(QUESTION).unwrap().input_digest = "different".into()
            }
            "empty-assessment" => fixture
                .decisions
                .get_mut(QUESTION)
                .unwrap()
                .assessment_id
                .clear(),
            "candidate" => {
                fixture.decisions.get_mut(QUESTION).unwrap().answer = Answer::Choice {
                    probabilities: BTreeMap::from([("undeclared".into(), 1.0)]),
                }
            }
            "primitive" => {
                fixture.decisions.get_mut(QUESTION).unwrap().answer = Answer::Noul {
                    probabilities: BTreeMap::from([("a".into(), 0.9), ("b".into(), 0.1)]),
                }
            }
            "nonfinite" => {
                fixture.decisions.get_mut(QUESTION).unwrap().answer = Answer::Choice {
                    probabilities: BTreeMap::from([("a".into(), f64::NAN), ("b".into(), 0.1)]),
                }
            }
            _ => unreachable!(),
        }
        assert!(fixture.compile().is_err(), "unused decision: {fault}");
    }
    Ok(())
}

#[test]
fn registered_questions_require_valid_content_and_matching_map_identity() -> Result<()> {
    for fault in ["identity", "version", "candidates"] {
        let mut fixture = PlanFixture::new()?;
        fixture.decisions.clear();
        let question = fixture.questions.get_mut(QUESTION).unwrap();
        match fault {
            "identity" => question.id = "project.other".into(),
            "version" => question.version = "invalid".into(),
            "candidates" => question.candidates.push("a".into()),
            _ => unreachable!(),
        }
        assert!(fixture.compile().is_err(), "{fault}");
    }
    Ok(())
}

#[test]
fn direct_condition_evaluation_refuses_invalid_probabilities() -> Result<()> {
    let condition = Condition::Choice {
        candidate: "a".into(),
        threshold: 0.8,
    };
    for probability in [f64::NAN, f64::INFINITY, -0.1, 1.1] {
        let answer = Answer::Choice {
            probabilities: BTreeMap::from([
                ("a".into(), probability),
                ("b".into(), 1.0 - probability),
            ]),
        };
        assert!(matches!(
            condition.evaluate(&answer),
            Err(Error::Invalid(_))
        ));
    }
    Ok(())
}
