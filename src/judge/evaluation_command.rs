use super::evaluation_run::EvaluationReport;
#[cfg(feature = "judge-transport")]
use super::{
    authorization::{Authorization, UploadPermission},
    bank::Bank,
    engine::JevEngine,
    evaluation::Corpus,
    evaluation_review::ReviewedCorpus,
    evaluation_run::{AgentReport, LiveEvaluator},
    judger::LiveJudger,
    replay::ReplayStore,
    scanner::GitleaksScanner,
    transport::TypeSafeTransport,
};
use crate::Result;
#[cfg(feature = "judge-transport")]
use crate::core::env::ProcessEnv;
use std::path::Path;

#[cfg(feature = "judge-transport")]
pub fn run(
    allow_upload: bool,
    reviewed_commit: &str,
    agent_report: &Path,
    scanner: &Path,
    state: &Path,
) -> Result<EvaluationReport> {
    crate::core::logging::Logging::new(&ProcessEnv).install();
    let authorization = Authorization::new(
        true,
        false,
        UploadPermission::from_invocation(allow_upload),
        &ProcessEnv,
    )?;
    let bank = Bank::compiled()?;
    let corpus = Corpus::compiled()?;
    let reviewed = ReviewedCorpus::open(Path::new("."), reviewed_commit)?;
    let agent = AgentReport::read(agent_report)?;
    let scanner = GitleaksScanner::new(scanner, Path::new("."))?;
    let store = ReplayStore::open_private(
        state,
        super::constants::RETENTION_SECONDS,
        super::constants::CACHE_BYTES,
    )?;
    let transport = TypeSafeTransport::new()?;
    let engine = JevEngine::new(&authorization, &scanner, &transport);
    let judger = LiveJudger {
        store: &store,
        engine: &engine,
    };
    let evaluator = LiveEvaluator {
        bank: &bank,
        corpus: &corpus,
        judger: &judger,
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    runtime.block_on(evaluator.evaluate(&agent, &reviewed.revision(), |destination,pairs| {
        // logging: stderr announces the explicit upload destination before each request.
        eprintln!("upload destination={destination} categories=synthetic_evidence,question_definitions pairs={pairs}");
    }))
}
#[cfg(not(feature = "judge-transport"))]
pub fn run(
    _allow_upload: bool,
    _reviewed_commit: &str,
    _agent_report: &Path,
    _scanner: &Path,
    _state: &Path,
) -> Result<EvaluationReport> {
    Err(crate::Error::Invalid(
        "enable orly/judge-transport for explicit live evaluation".into(),
    ))
}
