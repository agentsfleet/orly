use crate::support::Repository;
use orly::{
    Error, Result,
    core::{constants::*, git::Git, payload::Payload},
    install::{
        Installer,
        operation::Operation,
        preflight::InstallPlanner,
        recovery::{FaultTiming, InstallationLock, OperationManifest, RecoveryFault},
    },
};
use orly_fs::path::RelativePath;
use std::fs;
#[path = "recovery_fixture.rs"]
mod fixture;
use fixture::RecoveryFixture;

#[test]
fn unborn_recovery_resumes_but_refuses_a_new_first_commit() -> Result<()> {
    for first_commit in [false, true] {
        let repository = Repository::unborn()?;
        let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
        let payload = Payload::embedded()?;
        let binary = std::path::Path::new(env!("CARGO_BIN_EXE_orly"));
        let installer = Installer::new(repository.root())?;
        let state = installer.local_state(true)?;
        let planner = InstallPlanner::new(&state, &payload, &config, binary, false, false);
        let mut manifest = planner.plan()?;
        assert_eq!(manifest.source_revision, None);
        manifest.save(&state)?;
        assert!(matches!(
            planner.resume_with_fault(
                &mut manifest,
                Some(RecoveryFault {
                    ordinal: 0,
                    timing: FaultTiming::AfterJournal
                })
            ),
            Err(Error::Interrupted(0))
        ));
        let journal = state.read(MANIFEST_PATH, MAX_SNAPSHOT_BYTES)?;
        let mut loaded = OperationManifest::load(&state)?.unwrap();
        if first_commit {
            repository.commit()?;
            assert!(matches!(planner.resume(&mut loaded), Err(Error::Stale)));
            assert_eq!(state.read(MANIFEST_PATH, MAX_SNAPSHOT_BYTES)?, journal);
            assert!(!repository.root().join(CONFIG_PATH).exists());
        } else {
            planner.resume(&mut loaded)?;
            assert!(OperationManifest::load(&state)?.is_none());
            assert!(installer.doctor()?.is_empty());
        }
    }
    Ok(())
}

#[test]
fn recorded_managed_families_migrate_with_the_full_embedded_payload() -> Result<()> {
    let mut fixture = RecoveryFixture::new(true)?;
    fixture.payload = Payload::embedded()?;
    let state = fixture.installer.local_state(true)?;
    let planner = fixture.planner(&state, true, true);
    let mut manifest = planner.plan()?;
    manifest.save(&state)?;
    planner.resume(&mut manifest)?;
    assert!(OperationManifest::load(&state)?.is_none());
    for path in [
        "audits/doc-read.sh",
        "dispatch/write_rust.md",
        "docs/DOCUMENTATION_RULES.md",
        ".agents/skills/orly-write-unit-test/SKILL.md",
        ".claude/skills/orly-write-unit-test/SKILL.md",
        ".opencode/skills/orly-write-unit-test/SKILL.md",
    ] {
        assert!(
            !fixture.repository.root().join(path).exists(),
            "old copy: {path}"
        );
        let target = RelativePath::new(format!("{ORLY_PREFIX}{path}"))?;
        assert_eq!(
            fs::read(target.join(fixture.repository.root()))?,
            fixture.payload.materialized(&fixture.config.packs)?[&target]
        );
    }
    assert!(fixture.installer.doctor()?.is_empty());
    Ok(())
}

#[test]
fn test_migration_resumes_every_write_and_cleanup() -> Result<()> {
    let initial = RecoveryFixture::new(true)?;
    let state = initial.installer.local_state(true)?;
    let count = initial.planner(&state, true, true).plan()?.operations.len();
    for timing in [
        FaultTiming::BeforeEffect,
        FaultTiming::AfterEffect,
        FaultTiming::AfterJournal,
    ] {
        for ordinal in 0..count {
            RecoveryFixture::new(true)?.verify_interruption(ordinal, timing)?;
        }
    }
    println!(
        "recovery boundaries: {count} operations x 3 interruption timings; every retry completed"
    );
    Ok(())
}

