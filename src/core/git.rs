use super::{
    config::GIT_ENV_PREFIX,
    constants::{GIT_COMMAND, MAX_SOURCE_BYTES},
};
use crate::{Error, Result};
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Command,
};

pub struct Git;

impl Git {
    pub fn is_reserved_environment_key(key: &OsStr) -> bool {
        key.as_encoded_bytes()
            .get(..GIT_ENV_PREFIX.len())
            .is_some_and(|prefix| {
                if cfg!(windows) {
                    prefix.eq_ignore_ascii_case(GIT_ENV_PREFIX.as_bytes())
                } else {
                    prefix == GIT_ENV_PREFIX.as_bytes()
                }
            })
    }

    pub fn command(root: &Path) -> Command {
        let mut command = Command::new(GIT_COMMAND);
        command.arg("-C").arg(root);
        for (key, _) in std::env::vars_os() {
            if Self::is_reserved_environment_key(&key) {
                command.env_remove(key);
            }
        }
        command
    }

    pub fn output(root: &Path, args: &[&str]) -> Result<Vec<u8>> {
        let out = Self::command(root).args(args).output()?;
        if !out.status.success() {
            return Err(Error::Git(format!(
                "{} returned {}",
                args.join(" "),
                out.status
            )));
        }
        Ok(out.stdout)
    }

    pub fn text(root: &Path, args: &[&str]) -> Result<String> {
        Ok(String::from_utf8(Self::output(root, args)?)?
            .trim()
            .to_owned())
    }

    pub fn state_path(root: &Path, name: &str) -> Result<PathBuf> {
        let path = Self::text(
            root,
            &["rev-parse", "--path-format=absolute", "--git-path", name],
        )?;
        Ok(PathBuf::from(path))
    }

    pub fn index_command(root: &Path, alternate: Option<&OsStr>) -> Command {
        let mut command = Self::command(root);
        if let Some(index) = alternate {
            command.env(INDEX_KEY, index);
        }
        command
    }
}

pub const INDEX_KEY: &str = "GIT_INDEX_FILE";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FileMode {
    Regular,
    Executable,
    Symlink,
}
impl FileMode {
    fn from_git(mode: u32) -> Result<Self> {
        match mode {
            REGULAR_MODE => Ok(Self::Regular),
            EXECUTABLE_MODE => Ok(Self::Executable),
            SYMLINK_MODE => Ok(Self::Symlink),
            _ => Err(Error::Invalid(
                "unsupported Git file mode or submodule input".into(),
            )),
        }
    }
}

pub struct GitEntry {
    pub path: RelativePath,
    pub mode: FileMode,
    object: git2::Oid,
}
pub struct ObjectStore {
    repository: git2::Repository,
}
impl ObjectStore {
    pub fn open(root: &Path) -> Result<Self> {
        Ok(Self {
            repository: git2::Repository::open(root)?,
        })
    }
    pub fn head_revision(&self) -> Result<Option<String>> {
        match self.repository.head() {
            Ok(head) => Ok(Some(head.peel_to_commit()?.id().to_string())),
            Err(error) if error.code() == git2::ErrorCode::UnbornBranch => Ok(None),
            Err(error) => Err(error.into()),
        }
    }
    pub fn index_entries(&self, root: &Path, alternate: Option<&OsStr>) -> Result<Vec<GitEntry>> {
        let index = if let Some(path) = alternate {
            let path = Path::new(path);
            git2::Index::open(&if path.is_absolute() {
                path.to_owned()
            } else {
                root.join(path)
            })?
        } else {
            self.repository.index()?
        };
        if index.has_conflicts() {
            return Err(Error::Invalid(
                "unmerged index cannot form a snapshot".into(),
            ));
        }
        index
            .iter()
            .map(|entry| {
                let path = String::from_utf8(entry.path)?;
                Ok(GitEntry {
                    path: RelativePath::new(path)?,
                    mode: FileMode::from_git(entry.mode)?,
                    object: entry.id,
                })
            })
            .collect()
    }
    pub fn revision_entries(&self, revision: &str) -> Result<Vec<GitEntry>> {
        let tree = self.repository.revparse_single(revision)?.peel_to_tree()?;
        let mut entries = Vec::new();
        tree.walk(git2::TreeWalkMode::PreOrder, |parent, entry| {
            if entry.kind() == Some(git2::ObjectType::Tree) {
                return git2::TreeWalkResult::Ok;
            }
            entries.push(Self::tree_entry(parent, entry));
            git2::TreeWalkResult::Ok
        })?;
        entries.into_iter().collect()
    }
    fn tree_entry(parent: &str, entry: &git2::TreeEntry<'_>) -> Result<GitEntry> {
        let name = std::str::from_utf8(entry.name_bytes())?;
        Ok(GitEntry {
            path: RelativePath::new(format!("{parent}{name}"))?,
            mode: FileMode::from_git(entry.filemode() as u32)?,
            object: entry.id(),
        })
    }
    pub fn blob(&self, entry: &GitEntry) -> Result<Vec<u8>> {
        let blob = self.repository.find_blob(entry.object)?;
        if blob.size() > MAX_SOURCE_BYTES {
            return Err(Error::Invalid("source exceeds byte budget".into()));
        }
        Ok(blob.content().to_vec())
    }
}
const REGULAR_MODE: u32 = 0o100644;
const EXECUTABLE_MODE: u32 = 0o100755;
const SYMLINK_MODE: u32 = 0o120000;
