//! Schema-derived validation and cause-preserving JSON document loading.
use super::constants::MAX_OUTPUT_BYTES;
use crate::Result;
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use std::path::Path;

pub trait ObjectDocument: DeserializeOwned + JsonSchema {
    fn from_json(bytes: &[u8]) -> Result<Self> {
        let value = serde_json::from_slice(bytes)?;
        let document = serde_json::from_slice::<serde_json::Value>(bytes)?;
        let schema = serde_json::to_value(schemars::schema_for!(Self))?;
        jsonschema::validator_for(&schema)?.validate(&document)?;
        Ok(value)
    }
    fn read_json(path: &Path) -> Result<Self> {
        Self::from_json(&orly_fs::file_input::RegularInput::open(path, MAX_OUTPUT_BYTES)?.read()?)
    }
}
