//! Typed questions, probability answers, and replayable decision envelopes.
pub mod error;
pub use error::{Error, Result};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "primitive", rename_all = "snake_case", deny_unknown_fields)]
pub enum Answer {
    Choice {
        probabilities: BTreeMap<String, f64>,
    },
    Noul {
        probabilities: BTreeMap<String, f64>,
    },
    Score {
        distributions: BTreeMap<String, BTreeMap<String, f64>>,
    },
}

impl Answer {
    pub fn validate(&self) -> Result<()> {
        match self {
            Self::Choice { probabilities } => validate_distribution(probabilities, true),
            Self::Noul { probabilities } => validate_distribution(probabilities, false),
            Self::Score { distributions } => {
                if distributions.is_empty() {
                    return Err(Error::Invalid("empty score answer".into()));
                }
                for dist in distributions.values() {
                    validate_distribution(dist, true)?;
                }
                Ok(())
            }
        }
    }
    pub fn selected(&self, threshold: f64) -> Option<&str> {
        match self {
            Self::Choice { probabilities } => probabilities
                .iter()
                .filter(|(_, p)| **p >= threshold)
                .max_by(|a, b| a.1.total_cmp(b.1).then_with(|| b.0.cmp(a.0)))
                .map(|(key, _)| key.as_str()),
            _ => None,
        }
    }
}

fn validate_distribution(values: &BTreeMap<String, f64>, normalized: bool) -> Result<()> {
    if values.is_empty()
        || values
            .values()
            .any(|p| !p.is_finite() || !(0.0..=1.0).contains(p))
    {
        return Err(Error::Invalid("invalid probability distribution".into()));
    }
    if normalized && (values.values().sum::<f64>() - 1.0).abs() > PROBABILITY_TOLERANCE {
        return Err(Error::Invalid("probabilities do not sum to one".into()));
    }
    Ok(())
}
const PROBABILITY_TOLERANCE: f64 = 0.000001;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Primitive {
    // Empty struct variants let Serde reject fields beyond the kind tag.
    Choice {},
    Noul {},
    Score {
        levels: std::collections::BTreeSet<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Question {
    pub primitive: Primitive,
    pub id: String,
    pub version: String,
    pub builder: String,
    pub builder_version: String,
    pub model_version: String,
    pub candidates: Vec<String>,
    pub rule_section: String,
}

impl Question {
    pub fn validate(&self) -> Result<()> {
        validate_name(&self.id)?;
        validate_name(&self.builder)?;
        semver::Version::parse(&self.version)?;
        semver::Version::parse(&self.builder_version)?;
        let unique: std::collections::BTreeSet<_> = self.candidates.iter().collect();
        if self.candidates.is_empty()
            || unique.len() != self.candidates.len()
            || self.candidates.iter().any(String::is_empty)
            || self.model_version.is_empty()
            || self.rule_section.is_empty()
            || serde_json::to_vec(self)?.len() > MAX_QUESTION_BYTES
        {
            return Err(Error::Invalid(
                "question has no candidates or exceeds its budget".into(),
            ));
        }
        if matches!(&self.primitive,Primitive::Score {levels} if levels.is_empty() || levels.iter().any(String::is_empty))
        {
            return Err(Error::Invalid("score levels must be declared".into()));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DecisionEnvelope {
    pub version: u32,
    pub question_id: String,
    pub question_version: String,
    pub builder_version: String,
    pub model_version: String,
    pub input_digest: String,
    pub assessment_id: String,
    pub answer: Answer,
}

impl DecisionEnvelope {
    pub fn validate(&self, question: &Question, input_digest: &str) -> Result<()> {
        question.validate()?;
        if self.version != WIRE_VERSION
            || self.question_id != question.id
            || self.question_version != question.version
            || self.builder_version != question.builder_version
            || self.model_version != question.model_version
            || self.input_digest != input_digest
            || self.assessment_id.is_empty()
        {
            return Err(Error::Stale);
        }
        self.answer.validate()?;
        match (&question.primitive, &self.answer) {
            (Primitive::Choice {}, Answer::Choice { .. })
            | (Primitive::Noul {}, Answer::Noul { .. }) => {}
            (Primitive::Score { levels }, Answer::Score { distributions }) => {
                if distributions.values().any(|distribution| {
                    distribution
                        .keys()
                        .collect::<std::collections::BTreeSet<_>>()
                        != levels.iter().collect()
                }) {
                    return Err(Error::Invalid("score answer uses undeclared levels".into()));
                }
            }
            _ => return Err(Error::Invalid("question primitive mismatch".into())),
        }
        let keys: Vec<&String> = match &self.answer {
            Answer::Choice { probabilities } | Answer::Noul { probabilities } => {
                probabilities.keys().collect()
            }
            Answer::Score { distributions } => distributions.keys().collect(),
        };
        if keys.len() != question.candidates.len()
            || keys.iter().any(|k| !question.candidates.contains(k))
        {
            return Err(Error::Invalid(
                "answer uses unknown or missing candidates".into(),
            ));
        }
        Ok(())
    }
}

pub const WIRE_VERSION: u32 = 1;
pub const MAX_QUESTION_BYTES: usize = 16 * 1024;

pub fn validate_name(name: &str) -> Result<()> {
    if !name.contains('.')
        || name.split('.').any(|part| part.is_empty())
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || IDENTITY_PUNCTUATION.contains(&byte))
    {
        return Err(Error::Invalid("pack identity must be namespaced".into()));
    }
    Ok(())
}
const IDENTITY_PUNCTUATION: &[u8] = b"._-";
