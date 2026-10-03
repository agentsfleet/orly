use super::common::{batch, response};
use orly::judge::{
    constants::*,
    replay::{JudgmentStore, ReplayStore, StoreInput},
};

use super::runtime;
use orly::judge::{judger::ReplayJudger, runner::Invoker};

#[test]
fn contended_cache_lock_returns_incomplete_within_the_invocation_deadline() {
    use std::time::{Duration, Instant};
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let input = batch("source", "judge.scope_contradiction");
    let lock = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(root.path().join("cache.lock"))
        .unwrap();
    lock.lock().unwrap();
    let started = Instant::now();
    let judger = ReplayJudger {
        store: &store,
        ignore_local_records: false,
    };
    let run = runtime(
        Invoker::new(&judger)
            .within(Duration::from_millis(5))
            .invoke(std::slice::from_ref(&input), false, |_, _| {
                panic!("offline")
            }),
    )
    .unwrap();
    assert!(started.elapsed() < Duration::from_secs(1));
    assert!(
        matches!(&run.batches[input.digest()], orly::judge::runner::Outcome::Incomplete { reason } if reason == DEADLINE_EXCEEDED)
    );
    assert_eq!(run.metrics[input.digest()].requests, 0);
    let error = store
        .record(
            StoreInput::new(&input, 100).until(Instant::now() + Duration::from_millis(5)),
            response(&input),
            false,
        )
        .unwrap_err();
    assert_eq!(error.code(), DEADLINE_EXCEEDED);
    drop(lock);
    store
        .record(StoreInput::new(&input, 100), response(&input), false)
        .unwrap();
}
