use crate::support::Repository;
use orly::{
    Error, Result,
    core::{
        env::MapEnv,
        execution::EvaluationContext,
        git::{Git, INDEX_KEY},
        logging::{LOG_FILTER, Logging},
        runner::NativeRunner,
        snapshot::{GitSnapshotSource, SourceKind},
    },
};
use std::{borrow::Cow, collections::BTreeSet, sync::Arc};

const VALUE: &str = "ORLY_FIXTURE_VALUE";
const PRIVATE: &str = "ORLY_FIXTURE_PRIVATE";

#[test]
fn command_environment_refuses_git_scope_using_host_casing() -> Result<()> {
    for key in ["GIT_DIR", INDEX_KEY, "GIT_", "", "BAD=KEY", "BAD\0KEY"] {
        let mut command = Repository::command(&["/usr/bin/true"]);
        command.env_keys.insert(key.into());
        assert!(matches!(Repository::configuration(command),
            Err(Error::Invalid(reason)) if reason == "invalid command environment key"));
    }
    for key in ["Git_Dir", "git_index_file"] {
        let mut command = Repository::command(&["/usr/bin/true"]);
        command.env_keys.insert(key.into());
        #[cfg(windows)]
        assert!(matches!(Repository::configuration(command),
            Err(Error::Invalid(reason)) if reason == "invalid command environment key"));
        #[cfg(not(windows))]
        Repository::configuration(command)?;
    }
    let mut command = Repository::command(&["/usr/bin/true"]);
    command.env_keys = ["GIT", "GITX_DIR", VALUE, "環境"].map(String::from).into();
    Repository::configuration(command)?;
    Ok(())
}

#[test]
fn native_install_clears_inherited_git_scope_and_preserves_alternate_index() -> Result<()> {
    let repository = Repository::new()?;
    let foreign = Repository::new()?;
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    repository.write("native-input.json", &serde_json::to_vec(&config)?)?;
    let key = if cfg!(windows) { "Git_Dir" } else { "GIT_DIR" };
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_orly"))
        .args([
            "--root",
            repository.root().to_str().unwrap(),
            "--json",
            "init",
            "--config",
        ])
        .arg(repository.root().join("native-input.json"))
        .args(["--no-hooks", "--no-agent-hooks", "--dry-run"])
        .env(key, foreign.root().join(".git"))
        .output()?;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let document: serde_json::Value = serde_json::from_slice(&output.stdout)?;
    assert_eq!(document["dry_run"], true);
    assert!(
        !repository
            .root()
            .join(orly::core::constants::CONFIG_PATH)
            .exists()
    );
    let alternate = repository.root().join("alternate-index");
    Git::index_command(repository.root(), Some(alternate.as_os_str()))
        .args(["read-tree", "HEAD"])
        .output()
        .map(|output| assert!(output.status.success()))?;
    assert!(alternate.is_file());
    Ok(())
}

#[test]
fn injected_environments_are_isolated_and_values_never_enter_evidence() -> Result<()> {
    let repository = Repository::new()?;
    let probe = repository.probe()?;
    let mut command = Repository::command(&[probe.to_str().unwrap(), "environment"]);
    command.env_keys = BTreeSet::from([VALUE.into()]);
    let configuration = Repository::configuration(command.to_owned())?;
    let snapshot = GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None)
        .capture(configuration.digest()?)?;
    let environment = MapEnv::from_pairs([(VALUE, "local-only-a"), (PRIVATE, "never-export-this")]);
    assert!(matches!(environment.get(VALUE), Some(Cow::Borrowed(_))));
    assert!(environment.get("ORLY_FIXTURE_MISSING").is_none());
    let context =
        EvaluationContext::with_environment(snapshot, configuration, Arc::new(environment))?;
    let result = NativeRunner.run(&context, &command)?;
    assert_eq!(result.stdout, b"local-only-a\n\n");
    let evidence = serde_json::to_string(&result.invocation)?;
    assert!(!evidence.contains("local-only-a"));
    assert!(!evidence.contains("never-export-this"));
    std::thread::scope(|scope| {
        for expected in ["parallel-a", "parallel-b"] {
            scope.spawn(move || {
                let environment = MapEnv::from_pairs([(VALUE, expected)]);
                assert_eq!(environment.get(VALUE).unwrap().to_str(), Some(expected));
            });
        }
    });
    Ok(())
}

#[test]
fn logging_uses_injected_filters_and_invalid_values_have_a_stable_default() {
    assert_eq!(
        Logging::new(&MapEnv::from_pairs([(LOG_FILTER, "orly=debug")]))
            .filter()
            .to_string(),
        "orly=debug"
    );
    assert_eq!(
        Logging::new(&MapEnv::from_pairs([(LOG_FILTER, "[broken")]))
            .filter()
            .to_string(),
        "info"
    );
    assert_eq!(
        Logging::new(&MapEnv::default()).filter().to_string(),
        "info"
    );
}
