use crate::support::Repository;
use orly::core::{config::Configuration, constants::*, document::ObjectDocument};
use orly::{
    Error, Result,
    core::{
        payload::Payload,
        render::{Profile, Renderer},
    },
};
use orly_fs::digest::ContentDigest;
use orly_fs::path::RelativePath;
use std::{collections::BTreeSet, fs, path::Path, process::Command};

const NATIVE_CONFIG: &[u8] = include_bytes!("../../fixtures/port/native-orly.json");

struct RelocatedBinary {
    directory: tempfile::TempDir,
}

impl RelocatedBinary {
    fn new() -> Result<Self> {
        let directory = tempfile::tempdir()?;
        fs::copy(
            env!("CARGO_BIN_EXE_orly"),
            directory.path().join(engine_name()),
        )?;
        let git = std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
            .map(|path| path.join(git_name()))
            .find(|path| path.is_file())
            .ok_or_else(|| Error::Invalid("Git is required by the binary fixture".into()))?;
        provide_git(&git.canonicalize()?, directory.path())?;
        Ok(Self { directory })
    }

    fn run(&self, root: &Path, args: &[&str], exit: i32) -> Result<serde_json::Value> {
        let output = self
            .command(root, &self.directory.path().join(engine_name()))
            .arg("--json")
            .args(args)
            .output()?;
        assert_eq!(output.status.code(), Some(exit), "{args:?}: {output:?}");
        Ok(serde_json::from_slice(&output.stdout)?)
    }

    fn command(&self, root: &Path, executable: &Path) -> Command {
        let mut command = Command::new(executable);
        command
            .current_dir(root)
            .env_clear()
            .env("PATH", self.directory.path());
        #[cfg(windows)]
        command.env(
            "SystemRoot",
            std::env::var_os("SystemRoot").unwrap_or_default(),
        );
        command
    }

    fn assert_no_interpreters(&self) -> Result<()> {
        let probe = self.directory.path().join(format!(
            "interpreter-search{}",
            std::env::consts::EXE_SUFFIX
        ));
        fs::copy(crate::support::probe::executable(), &probe)?;
        // Windows searches the parent's executable directory and environment as well as PATH.
        let output = self
            .command(self.directory.path(), &probe)
            .arg("interpreter-search")
            .output()?;
        assert!(output.status.success(), "{output:?}");
        fs::remove_file(probe)?;
        Ok(())
    }
}

fn engine_name() -> String {
    format!("orly{}", std::env::consts::EXE_SUFFIX)
}
fn git_name() -> String {
    format!("{GIT_COMMAND}{}", std::env::consts::EXE_SUFFIX)
}

fn provide_git(source: &Path, directory: &Path) -> Result<()> {
    #[cfg(unix)]
    crate::support::platform::symlink_file(source, directory.join(git_name()))?;
    #[cfg(windows)]
    {
        let installation = source
            .parent()
            .and_then(Path::parent)
            .ok_or_else(|| Error::Invalid("Git fixture has no installation root".into()))?;
        let native = installation.join("mingw64/bin/git.exe");
        let native = if native.is_file() {
            native.as_path()
        } else {
            source
        };
        fs::copy(native, directory.join(git_name()))?;
        for entry in fs::read_dir(native.parent().unwrap())? {
            let entry = entry?;
            if entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "dll")
            {
                fs::copy(entry.path(), directory.join(entry.file_name()))?;
            }
        }
    }
    Ok(())
}

#[test]
fn test_foundation_binary_works_without_interpreters() -> Result<()> {
    let repository = Repository::new()?;
    let binary = RelocatedBinary::new()?;
    binary.assert_no_interpreters()?;
    repository.write(CONFIG_PATH, NATIVE_CONFIG)?;
    let root = repository.root();
    let rendered = binary.run(root, &["render"], 0)?;
    assert!(
        rendered["rules"]
            .as_str()
            .unwrap()
            .starts_with(GENERATED_BANNER)
    );
    let validated = binary.run(root, &["verify"], 0)?;
    assert_eq!(validated["reason"], "payload_and_configuration_valid");
    assert_eq!(rendered["payload_digest"], validated["payload_digest"]);
    let args = ["init", "--no-hooks", "--no-agent-hooks", "--dry-run"];
    let planned = binary.run(root, &args, 0)?;
    assert_eq!(planned["dry_run"], true);
    assert!(planned["operations"].as_u64().unwrap() > 0);
    assert_eq!(fs::read(root.join(CONFIG_PATH))?, NATIVE_CONFIG);
    assert!(!root.join(ORLY_AGENTS_FILENAME).exists());
    assert!(!root.join(".git/orly").exists());
    let installed = binary.run(root, &args[..3], 0)?;
    assert_eq!(installed["dry_run"], false);
    assert_eq!(installed["operations"], planned["operations"]);
    let installed_rules = fs::read_to_string(root.join(ORLY_AGENTS_FILENAME))?;
    assert!(installed_rules.starts_with(GENERATED_BANNER));
    assert!(root.join(ENGINE_BINARY).is_file());
    let configuration = Configuration::read_json(&root.join(CONFIG_PATH))?;
    assert_eq!(
        configuration.managed[&RelativePath::new(ORLY_AGENTS_FILENAME)?],
        ContentDigest::digest(installed_rules.as_bytes())
    );
    let doctor = binary.run(root, &["doctor"], 0)?;
    assert_eq!(doctor["findings"], serde_json::json!([]));
    Ok(())
}

