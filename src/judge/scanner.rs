use super::error::rejected;
use super::{
    authorization::{CredentialScanner, ScanFuture},
    constants::*,
};
use crate::{Error, Result};
use std::{
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    time::Instant,
};
use tokio::io::AsyncWriteExt;

pub struct GitleaksScanner {
    executable: PathBuf,
}
impl GitleaksScanner {
    pub fn new(executable: &Path, repository: &Path) -> Result<Self> {
        let executable = executable.canonicalize()?;
        if !executable.is_file() || executable.starts_with(repository.canonicalize()?) {
            return Err(rejected(SCAN_FAILED));
        }
        Ok(Self { executable })
    }
    async fn run(&self, bytes: &[u8], deadline: Instant) -> Result<()> {
        engine_scan(bytes)?;
        let mut configuration = tempfile::NamedTempFile::new()?;
        configuration.write_all(include_bytes!("scanner.toml"))?;
        configuration.flush()?;
        let directory = tempfile::tempdir()?;
        let mut child = tokio::process::Command::new(&self.executable)
            .args(SCANNER_ARGS)
            .arg(configuration.path())
            .current_dir(directory.path())
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()?;
        let operation = async {
            let mut input = child.stdin.take().ok_or_else(|| rejected(SCAN_FAILED))?;
            input.write_all(bytes).await?;
            drop(input);
            Ok::<_, Error>(child.wait().await?)
        };
        let remaining = deadline.saturating_duration_since(Instant::now());
        match tokio::time::timeout(remaining, operation).await {
            Ok(Ok(status)) if status.success() => Ok(()),
            Ok(Ok(status)) if status.code() == Some(FINDING_EXIT) => Err(rejected(SECRET_FOUND)),
            Ok(Ok(_)) => Err(rejected(SCAN_FAILED)),
            Ok(Err(error)) => {
                child.kill().await?;
                child.wait().await?;
                Err(error)
            }
            Err(_) => {
                child.kill().await?;
                child.wait().await?;
                Err(rejected(DEADLINE_EXCEEDED))
            }
        }
    }
}
impl CredentialScanner for GitleaksScanner {
    fn scan<'a>(&'a self, bytes: &'a [u8], deadline: Instant) -> ScanFuture<'a> {
        Box::pin(self.run(bytes, deadline))
    }
}
pub fn engine_scan(bytes: &[u8]) -> Result<()> {
    reject_secrets(bytes, None)
}
pub(super) fn reject_secrets(bytes: &[u8], runtime_key: Option<&str>) -> Result<()> {
    let value: serde_json::Value = serde_json::from_slice(bytes)?;
    let mut pending = vec![&value];
    let secret = |text: &str| {
        runtime_key.is_some_and(|key| text.contains(key))
            || SECRET_MARKERS.iter().any(|marker| text.contains(marker))
    };
    while let Some(value) = pending.pop() {
        match value {
            serde_json::Value::String(text) if secret(text) => {
                return Err(rejected(SECRET_FOUND));
            }
            serde_json::Value::Array(items) => pending.extend(items),
            serde_json::Value::Object(items) => {
                if items.keys().any(|key| secret(key)) {
                    return Err(rejected(SECRET_FOUND));
                }
                pending.extend(items.values());
            }
            _ => {}
        }
    }
    Ok(())
}
const FINDING_EXIT: i32 = 10;
const SCANNER_ARGS: [&str; 7] = [
    "stdin",
    "--no-banner",
    "--redact",
    "--exit-code",
    "10",
    "--ignore-gitleaks-allow",
    "--config",
];
const SECRET_MARKERS: [&str; 5] = [
    "-----BEGIN PRIVATE KEY-----",
    "-----BEGIN RSA PRIVATE KEY-----",
    "ghp_",
    "github_pat_",
    "sk_live_",
];
