use crate::Result;
use crate::core::constants::UNIVERSAL_PACK;
use crate::core::{payload::Payload, render::Renderer};
use crate::install::Installer;
use clap::{Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "orly", version, about = "Native repository rules and evidence", color = clap::ColorChoice::Auto)]
pub struct Cli {
    #[arg(long, global = true, default_value = ".")]
    pub root: PathBuf,
    #[arg(long, global = true)]
    pub json: bool,
    #[command(subcommand)]
    pub command: CliCommand,
}

#[derive(Debug, Subcommand)]
pub enum CliCommand {
    Init {
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        no_hooks: bool,
        #[arg(long)]
        no_agent_hooks: bool,
        #[arg(long)]
        dry_run: bool,
    },
    Update {
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        no_hooks: bool,
        #[arg(long)]
        no_agent_hooks: bool,
        #[arg(long)]
        dry_run: bool,
    },
    Doctor,
    Render {
        #[arg(long)]
        pack: Vec<String>,
    },
    Verify,
    Plan {
        #[arg(long)]
        policy: Option<PathBuf>,
        #[arg(long)]
        decisions: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = Source::Index)]
        source: Source,
        #[arg(long)]
        base: Option<String>,
        #[arg(long)]
        head: Option<String>,
    },
    Run {
        #[arg(long)]
        policy: Option<PathBuf>,
        #[arg(long)]
        decisions: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = Source::Index)]
        source: Source,
        #[arg(long)]
        base: Option<String>,
        #[arg(long)]
        head: Option<String>,
    },
    Gate {
        #[arg(value_enum)]
        group: GateGroup,
    },
}

#[derive(Clone, Debug, ValueEnum)]
pub enum Source {
    Index,
    Head,
    Event,
    WorkingTree,
}
#[derive(Clone, Debug, ValueEnum)]
pub enum GateGroup {
    Work,
    Verify,
    Pr,
}

pub struct CliOutcome {
    pub document: serde_json::Value,
    pub exit_code: u8,
}

impl Cli {
    pub fn run(&self) -> Result<CliOutcome> {
        let event = RUN_STARTED;
        tracing::debug!(event, scope = CLI_SCOPE, "native command started");
        let outcome = self.dispatch();
        let event = if outcome.is_ok() {
            RUN_COMPLETED
        } else {
            RUN_FAILED
        };
        tracing::debug!(event, scope = CLI_SCOPE, "native command finished");
        outcome
    }
    fn dispatch(&self) -> Result<CliOutcome> {
        match &self.command {
            CliCommand::Init {
                config,
                no_hooks,
                no_agent_hooks,
                dry_run,
            }
            | CliCommand::Update {
                config,
                no_hooks,
                no_agent_hooks,
                dry_run,
            } => self.install(config.as_deref(), !no_hooks, !no_agent_hooks, *dry_run),
            CliCommand::Render { pack } => self.render(pack),
            CliCommand::Doctor => self.doctor(),
            CliCommand::Verify => self.verify(),
            CliCommand::Plan {
                policy,
                decisions,
                source,
                base,
                head,
            }
            | CliCommand::Run {
                policy,
                decisions,
                source,
                base,
                head,
            } => self.plan_or_run(
                policy.as_deref(),
                decisions.as_deref(),
                source,
                base.as_deref(),
                head.as_deref(),
                matches!(&self.command, CliCommand::Run { .. }),
            ),
            CliCommand::Gate { group } => {
                let source = if matches!(group, GateGroup::Work) {
                    Source::Index
                } else {
                    Source::Head
                };
                self.plan_or_run(None, None, &source, None, None, true)
            }
        }
    }
    fn install(
        &self,
        config: Option<&std::path::Path>,
        hooks: bool,
        loaders: bool,
        dry_run: bool,
    ) -> Result<CliOutcome> {
        let config = self.configuration(config, true)?;
        let binary = std::env::current_exe()?;
        let report =
            Installer::new(&self.root)?.install(&config, &binary, hooks, loaders, dry_run)?;
        Ok(CliOutcome {
            document: serde_json::to_value(report)?,
            exit_code: 0,
        })
    }
    fn render(&self, packs: &[String]) -> Result<CliOutcome> {
        let default = [UNIVERSAL_PACK.to_owned()];
        let selected = if packs.is_empty() { &default } else { packs };
        let payload = Payload::embedded()?;
        Ok(CliOutcome {
            document: serde_json::json!({"rules": Renderer::new(&payload).rules(selected)?,
                (PAYLOAD_DIGEST_KEY): payload.digest()}),
            exit_code: 0,
        })
    }
    fn doctor(&self) -> Result<CliOutcome> {
        let findings = Installer::new(&self.root)?.doctor()?;
        let exit_code = u8::from(!findings.is_empty());
        Ok(CliOutcome {
            document: serde_json::json!({"findings": findings}),
            exit_code,
        })
    }
    fn verify(&self) -> Result<CliOutcome> {
        let payload = Payload::embedded()?;
        self.configuration(None, false)?.validate()?;
        Ok(CliOutcome {
            document: serde_json::json!({"state": "passed",
            "reason": "payload_and_configuration_valid", (PAYLOAD_DIGEST_KEY): payload.digest()}),
            exit_code: 0,
        })
    }
}
const CLI_SCOPE: &str = "cli";
const RUN_STARTED: &str = "command_started";
const RUN_COMPLETED: &str = "command_completed";
const PAYLOAD_DIGEST_KEY: &str = "payload_digest";
const RUN_FAILED: &str = "command_failed";
