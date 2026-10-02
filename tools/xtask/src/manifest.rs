use crate::{
    error::{Error, Result},
    manifest_model::{PortManifest, PortReport},
};
use orly::core::{
    document::ObjectDocument,
    git::{Git, ObjectStore},
};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

pub const INVENTORY_PATH: &str = "fixtures/port/inventory.json";
const PROOFS_PATH: &str = "fixtures/port/proofs.json";
impl ObjectDocument for PortManifest {}

impl PortManifest {
    pub fn read(root: &Path) -> Result<Self> {
        Ok(Self::read_json(&root.join(INVENTORY_PATH))?)
    }
    pub fn check(&self, root: &Path) -> Result<PortReport> {
        self.check_revision(root)?;
        self.check_ownership()?;
        let proofs = crate::manifest_proofs::ProofBook::read(root, PROOFS_PATH)?;
        proofs.check(root, &self.revision)?;
        let tracked = ObjectStore::open(root)?
            .revision_entries(&self.revision)?
            .into_iter()
            .map(|entry| (entry.path, entry.mode))
            .collect::<BTreeMap<_, _>>();
        let mut mapped = BTreeSet::new();
        let mut obligations = 0;
        for entry in &self.entries {
            if !mapped.insert(entry.path.clone()) || entry.successor.is_empty() {
                return Err(Error::Invalid);
            }
            let mode = tracked.get(&entry.path).ok_or(Error::Invalid)?;
            if entry.requires_proof(*mode) && entry.obligations.is_empty() {
                return Err(Error::Invalid);
            }
            let mut names = BTreeSet::new();
            for obligation in &entry.obligations {
                if obligation.name.is_empty()
                    || !names.insert(&obligation.name)
                    || obligation.successor.is_empty()
                    || !proofs.contains(&obligation.proof)
                {
                    return Err(Error::Invalid);
                }
                obligations += 1;
            }
        }
        if !tracked.keys().eq(mapped.iter()) {
            return Err(Error::Invalid);
        }
        Ok(PortReport {
            tracked_paths: mapped.len(),
            obligations,
            native_proofs: proofs.native_count(),
            frozen_proofs: proofs.frozen_count(),
        })
    }
    fn check_revision(&self, root: &Path) -> Result<()> {
        if self.version != 1
            || self.revision.len() != 40
            || !self.revision.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(Error::Invalid);
        }
        if Git::text(root, &["rev-parse", "--verify", &self.revision])? != self.revision {
            return Err(Error::Invalid);
        }
        Ok(())
    }
    fn check_ownership(&self) -> Result<()> {
        let mut claimed = BTreeSet::new();
        for (lane, paths) in &self.ownership {
            if lane.is_empty() || paths.is_empty() {
                return Err(Error::Invalid);
            }
            for path in paths {
                let path = Path::new(path.as_str());
                if claimed
                    .iter()
                    .any(|other: &&Path| path.starts_with(other) || other.starts_with(path))
                {
                    return Err(Error::Invalid);
                }
                claimed.insert(path);
            }
        }
        Ok(())
    }
}
