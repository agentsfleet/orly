use crate::support::Repository;
use orly::{
    Error, Result,
    core::{
        constants::CONFIG_PATH,
        execution::EvaluationContext,
        runner::NativeRunner,
        snapshot::{GitSnapshotSource, SourceKind},
    },
};
use orly_fs::path::RelativePath;
use std::collections::BTreeSet;

#[test]
fn configured_capture_uses_staged_configuration_and_detects_later_drift() -> Result<()> {
    let repository = Repository::new()?;
    let staged = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    repository.write(CONFIG_PATH, &serde_json::to_vec(&staged)?)?;
    repository.stage(CONFIG_PATH)?;
    let working = Repository::configuration(Repository::command(&["/usr/bin/false"]))?;
    repository.write(CONFIG_PATH, &serde_json::to_vec(&working)?)?;
    let provider = GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None);
    let (snapshot, config) = provider.configured()?;
    assert_eq!(config, staged);
    let context = EvaluationContext::new(snapshot, config)?;
    assert_eq!(
        NativeRunner
            .run(&context, &context.configuration.commands["conform"])?
            .invocation
            .exit_code,
        Some(0)
    );
    repository.write(CONFIG_PATH, &serde_json::to_vec(&staged)?)?;
    assert!(matches!(context.validate_current(), Err(Error::Stale)));
    Ok(())
}

#[test]
fn declared_nonsecret_dependencies_are_captured_and_later_edits_refuse() -> Result<()> {
    let repository = Repository::new()?;
    repository.write("fixture.dep", b"captured dependency\n")?;
    let mut command = Repository::command(&["/bin/cat", "fixture.dep"]);
    let path = RelativePath::new("fixture.dep")?;
    command.inputs.insert(path.to_owned());
    let mut config = Repository::configuration(command)?;
    config.untracked_dependencies = BTreeSet::from([path.to_owned()]);
    repository.write(CONFIG_PATH, &serde_json::to_vec(&config)?)?;
    let (snapshot, config) =
        GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None)
            .configured()?;
    assert!(snapshot.files().contains_key(&path));
    assert!(!serde_json::to_string(&snapshot)?.contains("captured dependency"));
    let context = EvaluationContext::new(snapshot, config)?;
    assert_eq!(
        NativeRunner
            .run(&context, &context.configuration.commands["conform"])?
            .stdout,
        b"captured dependency\n"
    );
    repository.write("fixture.dep", b"changed")?;
    assert!(matches!(context.validate_current(), Err(Error::Stale)));
    Ok(())
}

#[test]
fn remote_event_scope_requires_both_identities() -> Result<()> {
    let repository = Repository::new()?;
    let digest = Repository::configuration(Repository::command(&["/usr/bin/true"]))?.digest()?;
    for (base, head) in [("", "HEAD"), ("HEAD", "")] {
        let source = SourceKind::Event {
            base: base.into(),
            head: head.into(),
        };
        assert!(matches!(
            GitSnapshotSource::new(repository.root(), source, "HEAD", None)
                .capture(digest.to_owned()),
            Err(Error::Invalid(_))
        ));
    }
    let source = SourceKind::Event {
        base: "HEAD".into(),
        head: "HEAD".into(),
    };
    let snapshot =
        GitSnapshotSource::new(repository.root(), source, "HEAD", None).capture(digest)?;
    let original = snapshot.digest()?;
    repository.write("source.txt", b"new commit")?;
    repository.commit()?;
    snapshot.validate_current()?;
    assert_eq!(snapshot.digest()?, original);
    Ok(())
}

#[cfg(feature = "test-util")]
#[test]
fn configured_capture_refuses_replacement_at_both_dependency_boundaries() -> Result<()> {
    use orly::core::snapshot::ConfigurationBoundary;
    for boundary in [
        ConfigurationBoundary::ConfigurationCaptured,
        ConfigurationBoundary::DependenciesCaptured,
    ] {
        let repository = Repository::new()?;
        let original = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
        repository.write(CONFIG_PATH, &serde_json::to_vec(&original)?)?;
        let replacement = Repository::configuration(Repository::command(&["/usr/bin/false"]))?;
        let result = GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None)
            .configured_observed(|observed| {
                if observed == boundary {
                    repository.write(CONFIG_PATH, &serde_json::to_vec(&replacement)?)?;
                }
                Ok(())
            });
        assert!(matches!(result, Err(Error::Stale)), "{boundary:?}");
    }
    Ok(())
}

#[test]
fn configured_untracked_configuration_matches_captured_bytes() -> Result<()> {
    let repository = Repository::new()?;
    let original = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let bytes = serde_json::to_vec_pretty(&original)?;
    repository.write(CONFIG_PATH, &bytes)?;
    let (snapshot, configuration) =
        GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None)
            .configured()?;
    assert_eq!(configuration, original);
    assert_eq!(
        snapshot.files()[&RelativePath::new(CONFIG_PATH)?].bytes,
        bytes
    );
    assert_eq!(
        snapshot.identity().configuration_digest,
        configuration.digest()?
    );
    EvaluationContext::new(snapshot, configuration)?.validate_current()?;
    Ok(())
}

#[test]
fn snapshot_capture_refuses_special_untracked_inputs_without_reading_them() -> Result<()> {
    let repository = Repository::new()?;
    std::fs::create_dir(repository.root().join("directory"))?;
    let status = std::process::Command::new("mkfifo")
        .arg(repository.root().join("pipe"))
        .status()?;
    assert!(status.success());
    for name in ["directory", "pipe"] {
        let path = RelativePath::new(name)?;
        let result = orly::core::snapshot::Snapshot::capture_dependencies(
            repository.root(),
            SourceKind::Index {},
            "HEAD",
            "configuration".into(),
            None,
            &BTreeSet::from([path]),
        );
        assert!(matches!(result, Err(Error::Invalid(_))), "{name}");
    }
    Ok(())
}

#[test]
fn working_tree_capture_refuses_a_tracked_file_replaced_by_a_named_pipe() -> Result<()> {
    let repository = Repository::new()?;
    std::fs::remove_file(repository.root().join("source.txt"))?;
    let status = std::process::Command::new("mkfifo")
        .arg(repository.root().join("source.txt"))
        .status()?;
    assert!(status.success());
    let result = GitSnapshotSource::new(
        repository.root(),
        SourceKind::WorkingTree {
            untracked: BTreeSet::new(),
        },
        "HEAD",
        None,
    )
    .capture("configuration".into());
    assert!(matches!(result, Err(Error::Invalid(_))));
    Ok(())
}