#[test]
fn relocated_binary_refuses_missing_git_without_installation_effects() -> Result<()> {
    let repository = Repository::new()?;
    let binary = RelocatedBinary::new()?;
    fs::remove_file(binary.directory.path().join(git_name()))?;
    repository.write(CONFIG_PATH, NATIVE_CONFIG)?;
    let root = repository.root();
    let refusal = binary.run(root, &["init", "--no-hooks", "--no-agent-hooks"], 2)?;
    assert_eq!(refusal["reason"], orly::error::IO_FAILURE);
    assert_eq!(fs::read(root.join(CONFIG_PATH))?, NATIVE_CONFIG);
    assert!(!root.join(ORLY_AGENTS_FILENAME).exists());
    assert!(!root.join(".git/orly").exists());
    assert_eq!(binary.run(root, &["verify"], 0)?["state"], "passed");
    Ok(())
}

#[test]
fn relocated_binary_refuses_invalid_configuration_and_reports_modified_rules() -> Result<()> {
    let repository = Repository::new()?;
    let binary = RelocatedBinary::new()?;
    let root = repository.root();
    let mut config = Configuration::from_json(NATIVE_CONFIG)?;
    config.commands.clear();
    let invalid = serde_json::to_vec(&config)?;
    repository.write(CONFIG_PATH, &invalid)?;
    for args in [
        vec!["verify"],
        vec!["init", "--no-hooks", "--no-agent-hooks"],
    ] {
        assert_eq!(
            binary.run(root, &args, 2)?["reason"],
            orly::error::INVALID_INPUT
        );
    }
    assert_eq!(fs::read(root.join(CONFIG_PATH))?, invalid);
    assert!(!root.join(ORLY_AGENTS_FILENAME).exists());
    repository.write(CONFIG_PATH, NATIVE_CONFIG)?;
    binary.run(root, &["init", "--no-hooks", "--no-agent-hooks"], 0)?;
    repository.write(ORLY_AGENTS_FILENAME, b"owner changed the rules")?;
    let findings = binary.run(root, &["doctor"], 1)?;
    assert!(
        findings["findings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|finding| { finding.as_str().unwrap().starts_with(ORLY_AGENTS_FILENAME) })
    );
    assert_eq!(
        fs::read(root.join(ORLY_AGENTS_FILENAME))?,
        b"owner changed the rules"
    );
    Ok(())
}

#[test]
fn embedded_payload_is_self_contained_and_private_notes_are_absent() -> Result<()> {
    let payload = Payload::embedded()?;
    payload.validate()?;
    assert!(!payload.files().contains_key("SOUL.md"));
    assert!(!payload.files().contains_key("SOUL_LOG.md"));
    assert!(!payload.registry()?.packs.contains_key("persona.indy"));
    let embedded_core = std::str::from_utf8(payload.file("core/operating-model.md")?).unwrap();
    assert!(!embedded_core.contains("The human is Kishore"));
    assert!(!embedded_core.contains("persona.indy"));
    let rules = Renderer::new(&payload).rules(&["universal.authoring".into()])?;
    assert!(rules.starts_with("> **Generated by `orly`.**"));
    assert!(!rules.contains("SOUL.md — Aiwa's working notes"));
    assert!(!rules.contains("The human is Kishore"));
    assert!(matches!(
        Renderer::new(&payload).rules(&["unknown.pack".into()]),
        Err(Error::Invalid(_))
    ));
    Ok(())
}

#[test]
fn malformed_rule_text_preserves_the_decoding_cause() -> Result<()> {
    let payload = Payload::embedded()?;
    let mut files = payload.files().clone();
    files.insert("core/operating-model.md".into(), vec![0xff]);
    let document = serde_json::json!({"digest": ContentDigest::identity(&files)?, "files": files});
    let error = Payload::from_json(&serde_json::to_vec(&document)?).expect_err("invalid rule text");
    let cause = std::error::Error::source(&error).expect("decoding cause survives");
    assert!(cause.downcast_ref::<std::str::Utf8Error>().is_some());
    assert_ne!(error.to_string(), cause.to_string());
    Ok(())
}

#[test]
fn markdown_pack_markers_preserve_fences_and_reject_invalid_structure() -> Result<()> {
    let known = BTreeSet::from(["language.rust".into(), "language.go".into()]);
    let selected = BTreeSet::from(["language.rust".into()]);
    let content = "before\n\n<!-- oracle-packs:start language.go -->\n\nhidden\n\n<!-- oracle-packs:end -->\n\n```md\n<!-- oracle-packs:start language.go -->\n```\n\nafter";
    let rendered = Profile::new(content, &selected, &known).render()?;
    assert!(!rendered.contains("hidden"));
    assert!(rendered.contains("```md\n<!-- oracle-packs:start language.go -->\n```"));
    assert!(rendered.contains("before") && rendered.contains("after"));
    for invalid in [
        "<!-- oracle-packs:end -->",
        "<!-- oracle-packs:start unknown.pack -->",
        "<!-- oracle-packs:start language.go -->",
    ] {
        assert!(matches!(
            Profile::new(invalid, &selected, &known).render(),
            Err(Error::Invalid(_))
        ));
    }
    Ok(())
}
