use crate::support::Repository;
use orly::{
    Error, Result,
    core::{
        config::Configuration,
        constants::CONFIG_PATH,
        document::ObjectDocument,
        git::Git,
        storage::{DEFAULT_RELEASE_ROOT, ReleaseStorage},
    },
    install::Installer,
};
use orly_fs::path::RelativePath;
use std::{fs, path::Path};

struct SharedDocuments {
    repository: Repository,
    config: Configuration,
}

impl SharedDocuments {
    fn new(root: &str) -> Result<Self> {
        let repository = Repository::new()?;
        let mut config = Repository::configuration(Repository::command(&["git", "--version"]))?;
        config.releases = ReleaseStorage::new(RelativePath::new(root)?)?;
        Ok(Self { repository, config })
    }

    fn install(&self, dry_run: bool) -> Result<()> {
        Installer::new(self.repository.root())?.install(
            &self.config,
            Path::new(env!("CARGO_BIN_EXE_orly")),
            false,
            false,
            dry_run,
        )?;
        Ok(())
    }
}

#[test]
fn shared_release_storage_defaults_and_refuses_escape_or_private_overlap() -> Result<()> {
    let config = Repository::configuration(Repository::command(&["git", "--version"]))?;
    assert_eq!(config.releases.root().as_str(), DEFAULT_RELEASE_ROOT);
    let mut value = serde_json::to_value(config)?;
    value.as_object_mut().unwrap().remove("releases");
    assert_eq!(
        Configuration::from_json(&serde_json::to_vec(&value)?)?.releases,
        ReleaseStorage::default()
    );
    for path in [
        "../rels",
        "/rels",
        ".git/rels",
        ".orly",
        ".orly/bin/rels",
        ".ORLY/HOOKS",
    ] {
        value["releases"] = path.into();
        assert!(
            Configuration::from_json(&serde_json::to_vec(&value)?).is_err(),
            "{path}"
        );
    }
    Ok(())
}

#[test]
fn storage_install_preserves_documents_and_changing_root_does_not_move_them() -> Result<()> {
    let mut fixture = SharedDocuments::new(DEFAULT_RELEASE_ROOT)?;
    let source = format!("{DEFAULT_RELEASE_ROOT}/v1/active/current.md");
    fixture.repository.write(&source, b"owner-written spec\n")?;
    fixture
        .repository
        .write("docs/v1/done/old.md", b"completed history\n")?;
    fixture
        .repository
        .write(".gitignore", b".orly/bin/\n.orly/hooks/\n")?;
    fixture.install(false)?;
    let installed = fixture.repository.root().join(CONFIG_PATH);
    fixture.config = Configuration::read_json(&installed)?;
    assert_eq!(
        fixture.config.releases.root().as_str(),
        DEFAULT_RELEASE_ROOT
    );
    assert!(
        !fixture
            .config
            .managed
            .keys()
            .any(|path| path.as_str() == source)
    );
    fixture.repository.stage(&source)?;
    assert!(Git::text(fixture.repository.root(), &["ls-files", "--", &source])?.contains(&source));
    fixture.config.releases = ReleaseStorage::new(RelativePath::new("release-docs")?)?;
    fixture.install(false)?;
    assert_eq!(
        fs::read(fixture.repository.root().join(&source))?,
        b"owner-written spec\n"
    );
    assert_eq!(
        fs::read(fixture.repository.root().join("docs/v1/done/old.md"))?,
        b"completed history\n"
    );
    assert!(
        !fixture
            .repository
            .root()
            .join("release-docs/v1/active/current.md")
            .exists()
    );
    let updated = Configuration::read_json(&installed)?;
    assert_eq!(updated.releases.root().as_str(), "release-docs");
    Ok(())
}

#[test]
fn shared_storage_refuses_generated_destinations_before_installation() -> Result<()> {
    let fixture = SharedDocuments::new(".orly/docs")?;
    assert!(matches!(fixture.install(true), Err(Error::Invalid(_))));
    assert!(!fixture.repository.root().join(CONFIG_PATH).exists());
    assert!(!fixture.repository.root().join(".orly/docs").exists());
    let fixture = SharedDocuments::new("release-docs")?;
    fixture
        .repository
        .write("release-docs", b"file blocks directory")?;
    assert!(fixture.install(true).is_err());
    assert_eq!(
        fs::read(fixture.repository.root().join("release-docs"))?,
        b"file blocks directory"
    );
    assert!(!fixture.repository.root().join(CONFIG_PATH).exists());
    Ok(())
}

