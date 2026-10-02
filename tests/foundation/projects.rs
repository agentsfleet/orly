use crate::support::Repository;
use orly::{
    Result,
    core::{
        config::Configuration,
        constants::{CONFIG_PATH, WIRE_VERSION},
        document::ObjectDocument,
        execution::EvaluationContext,
        packs::{DataPack, PackRegistry},
        plan::{Action, CompiledAction, Condition, DecisionPlan, PlanCompiler},
        snapshot::{GitSnapshotSource, SourceKind},
    },
};
use orly_decision::{Answer, DecisionEnvelope};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
    process::Command,
};

const PROFILES: [&str; 3] = ["rust-cli", "typescript-library", "agentsfleet-profile"];

fn copy_project(source: &Path, repository: &Repository, prefix: &str) -> Result<()> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        let path = format!("{prefix}{}", name.to_str().unwrap());
        if entry.file_type()?.is_dir() {
            copy_project(&entry.path(), repository, &format!("{path}/"))?;
        } else {
            repository.write(&path, &fs::read(entry.path())?)?;
        }
    }
    Ok(())
}

fn context(repository: &Repository, pack: DataPack) -> Result<(EvaluationContext, PackRegistry)> {
    let config = Configuration::read_json(&repository.root().join(CONFIG_PATH))?;
    let snapshot = GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None)
        .capture(config.digest()?)?;
    let mut context = EvaluationContext::new(snapshot, config)?;
    let registry = PackRegistry::compose([pack], &BTreeSet::new())?;
    context.capabilities = registry.builders(context.capabilities)?;
    Ok((context, registry))
}

fn compile(
    context: &EvaluationContext,
    registry: &PackRegistry,
    answer: Option<f64>,
) -> Result<DecisionPlan> {
    let question = registry.questions.values().next().unwrap();
    let inputs = registry.inputs(context)?;
    let decisions = answer
        .map(|probability| {
            BTreeMap::from([(
                question.id.clone(),
                DecisionEnvelope {
                    version: WIRE_VERSION,
                    question_id: question.id.clone(),
                    question_version: question.version.clone(),
                    builder_version: question.builder_version.clone(),
                    model_version: question.model_version.clone(),
                    input_digest: inputs[&question.id].clone(),
                    assessment_id: "recorded-project-fixture".into(),
                    answer: Answer::Choice {
                        probabilities: BTreeMap::from([
                            ("focused".into(), probability),
                            ("broad".into(), 1.0 - probability),
                        ]),
                    },
                },
            )])
        })
        .unwrap_or_default();
    PlanCompiler {
        configuration: &context.configuration,
        snapshot: &context.snapshot.digest()?,
        facts: &BTreeMap::new(),
        questions: &registry.questions,
        decisions: &decisions,
        capabilities: &BTreeSet::new(),
        pack_digests: &registry.digests,
        question_inputs: &inputs,
    }
    .compile(&registry.policy)
}

fn verify_profile(repository: &Repository, pack: DataPack) -> Result<()> {
    let (context, registry) = context(repository, pack.clone())?;
    let question = registry.questions.values().next().unwrap();
    let selected = context
        .capabilities
        .builder(&question.builder)
        .unwrap()
        .build(&context)?;
    assert!(!selected["paths"].as_array().unwrap().is_empty());
    let positive = compile(&context, &registry, Some(0.9))?;
    assert!(matches!(positive.nodes.last().unwrap().action,
        CompiledAction::Command { ref command_id } if command_id == "conform"));
    assert_eq!(positive, compile(&context, &registry, Some(0.9))?);
    let broad = compile(&context, &registry, Some(0.1))?;
    assert!(matches!(broad.nodes.last().unwrap().action,
        CompiledAction::Command { ref command_id } if command_id == "verify.unit"));
    for answer in [None, Some(0.5)] {
        assert!(matches!(
            compile(&context, &registry, answer)?
                .nodes
                .last()
                .unwrap()
                .action,
            CompiledAction::Unresolved { .. }
        ));
    }
    verify_stricter_threshold(&context, pack.clone())?;
    let mut injected = serde_json::to_value(&pack)?;
    injected["command"] = "unapproved executable".into();
    assert!(DataPack::from_json(&serde_json::to_vec(&injected)?).is_err());
    assert!(PackRegistry::compose([pack.clone(), pack], &BTreeSet::new()).is_err());
    Ok(())
}

fn verify_stricter_threshold(context: &EvaluationContext, mut stricter: DataPack) -> Result<()> {
    if let Action::Select {
        condition: Condition::Choice { threshold, .. },
        ..
    } = &mut stricter.policy.nodes[0].action
    {
        *threshold = 0.95;
    }
    let stricter = PackRegistry::compose([stricter], &BTreeSet::new())?;
    assert!(matches!(
        compile(context, &stricter, Some(0.9))?
            .nodes
            .last()
            .unwrap()
            .action,
        CompiledAction::Unresolved { .. }
    ));
    Ok(())
}

#[test]
fn project_profiles_compile_from_data_and_keep_uncertain_answers_unresolved() -> Result<()> {
    for profile in PROFILES {
        let repository = Repository::new()?;
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures/projects")
            .join(profile);
        copy_project(&fixture, &repository, "")?;
        repository.commit()?;
        let pack = DataPack::read_json(&repository.root().join("project-pack.json"))?;
        verify_profile(&repository, pack)?;
        let output = Command::new(env!("CARGO_BIN_EXE_orly"))
            .current_dir(repository.root())
            .args(["--json", "plan"])
            .output()?;
        assert!(output.status.success(), "{profile}: {output:?}");
        let plan: DecisionPlan = serde_json::from_slice(&output.stdout)?;
        assert!(
            plan.nodes
                .iter()
                .any(|node| matches!(node.action, CompiledAction::Unresolved { .. }))
        );
    }
    Ok(())
}

#[test]
fn project_source_roots_move_by_changing_pack_data() -> Result<()> {
    for profile in PROFILES {
        let repository = Repository::new()?;
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures/projects")
            .join(profile);
        copy_project(&fixture, &repository, "")?;
        repository.commit()?;
        let mut pack = DataPack::read_json(&repository.root().join("project-pack.json"))?;
        let (before, registry) = context(&repository, pack.clone())?;
        let original = registry.inputs(&before)?;
        let pattern = pack.selectors.values_mut().next().unwrap();
        let (root, rest) = pattern.split_once('/').unwrap();
        fs::rename(
            repository.root().join(root),
            repository.root().join("moved"),
        )?;
        *pattern = format!("moved/{rest}");
        repository.write("project-pack.json", &serde_json::to_vec(&pack)?)?;
        repository.commit()?;
        let (after, registry) = context(&repository, pack)?;
        assert_ne!(original, registry.inputs(&after)?);
        let question = registry.questions.values().next().unwrap();
        let selected = after
            .capabilities
            .builder(&question.builder)
            .unwrap()
            .build(&after)?;
        let paths = selected["paths"].as_array().unwrap();
        assert!(!paths.is_empty());
        assert!(
            paths
                .iter()
                .all(|file| file["path"].as_str().unwrap().starts_with("moved/"))
        );
    }
    Ok(())
}
