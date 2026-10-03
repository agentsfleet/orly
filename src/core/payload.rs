use super::constants::*;
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.json"));
#[path = "payload_materialize.rs"]
mod materialize;
use materialize::Materialization;

#[derive(Clone, Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Payload {
    digest: String,
    files: BTreeMap<String, Vec<u8>>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PayloadDocument {
    digest: String,
    files: BTreeMap<String, Vec<u8>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ManagedResource {
    pub source: RelativePath,
    pub target: RelativePath,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RegistryPack {
    pub extensions: Vec<String>,
    pub managed_files: Vec<ManagedResource>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct NativeRegistry {
    pub schema_version: u32,
    pub core_documents: Vec<RelativePath>,
    pub packs: BTreeMap<String, RegistryPack>,
    pub rules: Vec<serde_json::Value>,
}

impl Payload {
    pub fn embedded() -> Result<Self> {
        Self::from_json(PAYLOAD)
    }
    pub fn from_json(bytes: &[u8]) -> Result<Self> {
        let document: PayloadDocument = serde_json::from_slice(bytes)?;
        let payload = Self {
            digest: document.digest,
            files: document.files,
        };
        payload.validate()?;
        Ok(payload)
    }
    pub fn digest(&self) -> &str {
        &self.digest
    }
    pub fn files(&self) -> &BTreeMap<String, Vec<u8>> {
        &self.files
    }
    pub fn validate(&self) -> Result<()> {
        if ContentDigest::identity(&self.files)? != self.digest {
            return Err(Error::Invalid("embedded payload digest mismatch".into()));
        }
        for key in self.files.keys() {
            RelativePath::new(key)?;
            if key.ends_with(".md") {
                std::str::from_utf8(&self.files[key])?;
            }
        }
        let registry = self.registry()?;
        for pack in registry.packs.values() {
            for file in &pack.managed_files {
                if !self.files.contains_key(file.source.as_str()) {
                    return Err(Error::Invalid(
                        "missing embedded registered resource".into(),
                    ));
                }
            }
        }
        Ok(())
    }
    pub fn registry(&self) -> Result<NativeRegistry> {
        serde_json::from_slice(self.file(REGISTRY_PATH)?).map_err(Into::into)
    }
    pub fn file(&self, source: &str) -> Result<&[u8]> {
        self.files
            .get(source)
            .map(Vec::as_slice)
            .ok_or_else(|| Error::Invalid(format!("resource unavailable: {source}")))
    }
    pub fn materialized(&self, selected: &[String]) -> Result<BTreeMap<RelativePath, Vec<u8>>> {
        Materialization::new(self, selected)?.files()
    }
    pub fn reference_map(&self) -> Result<BTreeMap<String, String>> {
        let mut mapping = BTreeMap::from([
            (OLD_CONFIG_PATH.into(), CONFIG_PATH.into()),
            (AGENTS_FILENAME.into(), ORLY_AGENTS_FILENAME.into()),
        ]);
        for pack in self.registry()?.packs.values() {
            for resource in &pack.managed_files {
                mapping.insert(
                    resource.target.as_str().into(),
                    format!("{ORLY_PREFIX}{}", resource.target.as_str()),
                );
            }
        }
        Ok(mapping)
    }
}
