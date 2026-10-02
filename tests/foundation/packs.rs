use crate::support::Repository;
use orly::{
    Error, Result,
    checks::Check,
    core::{
        config::Configuration,
        constants::WIRE_VERSION,
        document::ObjectDocument,
        evidence::CriterionResult,
        execution::EvaluationContext,
        packs::{DataPack, PackRegistry},
        plan::{Action, CompiledAction, Condition, PlanCompiler, Policy, PolicyNode},
        runner::NativeRunner,
        scheduler::PlanExecutor,
    },
};
use orly_decision::{Answer, DecisionEnvelope, Primitive, Question};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

struct Presence {
    identity: String,
}
impl Check for Presence {
    fn identity(&self) -> &str {
        &self.identity
    }
    fn evaluate(&self, context: &EvaluationContext) -> Result<CriterionResult> {
        Ok(if context.snapshot.files().is_empty() {
            CriterionResult::failed("no_captured_files")
        } else {
            CriterionResult::passed("captured_files_present")
        })
    }
}

fn recipe_pack() -> DataPack {
    let question = Question {
        primitive: Primitive::Choice {},
        id: "project.recipe.choice".into(),
        version: "1.0.0".into(),
        builder: "project.recipe.files".into(),
        builder_version: "1.0.0".into(),
        model_version: "fixture-model".into(),
        candidates: vec!["a".into(), "b".into()],
        rule_section: "source.txt#recipe".into(),
    };
    DataPack {
        id: "project.recipe".into(),
        version: "1.0.0".into(),
        engine_requirement: "^0.12".into(),
        selectors: BTreeMap::from([(question.builder.to_owned(), "*.txt".into())]),
        questions: vec![question.to_owned()],
        capabilities: BTreeSet::new(),
        policy: Policy {
            version: WIRE_VERSION,
            nodes: vec![PolicyNode {
                id: "recipe".into(),
                dependencies: BTreeSet::new(),
                required: false,
                action: Action::Select {
                    question_id: question.id.to_owned(),
                    condition: Condition::Choice {
                        candidate: "a".into(),
                        threshold: 0.8,
                    },
                    on_true: "conform".into(),
                    on_false: "verify.unit".into(),
                },
            }],
        },
    }
}

#[test]
fn test_data_pack_extends_policy_without_executable_plugins() -> Result<()> {
    let repository = Repository::new()?;
    let mut context = repository.context(Repository::command(&["/usr/bin/true"]))?;
    let pack = recipe_pack();
    let question = pack.questions[0].to_owned();
    let registry = PackRegistry::compose([pack.to_owned()], &BTreeSet::new())?;
    context.capabilities = registry.builders(context.capabilities)?;
    let inputs = registry.inputs(&context)?;
    let envelope = DecisionEnvelope {
        version: WIRE_VERSION,
        question_id: question.id.to_owned(),
        question_version: question.version.to_owned(),
        builder_version: question.builder_version.to_owned(),
        model_version: question.model_version.to_owned(),
        input_digest: inputs[&question.id].to_owned(),
        assessment_id: "fixture-recorded-answer".into(),
        answer: Answer::Choice {
            probabilities: BTreeMap::from([("a".into(), 0.9), ("b".into(), 0.1)]),
        },
    };
    let decisions = BTreeMap::from([(question.id.to_owned(), envelope)]);
    let plan = PlanCompiler {
        configuration: &context.configuration,
        snapshot: &context.snapshot.digest()?,
        facts: &BTreeMap::new(),
        questions: &registry.questions,
        decisions: &decisions,
        capabilities: &BTreeSet::new(),
        pack_digests: &registry.digests,
        question_inputs: &inputs,
    }
    .compile(&registry.policy)?;
    assert!(
        matches!(&plan.nodes.last().unwrap().action,CompiledAction::Command {command_id} if command_id == "conform")
    );
    assert_eq!(
        PlanExecutor::new(&context, &NativeRunner)
            .run(&plan)?
            .exit_code(),
        0
    );
    let mut executable = serde_json::to_value(&pack)?;
    executable["shell"] = "arbitrary execution".into();
    assert!(DataPack::from_json(&serde_json::to_vec(&executable)?).is_err());
    let mut incompatible = pack.to_owned();
    incompatible.engine_requirement = "^99".into();
    assert!(PackRegistry::compose([incompatible], &BTreeSet::new()).is_err());
    assert!(PackRegistry::compose([pack.to_owned(), pack], &BTreeSet::new()).is_err());
    Ok(())
}

