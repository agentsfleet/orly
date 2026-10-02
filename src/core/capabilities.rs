use super::plan::{PAYLOAD_CHECK, SNAPSHOT_CHECK};
use crate::{
    Error, Result,
    checks::{Check, EvidenceBuilder},
};
use orly_decision::validate_name;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

#[derive(Default)]
pub struct Capabilities {
    checks: BTreeMap<String, Arc<dyn Check>>,
    builders: BTreeMap<String, Arc<dyn EvidenceBuilder>>,
}
impl Capabilities {
    pub fn with_check(mut self, check: Arc<dyn Check>) -> Result<Self> {
        validate_name(check.identity())?;
        if [SNAPSHOT_CHECK, PAYLOAD_CHECK].contains(&check.identity())
            || self.checks.contains_key(check.identity())
        {
            return Err(Error::Invalid(
                "duplicate or reserved check identity".into(),
            ));
        }
        self.checks.insert(check.identity().into(), check);
        Ok(self)
    }
    pub fn with_builder(mut self, builder: Arc<dyn EvidenceBuilder>) -> Result<Self> {
        validate_name(builder.identity())?;
        if self.builders.contains_key(builder.identity()) {
            return Err(Error::Invalid("duplicate builder identity".into()));
        }
        self.builders.insert(builder.identity().into(), builder);
        Ok(self)
    }
    pub fn check(&self, identity: &str) -> Option<&dyn Check> {
        self.checks.get(identity).map(Arc::as_ref)
    }
    pub fn builder(&self, identity: &str) -> Option<&dyn EvidenceBuilder> {
        self.builders.get(identity).map(Arc::as_ref)
    }
    pub fn identities(&self) -> BTreeSet<String> {
        self.checks.keys().cloned().collect()
    }
}
