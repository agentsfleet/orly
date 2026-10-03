use super::super::{batch::Batch, constants::*, error::rejected};
use crate::Result;
use std::{
    fs::TryLockError,
    time::{Duration, Instant},
};

/// A storage operation inherits the invocation deadline, including lock contention.
#[derive(Clone, Copy)]
pub struct StoreInput<'a> {
    pub batch: &'a Batch,
    pub now: u64,
    pub deadline: Instant,
}
impl<'a> StoreInput<'a> {
    pub fn new(batch: &'a Batch, now: u64) -> Self {
        Self {
            batch,
            now,
            deadline: Instant::now() + DEADLINE,
        }
    }
    pub fn until(mut self, deadline: Instant) -> Self {
        self.deadline = self.deadline.min(deadline);
        self
    }
    pub(super) fn lock(&self, mut acquire: impl FnMut() -> Result<(), TryLockError>) -> Result<()> {
        loop {
            ensure_deadline(self.deadline)?;
            match acquire() {
                Ok(()) => return Ok(()),
                Err(TryLockError::Error(error)) => return Err(error.into()),
                Err(TryLockError::WouldBlock) => std::thread::sleep(
                    LOCK_RETRY.min(self.deadline.saturating_duration_since(Instant::now())),
                ),
            }
        }
    }
}
pub(super) fn ensure_deadline(deadline: Instant) -> Result<()> {
    (Instant::now() < deadline)
        .then_some(())
        .ok_or_else(|| rejected(DEADLINE_EXCEEDED))
}
const LOCK_RETRY: Duration = Duration::from_millis(2);
