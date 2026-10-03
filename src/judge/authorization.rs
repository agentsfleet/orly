use super::error::rejected;
use super::metrics::{Boundary, Operation};
use super::{batch::Batch, constants::*};
use crate::{Result, core::env::EnvSource};
use std::{future::Future, pin::Pin, time::Instant};
use tracing::Instrument;

pub type ScanFuture<'a> = Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>>;
pub trait CredentialScanner: Send + Sync {
    fn scan<'a>(&'a self, bytes: &'a [u8], deadline: Instant) -> ScanFuture<'a>;
}
/// Never deserialized from a checkout. The outer invocation supplies this permission.
pub struct UploadPermission {
    permitted: bool,
}
impl UploadPermission {
    pub fn from_invocation(allow_upload: bool) -> Self {
        Self {
            permitted: allow_upload,
        }
    }
}
pub struct Authorization {
    key: String,
}
impl Authorization {
    pub fn new(
        enabled: bool,
        blocking: bool,
        permission: UploadPermission,
        env: &dyn EnvSource,
    ) -> Result<Self> {
        if !enabled || blocking || !permission.permitted {
            return Err(rejected(AUTH_REQUIRED));
        }
        let key = env
            .get(KEY_ENV)
            .and_then(|value| value.to_str().map(str::to_owned))
            .filter(|value| !value.trim().is_empty() && !value.contains(['\r', '\n']))
            .ok_or_else(|| rejected(AUTH_REQUIRED))?;
        Ok(Self { key })
    }
    pub async fn scan<'a>(
        &'a self,
        batch: &'a Batch,
        scanner: &dyn CredentialScanner,
        deadline: Instant,
    ) -> Result<AuthorizedRequest<'a>> {
        let boundary = Boundary::start(Operation::Scan, batch.digest());
        let result = self
            .scanned(batch, scanner, deadline)
            .instrument(boundary.span())
            .await;
        boundary.finish(result)
    }
    async fn scanned<'a>(
        &'a self,
        batch: &'a Batch,
        scanner: &dyn CredentialScanner,
        deadline: Instant,
    ) -> Result<AuthorizedRequest<'a>> {
        // Check the actual runtime key too; unknown credential formats must not escape in source.
        super::scanner::reject_secrets(batch.bytes(), Some(&self.key))?;
        let remaining = deadline.saturating_duration_since(Instant::now());
        tokio::time::timeout(remaining, scanner.scan(batch.bytes(), deadline))
            .await
            .map_err(|_| rejected(DEADLINE_EXCEEDED))??;
        Ok(AuthorizedRequest {
            batch,
            #[cfg(feature = "judge-transport")]
            key: &self.key,
        })
    }
}
/// Transport accepts only this type; its fields cannot bypass authorization or scanning.
pub struct AuthorizedRequest<'a> {
    batch: &'a Batch,
    #[cfg(feature = "judge-transport")]
    key: &'a str,
}
impl AuthorizedRequest<'_> {
    pub fn batch(&self) -> &Batch {
        self.batch
    }
    #[cfg(feature = "judge-transport")]
    pub(super) fn key(&self) -> &str {
        self.key
    }
}
