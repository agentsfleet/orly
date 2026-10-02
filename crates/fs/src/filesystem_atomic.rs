use super::{PRIVATE_MODE, parent::Parent};
use crate::{
    Error, Result, constants::MAX_BINARY_BYTES, digest::ContentDigest, file_input::RegularInput,
};
use std::{
    io::{self, BufWriter, Read, Seek, Write},
    path::Path,
};

pub struct AtomicFile {
    parent: Parent,
}

impl AtomicFile {
    pub(super) fn new(parent: Parent) -> Self {
        Self { parent }
    }

    pub fn write(&self, bytes: &[u8], mode: u32) -> Result<()> {
        self.write_with(mode, bytes.len(), |output| Ok(output.write_all(bytes)?))
    }

    pub fn write_with<E: From<Error> + From<io::Error>>(
        &self,
        mode: u32,
        budget: usize,
        write: impl FnOnce(&mut dyn Write) -> Result<(), E>,
    ) -> Result<(), E> {
        let mut temp = self.temporary()?;
        {
            let mut output = ByteBudget {
                inner: BufWriter::new(&mut temp),
                remaining: budget,
            };
            write(&mut output)?;
            output.flush()?;
        }
        Ok(self.commit(temp, mode)?)
    }

    pub fn copy(&self, source: &Path, expected: &str, mode: u32) -> Result<()> {
        let input = RegularInput::open(source, MAX_BINARY_BYTES)?;
        let mut temp = self.temporary()?;
        let count = std::io::copy(
            &mut input.into_file().take(MAX_BINARY_BYTES as u64 + 1),
            &mut temp,
        )?;
        if count > MAX_BINARY_BYTES as u64 {
            return Err(Error::Stale);
        }
        temp.rewind()?;
        if ContentDigest::reader(&mut temp, MAX_BINARY_BYTES)? != expected {
            return Err(Error::Stale);
        }
        self.commit(temp, mode)
    }

    fn temporary(&self) -> Result<cap_tempfile::TempFile<'_>> {
        let temp = cap_tempfile::TempFile::new(&self.parent.directory)?;
        crate::permissions::set(temp.as_file(), PRIVATE_MODE)?;
        Ok(temp)
    }

    fn commit(&self, temp: cap_tempfile::TempFile<'_>, mode: u32) -> Result<()> {
        match self.parent.directory.symlink_metadata(&self.parent.name) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(Error::Invalid(SYMLINK_DESTINATION.into()));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        crate::permissions::set(temp.as_file(), mode)?;
        temp.as_file().sync_all()?;
        temp.replace(&self.parent.name)?;
        self.parent.sync()
    }
}

struct ByteBudget<W> {
    inner: W,
    remaining: usize,
}

impl<W: Write> Write for ByteBudget<W> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.remaining {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                OUTPUT_BUDGET_EXCEEDED,
            ));
        }
        let written = self.inner.write(bytes)?;
        self.remaining -= written;
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}
const SYMLINK_DESTINATION: &str = "write destination is a symlink";
const OUTPUT_BUDGET_EXCEEDED: &str = "output exceeds byte budget";