#[test]
fn compiled_capabilities_execute_and_missing_exact_inputs_fail() -> Result<()> {
    let repository = Repository::new()?;
    let mut context = repository.context(Repository::command(&["/usr/bin/true"]))?;
    context.capabilities = context.capabilities.with_check(Arc::new(Presence {
        identity: "project.presence".into(),
    }))?;
    let policy = Policy {
        version: WIRE_VERSION,
        nodes: vec![PolicyNode {
            id: "exact".into(),
            dependencies: BTreeSet::new(),
            required: true,
            action: Action::Check {
                capability: "project.presence".into(),
                inputs: BTreeSet::from(["source.present".into()]),
            },
        }],
    };
    for present in [false, true] {
        let plan = PlanCompiler {
            configuration: &context.configuration,
            snapshot: &context.snapshot.digest()?,
            facts: &BTreeMap::from([("source.present".into(), present)]),
            questions: &BTreeMap::new(),
            decisions: &BTreeMap::new(),
            capabilities: &context.capabilities.identities(),
            pack_digests: &BTreeMap::new(),
            question_inputs: &BTreeMap::new(),
        }
        .compile(&policy)?;
        assert_eq!(
            PlanExecutor::new(&context, &NativeRunner)
                .run(&plan)?
                .exit_code(),
            u8::from(!present)
        );
    }
    Ok(())
}

#[test]
fn configuration_refuses_array_shaped_objects_and_preserves_parse_details() -> Result<()> {
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let object = serde_json::to_value(config)?;
    let array: Vec<_> = object.as_object().unwrap().values().collect();
    assert_eq!(
        Configuration::from_json(&serde_json::to_vec(&array)?)
            .unwrap_err()
            .code(),
        orly::error::JSON_FAILURE
    );
    assert!(Configuration::from_json(b"{} trailing bytes").is_err());
    let error = Configuration::from_json(b"broken").unwrap_err();
    let Error::Json(parse) = error else {
        panic!("expected the original JSON parse error")
    };
    assert_eq!(parse.classify(), serde_json::error::Category::Syntax);
    assert_eq!((parse.line(), parse.column()), (1, 1));
    Ok(())
}

#[test]
fn configuration_refuses_positional_nested_structs() -> Result<()> {
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let valid = serde_json::to_value(&config)?;
    assert_eq!(
        Configuration::from_json(&serde_json::to_vec(&valid)?)?,
        config
    );
    for (pointer, fields) in [
        (
            "/commands/conform",
            &[
                "argv",
                "cwd",
                "env_keys",
                "inputs",
                "outputs",
                "resources",
                "deadline_seconds",
            ][..],
        ),
        ("/surfaces", &["user", "docs"][..]),
        ("/judge", &["upload", "model", "questions"][..]),
        ("/coverage", &["roots", "producers", "reports"][..]),
        ("/rules", &["selectors", "candidates"][..]),
    ] {
        let mut invalid = valid.clone();
        let object = invalid.pointer_mut(pointer).unwrap();
        *object = fields.iter().map(|field| object[*field].clone()).collect();
        assert!(
            matches!(
                Configuration::from_json(&serde_json::to_vec(&invalid)?),
                Err(Error::Schema(_))
            ),
            "accepted positional struct at {pointer}"
        );
    }
    Ok(())
}

#[test]
fn data_pack_refuses_positional_structs_in_lists_and_nested_objects() -> Result<()> {
    let pack = recipe_pack();
    let valid = serde_json::to_value(&pack)?;
    assert_eq!(DataPack::from_json(&serde_json::to_vec(&valid)?)?, pack);
    for (pointer, fields) in [
        (
            "/questions/0",
            &[
                "primitive",
                "id",
                "version",
                "builder",
                "builder_version",
                "model_version",
                "candidates",
                "rule_section",
            ][..],
        ),
        ("/policy", &["version", "nodes"][..]),
        (
            "/policy/nodes/0",
            &["id", "dependencies", "required", "action"][..],
        ),
    ] {
        let mut invalid = valid.clone();
        let object = invalid.pointer_mut(pointer).unwrap();
        *object = fields.iter().map(|field| object[*field].clone()).collect();
        assert!(
            matches!(
                DataPack::from_json(&serde_json::to_vec(&invalid)?),
                Err(Error::Schema(_))
            ),
            "accepted positional struct at {pointer}"
        );
    }
    Ok(())
}
