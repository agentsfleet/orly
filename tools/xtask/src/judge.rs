use crate::error::Result;
use orly::judge::{bank::Bank, evaluation::Corpus};
use std::path::Path;

pub fn check() -> Result<()> {
    let report = Corpus::compiled()?.validate(&Bank::compiled()?)?;
    let families = report.families;
    let cases = report.cases;
    let complete = report.complete;
    let owner_reviewed = report.owner_reviewed;
    // logging: stdout is the offline corpus validation result.
    println!(
        "judge corpus: {families} families; {cases} cases; {complete} complete labels; owner_reviewed={owner_reviewed}"
    );
    Ok(())
}

pub fn evaluate(
    allow_upload: bool,
    reviewed_commit: &str,
    agent_report: &Path,
    scanner: &Path,
    state: &Path,
    report: &Path,
) -> Result<()> {
    // Workspace dependency features are visible to the library, rather than this package.
    let result = orly::judge::evaluation_command::run(
        allow_upload,
        reviewed_commit,
        agent_report,
        scanner,
        state,
    )?;
    std::fs::write(report, serde_json::to_vec_pretty(&result)?)?;
    if !result.passed {
        return Err(crate::error::Error::Invalid);
    }
    Ok(())
}
