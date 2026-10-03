use crate::{Result, core::execution::EvaluationContext};
use orly_decision::{DecisionEnvelope, Question};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub mod adapter;
pub mod authorization;
pub mod bank;
pub mod batch;
pub mod builders;
pub mod calibration;
pub mod client;
pub mod constants;
pub mod engine;
pub mod error;
pub mod evaluation;
pub mod evaluation_command;
pub mod evaluation_review;
pub mod evaluation_run;
pub mod handler;
pub mod judger;
pub mod metrics;
pub mod policy;
pub mod replay;
pub mod runner;
pub mod scanner;
mod syntax;
pub mod transport;
pub mod wire;

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
