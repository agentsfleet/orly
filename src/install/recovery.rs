use super::operation::Operation;
use super::{Installer, LocalState, preflight::InstallPlanner};
use crate::core::document::ObjectDocument;
use crate::core::{constants::*, git::ObjectStore};
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs::File;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OperationManifest {
    pub version: u32,
    pub source_revision: Option<String>,
    pub source_digest: String,
    pub binary_digest: String,
    pub configuration_digest: String,
    pub identity: String,
    pub completed: usize,
    pub operations: Vec<Operation>,
}
impl ObjectDocument for OperationManifest {}

impl OperationManifest {
    pub fn seal(&mut self) -> Result<()> {
        self.identity = self.compute_identity()?;
        Ok(())
    }
    fn compute_identity(&self) -> Result<String> {
        Ok(ContentDigest::identity(&(
            self.version,
            &self.source_revision,
            &self.source_digest,
            &self.binary_digest,
            &self.configuration_digest,
            &self.operations,
        ))?)
    }
    pub fn load(state: &LocalState<'_>) -> Result<Option<Self>> {
        match state.read(MANIFEST_PATH, MAX_SNAPSHOT_BYTES) {
            Ok(bytes) => Ok(Some(Self::from_json(&bytes)?)),
            Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }
    pub fn save(&self, state: &LocalState<'_>) -> Result<()> {
        state.write_with(MANIFEST_PATH, MAX_SNAPSHOT_BYTES, |output| {
            Ok(serde_json::to_writer(output, self)?)
        })
    }
    pub(super) fn validate(&self, installer: &Installer) -> Result<()> {
        installer.verify_identity()?;
        if self.version != WIRE_VERSION
            || self.completed > self.operations.len()
            || self.compute_identity()? != self.identity
        {
            return Err(Error::Invalid("invalid recovery operation identity".into()));
        }
        if self.source_revision != ObjectStore::open(&installer.root)?.head_revision()? {
            return Err(Error::Stale);
        }
        for (index, op) in self.operations.iter().enumerate() {
            op.validate(installer, index < self.completed)?;
        }
        Ok(())
    }
    pub(super) fn resume_with_fault(
        &mut self,
        planner: &InstallPlanner<'_>,
        fault: Option<RecoveryFault>,
    ) -> Result<()> {
        planner.verify_identity()?;
        self.validate(planner.installer)?;
        for index in self.completed..self.operations.len() {
            if fault
                == Some(RecoveryFault {
                    ordinal: index,
                    timing: FaultTiming::BeforeEffect,
                })
            {
                return Err(Error::Interrupted(index));
            }
            planner.verify_identity()?;
            for op in &self.operations[..index] {
                op.validate(planner.installer, true)?;
            }
            self.operations[index].apply(planner.installer)?;
            self.operations[index].validate(planner.installer, true)?;
            // This seam injects acknowledgement loss after the effect, before its journal update.
            if fault
                == Some(RecoveryFault {
                    ordinal: index,
                    timing: FaultTiming::AfterEffect,
                })
            {
                return Err(Error::Interrupted(index));
            }
            self.completed = index + 1;
            self.save(planner.state)?;
            if fault
                == Some(RecoveryFault {
                    ordinal: index,
                    timing: FaultTiming::AfterJournal,
                })
            {
                return Err(Error::Interrupted(index));
            }
        }
        planner.verify_identity()?;
        for op in &self.operations {
            op.validate(planner.installer, true)?;
        }
        planner.state.remove(MANIFEST_PATH)?;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FaultTiming {
    BeforeEffect,
    AfterEffect,
    AfterJournal,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RecoveryFault {
    pub ordinal: usize,
    pub timing: FaultTiming,
}

pub struct InstallationLock<'a> {
    _file: File,
    _state: &'a LocalState<'a>,
}
impl<'a> InstallationLock<'a> {
    pub fn acquire(state: &'a LocalState<'a>) -> Result<Self> {
        let file = state.lock_file(LOCK_PATH)?;
        file.try_lock().map_err(|error| match error {
            std::fs::TryLockError::WouldBlock => Error::Locked,
            std::fs::TryLockError::Error(error) => error.into(),
        })?;
        state.verify_identity()?;
        Ok(Self {
            _file: file,
            _state: state,
        })
    }
}
