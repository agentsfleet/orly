// ERR-RS fail fixture: a public crate error with no `pub type Result` beside
// it, so every fallible signature has to spell out which error it returns and a
// reader must check WHICH one to know it is this crate's.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub fn load(path: &str) -> core::result::Result<String, Error> {
    Ok(std::fs::read_to_string(path)?)
}
