//! The judge's terminal boundary carries a boxed kind and preserves its underlying cause.
use std::{backtrace::Backtrace, error::Error as StdError, fmt};

pub type Result<T, E = Failure> = crate::Result<T, E>;
#[derive(Debug)]
pub struct Failure {
    inner: Box<Inner>,
}
#[derive(Debug)]
struct Inner {
    kind: Kind,
    backtrace: Backtrace,
}
#[derive(Debug, thiserror::Error)]
enum Kind {
    #[error("judgment is unavailable")]
    Rejected { code: &'static str },
    #[error("{operation} failed")]
    Context {
        operation: &'static str,
        #[source]
        source: crate::Error,
    },
    #[cfg(feature = "judge-transport")]
    #[error("provider transport failed")]
    Transport {
        #[source]
        source: reqwest::Error,
    },
}
impl Failure {
    pub fn rejected(code: &'static str) -> Self {
        Self::from_kind(Kind::Rejected { code })
    }
    pub(super) fn context(operation: &'static str, source: crate::Error) -> Self {
        Self::from_kind(Kind::Context { operation, source })
    }
    fn from_kind(kind: Kind) -> Self {
        Self {
            inner: Box::new(Inner {
                kind,
                backtrace: Backtrace::capture(),
            }),
        }
    }
    pub const fn code(&self) -> &'static str {
        match self.inner.kind {
            Kind::Rejected { code } => code,
            Kind::Context { ref source, .. } => source.code(),
            #[cfg(feature = "judge-transport")]
            Kind::Transport { .. } => super::constants::PROVIDER_FAILED,
        }
    }
    pub fn backtrace(&self) -> &Backtrace {
        &self.inner.backtrace
    }
}
#[cfg(feature = "judge-transport")]
impl From<reqwest::Error> for Failure {
    fn from(source: reqwest::Error) -> Self {
        Self::from_kind(Kind::Transport {
            source: source.without_url(),
        })
    }
}
impl fmt::Display for Failure {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(output, "[{}] {}", self.code(), self.inner.kind)
    }
}
impl StdError for Failure {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        self.inner.kind.source()
    }
}
pub(super) fn rejected(code: &'static str) -> crate::Error {
    Failure::rejected(code).into()
}
