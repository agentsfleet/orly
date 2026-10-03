use super::{
    Installer, LocalState,
    operation::{FileState, Operation},
    recovery::{OperationManifest, RecoveryFault},
};
use crate::core::{config::Configuration, constants::*, git::ObjectStore, payload::Payload};
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use orly_fs::path::RelativePath;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::Path};

const RECOVERY_INPUTS_CHANGED: &str = "recovery inputs differ from the recorded operation";
const RECOVERY_EFFECTS_CHANGED: &str =
    "recovery operations differ from the authorized installation";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PriorLayout {
    pub schema_version: u32,
    pub orly_version: String,
    pub managed: Vec<RelativePath>,
    pub digests: BTreeMap<RelativePath, String>,
}

pub struct InstallPlanner<'a> {
    pub(super) installer: &'a Installer,
    pub(super) root: &'a Path,
    pub(super) state: &'a LocalState<'a>,
    pub(super) payload: &'a Payload,
    pub(super) config: &'a Configuration,
    binary: &'a Path,
    hooks: bool,
    loaders: bool,
}

impl<'a> InstallPlanner<'a> {
    pub fn new(
        state: &'a LocalState<'a>,
        payload: &'a Payload,
        config: &'a Configuration,
        binary: &'a Path,
        hooks: bool,
        loaders: bool,
    ) -> Self {
        Self {
            installer: state.installer,
            root: &state.installer.root,
            state,
            payload,
            config,
            binary,
            hooks,
            loaders,
        }
    }

    pub fn plan(&self) -> Result<OperationManifest> {
        self.verify_identity()?;
        self.config.validate()?;
        self.config
            .releases
            .verify_location(&self.installer.filesystem)?;
        for path in self.config.managed.keys() {
            self.config.releases.ensure_separate(path)?;
        }
        let source_revision = ObjectStore::open(self.root)?.head_revision()?;
        let prior = self.prior()?;
        let (target_config, binary_digest, mut operations) = self.materialize()?;
        if self.loaders {
            self.loaders(prior.as_ref(), &mut operations)?;
        }
        if self.hooks {
            self.hooks(prior.as_ref(), &mut operations)?;
        }
        let path = RelativePath::new(CONFIG_PATH)?;
        let before = self.installer.filesystem.inspect(&path, false)?;
        operations.push(Operation::Write {
            path,
            before,
            bytes: serde_json::to_vec_pretty(&target_config)?,
            mode: 0o644,
        });
        if let Some(prior) = prior {
            self.cleanup(&prior, &mut operations)?;
        }
        let mut pending = Vec::new();
        for operation in operations {
            operation.validate(self.installer, false)?;
            if !operation.is_applied(self.installer)? {
                pending.push(operation);
            }
        }
        let mut manifest = OperationManifest {
            version: WIRE_VERSION,
            source_revision,
            source_digest: self.payload.digest().into(),
            binary_digest,
            configuration_digest: self.config.installation_digest()?,
            identity: String::new(),
            completed: 0,
            operations: pending,
        };
        manifest.seal()?;
        self.verify_identity()?;
        Ok(manifest)
    }

    fn materialize(&self) -> Result<(Configuration, String, Vec<Operation>)> {
        let mut target = self.config.clone();
        target.managed.clear();
        let mut operations = Vec::new();
        for (path, bytes) in self.payload.materialized(&self.config.packs)? {
            self.config.releases.ensure_separate(&path)?;
            let before = self.installer.filesystem.inspect(&path, false)?;
            let digest = ContentDigest::digest(&bytes);
            self.owned(&path, &before, &digest)?;
            target.managed.insert(path.clone(), digest);
            operations.push(Operation::Write {
                path,
                before,
                bytes,
                mode: 0o644,
            });
        }
        let path = RelativePath::new(ENGINE_BINARY)?;
        let before = self.installer.filesystem.inspect(&path, false)?;
        let source = fs::canonicalize(self.binary)?;
        let digest = ContentDigest::file(&source)?;
        self.owned(&path, &before, &digest)?;
        target.managed.insert(path.clone(), digest.clone());
        operations.push(Operation::Binary {
            path,
            before,
            source,
            digest: digest.clone(),
        });
        Ok((target, digest, operations))
    }

    fn owned(&self, path: &RelativePath, before: &FileState, expected: &str) -> Result<()> {
        match before {
            FileState::Missing {} => Ok(()),
            FileState::File { digest, .. }
                if digest == expected || self.config.managed.get(path) == Some(digest) =>
            {
                Ok(())
            }
            _ => Err(Error::Conflict(path.join(self.root))),
        }
    }

    pub(super) fn authorize(&self, manifest: &OperationManifest) -> Result<()> {
        self.verify_identity()?;
        manifest.validate(self.installer)?;
        if manifest.source_digest != self.payload.digest()
            || manifest.binary_digest != ContentDigest::file(self.binary)?
            || manifest.configuration_digest != self.config.installation_digest()?
        {
            return Err(Error::Invalid(RECOVERY_INPUTS_CHANGED.into()));
        }
        let expected = self.plan()?;
        let mut pending = Vec::new();
        for operation in &manifest.operations[manifest.completed..] {
            if !operation.is_applied(self.installer)? {
                pending.push(operation);
            }
        }
        if !pending.into_iter().eq(expected.operations.iter()) {
            return Err(Error::Invalid(RECOVERY_EFFECTS_CHANGED.into()));
        }
        Ok(())
    }

    pub fn resume(&self, manifest: &mut OperationManifest) -> Result<()> {
        self.resume_with_fault(manifest, None)
    }

    pub fn resume_with_fault(
        &self,
        manifest: &mut OperationManifest,
        fault: Option<RecoveryFault>,
    ) -> Result<()> {
        self.authorize(manifest)?;
        manifest.resume_with_fault(self, fault)
    }

    pub(super) fn verify_identity(&self) -> Result<()> {
        self.installer.verify_identity()?;
        self.state.verify_identity()
    }
}
