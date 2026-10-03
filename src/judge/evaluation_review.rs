use super::{
    bank::Bank,
    evaluation::{Corpus, Label, Split},
    evaluation_run::AgentReport,
};
use crate::{Error, Result};
use std::{collections::BTreeSet, path::Path};

/// Host-supplied approval must name an actual revision containing these exact compiled inputs.
pub struct ReviewedCorpus {
    revision: git2::Oid,
}
impl ReviewedCorpus {
    pub fn open(repository: &Path, revision: &str) -> Result<Self> {
        let revision = git2::Oid::from_str(revision)?;
        let repository = git2::Repository::open(repository)?;
        let tree = repository.find_commit(revision)?.tree()?;
        for (path, expected) in [
            (
                BANK_PATH,
                include_bytes!("../../questions/bank.json").as_slice(),
            ),
            (
                CORPUS_PATH,
                include_bytes!("../../fixtures/questions/corpus.json").as_slice(),
            ),
        ] {
            let entry = tree.get_path(Path::new(path))?;
            let blob = repository.find_blob(entry.id())?;
            if blob.content() != expected {
                return Err(Error::Stale);
            }
        }
        Ok(Self { revision })
    }
    pub fn revision(&self) -> String {
        self.revision.to_string()
    }
}
impl AgentReport {
    pub fn read(path: &Path) -> Result<Self> {
        Ok(serde_json::from_slice(
            &orly_fs::file_input::RegularInput::open(path, super::constants::CACHE_BYTES as usize)?
                .read()?,
        )?)
    }
    pub fn validate(&self, bank: &Bank, corpus: &Corpus) -> Result<()> {
        let expected: BTreeSet<_> = corpus
            .cases
            .iter()
            .filter(|case| case.split == Split::HeldOut && !matches!(case.label, Label::Missing {}))
            .map(|case| case.id.as_str())
            .collect();
        let actual: BTreeSet<_> = self.predictions.keys().map(String::as_str).collect();
        if self.corpus_digest != corpus.digest()?
            || self.author.trim().is_empty()
            || actual != expected
        {
            return Err(Error::Invalid(
                "independent coding-agent results must cover the identical frozen held-out corpus"
                    .into(),
            ));
        }
        for case in corpus
            .cases
            .iter()
            .filter(|case| expected.contains(case.id.as_str()))
        {
            if let Some(answer) = &self.predictions[&case.id].answer {
                answer.validate(&bank.get(&case.family)?.question)?;
            }
        }
        Ok(())
    }
}
const BANK_PATH: &str = "questions/bank.json";
const CORPUS_PATH: &str = "fixtures/questions/corpus.json";
