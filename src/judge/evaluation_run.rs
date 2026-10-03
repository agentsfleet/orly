use super::{
    bank::Bank,
    calibration::{Calibrator, TuningResult},
    constants::*,
    evaluation::{Corpus, Evaluator, Label, Metrics, Prediction, Split, disagreement},
    judger::Judger,
    policy::{Calibration, HELD_OUT_REPEATS},
    runner::{Invoker, Outcome},
};
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, time::Instant};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentReport {
    pub corpus_digest: String,
    pub author: String,
    #[serde(with = "serde_with::rust::maps_duplicate_key_is_error")]
    pub predictions: BTreeMap<String, Prediction>,
}
#[derive(Serialize)]
pub struct EvaluationReport {
    pub corpus_digest: String,
    pub model: String,
    pub label_author: String,
    pub owner_reviewed_commit: String,
    pub agent_author: String,
    pub tuning_predictions: BTreeMap<String, Prediction>,
    pub tuning: BTreeMap<String, TuningResult>,
    pub repeats: Vec<BTreeMap<String, Prediction>>,
    pub metrics: BTreeMap<String, Vec<Metrics>>,
    pub calibrations: BTreeMap<String, Calibration>,
    pub incomplete: BTreeMap<String, String>,
    pub cross_repeat_disagreement: usize,
    pub forbidden_authority_decisions: u64,
    pub elapsed_millis: u64,
    pub passed: bool,
}
pub struct LiveEvaluator<'a> {
    pub bank: &'a Bank,
    pub corpus: &'a Corpus,
    pub judger: &'a dyn Judger,
}
impl LiveEvaluator<'_> {
    pub async fn evaluate(
        &self,
        agent: &AgentReport,
        reviewed_commit: &str,
        mut announce: impl FnMut(&str, usize),
    ) -> Result<EvaluationReport> {
        self.corpus.validate(self.bank)?;
        agent.validate(self.bank, self.corpus)?;
        let started = Instant::now();
        let mut report = self.report(agent, reviewed_commit)?;
        report.tuning_predictions = self
            .predict(
                Split::Tuning,
                "tuning",
                &mut report.incomplete,
                &mut announce,
            )
            .await?;
        report.tuning = Calibrator {
            bank: self.bank,
            corpus: self.corpus,
            reviewed_commit,
        }
        .calibrate(&report.tuning_predictions)?;
        if report
            .tuning
            .values()
            .all(|result| result.candidate.is_some())
        {
            for repeat in 0..HELD_OUT_REPEATS {
                report.repeats.push(
                    self.predict(
                        Split::HeldOut,
                        &repeat.to_string(),
                        &mut report.incomplete,
                        &mut announce,
                    )
                    .await?,
                );
            }
            report.cross_repeat_disagreement = disagreement(&report.repeats)?;
            self.measure(&mut report, agent)?;
        }
        report.elapsed_millis = started.elapsed().as_millis() as u64;
        Ok(report)
    }
    fn report(&self, agent: &AgentReport, reviewed_commit: &str) -> Result<EvaluationReport> {
        Ok(EvaluationReport {
            corpus_digest: self.corpus.digest()?,
            model: MODEL.into(),
            label_author: self.corpus.label_author.clone(),
            owner_reviewed_commit: reviewed_commit.into(),
            agent_author: agent.author.clone(),
            tuning_predictions: BTreeMap::new(),
            tuning: BTreeMap::new(),
            repeats: Vec::new(),
            metrics: BTreeMap::new(),
            calibrations: BTreeMap::new(),
            incomplete: BTreeMap::new(),
            cross_repeat_disagreement: 0,
            // Accepted typed answers cannot represent approval, commands, facts or gate overrides.
            forbidden_authority_decisions: 0,
            elapsed_millis: 0,
            passed: false,
        })
    }
    fn measure(&self, report: &mut EvaluationReport, agent: &AgentReport) -> Result<()> {
        report.passed = true;
        for definition in self.bank.definitions().values() {
            let candidate = report.tuning[&definition.id]
                .candidate
                .as_ref()
                .ok_or(Error::Stale)?;
            let evaluator = Evaluator {
                bank: self.bank,
                candidate,
            };
            let mut metrics = Vec::with_capacity(HELD_OUT_REPEATS);
            for predictions in &report.repeats {
                let measured = evaluator.measure(
                    &definition.id,
                    &self.corpus.cases,
                    predictions,
                    &agent.predictions,
                )?;
                metrics.push(measured);
            }
            let passed = metrics
                .iter()
                .all(|metrics| metrics.passes(&definition.question));
            report.passed &= passed;
            if passed {
                report.calibrations.insert(
                    definition.id.clone(),
                    Calibration::from_held_out(definition, candidate.clone(), metrics.clone())?,
                );
            }
            report.metrics.insert(definition.id.clone(), metrics);
        }
        Ok(())
    }
    async fn predict(
        &self,
        split: Split,
        label: &str,
        incomplete: &mut BTreeMap<String, String>,
        announce: &mut impl FnMut(&str, usize),
    ) -> Result<BTreeMap<String, Prediction>> {
        let cases: Vec<_> = self
            .corpus
            .cases
            .iter()
            .filter(|case| case.split == split && !matches!(case.label, Label::Missing {}))
            .collect();
        let mut predictions = BTreeMap::new();
        for chunk in cases.chunks(MAX_PAIRS) {
            let batches: Vec<_> = chunk
                .iter()
                .map(|case| case.batch(self.bank))
                .collect::<Result<_>>()?;
            let run = Invoker::new(self.judger)
                .invoke(&batches, true, &mut *announce)
                .await?;
            for (case, batch) in chunk.iter().zip(&batches) {
                let observed = run.metrics.get(batch.digest());
                let latency_millis = observed
                    .map(|metrics| metrics.duration_millis)
                    .unwrap_or_default();
                let requests = observed.map(|metrics| metrics.requests).unwrap_or_default();
                let prediction = match &run.batches[batch.digest()] {
                    Outcome::Recorded { record, .. } => Prediction {
                        answer: record.response.answers.get(&case.id).cloned(),
                        requests,
                        input_tokens: record.response.usage.input_tokens,
                        output_tokens: record.response.usage.output_tokens,
                        latency_millis,
                    },
                    Outcome::Incomplete { reason } => {
                        incomplete.insert(format!("{label}.{}", case.id), reason.clone());
                        Prediction {
                            answer: None,
                            requests,
                            input_tokens: 0,
                            output_tokens: 0,
                            latency_millis,
                        }
                    }
                };
                predictions.insert(case.id.clone(), prediction);
            }
        }
        Ok(predictions)
    }
}
