use crate::support::Repository;
use orly::{
    Error, Result,
    core::{
        constants::WIRE_VERSION,
        plan::{Action, CompiledAction, Condition, PlanCompiler, Policy, PolicyNode},
    },
};
use orly_decision::{Answer, DecisionEnvelope, Question};
use std::collections::{BTreeMap, BTreeSet};

struct Planning;
impl Planning {
    fn node(id: &str, dependency: Option<&str>) -> PolicyNode {
        PolicyNode {
            id: id.into(),
            dependencies: dependency.into_iter().map(str::to_owned).collect(),
            required: true,
            action: Action::Command {
                command_id: "conform".into(),
            },
        }
    }
    fn question() -> Question {
        Question {
            primitive: orly_decision::Primitive::Choice {},
            id: "project.test.choice".into(),
            version: "1.0.0".into(),
            builder: "project.files".into(),
            builder_version: "1.0.0".into(),
            model_version: "fixture-model".into(),
            candidates: vec!["a".into(), "b".into()],
            rule_section: "docs/rules.md#choice".into(),
        }
    }
    fn semantic_policy(id: &str) -> Policy {
        Policy {
            version: WIRE_VERSION,
            nodes: vec![PolicyNode {
                id: "semantic".into(),
                dependencies: BTreeSet::new(),
                required: true,
                action: Action::Select {
                    question_id: id.into(),
                    condition: Condition::Choice {
                        candidate: "a".into(),
                        threshold: 0.8,
                    },
                    on_true: "conform".into(),
                    on_false: "verify.unit".into(),
                },
            }],
        }
    }
    fn answer(question: &Question) -> DecisionEnvelope {
        DecisionEnvelope {
            version: WIRE_VERSION,
            question_id: question.id.clone(),
            question_version: question.version.clone(),
            builder_version: question.builder_version.clone(),
            model_version: question.model_version.clone(),
            input_digest: "snapshot".into(),
            assessment_id: "recorded-answer".into(),
            answer: Answer::Choice {
                probabilities: BTreeMap::from([("a".into(), 0.9), ("b".into(), 0.1)]),
            },
        }
    }
}

#[test]
fn test_decision_plan_reducer_is_replayable_and_acyclic() -> Result<()> {
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let policy = Policy {
        version: WIRE_VERSION,
        nodes: vec![
            Planning::node("second", Some("first")),
            Planning::node("first", None),
        ],
    };
    let compile = |policy: &Policy| {
        PlanCompiler {
            configuration: &config,
            snapshot: "snapshot",
            facts: &BTreeMap::new(),
            questions: &BTreeMap::new(),
            decisions: &BTreeMap::new(),
            capabilities: &BTreeSet::new(),
            pack_digests: &BTreeMap::new(),
            question_inputs: &BTreeMap::new(),
        }
        .compile(policy)
    };
    assert_eq!(compile(&policy)?.digest, compile(&policy)?.digest);
    let cycle = Policy {
        version: WIRE_VERSION,
        nodes: vec![
            Planning::node("a", Some("b")),
            Planning::node("b", Some("a")),
        ],
    };
    assert!(matches!(compile(&cycle), Err(Error::Invalid(_))));
    let unknown = Policy {
        version: WIRE_VERSION,
        nodes: vec![Planning::node("a", Some("absent"))],
    };
    assert!(matches!(compile(&unknown), Err(Error::Invalid(_))));
    let mut unknown_command = Planning::node("a", None);
    unknown_command.action = Action::Command {
        command_id: "not-declared".into(),
    };
    assert!(matches!(
        compile(&Policy {
            version: WIRE_VERSION,
            nodes: vec![unknown_command]
        }),
        Err(Error::Invalid(_))
    ));
    Ok(())
}

#[test]
fn configuration_refuses_recursive_engine_commands() -> Result<()> {
    for executable in ["orly", "/tmp/orly-0.12.0"] {
        assert!(matches!(
            Repository::configuration(Repository::command(&[executable, "gate", "work"])),
            Err(Error::Invalid(_))
        ));
    }
    #[cfg(windows)]
    for executable in ["orly.exe", "ORLY", "ORLY.EXE", "C:\\tools\\OrLy-0.12.0.ExE"] {
        assert!(matches!(
            Repository::configuration(Repository::command(&[executable, "gate", "work"])),
            Err(Error::Invalid(reason)) if reason == "command re-enters its own engine"
        ));
    }
    for executable in ["cargo", "ordinary.exe", "orlytool"] {
        Repository::configuration(Repository::command(&[executable]))?;
    }
    Ok(())
}

#[test]
fn semantic_answers_replay_and_missing_answers_leave_partial_plans() -> Result<()> {
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let question = Planning::question();
    let id = question.id.to_owned();
    let questions = BTreeMap::from([(id.to_owned(), question)]);
    let policy = Planning::semantic_policy(&id);
    let compile = |snapshot: &str, decisions: &BTreeMap<String, DecisionEnvelope>| {
        PlanCompiler {
            configuration: &config,
            snapshot,
            facts: &BTreeMap::new(),
            questions: &questions,
            decisions,
            capabilities: &BTreeSet::new(),
            pack_digests: &BTreeMap::new(),
            question_inputs: &BTreeMap::from([(id.clone(), snapshot.into())]),
        }
        .compile(&policy)
    };
    let unresolved = compile("snapshot", &BTreeMap::new())?;
    assert!(
        matches!(&unresolved.nodes.last().unwrap().action,CompiledAction::Unresolved {question_id} if question_id == &id)
    );
    assert!(!unresolved.nodes.last().unwrap().required);
    let envelope = Planning::answer(&questions[&id]);
    let decisions = BTreeMap::from([(id.clone(), envelope)]);
    let replay = compile("snapshot", &decisions)?;
    assert!(
        matches!(&replay.nodes.last().unwrap().action,CompiledAction::Command {command_id} if command_id == "conform")
    );
    assert!(matches!(compile("changed", &decisions), Err(Error::Stale)));
    Ok(())
}