#[test]
fn shared_storage_refuses_prior_managed_documents_before_migration() -> Result<()> {
    let mut fixture = SharedDocuments::new("docs")?;
    fixture.repository.legacy()?;
    fixture.config.packs.push("domain.documentation".into());
    let path = "docs/DOCUMENTATION_RULES.md";
    let bytes = include_bytes!("../../docs/DOCUMENTATION_RULES.md");
    fixture.repository.write(path, bytes)?;
    let old_config = fixture.repository.root().join(".oracle/orly.json");
    let mut prior: serde_json::Value = serde_json::from_slice(&fs::read(&old_config)?)?;
    prior["digests"][path] = orly_fs::digest::ContentDigest::digest(bytes).into();
    let original = serde_json::to_vec(&prior)?;
    fs::write(&old_config, &original)?;
    for dry_run in [true, false] {
        assert!(matches!(
            fixture.install(dry_run),
            Err(Error::Invalid(reason)) if reason.contains("shared release storage")
        ));
        assert_eq!(fs::read(fixture.repository.root().join(path))?, bytes);
        assert_eq!(fs::read(&old_config)?, original);
        assert!(!fixture.repository.root().join(CONFIG_PATH).exists());
        assert!(!fixture.repository.root().join(".orly/docs").exists());
    }
    Ok(())
}

#[test]
fn shared_storage_refuses_resolved_private_git_directory_before_state_creation() -> Result<()> {
    let mut fixture = SharedDocuments::new("private-git")?;
    Git::output(
        fixture.repository.root(),
        &["init", "--quiet", "--separate-git-dir", "private-git"],
    )?;
    let private = fixture.repository.root().join("private-git");
    let head = fs::read(private.join("HEAD"))?;
    for root in ["private-git", "PRIVATE-GIT", "private-git/orly"] {
        fixture.config.releases = ReleaseStorage::new(RelativePath::new(root)?)?;
        for dry_run in [true, false] {
            assert!(matches!(
                fixture.install(dry_run),
                Err(Error::Invalid(reason)) if reason.contains("shared release storage")
            ));
            assert!(!private.join("orly").exists());
            assert!(!fixture.repository.root().join(CONFIG_PATH).exists());
            assert_eq!(fs::read(private.join("HEAD"))?, head);
        }
    }
    Ok(())
}

#[test]
fn doctor_preserves_configured_history_and_checks_current_shared_documents() -> Result<()> {
    let fixture = SharedDocuments::new("shared[docs]")?;
    fixture
        .repository
        .write(CONFIG_PATH, &serde_json::to_vec(&fixture.config)?)?;
    let stale = b"Read `.oracle/orly.json`.\n";
    for path in [
        "shared[docs]/v2/done/old.md",
        "shared[docs]/v2/active/current.md",
        "sharedd/v2/done/current.md",
    ] {
        fixture.repository.write(path, stale)?;
        fixture.repository.stage(path)?;
    }
    let findings = Installer::new(fixture.repository.root())?.doctor()?;
    assert_eq!(findings.len(), 2, "{findings:?}");
    assert!(
        findings
            .iter()
            .any(|row| row.starts_with("shared[docs]/v2/active/"))
    );
    assert!(
        findings
            .iter()
            .any(|row| row.starts_with("sharedd/v2/done/"))
    );
    assert_eq!(
        fs::read(
            fixture
                .repository
                .root()
                .join("shared[docs]/v2/done/old.md")
        )?,
        stale
    );
    Ok(())
}

#[test]
fn shared_storage_refuses_symlink_roots_and_preserves_external_documents() -> Result<()> {
    let fixture = SharedDocuments::new("shared")?;
    let outside = tempfile::tempdir()?;
    fs::write(outside.path().join("spec.md"), b"external content")?;
    crate::support::platform::symlink_directory(
        outside.path(),
        fixture.repository.root().join("shared"),
    )?;
    assert!(fixture.install(true).is_err());
    assert_eq!(
        fs::read(outside.path().join("spec.md"))?,
        b"external content"
    );
    assert_eq!(fs::read_dir(outside.path())?.count(), 1);
    assert!(!fixture.repository.root().join(CONFIG_PATH).exists());
    Ok(())
}