#[test]
fn recovery_journal_refuses_unknown_fields_in_missing_file_state() -> Result<()> {
    let fixture = RecoveryFixture::new(false)?;
    let root = fixture.repository.root();
    let state = fixture.installer.local_state(true)?;
    let planner = fixture.planner(&state, false, false);
    let manifest = planner.plan()?;
    manifest.save(&state)?;
    let journal = Git::state_path(root, MANIFEST_PATH)?;
    let original = fs::read(&journal)?;
    let mut document: serde_json::Value = serde_json::from_slice(&original)?;
    let operation = document["operations"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|op| op["before"]["kind"] == "missing")
        .expect("fresh installation records an absent destination");
    operation["before"]["unrecognized_extension"] = true.into();
    let altered = serde_json::to_vec(&document)?;
    fs::write(&journal, &altered)?;
    assert!(matches!(
        OperationManifest::load(&state),
        Err(Error::Json(_))
    ));
    assert!(matches!(
        fixture
            .installer
            .install(&fixture.config, &fixture.binary, false, false, false),
        Err(Error::Json(_))
    ));
    assert_eq!(fs::read(&journal)?, altered);
    assert!(!root.join(ORLY_AGENTS_FILENAME).exists());
    assert!(!root.join(CONFIG_PATH).exists());
    fs::write(&journal, &original)?;
    let mut restored = OperationManifest::load(&state)?.unwrap();
    assert_eq!(restored.identity, manifest.identity);
    planner.resume(&mut restored)?;
    assert!(OperationManifest::load(&state)?.is_none());
    assert!(fixture.installer.doctor()?.is_empty());
    Ok(())
}

#[test]
fn recovery_refuses_edited_replaced_sources_and_concurrent_installations() -> Result<()> {
    let fixture = RecoveryFixture::new(false)?;
    let root = fixture.repository.root();
    let state = fixture.installer.local_state(true)?;
    let lock = InstallationLock::acquire(&state)?;
    assert!(matches!(
        InstallationLock::acquire(&state),
        Err(Error::Locked)
    ));
    drop(lock);
    let planner = fixture.planner(&state, false, true);
    let mut manifest = planner.plan()?;
    manifest.save(&state)?;
    assert!(matches!(
        planner.resume_with_fault(
            &mut manifest,
            Some(RecoveryFault {
                ordinal: 0,
                timing: FaultTiming::AfterEffect
            })
        ),
        Err(Error::Interrupted(0))
    ));
    fixture
        .repository
        .write(ORLY_AGENTS_FILENAME, b"owner changed this")?;
    let before = fs::read(root.join(ORLY_AGENTS_FILENAME))?;
    let mut loaded = OperationManifest::load(&state)?.unwrap();
    assert!(planner.resume(&mut loaded).is_err());
    assert_eq!(fs::read(root.join(ORLY_AGENTS_FILENAME))?, before);
    let other = Repository::new()?;
    let outside = tempfile::tempdir()?;
    crate::support::platform::symlink_directory(
        outside.path(),
        Git::state_path(other.root(), "orly")?,
    )?;
    assert!(Installer::new(other.root())?.local_state(true).is_err());
    assert!(Installer::new(other.root())?.local_state(false).is_err());
    assert!(fs::read_dir(outside.path())?.next().is_none());
    Ok(())
}

#[test]
fn resealed_recovery_journals_cannot_authorize_other_effects() -> Result<()> {
    for fault in [
        "append",
        "managed-bytes",
        "order",
        "mode",
        "hooks",
        "delete",
    ] {
        let fixture = RecoveryFixture::new(false)?;
        fixture.repository.write("owner-note.txt", b"keep this")?;
        let root = fixture.repository.root();
        let state = fixture.installer.local_state(true)?;
        fixture.tampered(fault)?.save(&state)?;
        assert!(
            Installer::new(root)?
                .install(&fixture.config, &fixture.binary, false, false, false)
                .is_err(),
            "{fault}"
        );
        assert_eq!(
            fs::read(root.join("owner-note.txt"))?,
            b"keep this",
            "{fault}"
        );
        assert!(
            !root.join(ORLY_AGENTS_FILENAME).exists(),
            "{fault}: wrote before refusal"
        );
        assert_eq!(
            Operation::hooks_path(root)?.as_deref(),
            Some(".fixture-hooks")
        );
    }
    Ok(())
}

#[test]
fn recovery_refuses_changed_binary_and_repository_revision_before_writing() -> Result<()> {
    for binary_changed in [false, true] {
        let fixture = RecoveryFixture::new(false)?;
        let state = fixture.installer.local_state(true)?;
        let planner = fixture.planner(&state, false, false);
        let mut manifest = planner.plan()?;
        manifest.save(&state)?;
        if binary_changed {
            fs::write(&fixture.binary, b"changed binary")?;
        } else {
            fixture.repository.write("source.txt", b"new revision")?;
            fixture.repository.commit()?;
        }
        assert!(matches!(planner.resume(&mut manifest), Err(Error::Stale)));
        assert!(
            !fixture
                .repository
                .root()
                .join(ORLY_AGENTS_FILENAME)
                .exists()
        );
        assert_eq!(OperationManifest::load(&state)?.unwrap().completed, 0);
    }
    Ok(())
}
