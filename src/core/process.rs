use crate::{Error, Result};
use std::{
    process::{Command, ExitStatus},
    time::{Duration, Instant},
};

#[path = "process_streams.rs"]
mod streams;
use streams::OutputStreams;
pub(super) use streams::Stream;
#[path = "process_group.rs"]
mod group;
use group::ProcessGroup;

pub(super) struct Supervised {
    pub stdout: Stream,
    pub stderr: Stream,
    pub status: ExitStatus,
    pub failure: Option<&'static str>,
}

pub(super) struct NativeProcess {
    group: ProcessGroup,
    streams: OutputStreams,
    started: Instant,
    deadline: Duration,
    status: Option<ExitStatus>,
    failure: Option<&'static str>,
    stopped: Option<Instant>,
    checked_descendants: bool,
}
impl NativeProcess {
    pub(super) fn run(command: Command, started: Instant, deadline: u64) -> Result<Supervised> {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?
            .block_on(async {
                let group = ProcessGroup::spawn(command).await?;
                Self::new(group, started, deadline)?.supervise().await
            })
    }

    fn new(mut group: ProcessGroup, started: Instant, deadline: u64) -> Result<Self> {
        let streams = OutputStreams::new(
            group
                .child
                .stdout
                .take()
                .ok_or_else(|| Error::Invalid(STDOUT_ABSENT.into()))?,
            group
                .child
                .stderr
                .take()
                .ok_or_else(|| Error::Invalid(STDERR_ABSENT.into()))?,
        )?;
        Ok(Self {
            group,
            streams,
            started,
            deadline: Duration::from_secs(deadline),
            status: None,
            failure: None,
            stopped: None,
            checked_descendants: false,
        })
    }

    async fn supervise(mut self) -> Result<Supervised> {
        let outcome = self.poll().await;
        let cleanup = self.group.kill();
        let reaped = self.group.child.wait().await;
        outcome?;
        cleanup?;
        reaped?;
        let status = self
            .status
            .ok_or_else(|| Error::Invalid(CHILD_STATUS_ABSENT.into()))?;
        if self.failure.is_none() && !status.success() {
            self.failure = Some(if signal(status).is_some() {
                COMMAND_SIGNAL
            } else {
                COMMAND_FAILED
            });
        }
        let (stdout, stderr) = self.streams.finish();
        Ok(Supervised {
            stdout,
            stderr,
            status,
            failure: self.failure,
        })
    }

    async fn poll(&mut self) -> Result<()> {
        loop {
            self.streams.pump().await?;
            if self.status.is_none() {
                self.status = self.group.child.try_wait()?;
            }
            self.check_limits().await?;
            self.check_descendants().await?;
            if self.status.is_some() && self.streams.complete() {
                break;
            }
            if self.stopped.is_some_and(|at| at.elapsed() >= DRAIN_GRACE) {
                break;
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
        Ok(())
    }

    async fn check_limits(&mut self) -> Result<()> {
        if self.streams.overflowed() {
            self.stop(COMMAND_OUTPUT_LIMIT).await?;
        } else if self.started.elapsed() >= self.deadline
            && (self.status.is_none() || !self.streams.complete())
            && self.failure != Some(COMMAND_OUTPUT_LIMIT)
        {
            self.stop(COMMAND_TIMEOUT).await?;
        }
        Ok(())
    }

    async fn check_descendants(&mut self) -> Result<()> {
        if self.status.is_some() && !self.checked_descendants {
            self.checked_descendants = true;
            if self.failure.is_none() && self.group.has_descendants()? {
                self.stop(COMMAND_DESCENDANT_LEAK).await?;
            }
        }
        Ok(())
    }

    async fn stop(&mut self, reason: &'static str) -> Result<()> {
        self.failure = Some(reason);
        if self.stopped.is_none() {
            self.group.kill()?;
            self.status = Some(self.group.child.wait().await?);
            self.stopped = Some(Instant::now());
        }
        Ok(())
    }
}

pub(super) fn signal(status: ExitStatus) -> Option<i32> {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        status.signal()
    }
    #[cfg(windows)]
    {
        let _ = status;
        None
    }
}

const POLL_INTERVAL: Duration = Duration::from_millis(5);
const DRAIN_GRACE: Duration = Duration::from_millis(100);
const COMMAND_FAILED: &str = "command_failed";
const COMMAND_TIMEOUT: &str = "command_timeout";
const COMMAND_OUTPUT_LIMIT: &str = "command_output_limit";
const COMMAND_SIGNAL: &str = "command_signal";
const COMMAND_DESCENDANT_LEAK: &str = "command_descendant_leak";
const STDOUT_ABSENT: &str = "stdout pipe absent";
const STDERR_ABSENT: &str = "stderr pipe absent";
const CHILD_STATUS_ABSENT: &str = "child status absent after supervision";
