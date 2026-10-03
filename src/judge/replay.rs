use super::{batch::Batch, constants::*, wire::Response};
use crate::{Error, Result};
use orly_fs::{digest::ContentDigest, filesystem::RepositoryFs, path::RelativePath};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs::{self, File},
    path::Path,
};
#[path = "replay_access.rs"]
mod access;
#[path = "replay_retention.rs"]
mod retention;
use super::metrics::{Boundary, Operation};
pub use access::StoreInput;
use retention::Retention;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Record {
    pub version: u32,
    pub batch_digest: String,
    pub source_digest: String,
    pub run_id: String,
    pub created_seconds: u64,
    pub ordinal: u64,
    pub response: Response,
}
impl Record {
    fn new(batch: &Batch, response: Response, now: u64, ordinal: u64) -> Result<Self> {
        Ok(Self {
            version: VERSION,
            batch_digest: batch.digest().into(),
            source_digest: batch.source_digest().into(),
            created_seconds: now,
            ordinal,
            run_id: ContentDigest::identity(&(batch.digest(), now, ordinal, &response))?,
            response,
        })
    }
    pub fn validate(&self, batch: &Batch) -> Result<()> {
        if self.version != VERSION
            || self.batch_digest != batch.digest()
            || self.source_digest != batch.source_digest()
            || self.run_id
                != ContentDigest::identity(&(
                    batch.digest(),
                    self.created_seconds,
                    self.ordinal,
                    &self.response,
                ))?
        {
            return Err(Error::Stale);
        }
        self.response
            .validate(&batch.engine().model, batch.questions())
    }
}
#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct History {
    runs: VecDeque<Record>,
}
impl History {
    fn validate(&self, batch: &Batch) -> Result<()> {
        if self.runs.is_empty() {
            return Err(Error::Stale);
        }
        for record in &self.runs {
            record.validate(batch)?;
        }
        Ok(())
    }
}
pub trait JudgmentStore: Send + Sync {
    fn replay(&self, input: StoreInput<'_>) -> Result<Option<Record>>;
    fn record(&self, input: StoreInput<'_>, response: Response, refresh: bool) -> Result<Record>;
}
pub struct ReplayStore {
    filesystem: RepositoryFs,
    retention: Retention,
}
impl ReplayStore {
    pub fn for_repository(repository: &Path) -> Result<Self> {
        let repository = git2::Repository::open(repository)?;
        Self::open_private(
            &repository.path().join(PRIVATE_DIRECTORY),
            RETENTION_SECONDS,
            CACHE_BYTES,
        )
    }
    /// Host-owned private state, never tracked records imported from the evaluated checkout.
    pub fn open_private(root: &Path, seconds: u64, bytes: u64) -> Result<Self> {
        fs::create_dir_all(root)?;
        let filesystem = RepositoryFs::open(root)?;
        // Publish the cache lock before this store can be shared by concurrent callers.
        filesystem.lock_file(&RelativePath::new(CACHE_LOCK)?)?;
        Ok(Self {
            filesystem,
            retention: Retention { seconds, bytes },
        })
    }
    pub fn record_with(
        &self,
        input: StoreInput<'_>,
        response: Response,
        refresh: bool,
        before_commit: impl FnOnce() -> Result<()>,
    ) -> Result<Record> {
        let boundary = Boundary::start(Operation::ReplayWrite, input.batch.digest());
        boundary.finish(self.write(input, response, refresh, before_commit))
    }
    fn write(
        &self,
        input: StoreInput<'_>,
        response: Response,
        refresh: bool,
        before_commit: impl FnOnce() -> Result<()>,
    ) -> Result<Record> {
        response.validate(&input.batch.engine().model, input.batch.questions())?;
        let mut entry = self.locked(input)?;
        if !refresh && !entry.history.runs.is_empty() {
            return entry
                .history
                .runs
                .pop_front()
                .ok_or_else(|| super::error::rejected(EMPTY_HISTORY));
        }
        entry.append(response)?;
        entry.commit(before_commit)
    }
    fn locked<'a>(&'a self, input: StoreInput<'a>) -> Result<LockedHistory<'a>> {
        let cache_lock = self
            .filesystem
            .lock_file(&RelativePath::new(CACHE_LOCK)?)
            .map_err(|error| super::error::Failure::context("open_cache_lock", error.into()))?;
        input.lock(|| cache_lock.try_lock())?;
        let key_lock = self
            .filesystem
            .lock_file(&RelativePath::new(format!("{}.lock", stem(input.batch)?))?)
            .map_err(|error| super::error::Failure::context("open_key_lock", error.into()))?;
        input.lock(|| key_lock.try_lock())?;
        let mut history = self.read(input.batch)?.unwrap_or_default();
        history
            .runs
            .retain(|record| self.retention.current(record.created_seconds, input.now));
        Ok(LockedHistory {
            store: self,
            input,
            history,
            _key_lock: key_lock,
            _cache_lock: cache_lock,
        })
    }
    fn read(&self, batch: &Batch) -> Result<Option<History>> {
        let boundary = Boundary::start(Operation::ReplayRead, batch.digest());
        boundary.finish(self.load(batch))
    }
    fn load(&self, batch: &Batch) -> Result<Option<History>> {
        let bytes = match self
            .filesystem
            .read(&record_path(batch)?, self.retention.bytes as usize)
        {
            Ok(bytes) => bytes,
            Err(orly_fs::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(None);
            }
            Err(orly_fs::Error::Invalid(_) | orly_fs::Error::Conflict(_)) => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        // Corruption produces a miss; no subset of a broken batch is accepted.
        Ok(serde_json::from_slice::<History>(&bytes)
            .ok()
            .filter(|history| history.validate(batch).is_ok()))
    }
}
impl JudgmentStore for ReplayStore {
    fn replay(&self, input: StoreInput<'_>) -> Result<Option<Record>> {
        let cache_lock = self.filesystem.lock_file(&RelativePath::new(CACHE_LOCK)?)?;
        input.lock(|| cache_lock.try_lock_shared())?;
        let history = self.read(input.batch)?.unwrap_or_default();
        access::ensure_deadline(input.deadline)?;
        Ok(history
            .runs
            .into_iter()
            .find(|record| self.retention.current(record.created_seconds, input.now)))
    }
    fn record(&self, input: StoreInput<'_>, response: Response, refresh: bool) -> Result<Record> {
        self.record_with(input, response, refresh, || Ok(()))
    }
}
/// Owned locks survive validation, atomic commit, and retention; Drop releases both.
struct LockedHistory<'a> {
    store: &'a ReplayStore,
    input: StoreInput<'a>,
    history: History,
    _key_lock: File,
    _cache_lock: File,
}
impl LockedHistory<'_> {
    fn append(&mut self, response: Response) -> Result<()> {
        let ordinal = self.history.runs.back().map_or(Ok(0), |run| {
            run.ordinal
                .checked_add(1)
                .ok_or_else(|| super::error::rejected(LIMIT_EXCEEDED))
        })?;
        self.history.runs.push_back(Record::new(
            self.input.batch,
            response,
            self.input.now,
            ordinal,
        )?);
        Ok(())
    }
    fn commit(mut self, before_commit: impl FnOnce() -> Result<()>) -> Result<Record> {
        let mut bytes = serde_json::to_vec(&self.history)?;
        while bytes.len() as u64 > self.store.retention.bytes && self.history.runs.len() > 1 {
            self.history.runs.pop_front();
            bytes = serde_json::to_vec(&self.history)?;
        }
        if bytes.len() as u64 > self.store.retention.bytes {
            return Err(super::error::rejected(LIMIT_EXCEEDED));
        }
        self.store
            .filesystem
            .atomic(&record_path(self.input.batch)?)?
            .write_with(PRIVATE_MODE, bytes.len(), |output| {
                std::io::Write::write_all(output, &bytes)?;
                before_commit()?;
                access::ensure_deadline(self.input.deadline)
            })
            .map_err(|error| super::error::Failure::context("commit_replay_record", error))?;
        self.store
            .retention
            .prune(&self.store.filesystem, self.input.now, self.input.deadline)
            .map_err(|error| super::error::Failure::context("prune_replay_records", error))?;
        self.history
            .runs
            .pop_back()
            .ok_or_else(|| super::error::rejected(EMPTY_HISTORY))
    }
}
fn stem(batch: &Batch) -> Result<&str> {
    batch
        .digest()
        .strip_prefix(DIGEST_PREFIX)
        .filter(|stem| {
            stem.len() == DIGEST_HEX_BYTES && stem.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        .ok_or_else(|| Error::Invalid("invalid batch identity".into()))
}
fn record_path(batch: &Batch) -> Result<RelativePath> {
    Ok(RelativePath::new(format!(
        "{}{}",
        stem(batch)?,
        RECORD_SUFFIX
    ))?)
}
const PRIVATE_DIRECTORY: &str = "orly/judge";
pub(super) const PRIVATE_MODE: u32 = 0o600;
const CACHE_LOCK: &str = "cache.lock";
pub(super) const RECORD_SUFFIX: &str = ".json";
pub(super) const LOCK_SUFFIX: &str = ".lock";
const DIGEST_PREFIX: &str = "sha256:";
const DIGEST_HEX_BYTES: usize = 64;
const EMPTY_HISTORY: &str = "empty replay history";
pub(super) fn record_name(name: &str) -> bool {
    name.strip_suffix(RECORD_SUFFIX).is_some_and(|stem| {
        stem.len() == DIGEST_HEX_BYTES && stem.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}
