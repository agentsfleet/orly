use super::constants::*;
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use orly_fs::path::{RelativePath, ResourceId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CommandSpec {
    pub argv: Vec<String>,
    pub cwd: Option<RelativePath>,
    #[serde(default)]
    pub env_keys: BTreeSet<String>,
    #[serde(default)]
    pub inputs: BTreeSet<RelativePath>,
    #[serde(default)]
    pub outputs: BTreeSet<RelativePath>,
    #[serde(default)]
    pub resources: BTreeSet<ResourceId>,
    #[serde(default = "default_deadline")]
    pub deadline_seconds: u64,
}

fn default_deadline() -> u64 {
    DEFAULT_DEADLINE_SECONDS
}

impl CommandSpec {
    pub fn validate(&self, allowed: &BTreeSet<String>) -> Result<()> {
        let executable = self
            .argv
            .first()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| Error::Invalid("empty command vector".into()))?;
        if !allowed.contains(executable) || self.argv.iter().any(|a| a.contains('\0')) {
            return Err(Error::Invalid(
                "undeclared executable or invalid argument".into(),
            ));
        }
        if !(1..=MAX_DEADLINE_SECONDS).contains(&self.deadline_seconds) {
            return Err(Error::Invalid("deadline outside owner limits".into()));
        }
        if std::path::Path::new(executable)
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|name| {
                let name = if cfg!(windows) {
                    std::borrow::Cow::Owned(name.to_ascii_lowercase())
                } else {
                    std::borrow::Cow::Borrowed(name)
                };
                let name = if cfg!(windows) {
                    name.strip_suffix(WINDOWS_EXECUTABLE_SUFFIX)
                        .unwrap_or(&name)
                } else {
                    &name
                };
                name == ENGINE_NAME || name.starts_with(ENGINE_VERSION_PREFIX)
            })
        {
            return Err(Error::Invalid("command re-enters its own engine".into()));
        }
        if self.env_keys.iter().any(|k| {
            k.is_empty()
                || k.contains(['=', '\0'])
                || super::git::Git::is_reserved_environment_key(k.as_ref())
        }) {
            return Err(Error::Invalid("invalid command environment key".into()));
        }
        Ok(())
    }
}

pub const ENGINE_NAME: &str = "orly";
pub const ENGINE_VERSION_PREFIX: &str = "orly-";
pub const GIT_ENV_PREFIX: &str = "GIT_";
const WINDOWS_EXECUTABLE_SUFFIX: &str = ".exe";

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Surfaces {
    pub user: Vec<RelativePath>,
    pub docs: Vec<RelativePath>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct JudgeConfig {
    pub upload: bool,
    pub model: String,
    pub questions: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CoverageConfig {
    pub roots: Vec<RelativePath>,
    pub producers: Vec<String>,
    pub reports: Vec<RelativePath>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RulesConfig {
    pub selectors: Vec<String>,
    pub candidates: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Configuration {
    pub schema_version: u32,
    pub engine: String,
    pub packs: Vec<String>,
    #[serde(default)]
    pub releases: super::storage::ReleaseStorage,
    #[serde(default)]
    pub data_packs: Vec<RelativePath>,
    #[serde(default)]
    pub untracked_dependencies: BTreeSet<RelativePath>,
    pub commands: BTreeMap<String, CommandSpec>,
    pub allowed_executables: BTreeSet<String>,
    #[serde(default)]
    pub surfaces: Surfaces,
    #[serde(default)]
    pub judge: JudgeConfig,
    #[serde(default)]
    pub coverage: CoverageConfig,
    #[serde(default)]
    pub rules: RulesConfig,
    #[serde(default)]
    pub checks: Vec<String>,
    #[serde(default)]
    pub managed: BTreeMap<RelativePath, String>,
}

impl Configuration {
    pub fn new(
        commands: BTreeMap<String, CommandSpec>,
        allowed_executables: BTreeSet<String>,
    ) -> Result<Self> {
        let configuration = Self {
            schema_version: CONFIG_SCHEMA,
            engine: ENGINE_VERSION.into(),
            packs: vec![UNIVERSAL_PACK.into()],
            releases: super::storage::ReleaseStorage::default(),
            commands,
            allowed_executables,
            data_packs: Vec::default(),
            untracked_dependencies: BTreeSet::default(),
            surfaces: Surfaces::default(),
            judge: JudgeConfig::default(),
            coverage: CoverageConfig::default(),
            rules: RulesConfig::default(),
            checks: Vec::default(),
            managed: BTreeMap::default(),
        };
        configuration.validate()?;
        Ok(configuration)
    }
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != CONFIG_SCHEMA || self.engine != ENGINE_VERSION {
            return Err(Error::Invalid(
                "unsupported configuration or engine version".into(),
            ));
        }
        for command in self.commands.values() {
            command.validate(&self.allowed_executables)?;
        }
        if !self.commands.contains_key(CONFORM_ID)
            || !self.commands.keys().any(|k| k.starts_with(VERIFY_PREFIX))
        {
            return Err(Error::Invalid(
                "declare conform and a verification command".into(),
            ));
        }
        for name in &self.packs {
            orly_decision::validate_name(name)?;
        }
        Ok(())
    }
    pub fn digest(&self) -> Result<String> {
        Ok(ContentDigest::identity(self)?)
    }
    pub fn installation_digest(&self) -> Result<String> {
        Ok(ContentDigest::identity(&(
            self.schema_version,
            &self.engine,
            &self.packs,
            &self.releases,
            &self.data_packs,
            &self.untracked_dependencies,
            &self.commands,
            &self.allowed_executables,
            &self.surfaces,
            &self.judge,
            &self.coverage,
            &self.rules,
            &self.checks,
        ))?)
    }
}
impl super::document::ObjectDocument for Configuration {}

/// Validated invocation settings expose shared access to the wire configuration.
///
/// ```compile_fail
/// use orly::core::config::ValidatedConfiguration;
/// fn change(mut configuration: ValidatedConfiguration) {
///     configuration.commands.clear();
/// }
/// ```
#[derive(Clone, Debug, Serialize)]
#[serde(transparent)]
pub struct ValidatedConfiguration(Configuration);

impl TryFrom<Configuration> for ValidatedConfiguration {
    type Error = Error;
    fn try_from(configuration: Configuration) -> Result<Self> {
        configuration.validate()?;
        Ok(Self(configuration))
    }
}

impl std::ops::Deref for ValidatedConfiguration {
    type Target = Configuration;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub const CONFORM_ID: &str = "conform";
pub const VERIFY_UNIT_ID: &str = "verify.unit";
pub const VERIFY_PREFIX: &str = "verify.";
