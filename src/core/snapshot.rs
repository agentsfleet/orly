use super::dependencies::Dependencies;
use super::{config::Configuration, document::ObjectDocument};
use super::{constants::*, git};
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};
#[path = "snapshot_capture.rs"]
mod capture;
const HEAD_REF: &str = "HEAD";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum SourceKind {
    // Empty struct variants let Serde reject fields beyond the kind tag.
    Index {},
    Head {},
    Event { base: String, head: String },
    WorkingTree { untracked: BTreeSet<RelativePath> },
}

pub use super::git::FileMode;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SnapshotIdentity {
    pub source: SourceKind,
    pub base: String,
    pub head: String,
    pub manifest_digest: String,
    pub configuration_digest: String,
    pub engine: String,
    pub dependencies: Dependencies,
}

#[derive(Debug, Serialize)]
pub struct Snapshot {
    identity: SnapshotIdentity,
    #[serde(skip)]
    root: PathBuf,
    #[serde(skip)]
    alternate_index: Option<OsString>,
    #[serde(skip)]
    index_digest: Option<String>,
    #[serde(skip)]
    files: BTreeMap<RelativePath, CapturedFile>,
}

#[derive(Debug)]
pub struct CapturedFile {
    pub mode: FileMode,
    pub bytes: Vec<u8>,
    digest: String,
}
impl CapturedFile {
    fn new(mode: FileMode, bytes: Vec<u8>) -> Self {
        let digest = ContentDigest::digest(&bytes);
        Self {
            mode,
            bytes,
            digest,
        }
    }
    pub fn digest(&self) -> &str {
        &self.digest
    }
}

impl Snapshot {
    pub fn identity(&self) -> &SnapshotIdentity {
        &self.identity
    }
    pub fn files(&self) -> &BTreeMap<RelativePath, CapturedFile> {
        &self.files
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn digest(&self) -> Result<String> {
        Ok(ContentDigest::identity(&self.identity)?)
    }

    fn configure(
        mut self,
        mut observe: impl FnMut(ConfigurationBoundary) -> Result<()>,
    ) -> Result<(Self, Configuration)> {
        let path = RelativePath::new(CONFIG_PATH)?;
        if !self.files.contains_key(&path) {
            self = self.with_dependencies(&BTreeSet::from([path.clone()]))?;
        }
        observe(ConfigurationBoundary::ConfigurationCaptured)?;
        let config = Configuration::from_json(&self.files[&path].bytes)?;
        config.validate()?;
        let dependencies = config
            .untracked_dependencies
            .iter()
            .filter(|path| {
                !self
                    .identity
                    .dependencies
                    .paths()
                    .any(|captured| captured == *path)
            })
            .cloned()
            .collect();
        self = self.with_dependencies(&dependencies)?;
        self.identity.configuration_digest = config.digest()?;
        observe(ConfigurationBoundary::DependenciesCaptured)?;
        self.validate_current()?;
        Ok((self, config))
    }
}

impl Snapshot {
    pub fn validate_current(&self) -> Result<()> {
        self.identity
            .dependencies
            .at(&self.root)
            .validate_current()?;
        if matches!(self.identity.source, SourceKind::Event { .. }) {
            return Ok(());
        }
        if git::Git::text(&self.root, &["rev-parse", "--verify", HEAD_REF])? != self.identity.head {
            return Err(Error::Stale);
        }
        match &self.identity.source {
            SourceKind::Head {} => return Ok(()),
            SourceKind::Event { .. } => return Ok(()),
            SourceKind::Index {} => {
                if self.index_digest.as_ref() != Some(&self.current_index_digest()?) {
                    return Err(Error::Stale);
                }
                return Ok(());
            }
            SourceKind::WorkingTree { .. } => {}
        }
        let current = Self::capture_dependencies(
            &self.root,
            self.identity.source.clone(),
            &self.identity.base,
            self.identity.configuration_digest.clone(),
            self.alternate_index.clone(),
            &self.identity.dependencies.paths().cloned().collect(),
        )?;
        if self.digest()? != current.digest()? || self.index_digest != current.index_digest {
            return Err(Error::Stale);
        }
        Ok(())
    }
}

pub struct GitSnapshotSource<'a> {
    root: &'a Path,
    source: SourceKind,
    base: &'a str,
    alternate_index: Option<OsString>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureBoundary {
    IdentitiesResolved,
    FilesRead,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConfigurationBoundary {
    ConfigurationCaptured,
    DependenciesCaptured,
}

impl<'a> GitSnapshotSource<'a> {
    pub fn new(
        root: &'a Path,
        source: SourceKind,
        base: &'a str,
        alternate_index: Option<OsString>,
    ) -> Self {
        Self {
            root,
            source,
            base,
            alternate_index,
        }
    }
    #[cfg(feature = "test-util")]
    pub fn configured_observed(
        &self,
        observe: impl FnMut(ConfigurationBoundary) -> Result<()>,
    ) -> Result<(Snapshot, Configuration)> {
        self.capture(String::new())?.configure(observe)
    }
    #[cfg(feature = "test-util")]
    pub fn capture_observed(
        &self,
        configuration_digest: String,
        observe: impl FnMut(CaptureBoundary) -> Result<()>,
    ) -> Result<Snapshot> {
        Snapshot::capture_observed(
            self.root,
            self.source.to_owned(),
            self.base,
            configuration_digest,
            self.alternate_index.to_owned(),
            observe,
        )
    }
}
impl GitSnapshotSource<'_> {
    pub fn configured(&self) -> Result<(Snapshot, Configuration)> {
        self.capture(String::new())?.configure(|_| Ok(()))
    }
    pub fn capture(&self, configuration_digest: String) -> Result<Snapshot> {
        Snapshot::capture(
            self.root,
            self.source.to_owned(),
            self.base,
            configuration_digest,
            self.alternate_index.to_owned(),
        )
    }
}
