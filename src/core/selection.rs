use super::{constants::WIRE_VERSION, execution::EvaluationContext};
use crate::{Result, checks::EvidenceBuilder};
use globset::{Glob, GlobMatcher};
use serde::Serialize;

#[derive(Serialize)]
pub struct SelectedFile<'a> {
    pub path: &'a orly_fs::path::RelativePath,
    pub digest: &'a str,
    pub mode: super::git::FileMode,
}

#[derive(Serialize)]
pub struct SelectionEvidence<'a> {
    pub version: u32,
    pub snapshot_digest: String,
    pub builder: &'a str,
    pub paths: Vec<SelectedFile<'a>>,
}

pub struct FileSelector {
    identity: String,
    matcher: GlobMatcher,
}
impl FileSelector {
    pub fn new(identity: &str, pattern: &str) -> Result<Self> {
        orly_decision::validate_name(identity)?;
        Ok(Self {
            identity: identity.into(),
            matcher: Glob::new(pattern)?.compile_matcher(),
        })
    }
}
impl EvidenceBuilder for FileSelector {
    fn identity(&self) -> &str {
        &self.identity
    }
    fn build(&self, context: &EvaluationContext) -> Result<serde_json::Value> {
        context.validate_current()?;
        let paths: Vec<_> = context
            .snapshot
            .files()
            .iter()
            .filter(|(path, _)| self.matcher.is_match(path.as_str()))
            .map(|(path, file)| SelectedFile {
                path,
                digest: file.digest(),
                mode: file.mode,
            })
            .collect();
        Ok(serde_json::to_value(SelectionEvidence {
            version: WIRE_VERSION,
            snapshot_digest: context.snapshot.digest()?,
            builder: &self.identity,
            paths,
        })?)
    }
}
