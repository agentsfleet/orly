use super::COMMIT_BYTES;
use crate::{
    Error, Result,
    judge::{bank::Definition, engine::EngineIdentity, evaluation::Metrics},
};
use orly_fs::digest::ContentDigest;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TuningCandidate {
    pub threshold: f64,
    pub reviewed_commit: String,
    pub definition_digest: String,
    pub engine: EngineIdentity,
}
impl TuningCandidate {
    pub fn new(
        definition: &Definition,
        engine: EngineIdentity,
        threshold: f64,
        revision: &str,
    ) -> Result<Self> {
        let candidate = Self {
            threshold,
            reviewed_commit: revision.into(),
            engine,
            definition_digest: binding(definition)?,
        };
        candidate.validate_for(definition, &candidate.engine)?;
        Ok(candidate)
    }
    pub fn validate_for(&self, definition: &Definition, engine: &EngineIdentity) -> Result<()> {
        self.engine.validate()?;
        if self.engine != *engine || self.definition_digest != binding(definition)? {
            return Err(Error::Stale);
        }
        if !self.threshold.is_finite()
            || self.threshold <= 0.5
            || self.threshold > 1.0
            || self.reviewed_commit.len() != COMMIT_BYTES
            || !self
                .reviewed_commit
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(Error::Invalid(
                "calibration requires a threshold and reviewed revision".into(),
            ));
        }
        Ok(())
    }
}
/// A tuning candidate becomes usable policy only after every held-out repeat passes.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Calibration {
    candidate: TuningCandidate,
    held_out: Vec<Metrics>,
}
impl Calibration {
    pub fn from_held_out(
        definition: &Definition,
        candidate: TuningCandidate,
        held_out: Vec<Metrics>,
    ) -> Result<Self> {
        let calibration = Self {
            candidate,
            held_out,
        };
        calibration.validate_for(definition, &calibration.candidate.engine)?;
        Ok(calibration)
    }
    pub fn candidate(&self) -> &TuningCandidate {
        &self.candidate
    }
    pub fn threshold(&self) -> f64 {
        self.candidate.threshold
    }
    pub fn validate_for(&self, definition: &Definition, engine: &EngineIdentity) -> Result<()> {
        self.candidate.validate_for(definition, engine)?;
        if self.held_out.len() != HELD_OUT_REPEATS
            || !self
                .held_out
                .iter()
                .all(|metrics| metrics.passes(&definition.question))
        {
            return Err(Error::Invalid(
                "calibration requires passing held-out repeats".into(),
            ));
        }
        Ok(())
    }
}
fn binding(definition: &Definition) -> Result<String> {
    Ok(ContentDigest::identity(&(
        definition.inference_digest()?,
        definition.finding_polarity,
    ))?)
}
pub const HELD_OUT_REPEATS: usize = 3;
