// The bug this lane exists for: a wire verb spelled inline, twice, in a
// crate the gate claimed to cover and did not read.
pub fn probe(reply: &str) -> bool {
    reply == "repeated_marker_string" || reply.contains("repeated_marker_string")
}
