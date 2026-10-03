use super::{
    History, LOCK_SUFFIX, PRIVATE_MODE, RECORD_SUFFIX, access::ensure_deadline, record_name,
};
use crate::Result;
use orly_fs::{filesystem::RepositoryFs, path::RelativePath};
use std::{fs, time::Instant};

pub(super) struct Retention {
    pub seconds: u64,
    pub bytes: u64,
}
struct Entry {
    path: RelativePath,
    bytes: u64,
    history: History,
}
impl Retention {
    pub fn current(&self, created: u64, now: u64) -> bool {
        created <= now && now - created <= self.seconds
    }
    pub fn prune(&self, filesystem: &RepositoryFs, now: u64, deadline: Instant) -> Result<()> {
        let mut entries = self.entries(filesystem, now, deadline)?;
        let mut total = entries.iter().map(|entry| entry.bytes).sum::<u64>();
        while total > self.bytes {
            ensure_deadline(deadline)?;
            let Some(entry) = entries
                .iter_mut()
                .filter(|entry| !entry.history.runs.is_empty())
                .min_by(|a, b| a.oldest().cmp(&b.oldest()))
            else {
                break;
            };
            entry.history.runs.pop_front();
            let previous = entry.bytes;
            entry.persist(filesystem, deadline)?;
            total = total - previous + entry.bytes;
        }
        Ok(())
    }
    fn entries(
        &self,
        filesystem: &RepositoryFs,
        now: u64,
        deadline: Instant,
    ) -> Result<Vec<Entry>> {
        let mut entries = Vec::new();
        for entry in fs::read_dir(filesystem.root())? {
            ensure_deadline(deadline)?;
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str().filter(|name| record_name(name)) else {
                continue;
            };
            let path = RelativePath::new(name)?;
            let bytes = match filesystem.read(&path, self.bytes as usize) {
                Ok(bytes) => bytes,
                Err(orly_fs::Error::Invalid(_) | orly_fs::Error::Conflict(_)) => {
                    filesystem.remove(&path)?;
                    continue;
                }
                Err(error) => return Err(error.into()),
            };
            let mut history = serde_json::from_slice::<History>(&bytes).unwrap_or_default();
            let count = history.runs.len();
            history
                .runs
                .retain(|run| self.current(run.created_seconds, now));
            let mut entry = Entry {
                path,
                bytes: bytes.len() as u64,
                history,
            };
            if entry.history.runs.len() != count || count == 0 {
                entry.persist(filesystem, deadline)?;
            }
            if !entry.history.runs.is_empty() {
                entries.push(entry);
            }
        }
        Ok(entries)
    }
}
impl Entry {
    fn oldest(&self) -> (u64, &str) {
        (self.history.runs[0].created_seconds, self.path.as_str())
    }
    fn persist(&mut self, filesystem: &RepositoryFs, deadline: Instant) -> Result<()> {
        ensure_deadline(deadline)?;
        if self.history.runs.is_empty() {
            filesystem.remove(&self.path)?;
            let stem = self
                .path
                .as_str()
                .strip_suffix(RECORD_SUFFIX)
                .ok_or_else(|| crate::Error::Invalid("invalid replay filename".into()))?;
            let lock = RelativePath::new(format!("{stem}{LOCK_SUFFIX}"))?;
            match filesystem.remove(&lock) {
                Ok(()) => {}
                Err(orly_fs::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
            self.bytes = 0;
        } else {
            let bytes = serde_json::to_vec(&self.history)?;
            filesystem.write(&self.path, &bytes, PRIVATE_MODE)?;
            self.bytes = bytes.len() as u64;
        }
        Ok(())
    }
}
