use super::{constants::*, wire::Answer};
use crate::{
    Result,
    core::{
        evidence::{CriterionResult, EvidencePacket},
        plan::{CompiledAction, DecisionPlan},
    },
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
#[path = "policy_calibration.rs"]
mod calibration;
#[path = "policy_reduce.rs"]
mod composition;
#[path = "policy_effects.rs"]
mod effects;
pub use calibration::{Calibration, HELD_OUT_REPEATS, TuningCandidate};
pub use composition::PlanComposer;
pub use effects::{DeclaredPolicy, disposition};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Disposition {
    Finding,
    Quiet,
    Uncertain,
    Missing,
    Unused,
}
#[derive(Debug, Serialize)]
pub struct Constituent<'a> {
    pub pair_id: &'a str,
    pub input_id: &'a str,
    pub question_id: &'a str,
    pub source_clause: &'a str,
    pub batch_digest: &'a str,
    pub run_id: Option<&'a str>,
    pub disposition: Disposition,
    pub answer: Option<&'a Answer>,
    pub replayed: bool,
    pub selected_node: Option<String>,
}
#[derive(Serialize)]
pub struct Assessment<'a> {
    pub plan: DecisionPlan,
    pub constituents: Vec<Constituent<'a>>,
    pub ranked_candidates: Vec<(&'a str, f64)>,
}
impl Assessment<'_> {
    pub fn report_into(&self, exact: &mut EvidencePacket) {
        for item in &self.constituents {
            exact
                .results
                .entry(format!("{REPORT_PREFIX}{}", item.pair_id))
                .or_insert_with(|| CriterionResult::reported(SEMANTIC_REPORTED));
        }
    }
}
pub struct Decision {
    pub disposition: Disposition,
    pub action: Option<CompiledAction>,
    pub rank: Option<f64>,
}
/// Host policy is replaceable independently of inference and has its own identity.
pub trait Decider {
    fn decide(
        &self,
        engine: &super::engine::EngineIdentity,
        pair: &super::batch::Pair,
        answer: Option<&Answer>,
    ) -> Result<Decision>;
    fn digest(&self) -> Result<String>;
}
pub(super) const DEFAULT_CONFIDENCE: f64 = 0.8;
pub(super) const COMMIT_BYTES: usize = 40;
pub(super) const NODE_PREFIX: &str = "judge.";
const REPORT_PREFIX: &str = "semantic.";
pub type Declarations = BTreeSet<String>;
