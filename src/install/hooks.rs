use super::{operation::Operation, preflight::PriorLayout};
use crate::core::{constants::*, git::Git};
use crate::{Error, Result};
use orly_fs::filesystem::{FileState, RepositoryFs};
use orly_fs::path::RelativePath;
use std::{fs, path::Path};

const SAMPLE_EXTENSION: &str = "sample";
const COMMIT_TEMPLATE: &[u8] = include_bytes!("../../fixtures/layout-0.10/.githooks/pre-commit");
const PUSH_TEMPLATE: &[u8] = include_bytes!("../../fixtures/layout-0.10/.githooks/pre-push");

pub trait HookLayout {
    fn owns(&self, path: &RelativePath) -> Result<bool>;
}

pub struct RecordedHooks<'a> {
    filesystem: &'a RepositoryFs,
    inventory: &'a PriorLayout,
}
impl<'a> RecordedHooks<'a> {
    pub fn new(filesystem: &'a RepositoryFs, inventory: &'a PriorLayout) -> Self {
        Self {
            filesystem,
            inventory,
        }
    }
}
impl RecordedHooks<'_> {
    pub fn owns(&self, path: &RelativePath) -> Result<bool> {
        let expected = match path.as_str() {
            PRIOR_PRE_COMMIT => COMMIT_TEMPLATE,
            PRIOR_PRE_PUSH => PUSH_TEMPLATE,
            _ => return Ok(false),
        };
        if !self.inventory.managed.contains(path) {
            return Ok(false);
        }
        let state = self.filesystem.inspect(path, false)?;
        Ok(
            matches!(state, FileState::File { mode, .. } if mode == orly_fs::permissions::normalize_mode(0o755))
                && self.filesystem.read(path, MAX_OUTPUT_BYTES)? == expected,
        )
    }
}

pub struct NativeHooks<'a> {
    filesystem: &'a RepositoryFs,
}
impl<'a> NativeHooks<'a> {
    pub fn new(filesystem: &'a RepositoryFs) -> Self {
        Self { filesystem }
    }
}
impl NativeHooks<'_> {
    pub fn owns(&self, path: &RelativePath) -> Result<bool> {
        let name = path
            .as_str()
            .strip_prefix(HOOKS_DIRECTORY)
            .and_then(|name| name.strip_prefix('/'));
        if !name.is_some_and(|name| [PRE_COMMIT, PRE_PUSH].contains(&name)) {
            return Ok(false);
        }
        Ok(self.filesystem.inspect(path, true)?
            == FileState::Link {
                target: HOOK_BINARY_LINK.into(),
            })
    }
}

pub struct HookTransition<'a> {
    filesystem: &'a RepositoryFs,
    prior: Option<&'a PriorLayout>,
}
impl<'a> HookTransition<'a> {
    pub fn new(filesystem: &'a RepositoryFs, prior: Option<&'a PriorLayout>) -> Self {
        Self { filesystem, prior }
    }
}
impl HookTransition<'_> {
    pub fn preflight(&self) -> Result<Option<String>> {
        let root = self.filesystem.root();
        let before = Operation::hooks_path(root)?;
        let native = NativeHooks::new(self.filesystem);
        let recorded = self
            .prior
            .map(|prior| RecordedHooks::new(self.filesystem, prior));
        let (directory, owner): (_, Option<&dyn HookLayout>) = match before.as_deref() {
            None => (Git::state_path(root, "hooks")?, None),
            Some(HOOKS_DIRECTORY) => (
                RelativePath::new(HOOKS_DIRECTORY)?.resolve_inside(root)?,
                Some(&native),
            ),
            Some(PRIOR_HOOKS_DIRECTORY) if recorded.is_some() => (
                RelativePath::new(PRIOR_HOOKS_DIRECTORY)?.resolve_inside(root)?,
                recorded.as_ref().map(|owner| owner as &dyn HookLayout),
            ),
            _ => {
                return Err(Error::Invalid(
                    "repository-owned hooks require --no-hooks and explicit integration".into(),
                ));
            }
        };
        if directory.exists() {
            for entry in fs::read_dir(directory)? {
                let entry = entry?;
                let name = entry.file_name();
                if Path::new(&name)
                    .extension()
                    .is_some_and(|extension| extension == SAMPLE_EXTENSION)
                {
                    continue;
                }
                let path = entry.path();
                let relative = before
                    .as_deref()
                    .and_then(|directory| name.to_str().map(|name| format!("{directory}/{name}")))
                    .map(RelativePath::new)
                    .transpose()?;
                let owned = if let (Some(owner), Some(relative)) = (owner, relative.as_ref()) {
                    owner.owns(relative)?
                } else {
                    false
                };
                if !owned {
                    return Err(Error::Conflict(path));
                }
            }
        }
        Ok(before)
    }
}

impl HookLayout for RecordedHooks<'_> {
    fn owns(&self, path: &RelativePath) -> Result<bool> {
        Self::owns(self, path)
    }
}

impl HookLayout for NativeHooks<'_> {
    fn owns(&self, path: &RelativePath) -> Result<bool> {
        Self::owns(self, path)
    }
}
