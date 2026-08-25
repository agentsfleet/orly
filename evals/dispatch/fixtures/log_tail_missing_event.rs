fn report_failure() {
    tracing::warn!(reason = "lease unavailable")
}
