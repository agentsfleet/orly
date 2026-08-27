// ERR-RS carve-out fixture: a `#[cfg(test)]` module carrying BOTH violations —
// an aliasless public error type and a map_err that stringifies its cause — and
// exiting clean. Rust keeps unit tests inside the file they cover, so a fixture
// error and a rendered assertion string would otherwise read as that file's
// worst debt. Same carve-out audits/logging.sh applies to the same scope.
pub fn parse(raw: &str) -> Option<u32> {
    raw.trim().parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, thiserror::Error)]
    #[error("fixture")]
    pub struct Error;

    #[test]
    fn renders_a_cause_for_the_assertion() {
        let rendered = "nine".parse::<u32>().map_err(|cause| cause.to_string());

        assert!(rendered.is_err());
        assert_eq!(parse(" 9 "), Some(9));
    }
}
