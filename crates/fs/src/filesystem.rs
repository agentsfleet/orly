use super::{
    constants::MAX_BINARY_BYTES, digest::ContentDigest, file_input::RegularInput,
    path::RelativePath,
};
use crate::{Error, Result};
use cap_fs_ext::DirExt;
use cap_std::fs::Dir;
#[cfg(unix)]
use cap_std::fs::OpenOptionsExt as _;
use same_file::Handle;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
};

#[path = "filesystem_atomic.rs"]
mod atomic;
#[path = "filesystem_parent.rs"]
mod parent;
pub use atomic::AtomicFile;
use parent::Parent;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum FileState {
    // Empty struct variants let Serde reject fields beyond the kind tag.
    Missing {},
    File { digest: String, mode: u32 },
    Link { target: PathBuf },
}

impl FileState {
    pub fn inspect(root: &Path, path: &RelativePath, allow_link: bool) -> Result<Self> {
        RepositoryFs::open(root)?.inspect(path, allow_link)
    }
}

pub struct RepositoryFs {
    directory: Dir,
    root: PathBuf,
}

impl RepositoryFs {
    pub fn open(root: &Path) -> Result<Self> {
        let root = fs::canonicalize(root)?;
        Ok(Self {
            directory: Dir::open_ambient_dir(&root, cap_std::ambient_authority())?,
            root,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn verify_identity(&self) -> Result<()> {
        let current = match fs::symlink_metadata(&self.root) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(Error::Conflict(self.root.clone()));
            }
            Err(error) => return Err(error.into()),
        };
        if !current.is_dir() {
            return Err(Error::Conflict(self.root.clone()));
        }
        let retained = Handle::from_file(self.directory.try_clone()?.into_std_file())?;
        if Handle::from_path(&self.root)? != retained {
            return Err(Error::Conflict(self.root.clone()));
        }
        Ok(())
    }

    pub fn open_regular(&self, path: &RelativePath) -> Result<File> {
        self.parent(path, false)?.open_regular()
    }

    pub fn read(&self, path: &RelativePath, budget: usize) -> Result<Vec<u8>> {
        RegularInput::from_file(self.open_regular(path)?, budget)?.read()
    }

    pub fn inspect(&self, path: &RelativePath, allow_link: bool) -> Result<FileState> {
        let parent = match self.parent(path, false) {
            Ok(parent) => parent,
            Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(FileState::Missing {});
            }
            Err(error) => return Err(error),
        };
        match parent.directory.symlink_metadata(&parent.name) {
            Ok(meta) if meta.file_type().is_symlink() && allow_link => Ok(FileState::Link {
                target: parent.directory.read_link_contents(&parent.name)?,
            }),
            Ok(meta) if meta.is_file() => {
                let file = parent.open_regular()?;
                let mode = crate::permissions::mode(&file.metadata()?);
                Ok(FileState::File {
                    digest: ContentDigest::reader(file, MAX_BINARY_BYTES)?,
                    mode,
                })
            }
            Ok(_) => Err(Error::Conflict(path.join(&self.root))),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(FileState::Missing {}),
            Err(error) => Err(error.into()),
        }
    }

    pub fn atomic(&self, path: &RelativePath) -> Result<AtomicFile> {
        Ok(AtomicFile::new(self.parent(path, true)?))
    }

    pub fn write(&self, path: &RelativePath, bytes: &[u8], mode: u32) -> Result<()> {
        self.atomic(path)?.write(bytes, mode)
    }

    pub fn remove(&self, path: &RelativePath) -> Result<()> {
        let parent = self.parent(path, false)?;
        parent.directory.remove_file_or_symlink(&parent.name)?;
        parent.sync()
    }

    pub fn read_link(&self, path: &RelativePath) -> Result<PathBuf> {
        let parent = self.parent(path, false)?;
        Ok(parent.directory.read_link_contents(&parent.name)?)
    }

    pub fn validate_link(&self, path: &RelativePath) -> Result<()> {
        self.directory.canonicalize(path.as_str())?;
        Ok(())
    }

    pub fn is_link(&self, path: &RelativePath) -> Result<bool> {
        let parent = self.parent(path, false)?;
        Ok(parent
            .directory
            .symlink_metadata(&parent.name)?
            .file_type()
            .is_symlink())
    }

    pub fn link(&self, path: &RelativePath, target: &str) -> Result<()> {
        let parent = self.parent(path, true)?;
        let staged = cap_tempfile::TempDir::new_in(&parent.directory)?;
        #[cfg(unix)]
        staged.symlink_contents(target, LINK_STAGE)?;
        #[cfg(windows)]
        {
            // Native Windows symlink targets require native separators, including parent paths.
            let target: PathBuf = Path::new(target).components().collect();
            let destination = Path::new(path.as_str()).parent().unwrap_or(Path::new(""));
            if self
                .directory
                .metadata(destination.join(&target))
                .is_ok_and(|metadata| metadata.is_dir())
            {
                staged.symlink_dir(&target, LINK_STAGE)?;
            } else {
                staged.symlink_file(&target, LINK_STAGE)?;
            }
        }
        staged.rename(LINK_STAGE, &parent.directory, &parent.name)?;
        parent.sync()
    }

    pub fn lock_file(&self, path: &RelativePath) -> Result<File> {
        let parent = self.parent(path, true)?;
        let mut options = Parent::regular_options();
        options.read(true).write(true).create(true);
        #[cfg(unix)]
        options.mode(PRIVATE_MODE);
        parent.regular_with(&options)
    }
}

const PRIVATE_MODE: u32 = 0o600;
const LINK_STAGE: &str = "hook";
