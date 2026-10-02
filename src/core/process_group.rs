use crate::{Error, Result};
use std::process::Command;
use tokio::process::Child;

pub(super) struct ProcessGroup {
    pub(super) child: Child,
    #[cfg(unix)]
    id: nix::unistd::Pid,
    #[cfg(windows)]
    job: subc_jobobject::JobObject,
}

impl ProcessGroup {
    pub(super) async fn spawn(command: Command) -> Result<Self> {
        let mut command = tokio::process::Command::from(command);
        command.kill_on_drop(true);
        #[cfg(unix)]
        command.process_group(0);
        #[cfg(windows)]
        let job = {
            subc_jobobject::suspend_on_create_async(&mut command);
            subc_jobobject::JobObject::new()?
        };
        let child = command.spawn()?;
        let id = child
            .id()
            .ok_or_else(|| Error::Invalid(CHILD_ID_ABSENT.into()))?;
        let group = Self {
            child,
            #[cfg(unix)]
            id: nix::unistd::Pid::from_raw(id as i32),
            #[cfg(windows)]
            job,
        };
        #[cfg(windows)]
        {
            let mut group = group;
            if let Err(error) = group
                .job
                .assign(&group.child)
                .and_then(|_| subc_jobobject::resume_main_thread(id))
            {
                let _ = group.child.kill().await;
                return Err(error.into());
            }
            Ok(group)
        }
        #[cfg(unix)]
        Ok(group)
    }

    pub(super) fn kill(&mut self) -> Result<()> {
        #[cfg(unix)]
        match nix::sys::signal::killpg(self.id, nix::sys::signal::Signal::SIGKILL) {
            Ok(()) | Err(nix::errno::Errno::ESRCH) => Ok(()),
            Err(error) => Err(error.into()),
        }
        #[cfg(windows)]
        {
            Ok(self.job.terminate()?)
        }
    }

    pub(super) fn has_descendants(&self) -> Result<bool> {
        #[cfg(unix)]
        match nix::sys::signal::killpg(self.id, None) {
            Ok(()) => Ok(true),
            Err(nix::errno::Errno::ESRCH) => Ok(false),
            Err(error) => Err(error.into()),
        }
        #[cfg(windows)]
        {
            Ok(self.job.process_count()? != 0)
        }
    }
}

impl Drop for ProcessGroup {
    fn drop(&mut self) {
        let _ = self.kill();
        let _ = self.child.start_kill();
    }
}

const CHILD_ID_ABSENT: &str = "child identifier absent after spawn";
