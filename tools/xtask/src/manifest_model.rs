use orly::core::git::FileMode;
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PortManifest {
    pub version: u32,
    pub revision: String,
    pub entries: Vec<PortEntry>,
    pub ownership: BTreeMap<String, Vec<RelativePath>>,
}
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PortEntry {
    pub path: RelativePath,
    pub disposition: Disposition,
    pub successor: String,
    pub obligations: Vec<Obligation>,
}
impl PortEntry {
    pub(super) fn requires_proof(&self, mode: FileMode) -> bool {
        mode == FileMode::Executable || self.disposition.requires_proof()
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Disposition {
    AuthoritativeRules,
    GeneratedDestination,
    HostWrapper,
    ProjectDocumentation,
    HistoricalRecord,
    PrivateNotes,
    NativeReplacement,
    DevelopmentReplacement,
    ReleaseAssembly,
    PreservedData,
}
impl Disposition {
    fn requires_proof(&self) -> bool {
        matches!(
            self,
            Self::NativeReplacement | Self::DevelopmentReplacement | Self::ReleaseAssembly
        )
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Obligation {
    pub name: String,
    pub successor: String,
    pub proof: String,
}
#[derive(Debug, Serialize)]
pub struct PortReport {
    pub tracked_paths: usize,
    pub obligations: usize,
    pub native_proofs: usize,
    pub frozen_proofs: usize,
}
