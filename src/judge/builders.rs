use super::{constants::*, syntax};
use crate::{Result, core::snapshot::Snapshot};
use orly_fs::path::RelativePath;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Language {
    Rust,
    TypeScript,
    Unsupported,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SyntaxLink {
    pub language: Language,
    pub function_path: String,
    pub function_name: String,
    pub test_path: String,
    pub test_name: String,
    pub assertion_start: usize,
    pub assertion_end: usize,
    pub dimension: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
pub enum BuildResult {
    Complete { evidence: Value },
    Incomplete { reason: String },
}
pub trait EvidenceBuilder {
    fn build(&self, link: &SyntaxLink) -> Result<BuildResult>;
}
/// Sources are captured once; building evidence never executes or reopens project files.
pub struct SyntaxBuilder<'a> {
    sources: Sources<'a>,
    snapshot_digest: String,
}
impl<'a> SyntaxBuilder<'a> {
    pub fn from_snapshot(snapshot: &'a Snapshot) -> Result<Self> {
        Ok(Self {
            sources: Sources::Snapshot(snapshot),
            snapshot_digest: snapshot.digest()?,
        })
    }
    pub fn new(snapshot_digest: String, sources: BTreeMap<String, Vec<u8>>) -> Self {
        Self {
            sources: Sources::Captured(sources),
            snapshot_digest,
        }
    }
}
impl EvidenceBuilder for SyntaxBuilder<'_> {
    fn build(&self, link: &SyntaxLink) -> Result<BuildResult> {
        let (Some(function), Some(test)) = (
            self.sources.get(&link.function_path),
            self.sources.get(&link.test_path),
        ) else {
            return Ok(incomplete(EVIDENCE_MISSING));
        };
        if matches!(link.language, Language::Unsupported) {
            return Ok(incomplete(UNSUPPORTED_SOURCE));
        }
        if link.dimension.is_empty() || self.snapshot_digest.is_empty() {
            return Ok(incomplete(EVIDENCE_MISSING));
        }
        let Some((function_text, test_text, assertion)) = syntax::extract(function, test, link)?
        else {
            return Ok(incomplete(EVIDENCE_MISSING));
        };
        let evidence = json!({
            "function": function_text, "test_declaration": test_text,
            "assertion": assertion, "dimension": link.dimension,
            "source": {"snapshot_digest": self.snapshot_digest,
                "function_path": link.function_path, "test_path": link.test_path}
        });
        if serde_json::to_vec(&evidence)?.len() > MAX_STATE_BYTES {
            return Ok(incomplete(LIMIT_EXCEEDED));
        }
        Ok(BuildResult::Complete { evidence })
    }
}
enum Sources<'a> {
    Snapshot(&'a Snapshot),
    Captured(BTreeMap<String, Vec<u8>>),
}
impl Sources<'_> {
    fn get(&self, path: &str) -> Option<&[u8]> {
        match self {
            Self::Snapshot(snapshot) => RelativePath::new(path)
                .ok()
                .and_then(|path| snapshot.files().get(&path))
                .map(|file| file.bytes.as_slice()),
            Self::Captured(sources) => sources.get(path).map(Vec::as_slice),
        }
    }
}
pub(super) fn present(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.is_empty(),
        Value::Array(value) => !value.is_empty(),
        Value::Object(value) => !value.is_empty(),
        _ => true,
    }
}
pub fn bounded_fields(evidence: Value, required: &[&str]) -> Result<BuildResult> {
    if !evidence.is_object() {
        return Err(super::error::rejected(EVIDENCE_MISSING));
    }
    if required
        .iter()
        .any(|field| evidence.get(*field).is_none_or(|value| !present(value)))
    {
        return Ok(incomplete(EVIDENCE_MISSING));
    }
    if serde_json::to_vec(&evidence)?.len() > MAX_STATE_BYTES {
        return Ok(incomplete(LIMIT_EXCEEDED));
    }
    Ok(BuildResult::Complete { evidence })
}
fn incomplete(reason: &str) -> BuildResult {
    BuildResult::Incomplete {
        reason: reason.into(),
    }
}
