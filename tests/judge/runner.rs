use super::{
    client::{auth, runtime},
    common::{batch, response},
};
use orly::judge::{
    authorization::{AuthorizedRequest, CredentialScanner, ScanFuture},
    batch::Batch,
    constants::*,
    engine::JevEngine,
    judger::LiveJudger,
    replay::ReplayStore,
    runner::{Invoker, Outcome},
    transport::{Transport, TransportFuture, TransportResponse},
};
use std::{
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, Instant},
};

pub(super) struct Clean;
impl CredentialScanner for Clean {
    fn scan<'a>(&'a self, _: &'a [u8], _: Instant) -> ScanFuture<'a> {
        Box::pin(async { Ok(()) })
    }
}
#[derive(Default)]
pub(super) struct Provider {
    pub(super) calls: AtomicUsize,
    active: AtomicUsize,
    peak: AtomicUsize,
}
struct Active<'a>(&'a AtomicUsize);
impl Drop for Active<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}
impl Transport for Provider {
    fn send<'a>(&'a self, request: &'a AuthorizedRequest<'_>, _: Duration) -> TransportFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
            self.peak.fetch_max(active, Ordering::SeqCst);
            let _active = Active(&self.active);
            tokio::time::sleep(Duration::from_millis(1)).await;
            Ok(TransportResponse {
                status: 200,
                retry_after: None,
                body: serde_json::to_vec(&response(request.batch())).unwrap(),
            })
        })
    }
}
fn full_batch(index: usize) -> Batch {
    let single = batch(&format!("source.{index}"), "judge.scope_contradiction");
    let pair = single.pairs().values().next().unwrap();
    let pairs = (0..BATCH_PAIRS)
        .map(|n| {
            let mut pair = pair.clone();
            pair.input_id = format!("input.{n}");
            (format!("judge.scope_contradiction.input.{n}"), pair)
        })
        .collect();
    let state =
        serde_json::from_slice::<serde_json::Value>(single.bytes()).unwrap()["state"].clone();
    Batch::new(format!("source.{index}"), state, pairs).unwrap()
}
#[test]
fn invocation_budget_and_concurrency_are_enforced_with_real_replay() {
    let root = tempfile::tempdir().unwrap();
    let store = ReplayStore::open_private(root.path(), RETENTION_SECONDS, CACHE_BYTES).unwrap();
    let provider = Provider::default();
    let authorization = auth();
    let engine = JevEngine::new(&authorization, &Clean, &provider);
    let judger = LiveJudger {
        store: &store,
        engine: &engine,
    };
    let invoker = Invoker::new(&judger);
    let batches: Vec<_> = (0..MAX_PAIRS / BATCH_PAIRS + 1).map(full_batch).collect();
    let mut announced = 0;
    let result = runtime(invoker.invoke(&batches, true, |_, _| announced += 1)).unwrap();
    assert_eq!(result.exit_code(), 2);
    assert_eq!(result.excess_pairs, BATCH_PAIRS);
    assert_eq!(
        provider.calls.load(Ordering::SeqCst),
        MAX_PAIRS / BATCH_PAIRS
    );
    assert_eq!(provider.peak.load(Ordering::SeqCst), CONCURRENCY);
    assert_eq!(
        result
            .metrics
            .values()
            .map(|metric| metric.requests)
            .sum::<u64>(),
        8
    );
    assert_eq!(announced, 8);
    assert!(matches!(
        result.batches[batches.last().unwrap().digest()],
        Outcome::Incomplete { .. }
    ));
    let replay = runtime(invoker.invoke(&batches[..8], false, |_, _| {})).unwrap();
    assert_eq!(replay.exit_code(), 0);
    assert!(replay.metrics.values().all(|metric| metric.requests == 0));
    assert_eq!(provider.calls.load(Ordering::SeqCst), 8);
}
struct Never;
impl CredentialScanner for Never {
    fn scan<'a>(&'a self, _: &'a [u8], _: Instant) -> ScanFuture<'a> {
        Box::pin(std::future::pending())
    }
}
#[test]
fn scanner_cannot_extend_authorization_deadline() {
    let authorization = auth();
    let input = batch("source", "judge.scope_contradiction");
    let error =
        runtime(authorization.scan(&input, &Never, Instant::now() + Duration::from_millis(1)))
            .err()
            .unwrap();
    assert_eq!(error.code(), DEADLINE_EXCEEDED);
}
