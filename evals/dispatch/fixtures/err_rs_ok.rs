// ERR-RS pass fixture: one crate error, the alias beside it, and a map_err
// that ADDS context the call site alone knows without stringifying its cause.
// The `to_string()` here converts a PATH, not the closure binding — the
// distinction the rule turns on.
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("cannot read the manifest at {path}")]
    Manifest {
        source: std::io::Error,
        path: String,
    },
}

pub type Result<T, E = Error> = core::result::Result<T, E>;

pub fn read_manifest(path: &Path) -> Result<String> {
    std::fs::read_to_string(path).map_err(|cause| Error::Manifest {
        source: cause,
        path: path.display().to_string(),
    })
}
