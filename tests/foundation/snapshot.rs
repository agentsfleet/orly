use crate::support::Repository;
use orly::{
    Error, Result,
    core::{
        git::{Git, ObjectStore},
        snapshot::{GitSnapshotSource, SourceKind},
    },
};
use orly_fs::path::RelativePath;
use std::{collections::BTreeSet, fs};

#[test]
fn head_identity_distinguishes_absence_detachment_and_corrupt_repository() -> Result<()> {
    let repository = Repository::unborn()?;
    assert_eq!(ObjectStore::open(repository.root())?.head_revision()?, None);
    repository.write("source.txt", b"first commit")?;
    repository.commit()?;
    let revision = Git::text(repository.root(), &["rev-parse", "HEAD"])?;
    Git::output(
        repository.root(),
        &["checkout", "--detach", "--quiet", &revision],
    )?;
    assert_eq!(
        ObjectStore::open(repository.root())?.head_revision()?,
        Some(revision)
    );
    fs::write(repository.root().join(".git/HEAD"), b"malformed head\n")?;
    let result = ObjectStore::open(repository.root()).and_then(|store| store.head_revision());
    assert!(matches!(result, Err(Error::GitObject(_))));
    Ok(())
}

#[test]
fn malformed_git_text_preserves_the_decoding_cause() -> Result<()> {
    use std::io::Write;
    let repository = Repository::new()?;
    let config = Git::state_path(repository.root(), "config")?;
    fs::OpenOptions::new()
        .append(true)
        .open(config)?
        .write_all(b"\n[test]\ninvalid-text = \xff\n")?;
    let error = Git::text(repository.root(), &["config", "--get", "test.invalid-text"])
        .expect_err("invalid Git text");
    let cause = std::error::Error::source(&error).expect("decoding cause survives");
    assert!(cause.downcast_ref::<std::string::FromUtf8Error>().is_some());
    assert_ne!(error.to_string(), cause.to_string());
    Ok(())
}

#[test]
fn test_snapshot_reads_index_not_worktree() -> Result<()> {
    let repository = Repository::new()?;
    repository.write("source.txt", b"staged A\n")?;
    repository.stage("source.txt")?;
    repository.write("source.txt", b"working B\n")?;
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let snapshot = GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None)
        .capture(config.digest()?)?;
    let path = RelativePath::new("source.txt")?;
    assert_eq!(snapshot.files()[&path].bytes, b"staged A\n");
    snapshot.validate_current()?;
    let working = GitSnapshotSource::new(
        repository.root(),
        SourceKind::WorkingTree {
            untracked: BTreeSet::new(),
        },
        "HEAD",
        None,
    )
    .capture(config.digest()?)?;
    assert_eq!(working.files()[&path].bytes, b"working B\n");
    let head = GitSnapshotSource::new(repository.root(), SourceKind::Head {}, "HEAD", None)
        .capture(config.digest()?)?;
    assert_eq!(head.files()[&path].bytes, b"committed\n");
    repository.stage("source.txt")?;
    assert!(matches!(snapshot.validate_current(), Err(Error::Stale)));
    Ok(())
}

#[test]
fn alternate_index_preserves_renames_and_ignores_the_default_index() -> Result<()> {
    let repository = Repository::new()?;
    let index = Git::state_path(repository.root(), "alternate-index")?;
    fs::copy(Git::state_path(repository.root(), "index")?, &index)?;
    Git::output(repository.root(), &["mv", "source.txt", "renamed.txt"])?;
    let alternate = Some(index.into_os_string());
    let digest = Repository::configuration(Repository::command(&["/usr/bin/true"]))?.digest()?;
    let snapshot =
        GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", alternate)
            .capture(digest)?;
    assert!(
        snapshot
            .files()
            .contains_key(&RelativePath::new("source.txt")?)
    );
    assert!(
        !snapshot
            .files()
            .contains_key(&RelativePath::new("renamed.txt")?)
    );
    snapshot.validate_current()?;
    Ok(())
}

