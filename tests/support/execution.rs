use crate::support::Repository;
use orly::{
    Result,
    core::{
        config::CommandSpec,
        execution::EvaluationContext,
        snapshot::{GitSnapshotSource, SourceKind},
    },
};
use orly_fs::digest::ContentDigest;
impl Repository {
    pub fn context(&self, command: CommandSpec) -> Result<EvaluationContext> {
        let config = Self::configuration(command)?;
        let snapshot = GitSnapshotSource::new(self.root(), SourceKind::Index {}, "HEAD", None)
            .capture(config.digest()?)?;
        EvaluationContext::new(snapshot, config)
    }
    pub fn probe(&self) -> Result<std::path::PathBuf> {
        Ok(crate::support::probe::executable().to_owned())
    }
}

pub struct CountingRunner {
    pub calls: std::sync::Mutex<std::collections::BTreeMap<String, usize>>,
    pub peak: std::sync::atomic::AtomicUsize,
    active: std::sync::atomic::AtomicUsize,
    arrived: std::sync::Mutex<usize>,
    release: std::sync::Condvar,
    width: usize,
}

impl CountingRunner {
    pub fn new(width: usize) -> Self {
        Self {
            calls: std::sync::Mutex::default(),
            peak: 0.into(),
            active: 0.into(),
            arrived: std::sync::Mutex::default(),
            release: std::sync::Condvar::new(),
            width,
        }
    }
    fn rendezvous(&self) {
        if self.width <= 1 {
            return;
        }
        let mut arrived = self.arrived.lock().unwrap();
        *arrived += 1;
        let target = (*arrived).div_ceil(self.width) * self.width;
        self.release.notify_all();
        let (_arrivals, timeout) = self
            .release
            .wait_timeout_while(arrived, std::time::Duration::from_secs(5), |count| {
                *count < target
            })
            .unwrap();
        assert!(
            !timeout.timed_out(),
            "scheduler must admit a full batch without serializing its runner"
        );
    }
}

impl orly::core::runner::CommandRunner for CountingRunner {
    fn run(
        &self,
        context: &EvaluationContext,
        spec: &CommandSpec,
    ) -> Result<orly::core::runner::Execution> {
        use orly::core::evidence::{CommandInvocation, CriterionResult, OperationalMetadata};
        use std::sync::atomic::Ordering::SeqCst;
        let active = self.active.fetch_add(1, SeqCst) + 1;
        self.peak.fetch_max(active, SeqCst);
        self.rendezvous();
        let command_digest = ContentDigest::identity(spec)?;
        *self
            .calls
            .lock()
            .unwrap()
            .entry(command_digest.to_owned())
            .or_default() += 1;
        self.active.fetch_sub(1, SeqCst);
        let failed = spec.argv.last().is_some_and(|arg| arg == "fail");
        let result = if failed {
            CriterionResult::failed("fixture_failure")
        } else {
            CriterionResult::passed("fixture_completed")
        };
        Ok(orly::core::runner::Execution {
            invocation: CommandInvocation {
                identity: command_digest.to_owned(),
                command_digest: command_digest.to_owned(),
                snapshot_digest: context.snapshot.digest()?,
                config_digest: context.configuration.digest()?,
                result,
                exit_code: Some(i32::from(failed)),
                signal: None,
                stdout_bytes: 0,
                stderr_bytes: 0,
                output_complete: true,
            },
            operational: OperationalMetadata {
                invocation_id: command_digest,
                duration_millis: 0,
            },
            stdout: Vec::new(),
            stderr: Vec::new(),
        })
    }
}
