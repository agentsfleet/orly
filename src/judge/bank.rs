use super::{constants::*, wire::Question};
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Consumer {
    Recipe { choices: BTreeMap<String, String> },
    Review { route: String },
    Rank {},
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Definition {
    pub id: String,
    pub version: String,
    pub builder: String,
    pub builder_version: String,
    pub evidence: BTreeSet<String>,
    pub source_clause: String,
    pub finding_polarity: bool,
    pub consumer: Consumer,
    pub question: Question,
}
impl Definition {
    pub fn inference_digest(&self) -> Result<String> {
        Ok(orly_fs::digest::ContentDigest::identity(&(
            VERSION,
            &self.id,
            &self.version,
            &self.builder,
            &self.builder_version,
            &self.evidence,
            &self.question,
        ))?)
    }
    pub fn validate(&self) -> Result<()> {
        orly_decision::validate_name(&self.id)?;
        orly_decision::validate_name(&self.builder)?;
        semver::Version::parse(&self.version)?;
        semver::Version::parse(&self.builder_version)?;
        if !matches!(
            self.builder.as_str(),
            STRUCTURED_BUILDER | ASSERTION_BUILDER
        ) {
            return Err(Error::Invalid("unknown evidence builder".into()));
        }
        self.question.validate()?;
        if self.evidence.is_empty()
            || self.evidence.iter().any(String::is_empty)
            || self.source_clause.is_empty()
        {
            return Err(Error::Invalid("question mapping is incomplete".into()));
        }
        match (&self.consumer, &self.question) {
            (Consumer::Recipe { choices }, Question::Choice { criteria, .. })
                if !choices.is_empty()
                    && choices.iter().all(|(option, id)| {
                        criteria.contains_key(option)
                            && !id.is_empty()
                            && option != QUIET
                            && option != INSUFFICIENT
                    }) =>
            {
                Ok(())
            }
            (Consumer::Review { route }, Question::Choice { .. } | Question::Noul { .. })
                if !route.is_empty() =>
            {
                Ok(())
            }
            (Consumer::Rank {}, Question::Score { .. }) => Ok(()),
            _ => Err(Error::Invalid(
                "question consumer does not match its primitive".into(),
            )),
        }
    }
}
pub(super) const STRUCTURED_BUILDER: &str = "judge.structured";
pub(super) const ASSERTION_BUILDER: &str = "judge.assertion";
pub struct Bank {
    definitions: BTreeMap<String, Definition>,
}
impl Bank {
    pub fn compiled() -> Result<Self> {
        Self::parse(include_bytes!("../../questions/bank.json"))
    }
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        let definitions: Vec<Definition> = serde_json::from_slice(bytes)?;
        let mut bank = BTreeMap::new();
        for definition in definitions {
            definition.validate()?;
            if bank.insert(definition.id.clone(), definition).is_some() {
                return Err(Error::Invalid("duplicate question family".into()));
            }
        }
        if bank.is_empty() {
            return Err(Error::Invalid("empty question bank".into()));
        }
        Ok(Self { definitions: bank })
    }
    pub fn definitions(&self) -> &BTreeMap<String, Definition> {
        &self.definitions
    }
    pub fn get(&self, id: &str) -> Result<&Definition> {
        self.definitions
            .get(id)
            .ok_or_else(|| Error::Invalid("unknown question family".into()))
    }
}
