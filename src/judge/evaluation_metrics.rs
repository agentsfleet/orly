use super::{Case, Label, Split};
use crate::judge::{
    bank::{Bank, Definition},
    constants::{INSUFFICIENT, QUIET},
    policy::{Disposition, TuningCandidate, disposition},
    wire::{Answer, Question},
};
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Prediction {
    pub answer: Option<Answer>,
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub latency_millis: u64,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Metrics {
    pub total: u64,
    pub substantive: u64,
    pub correct: u64,
    pub true_positive: u64,
    pub false_positive: u64,
    pub missed_positive: u64,
    pub ranking_pairs: u64,
    pub ordered_pairs: u64,
    pub unique_useful: u64,
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub latency_millis: u64,
}
impl Metrics {
    pub fn passes(&self, question: &Question) -> bool {
        if !ratio(self.substantive, self.total, COVERAGE_PERCENT) {
            return false;
        }
        match question {
            Question::Choice { .. } => ratio(self.correct, self.substantive, QUALITY_PERCENT),
            Question::Noul { .. } => self.binary_passes(),
            Question::Score { .. } => {
                ratio(self.correct, self.substantive, QUALITY_PERCENT)
                    && ratio(self.ordered_pairs, self.ranking_pairs, QUALITY_PERCENT)
                    && self.binary_passes()
            }
        }
    }
    fn binary_passes(&self) -> bool {
        ratio(
            self.true_positive,
            self.true_positive + self.false_positive,
            QUALITY_PERCENT,
        ) && ratio(
            self.true_positive,
            self.true_positive + self.missed_positive,
            COVERAGE_PERCENT,
        )
    }
    fn observe(&mut self, expected_positive: bool, actual_positive: bool) {
        self.true_positive += u64::from(actual_positive && expected_positive);
        self.false_positive += u64::from(actual_positive && !expected_positive);
        self.missed_positive += u64::from(expected_positive && !actual_positive);
    }
    fn usage(&mut self, prediction: &Prediction) {
        self.requests += prediction.requests;
        self.input_tokens += prediction.input_tokens;
        self.output_tokens += prediction.output_tokens;
        self.latency_millis += prediction.latency_millis;
    }
}
pub struct Evaluator<'a> {
    pub bank: &'a Bank,
    pub candidate: &'a TuningCandidate,
}
impl Evaluator<'_> {
    pub fn measure(
        &self,
        family: &str,
        cases: &[Case],
        predictions: &BTreeMap<String, Prediction>,
        agent: &BTreeMap<String, Prediction>,
    ) -> Result<Metrics> {
        self.measure_split(family, cases, Split::HeldOut, predictions, agent)
    }
    pub fn measure_split(
        &self,
        family: &str,
        cases: &[Case],
        split: Split,
        predictions: &BTreeMap<String, Prediction>,
        agent: &BTreeMap<String, Prediction>,
    ) -> Result<Metrics> {
        let definition = self.bank.get(family)?;
        self.candidate
            .validate_for(definition, &self.candidate.engine)?;
        let mut measurement = Measurement::new(definition, self.candidate);
        for case in cases.iter().filter(|case| {
            case.family == family && case.split == split && !matches!(case.label, Label::Missing {})
        }) {
            measurement.include(case, predictions.get(&case.id), agent.get(&case.id))?;
        }
        Ok(measurement.finish())
    }
}
/// Owns a family's counts while borrowing its reviewed decision semantics.
struct Measurement<'a> {
    definition: &'a Definition,
    candidate: &'a TuningCandidate,
    metrics: Metrics,
    ranks: Vec<(usize, Option<f64>)>,
}
impl<'a> Measurement<'a> {
    fn new(definition: &'a Definition, candidate: &'a TuningCandidate) -> Self {
        Self {
            definition,
            candidate,
            metrics: Metrics::default(),
            ranks: Vec::new(),
        }
    }
    fn include(
        &mut self,
        case: &Case,
        prediction: Option<&Prediction>,
        agent: Option<&Prediction>,
    ) -> Result<()> {
        let answer = prediction.and_then(|prediction| prediction.answer.as_ref());
        let agent_answer = agent.and_then(|prediction| prediction.answer.as_ref());
        for answer in [answer, agent_answer].into_iter().flatten() {
            answer.validate(&self.definition.question)?;
        }
        let state = disposition(
            answer,
            Some(self.candidate),
            self.definition.finding_polarity,
        );
        let substantive = !matches!(state, Disposition::Uncertain | Disposition::Missing);
        let correct = substantive && label_matches(&case.label, answer);
        let expected = self.expected_positive(&case.label);
        let actual = self.predicted_positive(answer, substantive, &state);
        self.metrics.total += 1;
        self.metrics.substantive += u64::from(substantive);
        self.metrics.correct += u64::from(correct);
        self.metrics.observe(expected, actual);
        self.metrics.unique_useful +=
            u64::from(expected && actual && correct && !label_matches(&case.label, agent_answer));
        if let Label::Score { level } = &case.label {
            let score = match answer {
                Some(Answer::Score { score, .. }) if substantive => Some(*score),
                _ => None,
            };
            self.ranks.push((*level, score));
        }
        if let Some(prediction) = prediction {
            self.metrics.usage(prediction);
        }
        Ok(())
    }
    fn expected_positive(&self, label: &Label) -> bool {
        match label {
            Label::Choice { option } => option != QUIET && option != INSUFFICIENT,
            Label::Noul { positive } => *positive == self.definition.finding_polarity,
            Label::Score { level } => self.normalized(*level as f64) >= self.candidate.threshold,
            Label::Missing {} => false,
        }
    }
    fn predicted_positive(
        &self,
        answer: Option<&Answer>,
        substantive: bool,
        state: &Disposition,
    ) -> bool {
        match answer {
            Some(Answer::Score { score, .. }) => {
                substantive && self.normalized(*score) >= self.candidate.threshold
            }
            _ => *state == Disposition::Finding,
        }
    }
    fn normalized(&self, score: f64) -> f64 {
        match &self.definition.question {
            Question::Score { criteria, .. } => score / (criteria.len() - 1) as f64,
            _ => score,
        }
    }
    fn finish(mut self) -> Metrics {
        for (index, (level, score)) in self.ranks.iter().enumerate() {
            for (other_level, other_score) in &self.ranks[index + 1..] {
                if level != other_level {
                    self.metrics.ranking_pairs += 1;
                    self.metrics.ordered_pairs += u64::from(
                        score
                            .zip(*other_score)
                            .is_some_and(|(a, b)| if level < other_level { a < b } else { a > b }),
                    );
                }
            }
        }
        self.metrics
    }
}
fn label_matches(label: &Label, answer: Option<&Answer>) -> bool {
    match (label, answer) {
        (Label::Choice { option }, Some(Answer::Choice { choice, .. })) => option == choice,
        (Label::Noul { positive }, Some(Answer::Noul { noul })) => {
            *positive == (*noul >= NOUL_CUTOFF)
        }
        (Label::Score { level }, Some(Answer::Score { score, .. })) => {
            (*score - *level as f64).abs() <= LEVEL_TOLERANCE
        }
        _ => false,
    }
}
fn ratio(numerator: u64, denominator: u64, percent: u64) -> bool {
    denominator > 0
        && (numerator as u128) * PERCENT_DENOMINATOR >= (denominator as u128) * percent as u128
}
pub fn disagreement(repeats: &[BTreeMap<String, Prediction>]) -> Result<usize> {
    if repeats.len() != REQUIRED_REPEATS {
        return Err(Error::Invalid(
            "held-out evaluation requires three independent repeats".into(),
        ));
    }
    let ids: BTreeSet<_> = repeats.iter().flat_map(|repeat| repeat.keys()).collect();
    Ok(ids
        .into_iter()
        .filter(|id| {
            let first = repeats[0]
                .get(*id)
                .and_then(|prediction| prediction.answer.as_ref());
            repeats[1..].iter().any(|repeat| {
                repeat
                    .get(*id)
                    .and_then(|prediction| prediction.answer.as_ref())
                    != first
            })
        })
        .count())
}
const REQUIRED_REPEATS: usize = 3;
const COVERAGE_PERCENT: u64 = 80;
const QUALITY_PERCENT: u64 = 90;
const PERCENT_DENOMINATOR: u128 = 100;
const NOUL_CUTOFF: f64 = 0.5;
const LEVEL_TOLERANCE: f64 = 1.0;
