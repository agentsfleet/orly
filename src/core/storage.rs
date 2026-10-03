use orly_fs::filesystem::RepositoryFs;
use orly_fs::path::RelativePath;

use crate::{Error, Result};
use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "RelativePath", into = "RelativePath")]
#[schemars(with = "RelativePath")]
pub struct ReleaseStorage {
    root: RelativePath,
}

impl ReleaseStorage {
    pub fn new(root: RelativePath) -> Result<Self> {
        let storage = Self { root };
        for reserved in RESERVED_PATHS {
            storage.ensure_separate(&RelativePath::new(*reserved)?)?;
        }
        Ok(storage)
    }

    pub fn root(&self) -> &RelativePath {
        &self.root
    }

    pub fn ensure_separate(&self, path: &RelativePath) -> Result<()> {
        if overlaps(Path::new(self.root.as_str()), Path::new(path.as_str())) {
            return Err(Error::Invalid(STORAGE_OVERLAP.into()));
        }
        Ok(())
    }

    pub fn verify_location(&self, filesystem: &RepositoryFs) -> Result<()> {
        filesystem.verify_identity()?;
        let git = super::git::Git::state_path(filesystem.root(), ".")?.canonicalize()?;
        if overlaps(&self.root.join(filesystem.root()), &git) {
            return Err(Error::Invalid(STORAGE_OVERLAP.into()));
        }
        match filesystem.subdirectory(&self.root, false) {
            Ok(directory) => Ok(directory.verify_identity()?),
            Err(orly_fs::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(())
            }
            Err(error) => Err(error.into()),
        }
    }

    pub fn completed_specs(&self) -> Result<GlobSet> {
        let configured = format!("{}/v*/done/**", globset::escape(self.root.as_str()));
        let mut patterns = GlobSetBuilder::new();
        for pattern in [EXISTING_COMPLETED_SPECS, &configured] {
            patterns.add(GlobBuilder::new(pattern).literal_separator(true).build()?);
        }
        Ok(patterns.build()?)
    }
}

fn overlaps(left: &Path, right: &Path) -> bool {
    // Apply the same filename case rule on every host.
    let left = left.as_os_str().to_ascii_lowercase();
    let right = right.as_os_str().to_ascii_lowercase();
    Path::new(&left).starts_with(&right) || Path::new(&right).starts_with(&left)
}

impl TryFrom<RelativePath> for ReleaseStorage {
    type Error = Error;

    fn try_from(root: RelativePath) -> Result<Self> {
        Self::new(root)
    }
}

impl From<ReleaseStorage> for RelativePath {
    fn from(storage: ReleaseStorage) -> Self {
        storage.root
    }
}

impl Default for ReleaseStorage {
    fn default() -> Self {
        Self::new(RelativePath::new(DEFAULT_RELEASE_ROOT).expect("constant is a relative path"))
            .expect("constant release root is separate from reserved paths")
    }
}

pub const DEFAULT_RELEASE_ROOT: &str = ".orly/rels";
const EXISTING_COMPLETED_SPECS: &str = "docs/v*/done/**";
const STORAGE_OVERLAP: &str = "shared release storage overlaps an installation or private path";
const RESERVED_PATHS: &[&str] = &[
    ".git",
    ".oracle",
    super::constants::CONFIG_PATH,
    ".orly/bin",
    super::constants::HOOKS_DIRECTORY,
    super::constants::ORLY_AGENTS_FILENAME,
    super::constants::AGENTS_FILENAME,
    crate::host::CLAUDE_FILENAME,
    crate::host::OPENCODE_FILENAME,
];
