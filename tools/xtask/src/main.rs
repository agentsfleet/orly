use orly_decision::Question;
mod error;
mod manifest;
mod manifest_model;
mod manifest_proofs;
#[cfg(test)]
mod manifest_tests;
use clap::{Parser, Subcommand};
use error::Result;
use orly::core::{
    config::Configuration, evidence::EvidencePacket, packs::DataPack, payload::NativeRegistry,
    plan::DecisionPlan,
};
use std::{fs, path::Path};

fn schemas() -> Result<()> {
    let schemas = [
        (
            "native-config.schema.json",
            schemars_schema::<Configuration>()?,
        ),
        (
            "native-registry.schema.json",
            schemars_schema::<NativeRegistry>()?,
        ),
        (
            "decision-plan.schema.json",
            schemars_schema::<DecisionPlan>()?,
        ),
        ("question.schema.json", schemars_schema::<Question>()?),
        ("pack.schema.json", schemars_schema::<DataPack>()?),
        (
            "gate-evidence.schema.json",
            schemars_schema::<EvidencePacket>()?,
        ),
        (
            "coverage-manifest.schema.json",
            schemars_schema::<orly::coverage::CoverageManifest>()?,
        ),
        (
            "delivery.schema.json",
            schemars_schema::<orly::rules::DeliveryRecord>()?,
        ),
    ];
    for (name, bytes) in schemas {
        fs::write(Path::new(SCHEMAS_DIRECTORY).join(name), bytes)?;
    }
    Ok(())
}
fn schemars_schema<T: schemars::JsonSchema>() -> Result<Vec<u8>> {
    Ok(serde_json::to_vec_pretty(&schemars::schema_for!(T))?)
}
#[derive(Parser)]
struct Cli {
    #[command(subcommand)]
    command: Task,
}
#[derive(Subcommand)]
enum Task {
    PortCheck {
        #[arg(long)]
        map: bool,
    },
    Schemas,
}
impl Cli {
    fn run(&self) -> Result<()> {
        match self.command {
            Task::PortCheck { .. } => {
                let report =
                    manifest_model::PortManifest::read(Path::new("."))?.check(Path::new("."))?;
                // logging: stdout reports the development command's inventory result.
                println!(
                    "port inventory: {} tracked paths; {} assigned obligations; 0 unassigned paths",
                    report.tracked_paths, report.obligations
                );
                // logging: stdout distinguishes proof references from implementation results.
                println!(
                    "proof references: {} native pairs; {} frozen comparison pairs (not implementation results)",
                    report.native_proofs, report.frozen_proofs
                );
                Ok(())
            }
            Task::Schemas => schemas(),
        }
    }
}
fn main() -> std::process::ExitCode {
    match Cli::parse().run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            // logging: stderr is the maintenance command's failure response before tracing starts.
            eprintln!("{e}");
            std::process::ExitCode::FAILURE
        }
    }
}
const SCHEMAS_DIRECTORY: &str = "schemas";
