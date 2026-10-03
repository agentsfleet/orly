use super::common::{batch, response};
use orly::{
    Error,
    core::env::MapEnv,
    judge::{
        authorization::{
            Authorization, AuthorizedRequest, CredentialScanner, ScanFuture, UploadPermission,
        },
        client::Client,
        constants::*,
        error::Failure,
        scanner::{GitleaksScanner, engine_scan},
        transport::{Transport, TransportFuture, TransportResponse},
    },
};
use std::{
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, Instant},
};

struct Scanner {
    failed: bool,
    calls: AtomicUsize,
}
impl CredentialScanner for Scanner {
    fn scan<'a>(&'a self, bytes: &'a [u8], _deadline: Instant) -> ScanFuture<'a> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move {
            engine_scan(bytes)?;
            if self.failed {
                Err(Failure::rejected(SCAN_FAILED).into())
            } else {
                Ok(())
            }
        })
    }
}
struct Stub {
    calls: AtomicUsize,
    status: u16,
    body: Vec<u8>,
    retry_after: Option<Duration>,
}
impl Transport for Stub {
    fn send<'a>(
        &'a self,
        request: &'a AuthorizedRequest<'_>,
        _remaining: Duration,
    ) -> TransportFuture<'a> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        assert!(request.batch().bytes().len() <= MAX_REQUEST_BYTES);
        Box::pin(async move {
            Ok(TransportResponse {
                status: self.status,
                body: self.body.clone(),
                retry_after: self.retry_after,
            })
        })
    }
}
pub(super) fn auth() -> Authorization {
    Authorization::new(
        true,
        false,
        UploadPermission::from_invocation(true),
        &MapEnv::from_pairs([(KEY_ENV, "runtime-key-sentinel")]),
    )
    .unwrap()
}
pub(super) fn runtime<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}
#[test]
fn test_judge_authorization_and_scan_are_required() {
    let key = MapEnv::from_pairs([(KEY_ENV, "runtime-key-sentinel")]);
    for (enabled, blocking, allowed) in [
        (false, false, true),
        (true, true, true),
        (true, false, false),
    ] {
        assert_eq!(
            Authorization::new(
                enabled,
                blocking,
                UploadPermission::from_invocation(allowed),
                &key
            )
            .err()
            .unwrap()
            .code(),
            AUTH_REQUIRED
        );
    }
    assert_eq!(
        Authorization::new(
            true,
            false,
            UploadPermission::from_invocation(true),
            &MapEnv::default()
        )
        .err()
        .unwrap()
        .code(),
        AUTH_REQUIRED
    );
    let scanner = Scanner {
        failed: true,
        calls: AtomicUsize::new(0),
    };
    let authorization = auth();
    let input = batch("source", "judge.scope_contradiction");
    assert!(runtime(authorization.scan(&input, &scanner, Instant::now() + DEADLINE)).is_err());
    assert_eq!(scanner.calls.load(Ordering::SeqCst), 1);
    assert!(GitleaksScanner::new(Path::new("/missing/gitleaks"), Path::new(".")).is_err());
}
#[test]
fn runtime_key_in_question_text_is_rejected_before_scanning() {
    let scanner = Scanner {
        failed: false,
        calls: AtomicUsize::new(0),
    };
    let input = batch("source", "judge.scope_contradiction");
    let mut pairs = input.pairs().clone();
    if let orly::judge::wire::Question::Noul { instructions, .. } =
        &mut pairs.values_mut().next().unwrap().definition.question
    {
        *instructions = serde_json::json!("runtime-key-sentinel");
    }
    let input = orly::judge::batch::Batch::new(
        "source".into(),
        serde_json::json!({"required":"source","exclusion":"source"}),
        pairs,
    )
    .unwrap();
    assert_eq!(
        runtime(auth().scan(&input, &scanner, Instant::now() + DEADLINE))
            .err()
            .unwrap()
            .code(),
        SECRET_FOUND
    );
    assert_eq!(scanner.calls.load(Ordering::SeqCst), 0);
}
#[test]
fn test_client_limits_retries_and_validates_answers() {
    let scanner = Scanner {
        failed: false,
        calls: AtomicUsize::new(0),
    };
    let input = batch("source", "judge.scope_contradiction");
    let authorization = auth();
    let request = runtime(authorization.scan(&input, &scanner, Instant::now() + DEADLINE)).unwrap();
    let body = serde_json::to_vec(&response(&input)).unwrap();
    let stub = Stub {
        calls: AtomicUsize::new(0),
        status: 200,
        body,
        retry_after: None,
    };
    let actual = runtime(Client::new(&stub).evaluate(&request, Instant::now() + DEADLINE)).unwrap();
    assert_eq!(actual, response(&input));
    assert_eq!(stub.calls.load(Ordering::SeqCst), 1);
    let stub = Stub {
        calls: AtomicUsize::new(0),
        status: 529,
        body: Vec::new(),
        retry_after: Some(Duration::ZERO),
    };
    assert_eq!(
        runtime(Client::new(&stub).evaluate(&request, Instant::now() + DEADLINE))
            .err()
            .unwrap()
            .code(),
        PROVIDER_FAILED
    );
    assert_eq!(stub.calls.load(Ordering::SeqCst), ATTEMPTS);
}
#[test]
fn authentication_schema_redirect_and_deadline_failures_do_not_retry() {
    let scanner = Scanner {
        failed: false,
        calls: AtomicUsize::new(0),
    };
    let input = batch("source", "judge.scope_contradiction");
    let authorization = auth();
    let request = runtime(authorization.scan(&input, &scanner, Instant::now() + DEADLINE)).unwrap();
    for status in [301, 302, 401, 403, 422] {
        let stub = Stub {
            calls: AtomicUsize::new(0),
            status,
            body: Vec::new(),
            retry_after: None,
        };
        assert!(runtime(Client::new(&stub).evaluate(&request, Instant::now() + DEADLINE)).is_err());
        assert_eq!(stub.calls.load(Ordering::SeqCst), 1);
    }
    let stub = Stub {
        calls: AtomicUsize::new(0),
        status: 429,
        body: Vec::new(),
        retry_after: Some(DEADLINE),
    };
    assert_eq!(
        runtime(Client::new(&stub).evaluate(&request, Instant::now() + DEADLINE))
            .err()
            .unwrap()
            .code(),
        DEADLINE_EXCEEDED
    );
    assert_eq!(stub.calls.load(Ordering::SeqCst), 1);
}
#[test]
fn malformed_wrong_model_extra_missing_and_invalid_probabilities_are_rejected() {
    use orly::judge::wire::Response;
    let input = batch("source", "judge.scope_contradiction");
    let good = serde_json::to_value(response(&input)).unwrap();
    for patch in [
        serde_json::json!({"model":"jev-latest"}),
        serde_json::json!({"answers":{}}),
        serde_json::json!({"answers":{"judge.scope_contradiction":{"type":"noul","noul":1.1}}}),
        serde_json::json!({"answers":{"judge.scope_contradiction":{"type":"noul","noul":0.9,"confidence":1.0}}}),
    ] {
        let mut invalid = good.clone();
        for (key, value) in patch.as_object().unwrap() {
            invalid[key] = value.clone();
        }
        assert!(
            Response::parse(
                &serde_json::to_vec(&invalid).unwrap(),
                &input.engine().model,
                input.questions()
            )
            .is_err()
        );
    }
    assert!(
        Response::parse(
            &vec![b' '; MAX_RESPONSE_BYTES + 1],
            &input.engine().model,
            input.questions()
        )
        .is_err()
    );
}
#[test]
fn test_judge_never_runs_repository_code_or_leaks_key() {
    use orly::judge::{
        engine::JevEngine, judger::LiveJudger, replay::ReplayStore, runner::Invoker,
    };
    let root = tempfile::tempdir().unwrap();
    let marker = root.path().join("executed");
    std::fs::write(
        root.path().join("hostile.json"),
        serde_json::to_vec(&serde_json::json!({"command":["touch",marker],"plugin":"execute_me"}))
            .unwrap(),
    )
    .unwrap();
    let store =
        ReplayStore::open_private(&root.path().join("state"), RETENTION_SECONDS, CACHE_BYTES)
            .unwrap();
    let input = batch("source", "judge.scope_contradiction");
    let scanner = Scanner {
        failed: false,
        calls: AtomicUsize::new(0),
    };
    let stub = Stub {
        calls: AtomicUsize::new(0),
        status: 200,
        body: serde_json::to_vec(&response(&input)).unwrap(),
        retry_after: None,
    };
    let authorization = auth();
    let engine = JevEngine::new(&authorization, &scanner, &stub);
    let judger = LiveJudger {
        store: &store,
        engine: &engine,
    };
    let result = runtime(Invoker::new(&judger).invoke(&[input], true, |_, _| {})).unwrap();
    assert_eq!(result.exit_code(), 0);
    let value = serde_json::to_string(&result).unwrap();
    assert!(!value.contains("runtime-key-sentinel"));
    let error: Error = Failure::rejected(AUTH_REQUIRED).into();
    assert!(!error.to_string().contains("runtime-key-sentinel"));
    assert!(!marker.exists());
}
#[test]
fn actual_scanner_ignores_repository_suppressions() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(
        root.path().join(".gitleaks.toml"),
        "[allowlist]\nregexes=['.*']",
    )
    .unwrap();
    let executable = std::process::Command::new("mise")
        .args(["which", "gitleaks"])
        .output()
        .unwrap();
    let executable = std::str::from_utf8(&executable.stdout).unwrap().trim();
    let scanner = GitleaksScanner::new(Path::new(executable), root.path()).unwrap();
    let credential = format!("{}{}", "AKIA", "J7ZL4T6V3Q2N6R5P");
    let bytes = serde_json::to_vec(
        &serde_json::json!({"example":format!("aws_access_key_id = {credential}")}),
    )
    .unwrap();
    assert_eq!(
        runtime(scanner.scan(&bytes, Instant::now() + DEADLINE))
            .err()
            .unwrap()
            .code(),
        SECRET_FOUND
    );
    let clean =
        serde_json::to_vec(&serde_json::json!({"source":"complete bounded source"})).unwrap();
    runtime(scanner.scan(&clean, Instant::now() + DEADLINE)).unwrap();
}
