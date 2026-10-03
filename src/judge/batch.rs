use super::engine::EngineIdentity;
use super::{bank::Definition, constants::*, wire::Question};
use crate::Result;
use orly_fs::digest::ContentDigest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pair {
    pub input_id: String,
    pub candidate_id: String,
    pub definition: Definition,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    model: String,
    state: Value,
    questions: BTreeMap<String, Question>,
}
impl Request {
    fn new(model: &str, state: Value, pairs: &BTreeMap<String, Pair>) -> Result<Self> {
        if pairs.is_empty()
            || pairs.len() > BATCH_PAIRS
            || serde_json::to_vec(&state)?.len() > MAX_STATE_BYTES
        {
            return Err(super::error::rejected(LIMIT_EXCEEDED));
        }
        let mut questions = BTreeMap::new();
        for (id, pair) in pairs {
            orly_decision::validate_name(id)?;
            pair.definition.validate()?;
            if pair.input_id.is_empty()
                || pair.candidate_id.is_empty()
                || pair.definition.evidence.iter().any(|key| {
                    state
                        .get(key)
                        .is_none_or(|value| !super::builders::present(value))
                })
            {
                return Err(super::error::rejected(EVIDENCE_MISSING));
            }
            questions.insert(id.clone(), pair.definition.question.clone());
        }
        Ok(Self {
            model: model.into(),
            state,
            questions,
        })
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Identity {
    version: u32,
    engine: EngineIdentity,
    source_digest: String,
    pairs: BTreeMap<String, Pair>,
    request: Request,
}
impl Identity {
    fn digest(&self) -> Result<String> {
        // Consumer routing and finding polarity belong to policy, not inference identity.
        let inference_pairs: BTreeMap<_, _> = self
            .pairs
            .iter()
            .map(|(id, pair)| {
                Ok((
                    id,
                    (
                        &pair.input_id,
                        &pair.candidate_id,
                        pair.definition.inference_digest()?,
                    ),
                ))
            })
            .collect::<Result<_>>()?;
        Ok(ContentDigest::identity(&(
            self.version,
            &self.engine,
            &self.source_digest,
            &self.request,
            inference_pairs,
        ))?)
    }
}
/// A whole same-state batch. Constructors validate before private bytes become usable.
#[derive(Clone)]
pub struct Batch {
    identity: Identity,
    bytes: Vec<u8>,
    digest: String,
}
impl Batch {
    pub fn new(source_digest: String, state: Value, pairs: BTreeMap<String, Pair>) -> Result<Self> {
        Self::for_engine(EngineIdentity::jev(), source_digest, state, pairs)
    }
    pub fn for_engine(
        engine: EngineIdentity,
        source_digest: String,
        state: Value,
        pairs: BTreeMap<String, Pair>,
    ) -> Result<Self> {
        engine.validate()?;
        if source_digest.is_empty() {
            return Err(super::error::rejected(LIMIT_EXCEEDED));
        }
        let request = Request::new(&engine.model, state, &pairs)?;
        // Serde's default ordered object map plus BTreeMap give versioned stable key order.
        let bytes = serde_json::to_vec(&request)?;
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err(super::error::rejected(LIMIT_EXCEEDED));
        }
        let identity = Identity {
            version: VERSION,
            engine,
            source_digest,
            pairs,
            request,
        };
        let digest = identity.digest()?;
        Ok(Self {
            identity,
            bytes,
            digest,
        })
    }
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
    pub fn digest(&self) -> &str {
        &self.digest
    }
    pub fn source_digest(&self) -> &str {
        &self.identity.source_digest
    }
    pub fn pairs(&self) -> &BTreeMap<String, Pair> {
        &self.identity.pairs
    }
    pub fn questions(&self) -> &BTreeMap<String, Question> {
        &self.identity.request.questions
    }
    pub fn state(&self) -> &Value {
        &self.identity.request.state
    }
    pub fn engine(&self) -> &EngineIdentity {
        &self.identity.engine
    }
}
