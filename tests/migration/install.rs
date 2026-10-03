use crate::support::Repository;
use orly::{
    Result,
    core::{constants::*, git::Git},
    install::{Installer, operation::Operation},
};
use std::{fs, path::Path};

#[test]
fn install_supports_a_repository_before_its_first_commit() -> Result<()> {
    let repository = Repository::unborn()?;
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let binary = Path::new(env!("CARGO_BIN_EXE_orly"));
    let installer = Installer::new(repository.root())?;
    let dry = installer.install(&config, binary, false, true, true)?;
    assert!(dry.operations > 0);
    assert!(!repository.root().join(CONFIG_PATH).exists());
    installer.install(&config, binary, false, true, false)?;
    assert!(installer.doctor()?.is_empty());
    assert!(git2::Repository::open(repository.root())?.is_empty()?);
    Ok(())
}

#[test]
fn test_install_is_contained_and_idempotent() -> Result<()> {
    let repository = Repository::new()?;
    repository.allow_native_hooks()?;
    repository.write("AGENTS.md", b"# My rules\n\nKeep the whole paragraph.\n")?;
    repository.write("CLAUDE.md", b"# My agent instructions\n")?;
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let binary = Path::new(env!("CARGO_BIN_EXE_orly"));
    let dry = Installer::new(repository.root())?.install(&config, binary, true, true, true)?;
    assert!(dry.operations > 0);
    assert!(!repository.root().join(CONFIG_PATH).exists());
    Installer::new(repository.root())?.install(&config, binary, true, true, false)?;
    let agents = fs::read_to_string(repository.root().join(AGENTS_FILENAME))?;
    assert!(agents.starts_with("# My rules\n\nKeep the whole paragraph.\n"));
    assert!(agents.contains(ORLY_AGENTS_FILENAME));
    assert_eq!(
        Operation::hooks_path(repository.root())?.as_deref(),
        Some(HOOKS_DIRECTORY)
    );
    for name in [PRE_COMMIT, PRE_PUSH] {
        assert_eq!(
            fs::read_link(repository.root().join(HOOKS_DIRECTORY).join(name))?,
            Path::new(HOOK_BINARY_LINK)
        );
    }
    assert!(Installer::new(repository.root())?.doctor()?.is_empty());
    let path = repository.root().join(ORLY_AGENTS_FILENAME);
    let before = fs::metadata(&path)?.modified()?;
    let installed = serde_json::from_slice(&fs::read(repository.root().join(CONFIG_PATH))?)?;
    assert_eq!(
        Installer::new(repository.root())?
            .install(&installed, binary, true, true, false)?
            .operations,
        0
    );
    assert_eq!(fs::metadata(path)?.modified()?, before);
    assert_eq!(
        fs::read_to_string(repository.root().join(AGENTS_FILENAME))?,
        agents
    );
    // Actual Git dispatch proves the native link's invocation-name routing.
    repository.stage(CONFIG_PATH)?;
    Git::output(
        repository.root(),
        &["commit", "--quiet", "-m", "test: invoke native pre-commit"],
    )?;
    Ok(())
}

#[test]
fn foreign_hooks_and_symlinked_destinations_refuse_before_payload_writes() -> Result<()> {
    let repository = Repository::new()?;
    repository.allow_native_hooks()?;
    let hooks = Git::state_path(repository.root(), "hooks/pre-commit")?;
    fs::write(&hooks, b"repository-owned hook")?;
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let binary = Path::new(env!("CARGO_BIN_EXE_orly"));
    assert!(
        Installer::new(repository.root())?
            .install(&config, binary, true, true, false)
            .is_err()
    );
    assert!(!repository.root().join(CONFIG_PATH).exists());
    assert_eq!(fs::read(&hooks)?, b"repository-owned hook");
    Installer::new(repository.root())?.install(&config, binary, false, true, false)?;
    assert_eq!(fs::read(hooks)?, b"repository-owned hook");
    let other = Repository::new()?;
    let outside = tempfile::tempdir()?;
    crate::support::platform::symlink_directory(outside.path(), other.root().join(".orly"))?;
    assert!(
        Installer::new(other.root())?
            .install(&config, binary, false, true, false)
            .is_err()
    );
    assert!(fs::read_dir(outside.path())?.next().is_none());
    Ok(())
}

#[test]
fn migration_preserves_foreign_hook_paths_with_whitespace() -> Result<()> {
    for path in [".githooks ", " .githooks", ".githooks\t", ".githooks\n"] {
        let repository = Repository::new()?;
        repository.legacy()?;
        Git::output(repository.root(), &["config", "core.hooksPath", path])?;
        let before = Git::output(
            repository.root(),
            &["config", "--null", "--get", "core.hooksPath"],
        )?;
        let config = repository.migration_configuration()?;
        let binary = Path::new(env!("CARGO_BIN_EXE_orly"));
        let installer = Installer::new(repository.root())?;
        for dry_run in [true, false] {
            assert!(
                installer
                    .install(&config, binary, true, true, dry_run)
                    .is_err(),
                "accepted foreign hook path {path:?}"
            );
            assert_eq!(
                Git::output(
                    repository.root(),
                    &["config", "--null", "--get", "core.hooksPath"]
                )?,
                before
            );
            assert!(!repository.root().join(CONFIG_PATH).exists());
            assert!(!repository.root().join(ORLY_AGENTS_FILENAME).exists());
        }
        assert_eq!(
            Operation::hooks_path(repository.root())?.as_deref(),
            Some(path)
        );
        installer.install(&config, binary, false, true, false)?;
        assert_eq!(
            Git::output(
                repository.root(),
                &["config", "--null", "--get", "core.hooksPath"]
            )?,
            before
        );
    }
    Ok(())
}

