use crate::core::document::ObjectDocument;
use crate::core::{
    config::{CommandSpec, Configuration, CoverageConfig, JudgeConfig, RulesConfig, Surfaces},
    constants::*,
};
use crate::{Error, Result};
use orly_fs::filesystem::RepositoryFs;
use orly_fs::path::RelativePath;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

use crate::cli::Cli;
impl Cli {
    pub(crate) fn configuration(
        &self,
        provided: Option<&Path>,
        migration: bool,
    ) -> Result<Configuration> {
        let native = RelativePath::new(CONFIG_PATH)?.resolve_inside(&self.root)?;
        if let Some(provided) = provided {
            return Configuration::read_json(provided);
        }
        if native.exists() {
            return Configuration::read_json(&native);
        }
        if migration {
            let old = RelativePath::new(OLD_CONFIG_PATH)?.resolve_inside(&self.root)?;
            if old.exists() {
                return Self::convert_prior(
                    &RepositoryFs::open(&self.root)?
                        .read(&RelativePath::new(OLD_CONFIG_PATH)?, MAX_OUTPUT_BYTES)?,
                );
            }
        }
        Err(Error::Invalid(
            "configuration missing; pass --config with declared project commands".into(),
        ))
    }
    fn convert_prior(bytes: &[u8]) -> Result<Configuration> {
        let prior: serde_json::Value = serde_json::from_slice(bytes)?;
        let groups: BTreeMap<String, Vec<Vec<String>>> =
            serde_json::from_value(prior[COMMANDS_KEY].clone())?;
        let mut commands = BTreeMap::new();
        let mut executables = BTreeSet::new();
        for (id, vectors) in groups {
            if vectors.len() != 1 {
                return Err(Error::Invalid(
                    "multiple prior command vectors require an explicit target configuration"
                        .into(),
                ));
            }
            let argv = vectors
                .into_iter()
                .next()
                .ok_or_else(|| Error::Invalid("empty prior command group".into()))?;
            executables.insert(
                argv.first()
                    .ok_or_else(|| Error::Invalid("empty prior command".into()))?
                    .clone(),
            );
            commands.insert(
                id,
                CommandSpec {
                    argv,
                    cwd: None,
                    env_keys: BTreeSet::new(),
                    inputs: BTreeSet::new(),
                    outputs: BTreeSet::new(),
                    resources: BTreeSet::new(),
                    deadline_seconds: DEFAULT_DEADLINE_SECONDS,
                },
            );
        }
        Ok(Configuration {
            schema_version: CONFIG_SCHEMA,
            engine: ENGINE_VERSION.into(),
            packs: serde_json::from_value(prior[PACKS_KEY].clone())?,
            releases: crate::core::storage::ReleaseStorage::default(),
            data_packs: Vec::new(),
            untracked_dependencies: BTreeSet::new(),
            commands,
            allowed_executables: executables,
            surfaces: if prior[SURFACES_KEY].is_null() {
                Surfaces::default()
            } else {
                serde_json::from_value(prior[SURFACES_KEY].clone())?
            },
            judge: JudgeConfig::default(),
            coverage: CoverageConfig::default(),
            rules: RulesConfig::default(),
            checks: Vec::new(),
            managed: BTreeMap::new(),
        })
    }
}
const COMMANDS_KEY: &str = "commands";
const PACKS_KEY: &str = "packs";
const SURFACES_KEY: &str = "surfaces";
