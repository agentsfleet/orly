use crate::support::Repository;
use orly::{
    Error, Result,
    core::{constants::*, git::Git, payload::Payload},
    install::{
        Installer,
        preflight::InstallPlanner,
        recovery::{FaultTiming, InstallationLock, OperationManifest, RecoveryFault},
    },
};
use std::{fs, path::Path};

const STATE_DIRECTORY: &str = "orly";
const JOURNAL_NAME: &str = "installation.json";
const RETAINED_DIRECTORY: &str = "retained-orly";
const TRUE_COMMAND: &str = "/usr/bin/true";

#[test]
fn state_directory_replacement_refuses_effects_and_preserves_recovery() -> Result<()> {
    let repository = Repository::new()?;
    let root = repository.root();
    let installer = Installer::new(root)?;
    let state = installer.local_state(true)?;
    let payload = Payload::embedded()?;
    let config = Repository::configuration(Repository::command(&[TRUE_COMMAND]))?;
    let binary = Path::new(env!("CARGO_BIN_EXE_orly"));
    let planner = InstallPlanner::new(&state, &payload, &config, binary, false, false);
    let mut manifest = planner.plan()?;
    manifest.save(&state)?;
    let _lock = InstallationLock::acquire(&state)?;
    let directory = Git::state_path(root, STATE_DIRECTORY)?;
    let retained = directory.with_file_name(RETAINED_DIRECTORY);
    let before = fs::read(directory.join(JOURNAL_NAME))?;
    fs::rename(&directory, &retained)?;
    fs::create_dir(&directory)?;
    assert!(
        matches!(planner.resume(&mut manifest), Err(Error::Conflict(path)) if path == directory)
    );
    assert!(matches!(manifest.save(&state), Err(Error::Conflict(path)) if path == directory));
    assert!(!root.join(ORLY_AGENTS_FILENAME).exists());
    assert_eq!(fs::read(retained.join(JOURNAL_NAME))?, before);
    assert!(fs::read_dir(&directory)?.next().is_none());
    fs::remove_dir(&directory)?;
    fs::rename(&retained, &directory)?;
    let mut loaded = OperationManifest::load(&state)?.unwrap();
    planner.resume(&mut loaded)?;
    assert!(root.join(ORLY_AGENTS_FILENAME).exists());
    assert!(OperationManifest::load(&state)?.is_none());
    Ok(())
}

#[test]
fn journal_writer_retains_its_directory_during_the_callback() -> Result<()> {
    let repository = Repository::new()?;
    let installer = Installer::new(repository.root())?;
    let state = installer.local_state(true)?;
    let _lock = InstallationLock::acquire(&state)?;
    let directory = Git::state_path(repository.root(), STATE_DIRECTORY)?;
    let retained = directory.with_file_name(RETAINED_DIRECTORY);
    let bytes = b"completed operation";
    let result = state.write_with(MANIFEST_PATH, bytes.len(), |output| {
        fs::rename(&directory, &retained)?;
        fs::create_dir(&directory)?;
        Ok(output.write_all(bytes)?)
    });
    assert!(matches!(result, Err(Error::Conflict(path)) if path == directory));
    assert_eq!(fs::read(retained.join(JOURNAL_NAME))?, bytes);
    assert!(fs::read_dir(&directory)?.next().is_none());
    Ok(())
}

#[test]
fn moved_worktree_recovers_without_installing_into_a_reused_path() -> Result<()> {
    let repository = Repository::new()?;
    let workspace = tempfile::tempdir()?;
    let original = workspace.path().join("original");
    let moved = workspace.path().join("moved");
    add_worktree(&repository, &original)?;
    let installer = Installer::new(&original)?;
    let state = installer.local_state(true)?;
    let lock = InstallationLock::acquire(&state)?;
    let payload = Payload::embedded()?;
    let config = Repository::configuration(Repository::command(&[TRUE_COMMAND]))?;
    let binary = Path::new(env!("CARGO_BIN_EXE_orly"));
    let planner = InstallPlanner::new(&state, &payload, &config, binary, false, false);
    let mut manifest = planner.plan()?;
    manifest.save(&state)?;
    let fault = RecoveryFault {
        ordinal: 0,
        timing: FaultTiming::AfterJournal,
    };
    assert!(matches!(
        planner.resume_with_fault(&mut manifest, Some(fault)),
        Err(Error::Interrupted(0))
    ));
    let journal = Git::state_path(&original, MANIFEST_PATH)?;
    let before = fs::read(&journal)?;
    let old_path = original.to_str().unwrap();
    let new_path = moved.to_str().unwrap();
    Git::output(repository.root(), &["worktree", "move", old_path, new_path])?;
    add_worktree(&repository, &original)?;
    assert!(
        matches!(planner.resume(&mut manifest), Err(Error::Conflict(path)) if path == original.canonicalize().unwrap())
    );
    assert!(!original.join(ORLY_AGENTS_FILENAME).exists());
    assert_eq!(fs::read(&journal)?, before);
    drop(lock);
    Installer::new(&moved)?.install(&config, binary, false, false, false)?;
    assert!(moved.join(CONFIG_PATH).exists());
    assert!(!journal.exists());
    assert!(!original.join(CONFIG_PATH).exists());
    Ok(())
}

fn add_worktree(repository: &Repository, path: &Path) -> Result<()> {
    Git::output(
        repository.root(),
        &[
            "worktree",
            "add",
            "--quiet",
            "--detach",
            path.to_str().unwrap(),
            "HEAD",
        ],
    )?;
    Ok(())
}
