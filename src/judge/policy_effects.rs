use super::{
    Calibration, DEFAULT_CONFIDENCE, Decider, Decision, Declarations, Disposition, TuningCandidate,
};
use crate::judge::{
    bank::Consumer,
    batch::Pair,
    constants::{INSUFFICIENT, QUIET},
    engine::EngineIdentity,
    wire::Answer,
};
use crate::{Error, Result, core::plan::CompiledAction};
use orly_fs::digest::ContentDigest;
use std::collections::BTreeMap;

pub struct DeclaredPolicy<'a> {
    pub consumed: &'a Declarations,
    pub calibrations: &'a BTreeMap<String, Calibration>,
    pub commands: &'a Declarations,
    pub capabilities: &'a Declarations,
    pub candidates: &'a Declarations,
}
impl Decider for DeclaredPolicy<'_> {
    fn decide(
        &self,
        engine: &EngineIdentity,
        pair: &Pair,
        answer: Option<&Answer>,
    ) -> Result<Decision> {
        if !self.consumed.contains(&pair.definition.id) {
            return Ok(Decision {
                disposition: Disposition::Unused,
                action: None,
                rank: None,
            });
        }
        let calibration = self.calibrations.get(&pair.definition.id);
        if let Some(calibration) = calibration {
            calibration.validate_for(&pair.definition, engine)?;
        }
        let disposition = disposition(
            answer,
            calibration.map(Calibration::candidate),
            pair.definition.finding_polarity,
        );
        let rank = self.rank(pair, answer, &disposition)?;
        let action = answer
            .zip(calibration)
            .map(|(answer, calibration)| self.select(pair, answer, &disposition, calibration))
            .transpose()?
            .flatten();
        Ok(Decision {
            disposition,
            action,
            rank,
        })
    }
    fn digest(&self) -> Result<String> {
        Ok(ContentDigest::identity(&(
            self.consumed,
            self.calibrations,
            self.commands,
            self.capabilities,
            self.candidates,
        ))?)
    }
}
impl DeclaredPolicy<'_> {
    fn rank(
        &self,
        pair: &Pair,
        answer: Option<&Answer>,
        disposition: &Disposition,
    ) -> Result<Option<f64>> {
        let Some(Answer::Score { score, .. }) = answer else {
            return Ok(None);
        };
        if !self.candidates.contains(&pair.candidate_id) {
            return Err(Error::Invalid("unknown ranking candidate".into()));
        }
        Ok((*disposition != Disposition::Uncertain).then_some(*score))
    }
    fn select(
        &self,
        pair: &Pair,
        answer: &Answer,
        disposition: &Disposition,
        calibration: &Calibration,
    ) -> Result<Option<CompiledAction>> {
        match (&pair.definition.consumer, answer) {
            (
                Consumer::Recipe { choices },
                Answer::Choice {
                    choice, confidence, ..
                },
            ) if *confidence >= calibration.threshold() => choices
                .get(choice)
                .map(|command| {
                    declared(command, self.commands)
                        .map(|command_id| CompiledAction::Command { command_id })
                })
                .transpose(),
            (Consumer::Review { route }, _) if *disposition == Disposition::Finding => {
                Ok(Some(CompiledAction::Check {
                    capability: declared(route, self.capabilities)?,
                }))
            }
            (
                Consumer::Rank {},
                Answer::Score {
                    score,
                    legend,
                    confidence,
                    ..
                },
            ) if *confidence >= calibration.threshold()
                && *score / (legend.len() - 1) as f64 >= calibration.threshold()
                && self.capabilities.contains(&pair.candidate_id) =>
            {
                Ok(Some(CompiledAction::Check {
                    capability: declared(&pair.candidate_id, self.candidates)?,
                }))
            }
            _ => Ok(None),
        }
    }
}
fn declared(id: &str, declarations: &Declarations) -> Result<String> {
    declarations
        .get(id)
        .cloned()
        .ok_or_else(|| Error::Invalid("unknown declared policy identifier".into()))
}
pub fn disposition(
    answer: Option<&Answer>,
    calibration: Option<&TuningCandidate>,
    finding_polarity: bool,
) -> Disposition {
    let Some(answer) = answer else {
        return Disposition::Missing;
    };
    let threshold = calibration
        .map(|value| value.threshold)
        .unwrap_or(DEFAULT_CONFIDENCE);
    match answer {
        Answer::Choice {
            choice, confidence, ..
        } if *confidence < threshold || choice == INSUFFICIENT => Disposition::Uncertain,
        Answer::Choice { choice, .. } if choice == QUIET => Disposition::Quiet,
        Answer::Choice { .. } => Disposition::Finding,
        Answer::Noul { noul } => {
            let probability = if finding_polarity { *noul } else { 1.0 - noul };
            if probability >= threshold {
                Disposition::Finding
            } else if probability <= 1.0 - threshold {
                Disposition::Quiet
            } else {
                Disposition::Uncertain
            }
        }
        Answer::Score { confidence, .. } if *confidence < threshold => Disposition::Uncertain,
        Answer::Score { .. } => Disposition::Quiet,
    }
}
