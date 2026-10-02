//! Environment injection follows the `agentsfleetd` core pattern.
//! Operating-system values stay intact; map-backed values are borrowed.
use std::{
    borrow::Cow,
    collections::BTreeMap,
    ffi::{OsStr, OsString},
};

pub trait EnvSource: Send + Sync {
    fn get(&self, key: &str) -> Option<Cow<'_, OsStr>>;
}

#[derive(Debug, Default)]
pub struct ProcessEnv;

impl ProcessEnv {
    pub fn get(&self, key: &str) -> Option<Cow<'_, OsStr>> {
        std::env::var_os(key).map(Cow::Owned)
    }
}

#[derive(Debug, Default)]
pub struct MapEnv(BTreeMap<String, OsString>);

impl MapEnv {
    pub fn from_pairs<K, V>(pairs: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Into<String>,
        V: Into<OsString>,
    {
        Self(
            pairs
                .into_iter()
                .map(|(key, value)| (key.into(), value.into()))
                .collect(),
        )
    }
}

impl MapEnv {
    pub fn get(&self, key: &str) -> Option<Cow<'_, OsStr>> {
        self.0
            .get(key)
            .map(|value| Cow::Borrowed(value.as_os_str()))
    }
}

impl EnvSource for ProcessEnv {
    fn get(&self, key: &str) -> Option<Cow<'_, OsStr>> {
        Self::get(self, key)
    }
}

impl EnvSource for MapEnv {
    fn get(&self, key: &str) -> Option<Cow<'_, OsStr>> {
        Self::get(self, key)
    }
}
