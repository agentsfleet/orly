#[path = "judge/replay_access.rs"]
mod access;
#[path = "judge/common.rs"]
mod common;
#[path = "judge/replay_retention.rs"]
mod retention;
use common::{batch, response};
use orly::judge::{
    constants::*,
    judger::ReplayJudger,
    replay::{JudgmentStore, ReplayStore, StoreInput},
    runner::Invoker,
};
use std::sync::Barrier;
fn runtime<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}

#[test]
fn test_replay_identity_is_complete_and_offline() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let input = batch("source", "judge.scope_contradiction");
    let now = orly::judge::runner::epoch_seconds().unwrap();
    let original = store
        .record(StoreInput::new(&input, now), response(&input), false)
        .unwrap();
    assert_eq!(
        store.replay(StoreInput::new(&input, now)).unwrap().unwrap(),
        original
    );
    let refreshed = store
        .record(StoreInput::new(&input, now), response(&input), true)
        .unwrap();
    assert_ne!(refreshed.run_id, original.run_id);
    let selected = store.replay(StoreInput::new(&input, now)).unwrap().unwrap();
    assert_eq!(selected.run_id, original.run_id);
    let judger = ReplayJudger {
        store: &store,
        ignore_local_records: false,
    };
    let run = runtime(Invoker::new(&judger).invoke(std::slice::from_ref(&input), false, |_, _| {}))
        .unwrap();
    assert_eq!(run.exit_code(), 0);
    assert_eq!(
        runtime(
            Invoker::new(&ReplayJudger {
                store: &store,
                ignore_local_records: true
            })
            .invoke(&[input], false, |_, _| {})
        )
        .unwrap()
        .exit_code(),
        2
    );
    assert!(
        store
            .replay(StoreInput::new(
                &batch("changed", "judge.scope_contradiction"),
                now
            ))
            .unwrap()
            .is_none()
    );
}
#[test]
fn instruction_builder_membership_and_evidence_changes_invalidate_replay() {
    let original = batch("source", "judge.scope_contradiction");
    for change in 0..4 {
        let mut pairs = original.pairs().clone();
        let pair = pairs.values_mut().next().unwrap();
        match change {
            0 => pair.definition.builder_version = "1.0.1".into(),
            1 => pair.input_id = "changed".into(),
            2 => pair.candidate_id = "rule.changed".into(),
            _ => {
                if let orly::judge::wire::Question::Noul { instructions, .. } =
                    &mut pair.definition.question
                {
                    *instructions = serde_json::json!("changed instruction");
                }
            }
        }
        let changed = orly::judge::batch::Batch::new(
            "source".into(),
            serde_json::from_slice::<serde_json::Value>(original.bytes()).unwrap()["state"].clone(),
            pairs,
        )
        .unwrap();
        assert_ne!(changed.digest(), original.digest());
    }
}
#[test]
fn routing_policy_changes_reuse_inference_identity() {
    let original = batch("source", "judge.scope_contradiction");
    let mut pairs = original.pairs().clone();
    if let orly::judge::bank::Consumer::Review { route } =
        &mut pairs.values_mut().next().unwrap().definition.consumer
    {
        *route = "review.changed".into();
    }
    let state =
        serde_json::from_slice::<serde_json::Value>(original.bytes()).unwrap()["state"].clone();
    let changed = orly::judge::batch::Batch::new("source".into(), state, pairs).unwrap();
    assert_eq!(changed.digest(), original.digest());
}
#[test]
fn corrupt_and_future_records_are_explicit_misses() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let input = batch("source", "judge.scope_contradiction");
    store
        .record(StoreInput::new(&input, 500), response(&input), false)
        .unwrap();
    assert!(
        store
            .replay(StoreInput::new(&input, 499))
            .unwrap()
            .is_none()
    );
    let name = format!("{}.json", input.digest().strip_prefix("sha256:").unwrap());
    std::fs::write(root.path().join(name), b"{partial").unwrap();
    assert!(
        store
            .replay(StoreInput::new(&input, 500))
            .unwrap()
            .is_none()
    );
}
#[test]
fn test_replay_store_handles_concurrency_and_retention() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), 10, CACHE_BYTES).unwrap();
    let input = batch("source", "judge.scope_contradiction");
    let barrier = Barrier::new(8);
    let records = std::thread::scope(|scope| {
        let threads: Vec<_> = (0..8)
            .map(|_| {
                scope.spawn(|| {
                    barrier.wait();
                    store.record(StoreInput::new(&input, 100), response(&input), false)
                })
            })
            .collect();
        threads
            .into_iter()
            .map(|thread| thread.join().unwrap().unwrap())
            .collect::<Vec<_>>()
    });
    assert!(
        records
            .iter()
            .all(|record| record.run_id == records[0].run_id)
    );
    assert!(
        store
            .replay(StoreInput::new(&input, 111))
            .unwrap()
            .is_none()
    );
}
#[test]
fn interrupted_commit_preserves_prior_answer() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let input = batch("source", "judge.scope_contradiction");
    let original = store
        .record(StoreInput::new(&input, 100), response(&input), false)
        .unwrap();
    let mut fired = 0;
    let error = store.record_with(StoreInput::new(&input, 101), response(&input), true, || {
        fired += 1;
        Err(orly::Error::Interrupted(1))
    });
    let error = error.unwrap_err();
    assert_eq!(error.code(), orly::error::OPERATION_INTERRUPTED);
    let source = std::error::Error::source(&error).unwrap();
    assert!(matches!(
        source.downcast_ref::<orly::Error>(),
        Some(orly::Error::Interrupted(1))
    ));
    assert_eq!(fired, 1);
    assert_eq!(
        store.replay(StoreInput::new(&input, 101)).unwrap().unwrap(),
        original
    );
}
