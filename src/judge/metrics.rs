use super::{
    authorization::AuthorizedRequest,
    transport::{Transport, TransportFuture},
};
use serde::Serialize;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

#[derive(Default, Serialize)]
pub struct OperationMetrics {
    pub requests: u64,
    pub duration_millis: u64,
}
/// The invocation owns observation, so cancelling a provider future cannot erase requests.
pub struct Observation {
    started: Instant,
    requests: AtomicU64,
}
impl Observation {
    pub fn start() -> Self {
        Self {
            started: Instant::now(),
            requests: AtomicU64::new(0),
        }
    }
    pub fn request(&self) {
        self.requests.fetch_add(1, Ordering::Relaxed);
    }
    pub fn snapshot(&self) -> OperationMetrics {
        OperationMetrics {
            requests: self.requests.load(Ordering::Relaxed),
            duration_millis: self.started.elapsed().as_millis() as u64,
        }
    }
}
pub(super) struct CountedTransport<'a> {
    inner: &'a dyn Transport,
    observation: &'a Observation,
}
impl<'a> CountedTransport<'a> {
    pub fn new(inner: &'a dyn Transport, observation: &'a Observation) -> Self {
        Self { inner, observation }
    }
}
impl Transport for CountedTransport<'_> {
    fn send<'a>(
        &'a self,
        request: &'a AuthorizedRequest<'_>,
        remaining: Duration,
    ) -> TransportFuture<'a> {
        self.observation.request();
        self.inner.send(request, remaining)
    }
}
pub(super) enum Operation {
    Upload,
    Scan,
    ReplayRead,
    ReplayWrite,
}
impl Operation {
    fn events(&self) -> (&'static str, &'static str, &'static str) {
        match self {
            Self::Upload => (
                "judge_upload_started",
                "judge_upload_completed",
                "judge_upload_failed",
            ),
            Self::Scan => (
                "judge_scan_started",
                "judge_scan_completed",
                "judge_scan_failed",
            ),
            Self::ReplayRead => (
                "judge_replay_read_started",
                "judge_replay_read_completed",
                "judge_replay_read_failed",
            ),
            Self::ReplayWrite => (
                "judge_replay_write_started",
                "judge_replay_write_completed",
                "judge_replay_write_failed",
            ),
        }
    }
}
/// Brackets every boundary exit, including a future dropped before completion.
pub(super) struct Boundary<'a> {
    operation: Operation,
    correlation_id: &'a str,
    started: Instant,
    finished: bool,
}
impl<'a> Boundary<'a> {
    pub fn start(operation: Operation, correlation_id: &'a str) -> Self {
        let event = operation.events().0;
        let ts_ms = timestamp();
        let level = INFO_LEVEL;
        let scope = JUDGE_SCOPE;
        tracing::info!(ts_ms, level, scope, event, correlation_id);
        Self {
            operation,
            correlation_id,
            started: Instant::now(),
            finished: false,
        }
    }
    pub fn span(&self) -> tracing::Span {
        let correlation_id = self.correlation_id;
        tracing::info_span!("judge_operation", correlation_id)
    }
    pub fn finish<T>(mut self, result: crate::Result<T>) -> crate::Result<T> {
        self.emit(result.as_ref().err().map(crate::Error::code));
        self.finished = true;
        result
    }
    fn emit(&self, failure: Option<&str>) {
        let ts_ms = timestamp();
        let scope = JUDGE_SCOPE;
        let correlation_id = self.correlation_id;
        let duration_ms = self.started.elapsed().as_millis() as u64;
        match failure {
            Some(error_code) => {
                let level = ERROR_LEVEL;
                let event = self.operation.events().2;
                tracing::error!(
                    ts_ms,
                    level,
                    scope,
                    event,
                    correlation_id,
                    error_code,
                    duration_ms
                );
            }
            None => {
                let level = INFO_LEVEL;
                let event = self.operation.events().1;
                tracing::info!(ts_ms, level, scope, event, correlation_id, duration_ms);
            }
        }
    }
}
impl Drop for Boundary<'_> {
    fn drop(&mut self) {
        if !self.finished {
            self.emit(Some(super::constants::DEADLINE_EXCEEDED));
        }
    }
}
fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
const JUDGE_SCOPE: &str = "judge";
const INFO_LEVEL: &str = "info";
const ERROR_LEVEL: &str = "err";
