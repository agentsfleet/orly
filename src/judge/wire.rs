use super::constants::*;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Question {
    Choice {
        instructions: Value,
        #[serde(with = "serde_with::rust::maps_duplicate_key_is_error")]
        criteria: BTreeMap<String, Value>,
    },
    Noul {
        instructions: Value,
        #[serde(with = "serde_with::rust::maps_duplicate_key_is_error")]
        criteria: BTreeMap<String, Value>,
    },
    Score {
        instructions: Value,
        criteria: Vec<String>,
    },
}
impl Question {
    pub fn validate(&self) -> Result<()> {
        let instructions = match self {
            Self::Choice {
                instructions,
                criteria,
            } => {
                if criteria.len() < 3
                    || !criteria.contains_key(QUIET)
                    || !criteria.contains_key(INSUFFICIENT)
                {
                    return Err(Error::Invalid(
                        "choice must include quiet and insufficient evidence".into(),
                    ));
                }
                instructions
            }
            Self::Noul {
                instructions,
                criteria,
            } => {
                if criteria.keys().map(String::as_str).collect::<Vec<_>>() != [FALSE, TRUE] {
                    return Err(Error::Invalid(
                        "noul criteria must describe yes and no".into(),
                    ));
                }
                instructions
            }
            Self::Score {
                instructions,
                criteria,
            } => {
                if criteria.len() < 2 || criteria.iter().any(String::is_empty) {
                    return Err(Error::Invalid(
                        "score requires ordered descriptive levels".into(),
                    ));
                }
                instructions
            }
        };
        if instructions.is_null() || instructions.as_str().is_some_and(str::is_empty) {
            return Err(Error::Invalid("question has no instructions".into()));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Answer {
    Choice {
        choice: String,
        #[serde(with = "serde_with::rust::maps_duplicate_key_is_error")]
        probabilities: BTreeMap<String, f64>,
        confidence: f64,
    },
    Noul {
        noul: f64,
    },
    Score {
        score: f64,
        #[serde(with = "serde_with::rust::maps_duplicate_key_is_error")]
        legend: BTreeMap<String, String>,
        #[serde(with = "serde_with::rust::maps_duplicate_key_is_error")]
        probabilities: BTreeMap<String, f64>,
        confidence: f64,
    },
}
impl Answer {
    pub fn validate(&self, question: &Question) -> Result<()> {
        match (self, question) {
            (
                Self::Choice {
                    choice,
                    probabilities,
                    confidence,
                },
                Question::Choice { criteria, .. },
            ) => {
                distribution(probabilities)?;
                probability(*confidence)?;
                if probabilities.keys().ne(criteria.keys())
                    || !probabilities.contains_key(choice)
                    || probabilities
                        .values()
                        .any(|p| *p > probabilities[choice] + TOLERANCE)
                {
                    return Err(super::error::rejected(INVALID_RESPONSE));
                }
            }
            (Self::Noul { noul }, Question::Noul { .. }) => probability(*noul)?,
            (
                Self::Score {
                    score,
                    legend,
                    probabilities,
                    confidence,
                },
                Question::Score { criteria, .. },
            ) => {
                distribution(probabilities)?;
                probability(*confidence)?;
                let expected: BTreeMap<_, _> = criteria
                    .iter()
                    .enumerate()
                    .map(|(i, text)| (i.to_string(), text.clone()))
                    .collect();
                let weighted = criteria
                    .iter()
                    .enumerate()
                    .map(|(i, _)| {
                        i as f64
                            * probabilities
                                .get(&i.to_string())
                                .copied()
                                .unwrap_or_default()
                    })
                    .sum::<f64>();
                if *legend != expected
                    || probabilities.keys().ne(expected.keys())
                    || !score.is_finite()
                    || (*score - weighted).abs() > TOLERANCE
                {
                    return Err(super::error::rejected(INVALID_RESPONSE));
                }
            }
            _ => return Err(super::error::rejected(INVALID_RESPONSE)),
        }
        Ok(())
    }
}
fn distribution(values: &BTreeMap<String, f64>) -> Result<()> {
    for value in values.values() {
        probability(*value)?;
    }
    if values.is_empty() || (values.values().sum::<f64>() - 1.0).abs() > TOLERANCE {
        return Err(super::error::rejected(INVALID_RESPONSE));
    }
    Ok(())
}
fn probability(value: f64) -> Result<()> {
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Err(super::error::rejected(INVALID_RESPONSE));
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub model: String,
    #[serde(with = "serde_with::rust::maps_duplicate_key_is_error")]
    pub answers: BTreeMap<String, Answer>,
    pub usage: Usage,
}
impl Response {
    pub fn parse(
        bytes: &[u8],
        model: &str,
        questions: &BTreeMap<String, Question>,
    ) -> Result<Self> {
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(super::error::rejected(LIMIT_EXCEEDED));
        }
        let response: Self = serde_json::from_slice(bytes)?;
        response.validate(model, questions)?;
        Ok(response)
    }
    pub fn validate(&self, model: &str, questions: &BTreeMap<String, Question>) -> Result<()> {
        if self.model != model || self.answers.keys().ne(questions.keys()) {
            return Err(super::error::rejected(INVALID_RESPONSE));
        }
        for (id, answer) in &self.answers {
            answer.validate(&questions[id])?;
        }
        Ok(())
    }
}
const TRUE: &str = "true";
const FALSE: &str = "false";
