use super::constants::IDENTITY_PUNCTUATION;
use crate::{Error, Result};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, JsonSchema)]
#[serde(transparent)]
pub struct RelativePath(String);

impl RelativePath {
    pub fn new(value: impl Into<String>) -> Result<Self> {
        let value = value.into();
        let path = Path::new(&value);
        if value.is_empty()
            || value.contains(['\0', '\\'])
            || path.is_absolute()
            || value
                .split('/')
                .any(|part| part.is_empty() || part == "." || part == "..")
            || path
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err(Error::Invalid(format!("path is not contained: {value}")));
        }
        Ok(Self(value))
    }
    pub fn resolve_inside(&self, root: &Path) -> Result<PathBuf> {
        contained(root, self)
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn join(&self, root: &Path) -> PathBuf {
        root.join(&self.0)
    }
}

impl<'de> Deserialize<'de> for RelativePath {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        Self::new(String::deserialize(d)?).map_err(serde::de::Error::custom)
    }
}

fn contained(root: &Path, relative: &RelativePath) -> Result<PathBuf> {
    let root = fs::canonicalize(root)?;
    let mut current = root;
    for component in Path::new(relative.as_str()).components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => return Err(Error::Conflict(current)),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(current)
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String")]
pub struct ResourceId(Box<str>);

impl ResourceId {
    pub fn new(value: impl Into<String>) -> Result<Self> {
        let value = value.into();
        if value.is_empty()
            || !value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || IDENTITY_PUNCTUATION.contains(&b))
        {
            return Err(Error::Invalid("invalid resource identity".into()));
        }
        Ok(Self(value.into_boxed_str()))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
impl TryFrom<String> for ResourceId {
    type Error = Error;
    fn try_from(value: String) -> Result<Self> {
        Self::new(value)
    }
}
