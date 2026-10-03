use super::{constants::GENERATED_BANNER, payload::Payload};
use crate::{Error, Result};
use pulldown_cmark::{Event, Options, Parser};
use std::collections::BTreeSet;

#[path = "render_markers.rs"]
mod markers;
use markers::*;
const PRIVATE_NOTES: &str = "SOUL.md";
const SECTION_SEPARATOR: &str = "\n\n---\n\n";

pub struct Profile<'a> {
    content: &'a str,
    selected: &'a BTreeSet<String>,
    known: &'a BTreeSet<String>,
}
impl<'a> Profile<'a> {
    pub fn new(
        content: &'a str,
        selected: &'a BTreeSet<String>,
        known: &'a BTreeSet<String>,
    ) -> Self {
        Self {
            content,
            selected,
            known,
        }
    }
    pub fn render(&self) -> Result<String> {
        let content = self.content;
        let mut edits = Vec::new();
        let mut block = None;
        let mut included = true;
        for (event, range) in Parser::new_ext(content, Options::all()).into_offset_iter() {
            let (Event::Html(html) | Event::InlineHtml(html)) = event else {
                continue;
            };
            let marker = html.trim();
            if let Some(names) = marker
                .strip_prefix(MARKER_START)
                .and_then(|s| s.strip_suffix(COMMENT_END))
            {
                if block.is_some() {
                    return Err(Error::Invalid("nested pack marker".into()));
                }
                included = self.selected_names(names)?;
                block = Some(range.start);
                if included {
                    edits.push((range.clone(), String::new()));
                }
            } else if marker == MARKER_END {
                let start = block
                    .take()
                    .ok_or_else(|| Error::Invalid("unmatched pack marker end".into()))?;
                edits.push((
                    if included {
                        range.clone()
                    } else {
                        start..range.end
                    },
                    String::new(),
                ));
                included = true;
            } else if let Some(names) = marker
                .strip_prefix(MARKER_INLINE)
                .and_then(|s| s.strip_suffix(COMMENT_END))
            {
                if !included {
                    continue;
                }
                let keep = self.selected_names(names)?;
                let line_start = content[..range.start].rfind('\n').map_or(0, |n| n + 1);
                edits.push((
                    if keep { range } else { line_start..range.end },
                    String::new(),
                ));
            }
        }
        if block.is_some() {
            return Err(Error::Invalid("unclosed pack marker".into()));
        }
        edits.sort_by_key(|(range, _)| range.start);
        let mut rendered = content.to_owned();
        for (range, replacement) in edits.into_iter().rev() {
            rendered.replace_range(range, &replacement);
        }
        Ok(rendered.trim().to_owned())
    }

    fn selected_names(&self, names: &str) -> Result<bool> {
        let names: Vec<_> = names
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if names.is_empty() || names.iter().any(|n| !self.known.contains(*n)) {
            return Err(Error::Invalid("unknown pack marker".into()));
        }
        Ok(names.iter().any(|n| self.selected.contains(*n)))
    }
}

pub struct Renderer<'a> {
    payload: &'a Payload,
}
impl<'a> Renderer<'a> {
    pub fn new(payload: &'a Payload) -> Self {
        Self { payload }
    }
    pub fn rules(&self, selected: &[String]) -> Result<String> {
        let payload = self.payload;
        let registry = payload.registry()?;
        let selected_set = selected.iter().cloned().collect();
        let known = registry.packs.keys().cloned().collect();
        if selected.iter().any(|p| !registry.packs.contains_key(p)) {
            return Err(Error::Invalid("unknown rule pack".into()));
        }
        let mut sections = vec![GENERATED_BANNER.to_owned()];
        for source in registry.core_documents {
            if source.as_str() == PRIVATE_NOTES {
                continue;
            }
            let content = std::str::from_utf8(payload.file(source.as_str())?)?;
            sections.push(Profile::new(content, &selected_set, &known).render()?);
        }
        Ok(format!("{}\n", sections.join(SECTION_SEPARATOR)))
    }
}
