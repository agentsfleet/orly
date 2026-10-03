use super::{
    hooks::{HookTransition, RecordedHooks},
    operation::{FileState, Operation},
    preflight::{InstallPlanner, PriorLayout},
};
use crate::core::constants::*;
use crate::host::{CLAUDE_FILENAME, HostLoader, OPENCODE_FILENAME};
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use orly_fs::path::RelativePath;

impl InstallPlanner<'_> {
    pub(super) fn prior(&self) -> Result<Option<PriorLayout>> {
        let bytes = match self
            .installer
            .filesystem
            .read(&RelativePath::new(OLD_CONFIG_PATH)?, MAX_OUTPUT_BYTES)
        {
            Ok(bytes) => bytes,
            Err(orly_fs::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(None);
            }
            Err(error) => return Err(error.into()),
        };
        let layout: PriorLayout = serde_json::from_slice(&bytes)?;
        if layout.schema_version != 1 || layout.orly_version != PRIOR_ENGINE_VERSION {
            return Err(Error::Invalid(
                "unrecognized recorded installation version".into(),
            ));
        }
        for path in &layout.managed {
            self.config.releases.ensure_separate(path)?;
        }
        Ok(Some(layout))
    }
    pub(super) fn loaders(
        &self,
        prior: Option<&PriorLayout>,
        operations: &mut Vec<Operation>,
    ) -> Result<()> {
        let root = self.root;
        for (name, import) in [
            (AGENTS_FILENAME, ORLY_AGENTS_FILENAME),
            (CLAUDE_FILENAME, AGENTS_FILENAME),
        ] {
            let path = RelativePath::new(name)?;
            let before = self.installer.filesystem.inspect(&path, false)?;
            let current = if before == (FileState::Missing {}) {
                String::new()
            } else {
                String::from_utf8(self.installer.filesystem.read(&path, MAX_OUTPUT_BYTES)?)?
            };
            let current = if name == AGENTS_FILENAME && current.starts_with(GENERATED_BANNER) {
                let owned = prior
                    .and_then(|p| p.digests.get(&path))
                    .is_some_and(|expected| expected == &ContentDigest::digest(current.as_bytes()));
                if !owned {
                    return Err(Error::Conflict(path.join(root)));
                }
                String::new()
            } else {
                current
            };
            let bytes = HostLoader::markdown(&current, import)?.into_bytes();
            operations.push(Operation::Write {
                path,
                before,
                bytes,
                mode: 0o644,
            });
        }
        let path = RelativePath::new(OPENCODE_FILENAME)?;
        let before = self.installer.filesystem.inspect(&path, false)?;
        let current = if before == (FileState::Missing {}) {
            None
        } else {
            Some(self.installer.filesystem.read(&path, MAX_OUTPUT_BYTES)?)
        };
        let bytes = HostLoader::opencode(current.as_deref())?;
        operations.push(Operation::Write {
            path,
            before,
            bytes,
            mode: 0o644,
        });
        Ok(())
    }
    pub(super) fn hooks(
        &self,
        prior: Option<&PriorLayout>,
        operations: &mut Vec<Operation>,
    ) -> Result<()> {
        let root = self.root;
        let before = HookTransition::new(&self.installer.filesystem, prior).preflight()?;
        for name in [PRE_COMMIT, PRE_PUSH] {
            let path = RelativePath::new(format!("{HOOKS_DIRECTORY}/{name}"))?;
            let old = self.installer.filesystem.inspect(&path, true)?;
            let target = HOOK_BINARY_LINK.to_owned();
            if old != (FileState::Missing {})
                && old
                    != (FileState::Link {
                        target: target.as_str().into(),
                    })
            {
                return Err(Error::Conflict(path.join(root)));
            }
            operations.push(Operation::Link {
                path,
                before: old,
                target,
            });
        }
        operations.push(Operation::Hooks {
            before,
            after: HOOKS_DIRECTORY.into(),
        });
        Ok(())
    }
    pub(super) fn cleanup(
        &self,
        prior: &PriorLayout,
        operations: &mut Vec<Operation>,
    ) -> Result<()> {
        let root = self.root;
        let mapping: std::collections::BTreeSet<_> = operations
            .iter()
            .filter_map(|op| match op {
                Operation::Write { path, .. } if path.as_str().starts_with(ORLY_PREFIX) => {
                    Some(path.as_str().trim_start_matches(ORLY_PREFIX).to_owned())
                }
                _ => None,
            })
            .collect();
        for path in &prior.managed {
            if [AGENTS_FILENAME, CLAUDE_FILENAME, OPENCODE_FILENAME].contains(&path.as_str()) {
                continue;
            }
            let before = self.installer.filesystem.inspect(path, false)?;
            if before == (FileState::Missing {}) {
                continue;
            }
            if RecordedHooks::new(&self.installer.filesystem, prior).owns(path)? {
                if operations
                    .iter()
                    .any(|operation| matches!(operation, Operation::Hooks { .. }))
                {
                    operations.push(Operation::Delete {
                        path: path.clone(),
                        before,
                    });
                }
                continue;
            }
            if path.as_str() != OLD_AGENTS_FILENAME && !mapping.contains(path.as_str()) {
                return Err(Error::Invalid(
                    "prior managed file has no verified replacement".into(),
                ));
            }
            let digest = prior.digests.get(path).ok_or_else(|| {
                Error::Invalid("prior managed file has no ownership digest".into())
            })?;
            if !matches!(&before,FileState::File {digest:current,..} if current == digest) {
                return Err(Error::Conflict(path.join(root)));
            }
            operations.push(Operation::Delete {
                path: path.clone(),
                before,
            });
        }
        let path = RelativePath::new(OLD_CONFIG_PATH)?;
        let before = self.installer.filesystem.inspect(&path, false)?;
        operations.push(Operation::Delete { path, before });
        Ok(())
    }
}
