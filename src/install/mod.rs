use orly_fs::filesystem::RepositoryFs;
use orly_fs::path::RelativePath;
pub mod hooks;
pub mod operation;
pub mod preflight;
mod preflight_migration;
pub mod recovery;
mod state;

use crate::Result;
use crate::core::document::ObjectDocument;
use crate::core::{config::Configuration, constants::*, git::Git, payload::Payload};
use preflight::InstallPlanner;
use recovery::{InstallationLock, OperationManifest};
use serde::Serialize;
pub use state::LocalState;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
pub struct InstallReport {
    pub identity: String,
    pub operations: usize,
    pub dry_run: bool,
}

pub struct Installer {
    root: PathBuf,
    pub(super) filesystem: RepositoryFs,
}
impl Installer {
    pub fn new(root: &Path) -> Result<Self> {
        let filesystem = RepositoryFs::open(root)?;
        Ok(Self {
            root: filesystem.root().to_owned(),
            filesystem,
        })
    }

    pub fn local_state(&self, create: bool) -> Result<LocalState<'_>> {
        LocalState::open(self, create)
    }

    pub(super) fn verify_identity(&self) -> Result<()> {
        Ok(self.filesystem.verify_identity()?)
    }
    pub fn install(
        &self,
        config: &Configuration,
        binary: &Path,
        hooks: bool,
        loaders: bool,
        dry_run: bool,
    ) -> Result<InstallReport> {
        config.releases.verify_location(&self.filesystem)?;
        let payload = Payload::embedded()?;
        let state = self.local_state(!dry_run)?;
        let _lock = if dry_run {
            None
        } else {
            Some(InstallationLock::acquire(&state)?)
        };
        let planner = InstallPlanner::new(&state, &payload, config, binary, hooks, loaders);
        let mut manifest = OperationManifest::load(&state)?.map_or_else(|| planner.plan(), Ok)?;
        planner.authorize(&manifest)?;
        let report = InstallReport {
            identity: manifest.identity.clone(),
            operations: manifest.operations.len(),
            dry_run,
        };
        if !dry_run && !manifest.operations.is_empty() {
            manifest.save(&state)?;
            planner.resume(&mut manifest)?;
        }
        Ok(report)
    }
    pub fn doctor(&self) -> Result<Vec<String>> {
        let root = &self.root;
        let state = self.local_state(false)?;
        let config = Configuration::from_json(
            &self
                .filesystem
                .read(&RelativePath::new(CONFIG_PATH)?, MAX_OUTPUT_BYTES)?,
        )?;
        config.validate()?;
        config.releases.verify_location(&self.filesystem)?;
        let historical = config.releases.completed_specs()?;
        let mut findings = Vec::new();
        for (path, expected) in &config.managed {
            match self.filesystem.inspect(path, false) {
                Ok(operation::FileState::File { digest, .. }) if &digest == expected => {}
                _ => findings.push(format!(
                    "{}:1 managed file differs or is missing",
                    path.as_str()
                )),
            }
        }
        if OperationManifest::load(&state)?.is_some() {
            findings.push(RECOVERY_FINDING.into());
        }
        let listing = Git::output(root, &["ls-files", "-z"])?;
        let mapping = Payload::embedded()?.reference_map()?;
        for raw in listing.split(|b| *b == 0).filter(|p| !p.is_empty()) {
            let path = std::str::from_utf8(raw)?;
            if !path.ends_with(MARKDOWN_EXT) || historical.is_match(path) {
                continue;
            }
            let relative = RelativePath::new(path)?;
            let content = String::from_utf8(self.filesystem.read(&relative, MAX_SOURCE_BYTES)?)?;
            for caller in crate::core::citations::CitationRewriter::new(&mapping)
                .for_document(&relative, &relative)
                .rewrite(&content, false)
                .1
            {
                findings.push(format!(
                    "{path}:{} stale managed caller {}",
                    caller.line, caller.target
                ));
            }
        }
        state.verify_identity()?;
        Ok(findings)
    }
}
const RECOVERY_FINDING: &str = "installation recovery is incomplete";
const MARKDOWN_EXT: &str = ".md";
