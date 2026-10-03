pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Version(#[from] semver::Error),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("snapshot is stale")]
    Stale,
}
