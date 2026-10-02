use crate::{Error, Result};
use digest_io::IoWrapper;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    io::{BufWriter, Read, Write},
    path::Path,
};

pub struct ContentDigest;
impl ContentDigest {
    pub fn digest(bytes: &[u8]) -> String {
        Self::format(Sha256::digest(bytes))
    }

    pub fn identity<T: Serialize>(value: &T) -> Result<String> {
        let mut hash = IoWrapper(Sha256::new());
        {
            let mut output = BufWriter::new(&mut hash);
            serde_json::to_writer(&mut output, value)?;
            output.flush()?;
        }
        Ok(Self::format(hash.0.finalize()))
    }
    pub fn file(path: &Path) -> Result<String> {
        let input =
            super::file_input::RegularInput::open(path, super::constants::MAX_BINARY_BYTES)?;
        Self::reader(input.into_file(), super::constants::MAX_BINARY_BYTES)
    }

    pub fn reader(file: impl Read, budget: usize) -> Result<String> {
        let mut hash = IoWrapper(Sha256::new());
        let count = std::io::copy(&mut file.take((budget as u64).saturating_add(1)), &mut hash)?;
        if count > budget as u64 {
            return Err(Error::Invalid("digest input exceeds byte budget".into()));
        }
        Ok(Self::format(hash.0.finalize()))
    }

    fn format(hash: sha2::digest::Output<Sha256>) -> String {
        format!("{}:{}", super::constants::HASH_ALGORITHM, hex::encode(hash))
    }
}
