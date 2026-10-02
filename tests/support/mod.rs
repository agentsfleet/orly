use orly::{
    Result,
    core::{
        config::{CONFORM_ID, CommandSpec, Configuration, VERIFY_UNIT_ID},
        constants::*,
        git::Git,
    },
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};
pub mod platform;
pub(crate) mod probe;

pub struct Repository {
    directory: tempfile::TempDir,
}
impl Repository {
    pub fn new() -> Result<Self> {
        let repository = Self::unborn()?;
        repository.write("source.txt", b"committed\n")?;
        repository.commit()?;
        Ok(repository)
    }
    pub fn unborn() -> Result<Self> {
        let directory = tempfile::tempdir()?;
        Git::output(directory.path(), &["init", "--quiet"])?;
        Git::output(directory.path(), &["config", "user.name", "Fixture Owner"])?;
        Git::output(
            directory.path(),
            &["config", "user.email", "fixture@example.invalid"],
        )?;
        Git::output(
            directory.path(),
            &["config", "core.hooksPath", ".fixture-hooks"],
        )?;
        Ok(Self { directory })
    }
    pub fn root(&self) -> &Path {
        self.directory.path()
    }
    pub fn write(&self, path: &str, bytes: &[u8]) -> Result<()> {
        let target = self.root().join(path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(target, bytes)?;
        Ok(())
    }
    pub fn stage(&self, path: &str) -> Result<()> {
        Git::output(self.root(), &["add", "--", path])?;
        Ok(())
    }
    pub fn commit(&self) -> Result<()> {
        Git::output(self.root(), &["add", "--all"])?;
        // The fixture uses the machine's signing policy and never disables hooks or signing.
        Git::output(
            self.root(),
            &["commit", "--quiet", "-m", "test: record captured source"],
        )?;
        Ok(())
    }
    pub fn configuration(command: CommandSpec) -> Result<Configuration> {
        let allowed_executables = BTreeSet::from([command.argv[0].to_owned()]);
        Configuration::new(
            BTreeMap::from([
                (CONFORM_ID.into(), command.to_owned()),
                (VERIFY_UNIT_ID.into(), command),
            ]),
            allowed_executables,
        )
    }
    pub fn command(argv: &[&str]) -> CommandSpec {
        let operation = match argv[0] {
            "/usr/bin/true" => Some("success"),
            "/usr/bin/false" => Some("failure"),
            "/bin/cat" => Some("cat"),
            "/bin/sleep" => Some("sleep"),
            "/usr/bin/yes" => Some("yes"),
            _ => None,
        };
        let args = if let Some(operation) = operation {
            std::iter::once(
                probe::executable()
                    .to_str()
                    .expect("fixture path is Unicode")
                    .into(),
            )
            .chain(std::iter::once(operation.into()))
            .chain(argv[1..].iter().map(|value| (*value).into()))
            .collect()
        } else {
            argv.iter().map(|s| (*s).into()).collect()
        };
        CommandSpec {
            argv: args,
            cwd: None,
            env_keys: BTreeSet::new(),
            inputs: BTreeSet::new(),
            outputs: BTreeSet::new(),
            resources: BTreeSet::new(),
            deadline_seconds: DEFAULT_DEADLINE_SECONDS,
        }
    }
}
