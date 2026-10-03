use super::{
    bank::{ASSERTION_BUILDER, Bank},
    batch::{Batch, Pair},
    builders::{BuildResult, EvidenceBuilder, SyntaxLink, bounded_fields},
    constants::*,
};
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EvidenceInput {
    Structured { fields: Value },
    Assertion { link: SyntaxLink },
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    pub id: String,
    pub candidate_id: String,
    pub families: Vec<String>,
    pub evidence: EvidenceInput,
}
pub struct Prepared {
    pub batches: Vec<Batch>,
    pub incomplete: BTreeMap<String, String>,
}
pub struct Handler<'a> {
    pub bank: &'a Bank,
    pub assertion_builder: &'a dyn EvidenceBuilder,
}
impl Handler<'_> {
    pub fn prepare(&self, source_digest: &str, inputs: &[Input]) -> Result<Prepared> {
        validate_unique_inputs(inputs)?;
        let mut prepared = Prepared {
            batches: Vec::new(),
            incomplete: BTreeMap::new(),
        };
        let mut total = 0;
        for input in inputs {
            self.include(source_digest, input, &mut total, &mut prepared)?;
        }
        Ok(prepared)
    }
    fn include(
        &self,
        source_digest: &str,
        input: &Input,
        total: &mut usize,
        prepared: &mut Prepared,
    ) -> Result<()> {
        let evidence = self.evidence(&input.evidence)?;
        let mut pairs = BTreeMap::new();
        for family in &input.families {
            let definition = self.bank.get(family)?;
            let id = format!("{family}.{}", input.id);
            *total += 1;
            let reason = if *total > MAX_PAIRS {
                Some(LIMIT_EXCEEDED)
            } else if definition.builder == ASSERTION_BUILDER
                && !matches!(input.evidence, EvidenceInput::Assertion { .. })
            {
                Some(EVIDENCE_MISSING)
            } else {
                match &evidence {
                    BuildResult::Incomplete { reason } => Some(reason.as_str()),
                    BuildResult::Complete { evidence }
                        if definition.evidence.iter().any(|key| {
                            evidence
                                .get(key)
                                .is_none_or(|value| !super::builders::present(value))
                        }) =>
                    {
                        Some(EVIDENCE_MISSING)
                    }
                    BuildResult::Complete { .. } => None,
                }
            };
            if let Some(reason) = reason {
                prepared.incomplete.insert(id, reason.into());
                continue;
            }
            pairs.insert(
                id,
                Pair {
                    input_id: input.id.clone(),
                    candidate_id: input.candidate_id.clone(),
                    definition: definition.clone(),
                },
            );
        }
        if let BuildResult::Complete { evidence } = evidence {
            self.batches(source_digest, evidence, pairs, prepared)?;
        }
        Ok(())
    }
    fn evidence(&self, input: &EvidenceInput) -> Result<BuildResult> {
        match input {
            EvidenceInput::Structured { fields } => bounded_fields(fields.clone(), &[]),
            EvidenceInput::Assertion { link } => self.assertion_builder.build(link),
        }
    }
    fn batches(
        &self,
        source_digest: &str,
        evidence: Value,
        pairs: BTreeMap<String, Pair>,
        prepared: &mut Prepared,
    ) -> Result<()> {
        let mut pairs = pairs.into_iter();
        loop {
            let chunk: BTreeMap<_, _> = pairs.by_ref().take(BATCH_PAIRS).collect();
            if chunk.is_empty() {
                break;
            }
            let ids: Vec<_> = chunk.keys().cloned().collect();
            match Batch::new(source_digest.into(), evidence.clone(), chunk) {
                Ok(batch) => prepared.batches.push(batch),
                Err(error) => {
                    for id in ids {
                        prepared.incomplete.insert(id, error.code().into());
                    }
                }
            }
        }
        Ok(())
    }
}
fn validate_unique_inputs(inputs: &[Input]) -> Result<()> {
    let mut ids = std::collections::BTreeSet::new();
    if inputs.iter().any(|input| {
        !ids.insert(&input.id)
            || input.families.is_empty()
            || input
                .families
                .iter()
                .collect::<std::collections::BTreeSet<_>>()
                .len()
                != input.families.len()
    }) {
        return Err(Error::Invalid("duplicate or empty judgment input".into()));
    }
    Ok(())
}
