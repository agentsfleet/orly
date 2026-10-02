use super::constants::WIRE_VERSION;
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
pub enum CriterionResult {
    Passed {
        reason: String,
    },
    Failed {
        reason: String,
    },
    Skipped {
        reason: String,
    },
    Reported {
        reason: String,
    },
    Overridden {
        reason: String,
        original: Box<CriterionResult>,
        invocation: String,
    },
}

impl CriterionResult {
    pub fn failed(reason: impl Into<String>) -> Self {
        Self::Failed {
            reason: reason.into(),
        }
    }
    pub fn passed(reason: impl Into<String>) -> Self {
        Self::Passed {
            reason: reason.into(),
        }
    }
    pub fn reported(reason: impl Into<String>) -> Self {
        Self::Reported {
            reason: reason.into(),
        }
    }
    pub fn is_failure(&self) -> bool {
        matches!(self, Self::Failed { .. })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CommandInvocation {
    pub identity: String,
    pub command_digest: String,
    pub snapshot_digest: String,
    pub config_digest: String,
    pub result: CriterionResult,
    pub exit_code: Option<i32>,
    pub signal: Option<i32>,
    pub stdout_bytes: u64,
    pub stderr_bytes: u64,
    pub output_complete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct EvidencePacket {
    pub version: u32,
    pub engine: String,
    pub snapshot_digest: String,
    pub config_digest: String,
    pub results: BTreeMap<String, CriterionResult>,
    pub required: BTreeSet<String>,
    pub invocations: BTreeMap<String, CommandInvocation>,
    pub counts: BTreeMap<String, u64>,
    pub paths: Vec<RelativePath>,
}

impl EvidencePacket {
    pub fn new(snapshot_digest: String, config_digest: String) -> Self {
        Self {
            version: WIRE_VERSION,
            engine: super::constants::ENGINE_VERSION.into(),
            snapshot_digest,
            config_digest,
            results: BTreeMap::new(),
            required: BTreeSet::new(),
            invocations: BTreeMap::new(),
            counts: BTreeMap::new(),
            paths: Vec::new(),
        }
    }
    pub fn exit_code(&self) -> u8 {
        u8::from(
            self.required
                .iter()
                .any(|id| self.results.get(id).is_none_or(CriterionResult::is_failure)),
        )
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OperationalMetadata {
    pub invocation_id: String,
    pub duration_millis: u64,
}
