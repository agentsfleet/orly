use super::{filesystem::RepositoryFs, path::RelativePath};
use crate::{Error, Result};
use std::{fs::File, io::Read, path::Path};

pub struct RegularInput {
    file: File,
    budget: usize,
}

impl RegularInput {
    pub fn open(path: &Path, budget: usize) -> Result<Self> {
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| Error::Invalid(INVALID_FILE_NAME.into()))?;
        let file = RepositoryFs::open(parent)?.open_regular(&RelativePath::new(name)?)?;
        Self::from_file(file, budget)
    }

    pub fn from_file(file: File, budget: usize) -> Result<Self> {
        let metadata = file.metadata()?;
        if !metadata.is_file() {
            return Err(Error::Invalid(REGULAR_INPUT_REQUIRED.into()));
        }
        if metadata.len() > budget as u64 {
            return Err(Error::Invalid(INPUT_BUDGET_EXCEEDED.into()));
        }
        Ok(Self { file, budget })
    }

    pub fn read(self) -> Result<Vec<u8>> {
        let mut bytes = Vec::new();
        self.file
            .take(self.budget as u64 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > self.budget {
            return Err(Error::Invalid(INPUT_BUDGET_EXCEEDED.into()));
        }
        Ok(bytes)
    }

    pub fn into_file(self) -> File {
        self.file
    }
}

pub(crate) const REGULAR_INPUT_REQUIRED: &str = "input must be a regular file";
const INPUT_BUDGET_EXCEEDED: &str = "input exceeds byte budget";
const INVALID_FILE_NAME: &str = "input file name is invalid";
