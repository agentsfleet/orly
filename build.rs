use pulldown_cmark::{Event, Options, Parser};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    ops::Range,
    path::PathBuf,
};
#[path = "src/core/render_markers.rs"]
mod markers;
use markers::*;

type Error = Box<dyn std::error::Error>;
type Result<T, E = Error> = std::result::Result<T, E>;
const REGISTRY_PATH: &str = "registry.json";
const CORE_DOCUMENTS: &str = "core_documents";
const PACKS: &str = "packs";
const MISSING_PACKS: &str = "missing packs";
const MANAGED_FILES: &str = "managed_files";
const SOURCE: &str = "source";
const PRIVATE_NOTES: [&str; 2] = ["SOUL.md", "SOUL_LOG.md"];
const PRIVATE_PACK_PREFIX: &str = "persona.";
const OUTPUT_KEY: &str = "OUT_DIR";
const OUTPUT_NAME: &str = "payload.json";
const SCHEMAS: &str = "schemas";
const RUST_PACK: &str = "packs/language/rust/rules.md";

struct EmbeddedPayload {
    registry: serde_json::Value,
    documents: BTreeSet<String>,
    private_packs: BTreeSet<String>,
}
impl EmbeddedPayload {
    fn new() -> Result<Self> {
        let mut registry: serde_json::Value = serde_json::from_slice(&fs::read(REGISTRY_PATH)?)?;
        let documents = registry[CORE_DOCUMENTS]
            .as_array_mut()
            .ok_or("missing core documents")?;
        documents.retain(|document| {
            !document
                .as_str()
                .is_some_and(|name| PRIVATE_NOTES.contains(&name))
        });
        let documents = documents
            .iter()
            .map(|document| {
                document
                    .as_str()
                    .map(str::to_owned)
                    .ok_or("invalid core document")
            })
            .collect::<std::result::Result<_, _>>()?;
        let packs = registry[PACKS].as_object_mut().ok_or(MISSING_PACKS)?;
        let private_packs = packs
            .keys()
            .filter(|name| name.starts_with(PRIVATE_PACK_PREFIX))
            .cloned()
            .collect();
        packs.retain(|name, _| !name.starts_with(PRIVATE_PACK_PREFIX));
        Ok(Self {
            registry,
            documents,
            private_packs,
        })
    }

    fn compile(&self) -> Result<BTreeMap<String, Vec<u8>>> {
        let mut names = self.documents.clone();
        names.insert(RUST_PACK.into());
        for pack in self.registry[PACKS]
            .as_object()
            .ok_or(MISSING_PACKS)?
            .values()
        {
            for file in pack[MANAGED_FILES]
                .as_array()
                .ok_or("missing managed files")?
            {
                let source = file[SOURCE].as_str().ok_or("invalid managed source")?;
                if PRIVATE_NOTES.contains(&source) {
                    return Err("private notes cannot be a public resource".into());
                }
                names.insert(source.into());
            }
        }
        for entry in fs::read_dir(SCHEMAS)? {
            let path = entry?.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "json")
            {
                let name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or("schema filename must be Unicode")?;
                names.insert(format!("{SCHEMAS}/{name}"));
            }
        }
        let mut files = BTreeMap::new();
        for name in names {
            println!("cargo:rerun-if-changed={name}");
            let mut bytes = fs::read(&name)?;
            if name.ends_with(".md") {
                bytes = self.public_text(std::str::from_utf8(&bytes)?)?.into_bytes();
            }
            files.insert(name, bytes);
        }
        println!("cargo:rerun-if-changed={REGISTRY_PATH}");
        files.insert(REGISTRY_PATH.into(), serde_json::to_vec(&self.registry)?);
        Ok(files)
    }

    fn public_text(&self, content: &str) -> Result<String> {
        let mut edits: Vec<Range<usize>> = Vec::new();
        let mut private_block = None;
        for (event, range) in Parser::new_ext(content, Options::all()).into_offset_iter() {
            let (Event::Html(html) | Event::InlineHtml(html)) = event else {
                continue;
            };
            let marker = html.trim();
            if let Some(names) = marker
                .strip_prefix(MARKER_START)
                .and_then(|names| names.strip_suffix(COMMENT_END))
            {
                let names: BTreeSet<_> = names.split(',').map(str::trim).collect();
                if names.iter().any(|name| self.private_packs.contains(*name)) {
                    if private_block.is_some()
                        || names.iter().any(|name| !self.private_packs.contains(*name))
                    {
                        return Err("private pack markers must form separate blocks".into());
                    }
                    private_block = Some(range.start);
                } else if private_block.is_some() {
                    return Err("nested private pack marker".into());
                }
            } else if marker == MARKER_END {
                if let Some(start) = private_block.take() {
                    edits.push(start..range.end);
                }
            } else if let Some(names) = marker
                .strip_prefix(MARKER_INLINE)
                .and_then(|names| names.strip_suffix(COMMENT_END))
            {
                let names: Vec<_> = names.split(',').map(str::trim).collect();
                if private_block.is_none()
                    && names.iter().any(|name| self.private_packs.contains(*name))
                {
                    if names.iter().any(|name| !self.private_packs.contains(*name)) {
                        return Err("private inline markers must be separate".into());
                    }
                    let start = content[..range.start]
                        .rfind('\n')
                        .map_or(0, |offset| offset + 1);
                    edits.push(start..range.end);
                }
            }
        }
        if private_block.is_some() {
            return Err("unclosed private pack marker".into());
        }
        let mut public = content.to_owned();
        for range in edits.into_iter().rev() {
            public.replace_range(range, "");
        }
        Ok(public)
    }

    fn write(&self) -> Result<()> {
        let files = self.compile()?;
        let bytes = serde_json::to_vec(&files)?;
        let payload = serde_json::json!({"digest": format!("sha256:{}", hex::encode(Sha256::digest(&bytes))), "files": files});
        let output =
            PathBuf::from(std::env::var_os(OUTPUT_KEY).ok_or("missing build output directory")?);
        fs::write(output.join(OUTPUT_NAME), serde_json::to_vec(&payload)?)?;
        Ok(())
    }
}
fn main() -> Result<()> {
    EmbeddedPayload::new()?.write()
}