#[cfg(unix)]
#[test]
fn migration_keeps_the_foreign_whitespace_directory_hook_active() -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let repository = Repository::new()?;
    repository.legacy()?;
    let foreign_path = ".githooks ";
    Git::output(
        repository.root(),
        &["config", "core.hooksPath", foreign_path],
    )?;
    let hook = repository.root().join(foreign_path).join("pre-commit");
    let script = b"#!/bin/sh\nprintf 'foreign hook ran' > foreign-hook-proof\n";
    fs::create_dir(hook.parent().unwrap())?;
    fs::write(&hook, script)?;
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o755))?;
    let config = repository.migration_configuration()?;
    let binary = Path::new(env!("CARGO_BIN_EXE_orly"));
    let installer = Installer::new(repository.root())?;
    assert!(
        installer
            .install(&config, binary, true, true, false)
            .is_err()
    );
    assert_eq!(fs::read(&hook)?, script);
    installer.install(&config, binary, false, true, false)?;
    assert_eq!(fs::read(&hook)?, script);
    assert_eq!(
        Operation::hooks_path(repository.root())?.as_deref(),
        Some(foreign_path)
    );
    repository.stage(CONFIG_PATH)?;
    Git::output(
        repository.root(),
        &["commit", "--quiet", "-m", "test: retain foreign hook"],
    )?;
    assert_eq!(
        fs::read(repository.root().join("foreign-hook-proof"))?,
        b"foreign hook ran"
    );
    Ok(())
}

#[test]
fn symlinked_configuration_refuses_before_managed_writes() -> Result<()> {
    let repository = Repository::new()?;
    let outside = tempfile::tempdir()?;
    let foreign = outside.path().join("owner.json");
    fs::write(&foreign, b"owner content")?;
    fs::create_dir(repository.root().join(".orly"))?;
    crate::support::platform::symlink_file(&foreign, repository.root().join(CONFIG_PATH))?;
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let binary = Path::new(env!("CARGO_BIN_EXE_orly"));
    for dry_run in [true, false] {
        assert!(
            Installer::new(repository.root())?
                .install(&config, binary, false, false, dry_run)
                .is_err()
        );
        assert_eq!(fs::read(&foreign)?, b"owner content");
        assert!(!repository.root().join(ORLY_AGENTS_FILENAME).exists());
    }
    Ok(())
}

#[test]
fn doctor_preserves_completed_specs_across_versions_and_reports_current_callers() -> Result<()> {
    let repository = Repository::new()?;
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    repository.write(CONFIG_PATH, &serde_json::to_vec(&config)?)?;
    let stale = b"Run `cat .oracle/orly.json`.\n";
    for path in [
        "docs/v1/done/old.md",
        "docs/v2/done/old.md",
        "docs/v12/done/nested/old.md",
        "docs/v2/active/current.md",
        "docs/v2/pending/current.md",
        "docs/v2/done-copy/current.md",
        "docs/v2/active/done/current.md",
    ] {
        repository.write(path, stale)?;
    }
    repository.stage("docs")?;
    let findings = Installer::new(repository.root())?.doctor()?;
    assert_eq!(findings.len(), 4, "{findings:?}");
    for path in [
        "docs/v2/active/current.md",
        "docs/v2/pending/current.md",
        "docs/v2/done-copy/current.md",
        "docs/v2/active/done/current.md",
    ] {
        assert!(findings.iter().any(|finding| finding.starts_with(path)));
    }
    assert_eq!(
        fs::read(repository.root().join("docs/v12/done/nested/old.md"))?,
        stale
    );
    Ok(())
}

#[test]
fn doctor_resolves_nested_managed_links_without_matching_unrelated_paths() -> Result<()> {
    let repository = Repository::new()?;
    let config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    repository.write(CONFIG_PATH, &serde_json::to_vec(&config)?)?;
    repository.write(
        "dispatch/guide.md",
        b"[Managed](../docs/ORLY_ARCHITECTURE.md)\n[Unrelated](docs/ORLY_ARCHITECTURE.md)\n",
    )?;
    repository.stage("dispatch")?;
    let findings = Installer::new(repository.root())?.doctor()?;
    assert_eq!(findings.len(), 1, "{findings:?}");
    assert!(
        findings[0].starts_with("dispatch/guide.md:1 stale managed caller"),
        "{findings:?}"
    );
    assert_eq!(
        fs::read(repository.root().join("dispatch/guide.md"))?,
        b"[Managed](../docs/ORLY_ARCHITECTURE.md)\n[Unrelated](docs/ORLY_ARCHITECTURE.md)\n"
    );
    Ok(())
}
