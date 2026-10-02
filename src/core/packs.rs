use super::{constants::*, plan::Policy};
use crate::{Error, Result};
use orly_decision::Question;
use orly_decision::validate_name;
use orly_fs::digest::ContentDigest;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DataPack {
    pub id: String,
    pub version: String,
    pub engine_requirement: String,
    pub questions: Vec<Question>,
    pub selectors: BTreeMap<String, String>,
    pub capabilities: BTreeSet<String>,
    pub policy: Policy,
}
impl super::document::ObjectDocument for DataPack {}

impl DataPack {
    pub fn validate(&self, capabilities: &BTreeSet<String>) -> Result<()> {
        validate_name(&self.id)?;
        semver::Version::parse(&self.version)?;
        let requirement = semver::VersionReq::parse(&self.engine_requirement)?;
        let engine = semver::Version::parse(ENGINE_VERSION)?;
        if !requirement.matches(&engine) || !self.capabilities.is_subset(capabilities) {
            return Err(Error::Invalid(
                "incompatible engine or unresolved pack capability".into(),
            ));
        }
        for pattern in self.selectors.values() {
            globset::Glob::new(pattern)?;
        }
        let mut ids = BTreeSet::new();
        for question in &self.questions {
            question.validate()?;
            if !question.id.starts_with(&format!("{}.", self.id))
                || !ids.insert(&question.id)
                || !self.selectors.contains_key(&question.builder)
            {
                return Err(Error::Invalid(
                    "duplicate question or unresolved evidence builder".into(),
                ));
            }
        }
        Ok(())
    }
}

pub struct PackRegistry {
    pub policy: Policy,
    pub questions: BTreeMap<String, Question>,
    pub digests: BTreeMap<String, String>,
    selectors: BTreeMap<String, String>,
}
impl PackRegistry {
    pub fn compose(
        packs: impl IntoIterator<Item = DataPack>,
        capabilities: &BTreeSet<String>,
    ) -> Result<Self> {
        let mut registry = Self {
            policy: Policy {
                version: WIRE_VERSION,
                nodes: Vec::new(),
            },
            questions: BTreeMap::new(),
            digests: BTreeMap::new(),
            selectors: BTreeMap::new(),
        };
        let mut ordered: Vec<_> = packs.into_iter().collect();
        ordered.sort_by(|a, b| a.id.cmp(&b.id));
        for pack in ordered {
            pack.validate(capabilities)?;
            if pack.policy.version != WIRE_VERSION || registry.digests.contains_key(&pack.id) {
                return Err(Error::Invalid(
                    "duplicate pack or unsupported policy version".into(),
                ));
            }
            let digest = ContentDigest::identity(&pack)?;
            registry.digests.insert(pack.id, digest);
            for question in pack.questions {
                if registry.questions.contains_key(&question.id) {
                    return Err(Error::Invalid("duplicate question identity".into()));
                }
                registry.questions.insert(question.id.to_owned(), question);
            }
            for (id, pattern) in pack.selectors {
                if registry
                    .selectors
                    .get(&id)
                    .is_some_and(|existing| existing != &pattern)
                {
                    return Err(Error::Invalid("conflicting evidence builder".into()));
                }
                registry.selectors.insert(id, pattern);
            }
            registry.policy.nodes.extend(pack.policy.nodes);
        }
        Ok(registry)
    }
    pub fn builders(
        &self,
        mut capabilities: super::capabilities::Capabilities,
    ) -> Result<super::capabilities::Capabilities> {
        for (id, pattern) in &self.selectors {
            capabilities = capabilities.with_builder(std::sync::Arc::new(
                super::selection::FileSelector::new(id, pattern)?,
            ))?;
        }
        Ok(capabilities)
    }
    pub fn inputs(
        &self,
        context: &super::execution::EvaluationContext,
    ) -> Result<BTreeMap<String, String>> {
        self.questions
            .iter()
            .map(|(id, question)| {
                let builder = context
                    .capabilities
                    .builder(&question.builder)
                    .ok_or_else(|| Error::Invalid("evidence builder unavailable".into()))?;
                let evidence = builder.build(context)?;
                Ok((
                    id.to_owned(),
                    ContentDigest::identity(&(question, evidence))?,
                ))
            })
            .collect()
    }
}
