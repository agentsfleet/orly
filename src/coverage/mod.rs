use crate::{
    Result,
    core::{evidence::CriterionResult, execution::EvaluationContext},
};
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CoveredLine {
    pub path: RelativePath,
    pub line: u32,
    pub hits: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CoverageManifest {
    pub version: u32,
    pub snapshot_digest: String,
    pub invocation_identity: String,
    pub producer: String,
    pub lines: Vec<CoveredLine>,
    pub result: CriterionResult,
}

pub trait Coverage: Send + Sync {
    fn collect(&self, context: &EvaluationContext) -> Result<CoverageManifest>;
}
pub struct UnavailableCoverage;
impl Coverage for UnavailableCoverage {
    fn collect(&self, context: &EvaluationContext) -> Result<CoverageManifest> {
        Ok(CoverageManifest {
            version: crate::core::constants::WIRE_VERSION,
            snapshot_digest: context.snapshot.digest()?,
            invocation_identity: String::new(),
            producer: String::new(),
            lines: Vec::new(),
            result: CriterionResult::failed(crate::core::constants::UNAVAILABLE_CODE),
        })
    }
}
