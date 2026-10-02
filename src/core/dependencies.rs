use super::git::FileMode;
use crate::{Error, Result};
use orly_fs::filesystem::FileState;
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DependencyFile {
    digest: String,
    mode: FileMode,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Dependencies {
    files: BTreeMap<RelativePath, DependencyFile>,
}

impl Dependencies {
    pub fn record(&mut self, path: RelativePath, mode: FileMode, digest: &str) -> Result<()> {
        if mode == FileMode::Symlink || self.files.contains_key(&path) {
            return Err(Error::Invalid(
                "dependency must be a unique regular input".into(),
            ));
        }
        self.files.insert(
            path,
            DependencyFile {
                mode,
                digest: digest.into(),
            },
        );
        Ok(())
    }
    pub fn paths(&self) -> impl Iterator<Item = &RelativePath> {
        self.files.keys()
    }
    pub fn at<'a>(&'a self, root: &'a Path) -> CapturedDependencies<'a> {
        CapturedDependencies {
            root,
            manifest: self,
        }
    }
}

pub struct CapturedDependencies<'a> {
    root: &'a Path,
    manifest: &'a Dependencies,
}
impl CapturedDependencies<'_> {
    pub fn validate_current(&self) -> Result<()> {
        for (path, expected) in &self.manifest.files {
            let current = FileState::inspect(self.root, path, false)?;
            if !matches!(current,FileState::File {digest,mode} if digest == expected.digest && mode_matches(mode, expected.mode))
            {
                return Err(Error::Stale);
            }
        }
        Ok(())
    }
}

fn mode_matches(actual: u32, expected: FileMode) -> bool {
    #[cfg(unix)]
    {
        (actual & 0o111 != 0) == (expected == FileMode::Executable)
    }
    #[cfg(windows)]
    {
        actual
            == orly_fs::permissions::normalize_mode(if expected == FileMode::Executable {
                0o755
            } else {
                0o644
            })
    }
}