#[test]
fn paths_reject_normalized_traversal_and_external_links() -> Result<()> {
    for path in ["", "../x", "a/../x", "a/./x", "a//x", "/x", "a\\x", "a\0x"] {
        assert!(
            matches!(RelativePath::new(path), Err(orly_fs::Error::Invalid(_))),
            "{path:?}"
        );
    }
    let repository = Repository::new()?;
    let outside = tempfile::tempdir()?;
    crate::support::platform::symlink_directory(outside.path(), repository.root().join("escape"))?;
    assert!(matches!(
        RelativePath::new("escape/file")?.resolve_inside(repository.root()),
        Err(orly_fs::Error::Conflict(_))
    ));
    Ok(())
}

#[test]
fn event_snapshot_records_resolved_objects_and_survives_reference_movement() -> Result<()> {
    let repository = Repository::new()?;
    let head = Git::text(repository.root(), &["rev-parse", "HEAD"])?;
    Git::output(repository.root(), &["branch", "event-head"])?;
    let source = SourceKind::Event {
        base: "HEAD".into(),
        head: "event-head".into(),
    };
    let snapshot =
        GitSnapshotSource::new(repository.root(), source, "HEAD", None).capture(String::new())?;
    repository.write("source.txt", b"next commit\n")?;
    repository.commit()?;
    Git::output(
        repository.root(),
        &["branch", "--force", "event-head", "HEAD"],
    )?;
    assert!(
        matches!(&snapshot.identity().source, SourceKind::Event {base, head: captured}
        if base == &head && captured == &head)
    );
    assert_eq!(
        snapshot.files()[&RelativePath::new("source.txt")?].bytes,
        b"committed\n"
    );
    snapshot.validate_current()?;
    Ok(())
}

#[cfg(feature = "test-util")]
#[test]
fn event_capture_reads_resolved_objects_when_reference_moves_before_blob_read() -> Result<()> {
    use orly::core::snapshot::CaptureBoundary;
    let repository = Repository::new()?;
    let head = Git::text(repository.root(), &["rev-parse", "HEAD"])?;
    Git::output(repository.root(), &["branch", "event-head"])?;
    repository.write("source.txt", b"later bytes\n")?;
    repository.commit()?;
    let source = SourceKind::Event {
        base: head.to_owned(),
        head: "event-head".into(),
    };
    let snapshot = GitSnapshotSource::new(repository.root(), source, "HEAD", None)
        .capture_observed(String::new(), |boundary| {
            if boundary == CaptureBoundary::IdentitiesResolved {
                Git::output(
                    repository.root(),
                    &["branch", "--force", "event-head", "HEAD"],
                )?;
            }
            Ok(())
        })?;
    assert_eq!(snapshot.identity().head, head);
    assert_eq!(
        snapshot.files()[&RelativePath::new("source.txt")?].bytes,
        b"committed\n"
    );
    Ok(())
}

#[cfg(feature = "test-util")]
#[test]
fn capture_refuses_index_changes_at_both_read_boundaries() -> Result<()> {
    use orly::core::snapshot::CaptureBoundary;
    for boundary in [
        CaptureBoundary::IdentitiesResolved,
        CaptureBoundary::FilesRead,
    ] {
        let repository = Repository::new()?;
        repository.write("source.txt", b"new index bytes\n")?;
        let result = GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None)
            .capture_observed(String::new(), |observed| {
                if observed == boundary {
                    repository.stage("source.txt")?;
                }
                Ok(())
            });
        assert!(matches!(result, Err(Error::Stale)), "{boundary:?}");
    }
    Ok(())
}

#[cfg(feature = "test-util")]
#[test]
fn capture_refuses_head_changes_at_both_read_boundaries() -> Result<()> {
    use orly::core::snapshot::CaptureBoundary;
    for boundary in [
        CaptureBoundary::IdentitiesResolved,
        CaptureBoundary::FilesRead,
    ] {
        let repository = Repository::new()?;
        repository.write("source.txt", b"new commit bytes\n")?;
        let result = GitSnapshotSource::new(repository.root(), SourceKind::Head {}, "HEAD", None)
            .capture_observed(String::new(), |observed| {
                if observed == boundary {
                    repository.commit()?;
                }
                Ok(())
            });
        assert!(matches!(result, Err(Error::Stale)), "{boundary:?}");
    }
    Ok(())
}
