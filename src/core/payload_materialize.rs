use super::{ManagedResource, NativeRegistry, Payload};
use crate::core::{
    citations::CitationRewriter,
    constants::*,
    render::{Profile, Renderer},
};
use crate::{Error, Result};
use orly_fs::path::RelativePath;
use std::collections::{BTreeMap, BTreeSet};

const RUST_RULES: &str = "packs/language/rust/rules.md";
const RUST_DISPATCH: &str = "dispatch/write_rust.md";
const MARKDOWN_EXTENSION: &str = ".md";

pub(super) struct Materialization<'a> {
    payload: &'a Payload,
    registry: NativeRegistry,
    selected: &'a [String],
    selected_set: BTreeSet<String>,
    known: BTreeSet<String>,
    mapping: BTreeMap<String, String>,
}
impl<'a> Materialization<'a> {
    pub(super) fn new(payload: &'a Payload, selected: &'a [String]) -> Result<Self> {
        let registry = payload.registry()?;
        if selected
            .iter()
            .any(|name| !registry.packs.contains_key(name))
        {
            return Err(Error::Invalid("unknown selected pack".into()));
        }
        Ok(Self {
            payload,
            selected,
            selected_set: selected.iter().cloned().collect(),
            known: registry.packs.keys().cloned().collect(),
            registry,
            mapping: payload.reference_map()?,
        })
    }
    pub(super) fn files(&self) -> Result<BTreeMap<RelativePath, Vec<u8>>> {
        let mut files = BTreeMap::new();
        for name in self.selected {
            for resource in &self.registry.packs[name].managed_files {
                let target =
                    RelativePath::new(format!("{ORLY_PREFIX}{}", resource.target.as_str()))?;
                let content = self.resource(resource, &target)?;
                if files.get(&target).is_some_and(|prior| *prior != content) {
                    return Err(Error::Invalid("conflicting managed destination".into()));
                }
                files.insert(target, content);
            }
        }
        let rendered = Renderer::new(self.payload).rules(self.selected)?;
        files.insert(
            RelativePath::new(ORLY_AGENTS_FILENAME)?,
            CitationRewriter::new(&self.mapping)
                .rewrite(&rendered, false)
                .0
                .into_bytes(),
        );
        Ok(files)
    }
    fn resource(&self, resource: &ManagedResource, target: &RelativePath) -> Result<Vec<u8>> {
        let source = if resource.target.as_str() == RUST_DISPATCH {
            RUST_RULES
        } else {
            resource.source.as_str()
        };
        let bytes = self.payload.file(source)?;
        if !source.ends_with(MARKDOWN_EXTENSION) {
            return Ok(bytes.to_vec());
        }
        let text = std::str::from_utf8(bytes)?;
        let rendered = Profile::new(text, &self.selected_set, &self.known).render()?;
        Ok(CitationRewriter::new(&self.mapping)
            .for_document(&resource.target, target)
            .rewrite(&rendered, false)
            .0
            .into_bytes())
    }
}
