use std::path::PathBuf;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Schema(Box<jsonschema::ValidationError<'static>>),
    #[error(transparent)]
    Toml(#[from] toml::de::Error),
    #[cfg(unix)]
    #[error(transparent)]
    Process(#[from] nix::Error),
    #[error(transparent)]
    GitObject(#[from] git2::Error),
    #[error(transparent)]
    Version(#[from] semver::Error),
    #[error(transparent)]
    Glob(#[from] globset::Error),
    #[error("input is not valid Unicode text")]
    Utf8(#[from] std::str::Utf8Error),
    #[error("input is not valid Unicode text")]
    OwnedUtf8(#[from] std::string::FromUtf8Error),
    #[error(transparent)]
    Language(#[from] tree_sitter::LanguageError),
    #[error(transparent)]
    Judge(#[from] crate::judge::error::Failure),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("refusing conflicting path: {0}")]
    Conflict(PathBuf),
    #[error("installation is locked")]
    Locked,
    #[error("snapshot is stale")]
    Stale,
    #[error("git operation failed: {0}")]
    Git(String),
    #[error("interrupted after operation {0}")]
    Interrupted(usize),
}

pub const INVALID_INPUT: &str = "invalid_input";
pub const PATH_CONFLICT: &str = "path_conflict";
pub const INSTALL_LOCKED: &str = "install_locked";
pub const STALE_IDENTITY: &str = "stale_identity";
pub const IO_FAILURE: &str = "io_failure";
pub const JSON_FAILURE: &str = "json_failure";
pub const TOML_FAILURE: &str = "toml_failure";
pub const PROCESS_FAILURE: &str = "process_failure";
pub const GIT_FAILURE: &str = "git_failure";
pub const OPERATION_INTERRUPTED: &str = "operation_interrupted";

impl From<jsonschema::ValidationError<'_>> for Error {
    fn from(error: jsonschema::ValidationError<'_>) -> Self {
        Self::Schema(Box::new(error.to_owned()))
    }
}

impl From<orly_fs::Error> for Error {
    fn from(error: orly_fs::Error) -> Self {
        match error {
            orly_fs::Error::Io(cause) => Self::Io(cause),
            orly_fs::Error::Json(cause) => Self::Json(cause),
            orly_fs::Error::Invalid(reason) => Self::Invalid(reason),
            orly_fs::Error::Conflict(path) => Self::Conflict(path),
            orly_fs::Error::Stale => Self::Stale,
        }
    }
}

impl From<orly_decision::Error> for Error {
    fn from(error: orly_decision::Error) -> Self {
        match error {
            orly_decision::Error::Json(cause) => Self::Json(cause),
            orly_decision::Error::Version(cause) => Self::Version(cause),
            orly_decision::Error::Invalid(reason) => Self::Invalid(reason),
            orly_decision::Error::Stale => Self::Stale,
        }
    }
}

impl Error {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Invalid(_)
            | Self::Version(_)
            | Self::Glob(_)
            | Self::Utf8(_)
            | Self::OwnedUtf8(_) => INVALID_INPUT,
            Self::Language(_) => INVALID_INPUT,
            Self::Judge(failure) => failure.code(),
            Self::Conflict(_) => PATH_CONFLICT,
            Self::Locked => INSTALL_LOCKED,
            Self::Stale => STALE_IDENTITY,
            Self::Io(_) => IO_FAILURE,
            Self::Json(_) | Self::Schema(_) => JSON_FAILURE,
            Self::Toml(_) => TOML_FAILURE,
            #[cfg(unix)]
            Self::Process(_) => PROCESS_FAILURE,
            Self::Git(_) | Self::GitObject(_) => GIT_FAILURE,
            Self::Interrupted(_) => OPERATION_INTERRUPTED,
        }
    }
}
