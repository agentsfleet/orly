use crate::core::{constants::HOOKS_PATH_KEY, git::Git};
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::path::Path;

use super::Installer;
pub use orly_fs::filesystem::FileState;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operation {
    Write {
        path: RelativePath,
        before: FileState,
        bytes: Vec<u8>,
        mode: u32,
    },
    Binary {
        path: RelativePath,
        before: FileState,
        source: std::path::PathBuf,
        digest: String,
    },
    Link {
        path: RelativePath,
        before: FileState,
        target: String,
    },
    Hooks {
        before: Option<String>,
        after: String,
    },
    Delete {
        path: RelativePath,
        before: FileState,
    },
}

impl Operation {
    pub fn is_applied(&self, installer: &Installer) -> Result<bool> {
        installer.verify_identity()?;
        let root = &installer.root;
        if let Some((path, _, after)) = self.states() {
            Ok(installer
                .filesystem
                .inspect(path, matches!(self, Self::Link { .. }))?
                == after)
        } else if let Self::Hooks { after, .. } = self {
            Ok(Self::hooks_path(root)?.as_ref() == Some(after))
        } else {
            Ok(false)
        }
    }
    pub fn states(&self) -> Option<(&RelativePath, &FileState, FileState)> {
        match self {
            Self::Write {
                path,
                before,
                bytes,
                mode,
            } => Some((
                path,
                before,
                FileState::File {
                    digest: ContentDigest::digest(bytes),
                    mode: orly_fs::permissions::normalize_mode(*mode),
                },
            )),
            Self::Binary {
                path,
                before,
                digest,
                ..
            } => Some((
                path,
                before,
                FileState::File {
                    digest: digest.clone(),
                    mode: orly_fs::permissions::normalize_mode(0o755),
                },
            )),
            Self::Link {
                path,
                before,
                target,
            } => Some((
                path,
                before,
                FileState::Link {
                    target: target.into(),
                },
            )),
            Self::Delete { path, before } => Some((path, before, FileState::Missing {})),
            Self::Hooks { .. } => None,
        }
    }
    pub fn validate(&self, installer: &Installer, completed: bool) -> Result<()> {
        installer.verify_identity()?;
        let root = &installer.root;
        if let Self::Binary { source, digest, .. } = self
            && ContentDigest::file(source)? != *digest
        {
            return Err(Error::Stale);
        }
        if let Some((path, before, after)) = self.states() {
            let current = installer
                .filesystem
                .inspect(path, matches!(self, Self::Link { .. }))?;
            if current != after && (completed || current != *before) {
                return Err(Error::Conflict(path.join(root)));
            }
        } else if let Self::Hooks { before, after } = self {
            let current = Self::hooks_path(root)?;
            if current.as_ref() != Some(after) && (completed || current != *before) {
                return Err(Error::Invalid(
                    "hook configuration changed during operation".into(),
                ));
            }
        }
        Ok(())
    }
    pub(super) fn apply(&self, installer: &Installer) -> Result<()> {
        let filesystem = &installer.filesystem;
        let root = &installer.root;
        self.validate(installer, false)?;
        if let Some((path, _, after)) = self.states()
            && filesystem.inspect(path, matches!(self, Self::Link { .. }))? == after
        {
            return Ok(());
        }
        match self {
            Self::Write {
                path, bytes, mode, ..
            } => Ok(filesystem.write(path, bytes, *mode)?),
            Self::Binary {
                path,
                source,
                digest,
                ..
            } => Ok(filesystem.atomic(path)?.copy(source, digest, 0o755)?),
            Self::Link { path, target, .. } => Ok(filesystem.link(path, target)?),
            Self::Hooks { after, .. } => {
                if Self::hooks_path(root)?.as_ref() != Some(after) {
                    Git::output(root, &[GIT_CONFIG, HOOKS_PATH_KEY, after])?;
                }
                Ok(())
            }
            Self::Delete { path, .. } => Ok(filesystem.remove(path)?),
        }
    }
    pub fn hooks_path(root: &Path) -> Result<Option<String>> {
        let output = Git::command(root)
            .args([GIT_CONFIG, "--null", "--get", HOOKS_PATH_KEY])
            .output()?;
        match output.status.code() {
            Some(0) => {
                let value = String::from_utf8(output.stdout)?;
                let path = value
                    .strip_suffix('\0')
                    .ok_or_else(|| Error::Git("unterminated hook configuration".into()))?;
                Ok(Some(path.into()))
            }
            Some(1) => Ok(None),
            _ => Err(Error::Git("cannot read hook configuration".into())),
        }
    }
}
const GIT_CONFIG: &str = "config";
