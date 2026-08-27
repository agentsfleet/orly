// ERR-RS fail fixture: the lossy conversion wearing a conversion's clothes.
// The alias is present, so the only finding is the map_err that renders its own
// cause as text on the way into the error type — which compiles, reads fine,
// and silently defeats every source() chain walker downstream.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("[{code}] the store refused the write")]
    Store { code: u16, detail: String },
}

pub type Result<T, E = Error> = core::result::Result<T, E>;

pub fn write(bytes: &[u8]) -> Result<()> {
    store::put(bytes).map_err(|cause| Error::Store {
        code: 500,
        detail: cause.to_string(),
    })?;
    Ok(())
}
