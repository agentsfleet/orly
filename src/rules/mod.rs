use crate::{
    Result,
    core::{evidence::CriterionResult, execution::EvaluationContext},
};
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DeliveryRecord {
    pub version: u32,
    pub snapshot_digest: String,
    pub rule_digest: String,
    pub paths: Vec<RelativePath>,
    pub emitted: CriterionResult,
    pub self_reported_read: CriterionResult,
    pub compliance: CriterionResult,
}

pub trait Rules: Send + Sync {
    fn deliver(&self, context: &EvaluationContext) -> Result<DeliveryRecord>;
}
pub struct UnavailableRules;
impl Rules for UnavailableRules {
    fn deliver(&self, context: &EvaluationContext) -> Result<DeliveryRecord> {
        let unavailable = CriterionResult::reported(crate::core::constants::UNAVAILABLE_CODE);
        Ok(DeliveryRecord {
            version: crate::core::constants::WIRE_VERSION,
            snapshot_digest: context.snapshot.digest()?,
            rule_digest: String::new(),
            paths: Vec::new(),
            emitted: unavailable.clone(),
            self_reported_read: unavailable.clone(),
            compliance: unavailable,
        })
    }
}
