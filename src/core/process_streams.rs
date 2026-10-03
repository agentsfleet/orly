use crate::{Result, core::constants::MAX_OUTPUT_BYTES};
use std::time::Duration;
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::{ChildStderr, ChildStdout},
};

pub(crate) struct Stream {
    pub bytes: Vec<u8>,
    pub count: u64,
    pub truncated: bool,
}

struct Pipe<R> {
    reader: R,
    stream: Stream,
    complete: bool,
}

impl<R: AsyncRead + Unpin> Pipe<R> {
    fn new(reader: R) -> Result<Self> {
        Ok(Self {
            reader,
            stream: Stream {
                bytes: Vec::new(),
                count: 0,
                truncated: false,
            },
            complete: false,
        })
    }

    async fn pump(&mut self) -> Result<()> {
        if self.complete {
            return Ok(());
        }
        let mut buffer = [0; READ_BUFFER_BYTES];
        for _ in 0..READS_PER_POLL {
            match tokio::time::timeout(Duration::ZERO, self.reader.read(&mut buffer)).await {
                Ok(Ok(0)) => {
                    self.complete = true;
                    break;
                }
                Ok(Ok(count)) => {
                    self.stream.count += count as u64;
                    let keep = count.min(MAX_OUTPUT_BYTES.saturating_sub(self.stream.bytes.len()));
                    self.stream.bytes.extend_from_slice(&buffer[..keep]);
                    self.stream.truncated |= keep != count;
                }
                Err(_) => break,
                Ok(Err(error)) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Ok(Err(error)) => return Err(error.into()),
            }
        }
        Ok(())
    }

    fn finish(mut self) -> Stream {
        self.stream.truncated |= !self.complete;
        self.stream
    }
}

pub(super) struct OutputStreams {
    stdout: Pipe<ChildStdout>,
    stderr: Pipe<ChildStderr>,
}
impl OutputStreams {
    pub(super) fn new(stdout: ChildStdout, stderr: ChildStderr) -> Result<Self> {
        Ok(Self {
            stdout: Pipe::new(stdout)?,
            stderr: Pipe::new(stderr)?,
        })
    }

    pub(super) async fn pump(&mut self) -> Result<()> {
        self.stdout.pump().await?;
        self.stderr.pump().await
    }

    pub(super) fn complete(&self) -> bool {
        self.stdout.complete && self.stderr.complete
    }

    pub(super) fn overflowed(&self) -> bool {
        self.stdout.stream.truncated || self.stderr.stream.truncated
    }

    pub(super) fn finish(self) -> (Stream, Stream) {
        (self.stdout.finish(), self.stderr.finish())
    }
}

const READ_BUFFER_BYTES: usize = 8192;
const READS_PER_POLL: usize = 32;
