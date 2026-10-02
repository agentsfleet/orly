use crate::{
    Result,
    core::{evidence::CriterionResult, execution::EvaluationContext},
};

pub trait Check: Send + Sync {
    fn identity(&self) -> &str;
    fn evaluate(&self, context: &EvaluationContext) -> Result<CriterionResult>;
}

pub trait EvidenceBuilder: Send + Sync {
    fn identity(&self) -> &str;
    fn build(&self, context: &EvaluationContext) -> Result<serde_json::Value>;
}

pub struct UnavailableChecks;
impl Check for UnavailableChecks {
    fn identity(&self) -> &str {
        crate::core::constants::UNAVAILABLE_CODE
    }
    fn evaluate(&self, _context: &EvaluationContext) -> Result<CriterionResult> {
        Ok(CriterionResult::failed(
            crate::core::constants::UNAVAILABLE_CODE,
        ))
    }
}
