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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repetition_here_is_fixture_data() {
        assert!(probe("repeated_fixture_key"));
        assert!(probe("repeated_fixture_key"));
    }
}
