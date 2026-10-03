use super::common::{batch, response};
use orly::{
    core::{
        config::{CONFORM_ID, CommandSpec, Configuration, VERIFY_UNIT_ID},
        execution::EvaluationContext,
        snapshot::{GitSnapshotSource, SourceKind},
    },
    judge::{
        Judge, JudgeResult,
        adapter::ReplayJudge,
        constants::*,
        judger::ReplayJudger,
        replay::{JudgmentStore, ReplayStore, StoreInput},
        runner::epoch_seconds,
    },
};

fn context(root: &std::path::Path) -> EvaluationContext {
    use std::collections::{BTreeMap, BTreeSet};
    let repository = git2::Repository::init(root).unwrap();
    let mut index = repository.index().unwrap();
    let tree = index.write_tree().unwrap();
    index.write().unwrap();
    let tree = repository.find_tree(tree).unwrap();
    let signature = git2::Signature::now("Test Owner", "fixture@example.invalid").unwrap();
    repository
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            "test: capture input",
            &tree,
            &[],
        )
        .unwrap();
    let command = CommandSpec {
        argv: vec!["fixture-tool".into()],
        cwd: None,
        env_keys: BTreeSet::new(),
        inputs: BTreeSet::new(),
        outputs: BTreeSet::new(),
        resources: BTreeSet::new(),
        deadline_seconds: 1,
    };
    let configuration = Configuration::new(
        BTreeMap::from([
            (CONFORM_ID.into(), command.clone()),
            (VERIFY_UNIT_ID.into(), command),
        ]),
        BTreeSet::from(["fixture-tool".into()]),
    )
    .unwrap();
    let snapshot = GitSnapshotSource::new(root, SourceKind::Index {}, "HEAD", None)
        .capture(configuration.digest().unwrap())
        .unwrap();
    EvaluationContext::new(snapshot, configuration).unwrap()
}
#[test]
fn native_adapter_shares_the_replay_judgers_ignore_local_policy() {
    let root = tempfile::tempdir().unwrap();
    let context = context(root.path());
    let input = batch(
        &context.snapshot.digest().unwrap(),
        "judge.scope_contradiction",
    );
    let definition = &input.pairs().values().next().unwrap().definition;
    let question = orly_decision::Question {
        primitive: orly_decision::Primitive::Noul {},
        id: definition.id.clone(),
        version: definition.version.clone(),
        builder: definition.builder.clone(),
        builder_version: definition.builder_version.clone(),
        model_version: MODEL.into(),
        candidates: vec![CONDITION.into()],
        rule_section: definition.source_clause.clone(),
    };
    let private = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(private.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    store
        .record(
            StoreInput::new(&input, epoch_seconds().unwrap()),
            response(&input),
            false,
        )
        .unwrap();
    for ignore_local_records in [false, true] {
        let judger = ReplayJudger {
            store: &store,
            ignore_local_records,
        };
        let adapter = ReplayJudge {
            judger: &judger,
            batches: std::slice::from_ref(&input),
        };
        let result = adapter.evaluate(&context, &question).unwrap();
        assert_eq!(
            matches!(result, JudgeResult::Unavailable { .. }),
            ignore_local_records
        );
    }
}
