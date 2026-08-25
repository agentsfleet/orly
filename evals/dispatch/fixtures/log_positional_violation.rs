pub fn report(runner: &str) {
    tracing::info!(
        event = "runner_checked",
        "runner {}",
        runner,
    );
}
