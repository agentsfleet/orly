// Every literal here is either bound to a name or unfixable by binding one.
// Pins the Rust lane carve-outs in audits/ufs.sh — remove any one of them and
// this fixture starts failing, which is the point of it.
//
//   `static` bindings   two names, one value, two domains — the same case the
//                       single-line const carve-out already allows
//   `#[...]` attributes a literal token the language requires; no const is
//                       accepted in that position, so no rename can fix it
//   `#[cfg(test)]`      Rust keeps unit tests inside the file they cover, so
//                       fixture keys would otherwise read as production debt
//   test-util seam      a helper gated on a test FEATURE compiles into the
//                       crate so a sibling integration test can call it; its
//                       contents are fixture data, not shipped behaviour
static WIRE_PING: &str = "PING";
static HEALTH_PROBE: &str = "PING";

#[derive(Debug)]
pub struct Probe {
    #[serde(rename = "repeated_attribute_literal")]
    pub sent: String,
    #[serde(rename = "repeated_attribute_literal")]
    pub seen: String,
}

pub fn probe(reply: &str) -> bool {
    reply == WIRE_PING || reply == HEALTH_PROBE
}

// A production feature gate is NOT a test seam — this block still counts, and
// the literal below appears once precisely so it stays clean either way.
#[cfg(feature = "wire")]
pub fn wire_probe() -> &'static str {
    "wire_only_literal"
}

// One of each error kind, for a sibling integration test. Feature-gated, so it
// is fixture data the same way a `#[cfg(test)]` block is.
#[cfg(feature = "test-util")]
pub fn one_of_each_kind() -> Vec<&'static str> {
    vec!["repeated_seam_fixture", "repeated_seam_fixture"]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repetition_here_is_fixture_data() {
        assert!(probe("repeated_fixture_key"));
        assert!(probe("repeated_fixture_key"));
    }
}
