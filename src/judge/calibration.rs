use super::{
    bank::Bank,
    engine::EngineIdentity,
    evaluation::{Corpus, Evaluator, Metrics, Prediction, Split},
    policy::TuningCandidate,
};
use crate::Result;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
pub struct Trial {
    pub threshold: f64,
    pub metrics: Metrics,
    pub passed: bool,
}
#[derive(Serialize)]
pub struct TuningResult {
    pub candidate: Option<TuningCandidate>,
    pub trials: Vec<Trial>,
}
/// Select each question's most conservative passing threshold using tuning evidence only.
pub struct Calibrator<'a> {
    pub bank: &'a Bank,
    pub corpus: &'a Corpus,
    pub reviewed_commit: &'a str,
}
impl Calibrator<'_> {
    pub fn calibrate(
        &self,
        predictions: &BTreeMap<String, Prediction>,
    ) -> Result<BTreeMap<String, TuningResult>> {
        self.bank
            .definitions()
            .keys()
            .map(|family| Ok((family.clone(), self.family(family, predictions)?)))
            .collect()
    }
    fn family(
        &self,
        family: &str,
        predictions: &BTreeMap<String, Prediction>,
    ) -> Result<TuningResult> {
        let definition = self.bank.get(family)?;
        let mut trials = Vec::with_capacity(THRESHOLDS.len());
        let mut candidate = TuningCandidate::new(
            definition,
            EngineIdentity::jev(),
            THRESHOLDS[0],
            self.reviewed_commit,
        )?;
        for threshold in THRESHOLDS {
            candidate.threshold = threshold;
            let evaluator = Evaluator {
                bank: self.bank,
                candidate: &candidate,
            };
            let metrics = evaluator.measure_split(
                family,
                &self.corpus.cases,
                Split::Tuning,
                predictions,
                &BTreeMap::new(),
            )?;
            trials.push(Trial {
                threshold,
                passed: metrics.passes(&definition.question),
                metrics,
            });
        }
        let candidate = trials.iter().find(|trial| trial.passed).map(|trial| {
            candidate.threshold = trial.threshold;
            candidate
        });
        Ok(TuningResult { candidate, trials })
    }
}
const THRESHOLDS: [f64; 9] = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55];
