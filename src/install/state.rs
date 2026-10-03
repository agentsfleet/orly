use super::Installer;
use crate::core::git::Git;
use crate::{Error, Result};
use orly_fs::filesystem::{FileState, RepositoryFs};
use orly_fs::path::RelativePath;
use std::{fs::File, io::Write};

pub struct LocalState<'a> {
    pub(super) installer: &'a Installer,
    git: RepositoryFs,
    directory: Option<RepositoryFs>,
    git_marker: Option<FileState>,
}

impl<'a> LocalState<'a> {
    pub(super) fn open(installer: &'a Installer, create: bool) -> Result<Self> {
        let repository = &installer.filesystem;
        repository.verify_identity()?;
        let git = RepositoryFs::open(&Git::state_path(repository.root(), ".")?)?;
        let marker = RelativePath::new(GIT_MARKER)?;
        let git_marker = if git.root() == marker.join(repository.root()) {
            None
        } else {
            Some(repository.inspect(&marker, false)?)
        };
        let directory = match git.subdirectory(&RelativePath::new(STATE_DIRECTORY)?, create) {
            Ok(directory) => Some(directory),
            Err(orly_fs::Error::Io(error))
                if !create && error.kind() == std::io::ErrorKind::NotFound =>
            {
                None
            }
            Err(error) => return Err(error.into()),
        };
        let state = Self {
            installer,
            git,
            directory,
            git_marker,
        };
        state.verify_identity()?;
        Ok(state)
    }

    pub fn verify_identity(&self) -> Result<()> {
        let repository = &self.installer.filesystem;
        repository.verify_identity()?;
        self.git.verify_identity()?;
        if let Some(expected) = &self.git_marker
            && repository.inspect(&RelativePath::new(GIT_MARKER)?, false)? != *expected
        {
            return Err(Error::Conflict(repository.root().join(GIT_MARKER)));
        }
        if let Some(directory) = &self.directory {
            directory.verify_identity()?;
        } else {
            match self
                .git
                .subdirectory(&RelativePath::new(STATE_DIRECTORY)?, false)
            {
                Err(orly_fs::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
                Ok(_) => return Err(Error::Conflict(self.git.root().join(STATE_DIRECTORY))),
            }
        }
        Ok(())
    }

    fn directory(&self) -> Result<&RepositoryFs> {
        self.verify_identity()?;
        self.directory
            .as_ref()
            .ok_or_else(|| std::io::Error::from(std::io::ErrorKind::NotFound).into())
    }

    fn relative(name: &str) -> Result<RelativePath> {
        Ok(RelativePath::new(
            name.strip_prefix(STATE_PREFIX)
                .ok_or_else(|| Error::Invalid(STATE_PATH_REQUIRED.into()))?,
        )?)
    }

    pub fn read(&self, name: &str, budget: usize) -> Result<Vec<u8>> {
        Ok(self.directory()?.read(&Self::relative(name)?, budget)?)
    }

    pub fn write_with(
        &self,
        name: &str,
        budget: usize,
        write: impl FnOnce(&mut dyn Write) -> Result<()>,
    ) -> Result<()> {
        self.directory()?
            .atomic(&Self::relative(name)?)?
            .write_with(PRIVATE_MODE, budget, write)?;
        self.verify_identity()
    }

    pub fn remove(&self, name: &str) -> Result<()> {
        self.directory()?.remove(&Self::relative(name)?)?;
        self.verify_identity()
    }

    pub fn lock_file(&self, name: &str) -> Result<File> {
        let file = self.directory()?.lock_file(&Self::relative(name)?)?;
        self.verify_identity()?;
        Ok(file)
    }
}
const PRIVATE_MODE: u32 = 0o600;
const STATE_DIRECTORY: &str = "orly";
const STATE_PREFIX: &str = constcat::concat!(STATE_DIRECTORY, "/");
const GIT_MARKER: &str = ".git";
const STATE_PATH_REQUIRED: &str = "path must belong to installation state";
