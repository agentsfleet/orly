use super::RepositoryFs;
use crate::{Error, Result, path::RelativePath};
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt, OpenOptionsSyncExt};
use cap_std::fs::{Dir, OpenOptions};
use std::{ffi::OsString, fs::File, path::Path};

pub(super) struct Parent {
    pub(super) directory: Dir,
    pub(super) name: OsString,
}

impl Parent {
    pub(super) fn regular_options() -> OpenOptions {
        let mut options = OpenOptions::new();
        options.follow(FollowSymlinks::No).nonblock(true);
        options
    }

    pub(super) fn regular_with(&self, options: &OpenOptions) -> Result<File> {
        let file = self.directory.open_with(&self.name, options)?.into_std();
        if !file.metadata()?.is_file() {
            return Err(Error::Invalid(REGULAR_INPUT_REQUIRED.into()));
        }
        Ok(file)
    }

    pub(super) fn open_regular(&self) -> Result<File> {
        self.regular_with(Self::regular_options().read(true))
    }

    pub(super) fn sync(&self) -> Result<()> {
        #[cfg(unix)]
        self.directory.open(CURRENT_DIRECTORY)?.sync_all()?;
        // Windows flushes file content before replacement; directory handles cannot be flushed.
        Ok(())
    }
}

impl RepositoryFs {
    pub(super) fn parent(&self, path: &RelativePath, create: bool) -> Result<Parent> {
        let path = Path::new(path.as_str());
        let directory = self.directory_for(path.parent().unwrap_or(Path::new("")), create)?;
        Ok(Parent {
            directory,
            name: path
                .file_name()
                .ok_or_else(|| Error::Invalid(MISSING_FILE_NAME.into()))?
                .into(),
        })
    }

    pub fn subdirectory(&self, path: &RelativePath, create: bool) -> Result<Self> {
        Ok(Self {
            directory: self.directory_for(Path::new(path.as_str()), create)?,
            root: path.join(&self.root),
        })
    }

    fn directory_for(&self, path: &Path, create: bool) -> Result<Dir> {
        let mut directory = self.directory.try_clone()?;
        for component in path.components() {
            let name = component.as_os_str();
            directory = match directory.open_dir_nofollow(name) {
                Ok(next) => next,
                Err(error) if create && error.kind() == std::io::ErrorKind::NotFound => {
                    match directory.create_dir(name) {
                        Ok(()) => {}
                        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                        Err(error) => return Err(error.into()),
                    }
                    directory
                        .open_dir_nofollow(name)
                        .map_err(|error| self.path_error(path, error))?
                }
                Err(error) => return Err(self.path_error(path, error)),
            };
        }
        Ok(directory)
    }

    fn path_error(&self, path: &Path, error: std::io::Error) -> Error {
        if error.kind() == std::io::ErrorKind::NotADirectory
            || std::fs::symlink_metadata(self.root.join(path))
                .is_ok_and(|metadata| metadata.file_type().is_symlink())
        {
            Error::Conflict(self.root.join(path))
        } else {
            error.into()
        }
    }
}

use crate::file_input::REGULAR_INPUT_REQUIRED;
const MISSING_FILE_NAME: &str = "input file name missing";
#[cfg(unix)]
const CURRENT_DIRECTORY: &str = ".";
