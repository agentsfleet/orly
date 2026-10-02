use crate::{Result, core::execution::EvaluationContext};
use orly_decision::{DecisionEnvelope, Question};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
pub enum JudgeResult {
    Recorded { envelope: DecisionEnvelope },
    Unavailable { reason: String },
}

pub trait Judge: Send + Sync {
    fn evaluate(&self, context: &EvaluationContext, question: &Question) -> Result<JudgeResult>;
}
pub struct UnavailableJudge;
impl Judge for UnavailableJudge {
    fn evaluate(&self, _context: &EvaluationContext, _question: &Question) -> Result<JudgeResult> {
        Ok(JudgeResult::Unavailable {
            reason: crate::core::constants::UNAVAILABLE_CODE.into(),
        })
    }
}
