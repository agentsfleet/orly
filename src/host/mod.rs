use crate::core::constants::{AGENTS_FILENAME, OLD_AGENTS_FILENAME, ORLY_AGENTS_FILENAME};
use crate::{Error, Result};
use pulldown_cmark::{Event, Parser};

pub const POINTER_OPEN: &str = "<!-- orly:begin -->";
pub const POINTER_CLOSE: &str = "<!-- orly:end -->";
pub const CLAUDE_FILENAME: &str = "CLAUDE.md";
pub const OPENCODE_FILENAME: &str = "opencode.json";
const IMPORT_PREFIX: &str = "@";
const INSTRUCTIONS_KEY: &str = "instructions";
const PARAGRAPH_SEPARATOR: &str = "\n\n";

pub struct HostLoader;
impl HostLoader {
    pub fn markdown(current: &str, import: &str) -> Result<String> {
        let block = format!("{POINTER_OPEN}\n{IMPORT_PREFIX}{import}\n{POINTER_CLOSE}");
        let markers: Vec<_> = Parser::new(current)
            .into_offset_iter()
            .filter_map(|(event, range)| match event {
                Event::Html(text) | Event::InlineHtml(text)
                    if [POINTER_OPEN, POINTER_CLOSE].contains(&text.trim()) =>
                {
                    Some((
                        text.trim() == POINTER_OPEN,
                        range.start..range.start + text.trim_end().len(),
                    ))
                }
                _ => None,
            })
            .collect();
        match markers.as_slice() {
            [] => {
                let separator = if current.is_empty() || current.ends_with(PARAGRAPH_SEPARATOR) {
                    ""
                } else if current.ends_with('\n') {
                    "\n"
                } else {
                    PARAGRAPH_SEPARATOR
                };
                Ok(format!("{current}{separator}{block}\n"))
            }
            [(true, start), (false, end)] => Ok(format!(
                "{}{block}{}",
                &current[..start.start],
                &current[end.end..]
            )),
            _ => Err(Error::Invalid("malformed host ownership block".into())),
        }
    }
    pub fn opencode(current: Option<&[u8]>) -> Result<Vec<u8>> {
        let mut object: serde_json::Map<String, serde_json::Value> = current
            .map(serde_json::from_slice)
            .transpose()?
            .unwrap_or_default();
        let instructions = object
            .entry(INSTRUCTIONS_KEY)
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        let array = instructions
            .as_array_mut()
            .ok_or_else(|| Error::Invalid("host instructions must be an array".into()))?;
        array.retain(|v| v.as_str() != Some(OLD_AGENTS_FILENAME));
        for import in [AGENTS_FILENAME, ORLY_AGENTS_FILENAME] {
            if !array.iter().any(|v| v.as_str() == Some(import)) {
                array.push(import.into());
            }
        }
        Ok(serde_json::to_vec_pretty(&object)?)
    }
}
