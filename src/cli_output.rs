use crate::Result;
use crate::core::constants::{PRE_COMMIT, PRE_PUSH};
use crate::core::{env::ProcessEnv, logging::Logging};
use clap::Parser;
use std::{
    io::{IsTerminal, Write},
    path::{Path, PathBuf},
};

use crate::cli::{Cli, CliCommand, CliOutcome, GateGroup};
impl Cli {
    pub fn write(
        &self,
        outcome: &CliOutcome,
        writer: &mut impl Write,
        terminal: bool,
    ) -> Result<()> {
        if self.json {
            serde_json::to_writer(&mut *writer, &outcome.document)?;
            writeln!(writer)?;
            return Ok(());
        }
        let style = if outcome.exit_code == 0 {
            anstyle::Style::new().fg_color(Some(anstyle::AnsiColor::Green.into()))
        } else {
            anstyle::Style::new().fg_color(Some(anstyle::AnsiColor::Red.into()))
        };
        if terminal {
            write!(writer, "{style}")?;
        }
        let document = serde_json::to_string_pretty(&outcome.document)?;
        writeln!(writer, "{document}")?;
        if terminal {
            let reset = style.render_reset();
            write!(writer, "{reset}")?;
        }
        Ok(())
    }
    pub fn main() -> u8 {
        let invoked = std::env::args_os()
            .next()
            .and_then(|p| Path::new(&p).file_name().map(|s| s.to_owned()));
        let cli = if invoked
            .as_deref()
            .is_some_and(|p| p == PRE_COMMIT || p == PRE_PUSH)
        {
            Self {
                root: PathBuf::from("."),
                json: false,
                command: CliCommand::Gate {
                    group: if invoked.as_deref() == Some(std::ffi::OsStr::new(PRE_COMMIT)) {
                        GateGroup::Work
                    } else {
                        GateGroup::Verify
                    },
                },
            }
        } else {
            Self::parse()
        };
        Logging::new(&ProcessEnv).install();
        match cli.run() {
            Ok(outcome) => match cli.write(
                &outcome,
                &mut std::io::stdout().lock(),
                std::io::stdout().is_terminal(),
            ) {
                Ok(()) => outcome.exit_code,
                Err(_) => 2,
            },
            Err(error) => {
                let event = RUN_FAILED;
                let error_code = error.code();
                crate::core::logging::Logging::error(
                    CLI_SCOPE,
                    event,
                    error_code,
                    "native command refused",
                );
                let outcome = CliOutcome {
                    document: serde_json::json!({"state":"failed","reason":error_code}),
                    exit_code: 2,
                };
                let _ = cli.write(
                    &outcome,
                    &mut std::io::stdout().lock(),
                    std::io::stdout().is_terminal(),
                );
                2
            }
        }
    }
}
const CLI_SCOPE: &str = "cli";
const RUN_FAILED: &str = "command_failed";
