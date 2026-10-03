use super::{
    client::{auth, runtime},
    common::{batch, response},
};
use orly::judge::{
    batch::Batch,
    constants::*,
    engine::{DecisionEngine, EngineFuture, EngineIdentity, JevEngine},
    judger::LiveJudger,
    metrics::Observation,
    replay::{JudgmentStore, ReplayStore, StoreInput},
    runner::{Invoker, Outcome},
};
use std::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Instant,
};

struct OtherEngine {
    identity: EngineIdentity,
    calls: AtomicUsize,
    wrong_model: bool,
    hanging: bool,
}
impl OtherEngine {
    fn new() -> Self {
        Self {
            identity: EngineIdentity {
                provider: "test_engine".into(),
                model: "decision-1".into(),
            },
            calls: AtomicUsize::new(0),
            wrong_model: false,
            hanging: false,
        }
    }
}
impl DecisionEngine for OtherEngine {
    fn identity(&self) -> &EngineIdentity {
        &self.identity
    }
    fn infer<'a>(
        &'a self,
        input: &'a Batch,
        _: Instant,
        observation: &'a Observation,
        announce: &mut dyn FnMut(&str, usize),
    ) -> EngineFuture<'a> {
        announce("test://decision-engine", input.pairs().len());
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            observation.request();
            if self.hanging {
                return std::future::pending().await;
            }
            assert!(input.state().get("required").is_some());
            let mut answer = response(input);
            if self.wrong_model {
                answer.model = "unrequested-model".into();
            }
            Ok(answer)
        })
    }
}
#[test]
fn invocation_bounds_a_stalled_engine_and_keeps_its_request_count() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let mut engine = OtherEngine::new();
    engine.hanging = true;
    let input = for_engine(engine.identity.clone());
    let judger = LiveJudger {
        store: &store,
        engine: &engine,
    };
    let started = Instant::now();
    let run = runtime(
        Invoker::new(&judger)
            .within(std::time::Duration::from_millis(5))
            .invoke(std::slice::from_ref(&input), true, |_, _| {}),
    )
    .unwrap();
    assert!(started.elapsed() < std::time::Duration::from_secs(1));
    assert_eq!(run.exit_code(), 2);
    assert_eq!(run.metrics[input.digest()].requests, 1);
    assert!(
        matches!(&run.batches[input.digest()], Outcome::Incomplete { reason } if reason == DEADLINE_EXCEEDED)
    );
    assert!(
        store
            .replay(StoreInput::new(&input, 100))
            .unwrap()
            .is_none()
    );
}
fn for_engine(identity: EngineIdentity) -> Batch {
    let input = batch("source", "judge.scope_contradiction");
    Batch::for_engine(
        identity,
        input.source_digest().into(),
        input.state().clone(),
        input.pairs().clone(),
    )
    .unwrap()
}
#[test]
fn another_engine_uses_the_same_live_and_replay_judger_without_jev_transport() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let engine = OtherEngine::new();
    let input = for_engine(engine.identity.clone());
    let judger = LiveJudger {
        store: &store,
        engine: &engine,
    };
    let invoker = Invoker::new(&judger);
    let mut announcements = 0;
    let run = runtime(invoker.invoke(std::slice::from_ref(&input), true, |_, _| {
        announcements += 1
    }))
    .unwrap();
    assert_eq!(run.exit_code(), 0);
    let Outcome::Recorded { record, replayed } = &run.batches[input.digest()] else {
        panic!("expected recorded judgment");
    };
    assert!(!replayed);
    assert_eq!(record.response.model, "decision-1");
    let replay = runtime(invoker.invoke(std::slice::from_ref(&input), false, |_, _| {
        announcements += 1
    }))
    .unwrap();
    assert!(matches!(
        replay.batches[input.digest()],
        Outcome::Recorded { replayed: true, .. }
    ));
    assert_eq!(engine.calls.load(Ordering::SeqCst), 1);
    assert_eq!(announcements, 1);
    assert_eq!(replay.metrics[input.digest()].requests, 0);
}
#[test]
fn provider_and_model_changes_cannot_reuse_another_engine_record() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let input = for_engine(OtherEngine::new().identity);
    store
        .record(StoreInput::new(&input, 100), response(&input), false)
        .unwrap();
    for identity in [
        EngineIdentity::jev(),
        EngineIdentity {
            provider: "different_provider".into(),
            model: input.engine().model.clone(),
        },
        EngineIdentity {
            provider: input.engine().provider.clone(),
            model: "decision-2".into(),
        },
    ] {
        let changed = for_engine(identity);
        assert_ne!(changed.digest(), input.digest());
        assert!(
            store
                .replay(StoreInput::new(&changed, 100))
                .unwrap()
                .is_none()
        );
    }
}
#[test]
fn an_engine_cannot_record_an_answer_from_an_unrequested_model() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let mut engine = OtherEngine::new();
    engine.wrong_model = true;
    let input = for_engine(engine.identity.clone());
    let judger = LiveJudger {
        store: &store,
        engine: &engine,
    };
    let run = runtime(Invoker::new(&judger).invoke(std::slice::from_ref(&input), true, |_, _| {}))
        .unwrap();
    assert_eq!(run.exit_code(), 2);
    assert!(
        store
            .replay(StoreInput::new(
                &input,
                orly::judge::runner::epoch_seconds().unwrap()
            ))
            .unwrap()
            .is_none()
    );
    assert_eq!(run.metrics[input.digest()].requests, 1);
}
#[test]
fn jev_rejects_a_batch_for_another_engine_before_scan_or_upload() {
    // Neither dependency is reachable when engine identity is rejected.
    use super::runner::{Clean, Provider};
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let transport = Provider::default();
    let authorization = auth();
    let engine = JevEngine::new(&authorization, &Clean, &transport);
    let input = for_engine(OtherEngine::new().identity);
    let judger = LiveJudger {
        store: &store,
        engine: &engine,
    };
    let mut announced = 0;
    let run = runtime(
        Invoker::new(&judger).invoke(std::slice::from_ref(&input), true, |_, _| announced += 1),
    )
    .unwrap();
    assert_eq!(run.exit_code(), 2);
    assert_eq!(announced, 0);
    assert_eq!(transport.calls.load(Ordering::SeqCst), 0);
}
