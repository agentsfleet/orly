use crate::support::Repository;
use orly::{
    Error, Result,
    core::{config::Configuration, constants::*, payload::Payload},
    install::{
        Installer, LocalState,
        operation::Operation,
        preflight::InstallPlanner,
        recovery::{FaultTiming, OperationManifest, RecoveryFault},
    },
};
use orly_fs::{filesystem::FileState, path::RelativePath};
use std::{fs, path::PathBuf};
#[path = "recovery_payload.rs"]
mod payload_support;
use payload_support::recovery_payload;

pub(super) struct RecoveryFixture {
    pub(super) repository: Repository,
    _binary_directory: tempfile::TempDir,
    pub(super) binary: PathBuf,
    pub(super) payload: Payload,
    pub(super) config: Configuration,
    pub(super) installer: Installer,
}
impl RecoveryFixture {
    pub(super) fn new(recorded: bool) -> Result<Self> {
        let repository = Repository::new()?;
        if recorded {
            repository.legacy()?;
        }
        let directory = tempfile::tempdir()?;
        let binary = directory.path().join("fixture-engine");
        fs::write(&binary, b"immutable test binary")?;
        let installer = Installer::new(repository.root())?;
        let config = if recorded {
            repository.migration_configuration()?
        } else {
            Repository::configuration(Repository::command(&["/usr/bin/true"]))?
        };
        Ok(Self {
            installer,
            repository,
            _binary_directory: directory,
            binary,
            payload: recovery_payload()?,
            config,
        })
    }
    pub(super) fn planner<'a>(
        &'a self,
        state: &'a LocalState<'a>,
        hooks: bool,
        loaders: bool,
    ) -> InstallPlanner<'a> {
        InstallPlanner::new(
            state,
            &self.payload,
            &self.config,
            &self.binary,
            hooks,
            loaders,
        )
    }
    pub(super) fn verify_interruption(&self, ordinal: usize, timing: FaultTiming) -> Result<()> {
        let state = self.installer.local_state(true)?;
        let planner = self.planner(&state, true, true);
        let mut manifest = planner.plan()?;
        manifest.save(&state)?;
        assert!(
            matches!(planner.resume_with_fault(&mut manifest, Some(RecoveryFault {ordinal, timing})),
            Err(Error::Interrupted(index)) if index == ordinal)
        );
        let mut loaded = OperationManifest::load(&state)?.unwrap();
        assert_eq!(
            loaded.completed,
            ordinal + usize::from(timing == FaultTiming::AfterJournal)
        );
        planner.resume(&mut loaded)?;
        assert!(OperationManifest::load(&state)?.is_none());
        assert!(!self.repository.root().join(OLD_CONFIG_PATH).exists());
        assert!(!self.repository.root().join(OLD_AGENTS_FILENAME).exists());
        assert!(
            fs::read_to_string(self.repository.root().join(AGENTS_FILENAME))?
                .starts_with("# Consumer rules\n\nKeep this paragraph.\n")
        );
        assert!(Installer::new(self.repository.root())?.doctor()?.is_empty());
        let prior: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../fixtures/layout-0.10/.oracle/orly.json"
        ))?;
        for path in prior["managed"].as_array().unwrap() {
            let path = path.as_str().unwrap();
            assert!(
                !self.repository.root().join(path).exists(),
                "old managed copy: {path}"
            );
            if !path.starts_with(".githooks/") && path != OLD_AGENTS_FILENAME {
                assert!(
                    self.repository
                        .root()
                        .join(format!("{ORLY_PREFIX}{path}"))
                        .is_file(),
                    "replacement: {path}"
                );
            }
        }
        Ok(())
    }
    pub(super) fn tampered(&self, fault: &str) -> Result<OperationManifest> {
        let state = self.installer.local_state(true)?;
        let mut manifest = self.planner(&state, false, false).plan()?;
        let path = RelativePath::new("owner-note.txt")?;
        let before = FileState::inspect(self.repository.root(), &path, false)?;
        match fault {
            "append" => manifest.operations.push(Operation::Write {
                path,
                before,
                bytes: b"replaced".to_vec(),
                mode: 0o644,
            }),
            "managed-bytes" => {
                if let Operation::Write { bytes, .. } = &mut manifest.operations[0] {
                    *bytes = b"replaced".to_vec();
                }
            }
            "order" => manifest.operations.swap(0, 1),
            "mode" => {
                if let Operation::Write { mode, .. } = &mut manifest.operations[0] {
                    *mode = 0o777;
                }
            }
            "hooks" => manifest.operations.push(Operation::Hooks {
                before: Operation::hooks_path(self.repository.root())?,
                after: ".unrequested-hooks".into(),
            }),
            "delete" => manifest.operations.push(Operation::Delete { path, before }),
            _ => unreachable!(),
        }
        manifest.seal()?;
        Ok(manifest)
    }
}
