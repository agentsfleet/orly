use super::{
    bank::Bank,
    batch::{Batch, Pair},
    constants::*,
    wire::Question,
};
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "primitive", rename_all = "snake_case", deny_unknown_fields)]
pub enum Label {
    Choice { option: String },
    Noul { positive: bool },
    Score { level: usize },
    Missing {},
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Case {
    pub id: String,
    pub family: String,
    pub split: Split,
    pub evidence: Value,
    pub label: Label,
    pub scenario: Scenario,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Split {
    Tuning,
    HeldOut,
}
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scenario {
    Positive,
    Quiet,
    Missing,
    Contradictory,
    Lookalike,
    Injected,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Corpus {
    pub version: u32,
    pub label_author: String,
    pub owner_reviewed_commit: Option<String>,
    pub cases: Vec<Case>,
}
#[derive(Debug, Serialize)]
pub struct CorpusCheck {
    pub families: usize,
    pub cases: usize,
    pub complete: usize,
    pub owner_reviewed: bool,
}
impl Corpus {
    pub fn compiled() -> Result<Self> {
        Ok(serde_json::from_slice(include_bytes!(
            "../../fixtures/questions/corpus.json"
        ))?)
    }
    pub fn validate(&self, bank: &Bank) -> Result<CorpusCheck> {
        if self.version != VERSION || self.label_author.is_empty() {
            return Err(Error::Invalid("evaluation label history is missing".into()));
        }
        self.validate_cases(bank)?;
        self.validate_splits(bank)?;
        let owner_reviewed = self.owner_reviewed_commit.as_ref().is_some_and(|commit| {
            commit.len() == COMMIT_BYTES && commit.bytes().all(|byte| byte.is_ascii_hexdigit())
        });
        if self.owner_reviewed_commit.is_some() && !owner_reviewed {
            return Err(Error::Invalid("invalid owner reviewed revision".into()));
        }
        Ok(CorpusCheck {
            families: bank.definitions().len(),
            cases: self.cases.len(),
            complete: self
                .cases
                .iter()
                .filter(|case| !matches!(case.label, Label::Missing {}))
                .count(),
            owner_reviewed,
        })
    }
    fn validate_cases(&self, bank: &Bank) -> Result<()> {
        let mut identities = BTreeSet::new();
        let mut sources = BTreeSet::new();
        for case in &self.cases {
            if !identities.insert(&case.id)
                || !sources.insert(ContentDigest::identity(&(&case.family, &case.evidence))?)
            {
                return Err(Error::Invalid(
                    "duplicate evaluation identity or evidence".into(),
                ));
            }
            validate_label(case, bank)?;
        }
        Ok(())
    }
    fn validate_splits(&self, bank: &Bank) -> Result<()> {
        for family in bank.definitions().keys() {
            let cases: Vec<_> = self
                .cases
                .iter()
                .filter(|case| &case.family == family)
                .collect();
            for split in [Split::Tuning, Split::HeldOut] {
                let count = cases
                    .iter()
                    .filter(|case| case.split == split && !matches!(case.label, Label::Missing {}))
                    .count();
                if count < MIN_SPLIT_CASES {
                    return Err(Error::Invalid(
                        "evaluation split lacks complete labeled cases".into(),
                    ));
                }
            }
            let scenarios: BTreeSet<_> = cases.iter().map(|case| &case.scenario).collect();
            if scenarios.len() != REQUIRED_SCENARIOS {
                return Err(Error::Invalid(
                    "evaluation family lacks required boundary scenarios".into(),
                ));
            }
        }
        Ok(())
    }
    pub fn digest(&self) -> Result<String> {
        Ok(ContentDigest::identity(self)?)
    }
}
impl Case {
    pub fn batch(&self, bank: &Bank) -> Result<Batch> {
        Batch::new(
            ContentDigest::identity(&self.evidence)?,
            self.evidence.clone(),
            BTreeMap::from([(
                self.id.clone(),
                Pair {
                    input_id: self.id.clone(),
                    candidate_id: self.family.clone(),
                    definition: bank.get(&self.family)?.clone(),
                },
            )]),
        )
    }
}
fn validate_label(case: &Case, bank: &Bank) -> Result<()> {
    let definition = bank.get(&case.family)?;
    match (&case.label, &definition.question) {
        (Label::Missing {}, _)
            if matches!(case.scenario, Scenario::Missing) && case.batch(bank).is_err() =>
        {
            return Ok(());
        }
        (Label::Choice { option }, Question::Choice { criteria, .. })
            if criteria.contains_key(option) && option != INSUFFICIENT => {}
        (Label::Noul { .. }, Question::Noul { .. }) => {}
        (Label::Score { level }, Question::Score { criteria, .. }) if *level < criteria.len() => {}
        _ => {
            return Err(Error::Invalid(
                "evaluation label has wrong primitive or level".into(),
            ));
        }
    }
    case.batch(bank)?;
    Ok(())
}
#[path = "evaluation_metrics.rs"]
mod metrics;
pub use metrics::{Evaluator, Metrics, Prediction, disagreement};
const MIN_SPLIT_CASES: usize = 20;
const REQUIRED_SCENARIOS: usize = 6;
const COMMIT_BYTES: usize = 40;
