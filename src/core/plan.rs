use super::evidence::CriterionResult;
use crate::{Error, Result};
use orly_decision::{Answer, Primitive, Question};
use orly_fs::digest::ContentDigest;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
#[path = "plan_validate.rs"]
mod validation;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "primitive", rename_all = "snake_case", deny_unknown_fields)]
pub enum Condition {
    Choice {
        candidate: String,
        threshold: f64,
    },
    Noul {
        condition: String,
        threshold: f64,
    },
    Score {
        candidate: String,
        level: String,
        threshold: f64,
    },
}

impl Condition {
    pub fn validate(&self, question: &Question) -> Result<()> {
        self.threshold()?;
        let candidate = match (self, &question.primitive) {
            (Self::Choice { candidate, .. }, Primitive::Choice {}) => candidate,
            (Self::Noul { condition, .. }, Primitive::Noul {}) => condition,
            (
                Self::Score {
                    candidate, level, ..
                },
                Primitive::Score { levels },
            ) if levels.contains(level) => candidate,
            _ => {
                return Err(Error::Invalid(
                    "condition primitive or score level is undeclared".into(),
                ));
            }
        };
        if !question.candidates.contains(candidate) {
            return Err(Error::Invalid("condition uses undeclared candidate".into()));
        }
        Ok(())
    }
    pub fn evaluate(&self, answer: &Answer) -> Result<Option<bool>> {
        answer.validate()?;
        let threshold = self.threshold()?;
        match (self, answer) {
            (Self::Choice { candidate, .. }, Answer::Choice { probabilities }) => {
                if !probabilities.contains_key(candidate) {
                    return Err(Error::Invalid("unknown choice".into()));
                }
                Ok(answer.selected(threshold).map(|key| key == candidate))
            }
            (Self::Noul { condition, .. }, Answer::Noul { probabilities }) => {
                confidence(probabilities.get(condition), threshold)
            }
            (
                Self::Score {
                    candidate, level, ..
                },
                Answer::Score { distributions },
            ) => confidence(
                distributions.get(candidate).and_then(|d| d.get(level)),
                threshold,
            ),
            _ => Err(Error::Invalid("decision primitive mismatch".into())),
        }
    }
    fn threshold(&self) -> Result<f64> {
        let threshold = match self {
            Self::Choice { threshold, .. }
            | Self::Noul { threshold, .. }
            | Self::Score { threshold, .. } => *threshold,
        };
        if !threshold.is_finite() || threshold <= 0.5 || threshold > 1.0 {
            return Err(Error::Invalid("threshold must exceed one half".into()));
        }
        Ok(threshold)
    }
}

fn confidence(probability: Option<&f64>, threshold: f64) -> Result<Option<bool>> {
    let p = probability.ok_or_else(|| Error::Invalid("unknown decision candidate".into()))?;
    Ok(if *p >= threshold {
        Some(true)
    } else if *p <= 1.0 - threshold {
        Some(false)
    } else {
        None
    })
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Check {
        capability: String,
        inputs: BTreeSet<String>,
    },
    Command {
        command_id: String,
    },
    Select {
        question_id: String,
        condition: Condition,
        on_true: String,
        on_false: String,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PolicyNode {
    pub id: String,
    pub dependencies: BTreeSet<String>,
    pub required: bool,
    pub action: Action,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub version: u32,
    pub nodes: Vec<PolicyNode>,
}
impl super::document::ObjectDocument for Policy {}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
pub enum CompiledAction {
    Check { capability: String },
    Command { command_id: String },
    Resolved { result: CriterionResult },
    Unresolved { question_id: String },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PlanNode {
    pub id: String,
    pub dependencies: BTreeSet<String>,
    pub required: bool,
    pub action: CompiledAction,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DecisionPlan {
    pub version: u32,
    pub snapshot_digest: String,
    pub configuration_digest: String,
    pub policy_digest: String,
    pub decisions_digest: String,
    pub pack_digests: BTreeMap<String, String>,
    pub nodes: Vec<PlanNode>,
    pub digest: String,
}

pub const SNAPSHOT_CHECK: &str = "core.snapshot";
pub const PAYLOAD_CHECK: &str = "core.payload";
pub const REQUIRED_INPUT_MISSING: &str = "required_input_missing";
pub const SEMANTIC_UNRESOLVED: &str = "semantic_unresolved";
pub const DEPENDENCY_BLOCKED: &str = "dependency_blocked";
pub const CHECK_PASSED: &str = "exact_check_passed";
pub(crate) const SAFETY_CHECKS: [&str; 2] = [SNAPSHOT_CHECK, PAYLOAD_CHECK];
pub(crate) const INVALID_PLAN_NODE: &str = "duplicate or empty node identity";
pub(crate) const UNKNOWN_PLAN_DEPENDENCY: &str = "unknown node dependency";
pub(crate) const CYCLIC_PLAN: &str = "cyclic decision plan";
pub(crate) const UNKNOWN_QUESTION: &str = "unknown question";
pub(crate) const MISSING_QUESTION_INPUT: &str = "question evidence is missing";

impl DecisionPlan {
    pub fn compute_digest(&self) -> Result<String> {
        Ok(ContentDigest::identity(&(
            self.version,
            &self.snapshot_digest,
            &self.configuration_digest,
            &self.policy_digest,
            &self.decisions_digest,
            &self.pack_digests,
            &self.nodes,
        ))?)
    }
    pub fn validate(&self, snapshot: &str, config: &str) -> Result<()> {
        self.validate_structure()?;
        if self.snapshot_digest != snapshot
            || self.configuration_digest != config
            || self.digest != self.compute_digest()?
        {
            return Err(Error::Stale);
        }
        Ok(())
    }
}

pub use super::plan_compile::PlanCompiler;
