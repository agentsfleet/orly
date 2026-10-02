use super::{
    config::CommandSpec,
    evidence::{CommandInvocation, CriterionResult, OperationalMetadata},
    execution::EvaluationContext,
};
use crate::Result;
use orly_fs::digest::ContentDigest;
use std::{
    process::{Command, Stdio},
    time::Instant,
};

const COMMAND_COMPLETED: &str = "command_completed";
const COMMAND_NOT_FOUND: &str = "command_not_found";
const COMMAND_SOURCE_MUTATION: &str = "command_source_mutation";

pub struct Execution {
    pub invocation: CommandInvocation,
    pub operational: OperationalMetadata,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

impl NativeRunner {
    pub fn run(&self, context: &EvaluationContext, spec: &CommandSpec) -> Result<Execution> {
        spec.validate(&context.configuration.allowed_executables)?;
        let scratch = context.materialize(spec)?;
        let snapshot_digest = context.snapshot.digest()?;
        let config_digest = context.configuration.digest()?;
        let command_digest = ContentDigest::identity(spec)?;
        let invocation_id =
            ContentDigest::identity(&(&snapshot_digest, &config_digest, &command_digest))?;
        let started = Instant::now();
        let command = Self::command(context, spec, scratch.root());
        let execution =
            match super::process::NativeProcess::run(command, started, spec.deadline_seconds) {
                Ok(execution) => execution,
                Err(crate::Error::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => {
                    return missing_execution(
                        invocation_id,
                        command_digest,
                        snapshot_digest,
                        config_digest,
                    );
                }
                Err(e) => return Err(e),
            };
        let current = context
            .validate_current()
            .and_then(|_| scratch.validate_sources());
        let result = if current.is_err() {
            CriterionResult::failed(COMMAND_SOURCE_MUTATION)
        } else if let Some(reason) = execution.failure {
            CriterionResult::failed(reason)
        } else {
            CriterionResult::passed(COMMAND_COMPLETED)
        };
        Ok(Execution {
            invocation: CommandInvocation {
                identity: invocation_id.clone(),
                command_digest,
                snapshot_digest,
                config_digest,
                result,
                exit_code: execution.status.code(),
                signal: super::process::signal(execution.status),
                stdout_bytes: execution.stdout.count,
                stderr_bytes: execution.stderr.count,
                output_complete: !execution.stdout.truncated && !execution.stderr.truncated,
            },
            operational: OperationalMetadata {
                invocation_id,
                duration_millis: started.elapsed().as_millis() as u64,
            },
            stdout: execution.stdout.bytes,
            stderr: execution.stderr.bytes,
        })
    }

    fn command(context: &EvaluationContext, spec: &CommandSpec, root: &std::path::Path) -> Command {
        let mut command = Command::new(&spec.argv[0]);
        command
            .args(&spec.argv[1..])
            .env_clear()
            .current_dir(
                spec.cwd
                    .as_ref()
                    .map_or_else(|| root.to_owned(), |p| p.join(root)),
            )
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for key in &spec.env_keys {
            if let Some(value) = context.environment.get(key) {
                command.env(key, &*value);
            }
        }
        command
    }
}

fn missing_execution(
    identity: String,
    command_digest: String,
    snapshot_digest: String,
    config_digest: String,
) -> Result<Execution> {
    Ok(Execution {
        invocation: CommandInvocation {
            identity: identity.clone(),
            command_digest,
            snapshot_digest,
            config_digest,
            result: CriterionResult::failed(COMMAND_NOT_FOUND),
            exit_code: None,
            signal: None,
            stdout_bytes: 0,
            stderr_bytes: 0,
            output_complete: true,
        },
        operational: OperationalMetadata {
            invocation_id: identity,
            duration_millis: 0,
        },
        stdout: Vec::new(),
        stderr: Vec::new(),
    })
}

pub trait CommandRunner: Send + Sync {
    fn run(&self, context: &EvaluationContext, spec: &CommandSpec) -> Result<Execution>;
}
pub struct NativeRunner;
impl CommandRunner for NativeRunner {
    fn run(&self, context: &EvaluationContext, spec: &CommandSpec) -> Result<Execution> {
        Self::run(self, context, spec)
    }
}
