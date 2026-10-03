use super::env::{EnvSource, ProcessEnv};
use super::{
    config::{CommandSpec, Configuration, ValidatedConfiguration},
    constants::{CONFIG_PATH, MAX_OUTPUT_BYTES},
    snapshot::{FileMode, Snapshot},
};
use crate::{Error, Result};
use orly_fs::digest::ContentDigest;
use orly_fs::filesystem::{FileState, RepositoryFs};
use orly_fs::path::RelativePath;
use std::{collections::BTreeMap, path::Path, sync::Arc};

pub struct EvaluationContext {
    pub snapshot: Arc<Snapshot>,
    pub configuration: Arc<ValidatedConfiguration>,
    pub environment: Arc<dyn EnvSource>,
    pub capabilities: super::capabilities::Capabilities,
    config_file_digest: Option<String>,
}

impl EvaluationContext {
    pub fn new(snapshot: Snapshot, configuration: Configuration) -> Result<Self> {
        Self::with_environment(snapshot, configuration, Arc::new(ProcessEnv))
    }
    pub fn with_environment(
        snapshot: Snapshot,
        configuration: Configuration,
        environment: Arc<dyn EnvSource>,
    ) -> Result<Self> {
        let configuration = ValidatedConfiguration::try_from(configuration)?;
        if snapshot.identity().configuration_digest != configuration.digest()? {
            return Err(Error::Stale);
        }
        let config_file_digest = config_file_digest(snapshot.root())?;
        Ok(Self {
            snapshot: Arc::new(snapshot),
            configuration: Arc::new(configuration),
            environment,
            capabilities: super::capabilities::Capabilities::default(),
            config_file_digest,
        })
    }
    pub fn materialize(&self, command: &CommandSpec) -> Result<ScratchTree<'_>> {
        self.validate_current()?;
        for input in &command.inputs {
            if !self.snapshot.files().contains_key(input) {
                return Err(Error::Invalid("uncaptured command dependency input".into()));
            }
        }
        let directory = tempfile::tempdir()?;
        let filesystem = RepositoryFs::open(directory.path())?;
        let mut manifest = BTreeMap::new();
        for (path, file) in self.snapshot.files() {
            if matches!(file.mode, FileMode::Symlink) {
                continue;
            }
            path.resolve_inside(directory.path())?;
            let mode = if file.mode == FileMode::Executable {
                0o755
            } else {
                0o644
            };
            filesystem.write(path, &file.bytes, mode)?;
            manifest.insert(
                path,
                FileState::File {
                    digest: file.digest().into(),
                    mode: orly_fs::permissions::normalize_mode(mode),
                },
            );
        }
        for (path, file) in self
            .snapshot
            .files()
            .iter()
            .filter(|(_, f)| f.mode == FileMode::Symlink)
        {
            filesystem.link(path, std::str::from_utf8(&file.bytes)?)?;
            manifest.insert(path, filesystem.inspect(path, true)?);
        }
        for (path, state) in &manifest {
            if matches!(state, FileState::Link { .. }) {
                filesystem.validate_link(path)?;
            }
        }
        if let Some(cwd) = &command.cwd {
            cwd.resolve_inside(directory.path())?;
        }
        for output in &command.outputs {
            if self.snapshot.files().keys().any(|input| {
                input == output || input.as_str().starts_with(&format!("{}/", output.as_str()))
            }) {
                return Err(Error::Invalid(
                    "build output overlaps captured source".into(),
                ));
            }
            output.resolve_inside(directory.path())?;
        }
        Ok(ScratchTree {
            directory,
            manifest,
        })
    }
}

fn config_file_digest(root: &Path) -> Result<Option<String>> {
    match RepositoryFs::open(root)?.read(&RelativePath::new(CONFIG_PATH)?, MAX_OUTPUT_BYTES) {
        Ok(bytes) => Ok(Some(ContentDigest::digest(&bytes))),
        Err(orly_fs::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub struct ScratchTree<'a> {
    directory: tempfile::TempDir,
    manifest: BTreeMap<&'a RelativePath, FileState>,
}

impl ScratchTree<'_> {
    pub fn root(&self) -> &Path {
        self.directory.path()
    }
    pub fn validate_sources(&self) -> Result<()> {
        for (path, expected) in &self.manifest {
            if FileState::inspect(self.root(), path, true)? != *expected {
                return Err(Error::Stale);
            }
        }
        Ok(())
    }
}

impl EvaluationContext {
    pub fn validate_current(&self) -> Result<()> {
        if self.configuration.digest()? != self.snapshot.identity().configuration_digest {
            return Err(Error::Stale);
        }
        self.snapshot.validate_current()?;
        if self.config_file_digest != config_file_digest(self.snapshot.root())? {
            return Err(Error::Stale);
        }
        Ok(())
    }
}
