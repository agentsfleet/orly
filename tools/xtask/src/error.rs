pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Filesystem(#[from] orly_fs::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Engine(#[from] orly::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Syntax(#[from] syn::Error),
    #[error("input is not valid Unicode text")]
    Utf8(#[from] std::str::Utf8Error),
    #[error("invalid maintenance command")]
    Invalid,
}
