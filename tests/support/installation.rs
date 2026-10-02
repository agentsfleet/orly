use crate::support::Repository;
use orly::{Result, core::git::Git};
use std::{fs, path::Path};
impl Repository {
    pub fn allow_native_hooks(&self) -> Result<()> {
        Git::output(self.root(), &["config", "--unset", "core.hooksPath"])?;
        Ok(())
    }
    pub fn legacy(&self) -> Result<()> {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/layout-0.10");
        for name in [
            ".oracle/orly.json",
            ".githooks/pre-commit",
            ".githooks/pre-push",
            "AGENTS.md",
            "AGENTS.orly.md",
            "CLAUDE.md",
            "opencode.json",
        ] {
            self.write(name, &fs::read(fixture.join(name))?)?;
            if name.starts_with(".githooks/") {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(self.root().join(name), fs::Permissions::from_mode(0o755))?;
                }
            }
        }
        let config: serde_json::Value =
            serde_json::from_slice(&fs::read(fixture.join(".oracle/orly.json"))?)?;
        let managed: Vec<String> = serde_json::from_value(config["managed"].clone())?;
        for name in managed {
            if !name.starts_with(".githooks/") {
                self.write(&name, &fs::read(fixture.join(&name))?)?;
            }
        }
        Git::output(self.root(), &["config", "core.hooksPath", ".githooks"])?;
        Ok(())
    }

    pub fn migration_configuration(&self) -> Result<orly::core::config::Configuration> {
        let mut config = Self::configuration(Self::command(&["/usr/bin/true"]))?;
        let prior: serde_json::Value =
            serde_json::from_slice(&fs::read(self.root().join(".oracle/orly.json"))?)?;
        config.packs = serde_json::from_value(prior["packs"].clone())?;
        Ok(config)
    }
}
