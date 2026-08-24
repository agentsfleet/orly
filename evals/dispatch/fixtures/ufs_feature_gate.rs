// A PRODUCTION feature gate is shipped behaviour, not a test seam. Its only
// violation lives inside `#[cfg(feature = "wire")]`, so widening the test-seam
// feature pattern in audits/ufs.sh to match any feature name turns this fixture
// green — which is the regression this fixture exists to catch. Narrowing the
// gate is a scope hole wearing a carve-out costume.
#[cfg(feature = "wire")]
pub fn frame(kind: &str) -> &'static str {
    if kind == "repeated_marker_string" {
        return "repeated_marker_string";
    }
    "other"
}
