pub fn report(runner: &str, error: &str) {
    // println! in documentation is not an emit.
    let code = "UZ-DB-001";
    let id = runner;
    let reason = error;
    let event = "runner_lease_failed";
    tracing::warn!(
        error_code = code,
        runner_id = id,
        reason,
        event,
        "lease failed",
    );

    // logging: stdout is this command's answer, not a log record
    println!("{runner}");
    eprintln!("{error}"); // logging: stderr is the fallback fatal renderer
}
