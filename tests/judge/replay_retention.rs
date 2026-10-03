use super::common::{batch, response};
use orly::judge::{
    constants::*,
    replay::{JudgmentStore, ReplayStore, StoreInput},
};

#[test]
fn byte_budget_evicts_oldest_valid_record() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, 800).unwrap();
    let first = batch("first", "judge.scope_contradiction");
    let second = batch("second", "judge.scope_contradiction");
    store
        .record(StoreInput::new(&first, 100), response(&first), false)
        .unwrap();
    store
        .record(StoreInput::new(&second, 101), response(&second), false)
        .unwrap();
    assert!(
        store
            .replay(StoreInput::new(&first, 101))
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .replay(StoreInput::new(&second, 101))
            .unwrap()
            .is_some()
    );
}

#[test]
fn pruning_expired_runs_preserves_current_refresh_and_monotonic_run_identity() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), 10, CACHE_BYTES).unwrap();
    let first = batch("first", "judge.scope_contradiction");
    let second = batch("second", "judge.scope_contradiction");
    store
        .record(StoreInput::new(&first, 100), response(&first), false)
        .unwrap();
    let refresh = store
        .record(StoreInput::new(&first, 108), response(&first), true)
        .unwrap();
    store
        .record(StoreInput::new(&second, 112), response(&second), false)
        .unwrap();
    assert_eq!(
        store.replay(StoreInput::new(&first, 112)).unwrap().unwrap(),
        refresh
    );
    let next = store
        .record(StoreInput::new(&first, 112), response(&first), true)
        .unwrap();
    assert_eq!(next.ordinal, refresh.ordinal + 1);
    assert_ne!(next.run_id, refresh.run_id);
    assert_eq!(
        store.replay(StoreInput::new(&first, 112)).unwrap().unwrap(),
        refresh
    );
}

#[test]
fn byte_budget_prunes_the_oldest_run_instead_of_its_current_history() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let first = batch("first", "judge.scope_contradiction");
    let second = batch("second", "judge.scope_contradiction");
    store
        .record(StoreInput::new(&first, 100), response(&first), false)
        .unwrap();
    let refresh = store
        .record(StoreInput::new(&first, 110), response(&first), true)
        .unwrap();
    let name = format!("{}.json", first.digest().strip_prefix("sha256:").unwrap());
    let budget = std::fs::metadata(root.path().join(name)).unwrap().len() + 128;
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, budget).unwrap();
    store
        .record(StoreInput::new(&second, 111), response(&second), false)
        .unwrap();
    assert_eq!(
        store.replay(StoreInput::new(&first, 111)).unwrap().unwrap(),
        refresh
    );
    assert!(
        store
            .replay(StoreInput::new(&second, 111))
            .unwrap()
            .is_some()
    );
    let bytes: u64 = std::fs::read_dir(root.path())
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .map(|path| std::fs::metadata(path).unwrap().len())
        .sum();
    assert!(bytes <= budget, "{bytes} exceeds {budget}");
}
