use crate::error::{Error, Result};
use orly::core::{document::ObjectDocument, git::Git};
use orly_fs::digest::ContentDigest;
use orly_fs::path::RelativePath;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::Path};

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProofBook {
    proofs: BTreeMap<String, ProofPair>,
}
impl ObjectDocument for ProofBook {}
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProofPair {
    positive: ProofReference,
    negative: ProofReference,
}
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum ProofReference {
    NativeTest { path: RelativePath, test: String },
    FrozenFile { path: RelativePath, digest: String },
}
impl ProofBook {
    pub fn read(root: &Path, relative: &str) -> Result<Self> {
        Ok(Self::read_json(
            &RelativePath::new(relative)?.resolve_inside(root)?,
        )?)
    }
    pub fn contains(&self, id: &str) -> bool {
        self.proofs.contains_key(id)
    }
    pub fn check(&self, root: &Path, revision: &str) -> Result<()> {
        for (id, pair) in &self.proofs {
            if id.is_empty() {
                return Err(Error::Invalid);
            }
            pair.positive.check(root, revision)?;
            pair.negative.check(root, revision)?;
        }
        Ok(())
    }
    pub fn native_count(&self) -> usize {
        self.proofs
            .values()
            .filter(|pair| {
                matches!(pair.positive, ProofReference::NativeTest { .. })
                    && matches!(pair.negative, ProofReference::NativeTest { .. })
            })
            .count()
    }
    pub fn frozen_count(&self) -> usize {
        self.proofs.len() - self.native_count()
    }
}
impl ProofReference {
    fn check(&self, root: &Path, revision: &str) -> Result<()> {
        match self {
            Self::FrozenFile { path, digest } => {
                let bytes = Git::output(root, &["show", &format!("{revision}:{}", path.as_str())])?;
                if &ContentDigest::digest(&bytes) != digest {
                    return Err(Error::Invalid);
                }
            }
            Self::NativeTest { path, test } => {
                let source = fs::read_to_string(path.resolve_inside(root)?)?;
                let syntax = syn::parse_file(&source)?;
                if !syntax.items.iter().any(|item| matches!(item, syn::Item::Fn(function)
                    if function.sig.ident == test.as_str() && function.attrs.iter().any(|attr| attr.path().is_ident("test")))) {
                    return Err(Error::Invalid);
                }
            }
        }
        Ok(())
    }
}
