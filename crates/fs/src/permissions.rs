use crate::Result;

pub fn normalize_mode(mode: u32) -> u32 {
    #[cfg(unix)]
    {
        mode
    }
    #[cfg(windows)]
    {
        if mode & WRITE_BITS == 0 {
            READONLY_MODE
        } else {
            REGULAR_MODE
        }
    }
}

pub fn mode(metadata: &std::fs::Metadata) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & PERMISSION_BITS
    }
    #[cfg(windows)]
    {
        if metadata.permissions().readonly() {
            READONLY_MODE
        } else {
            REGULAR_MODE
        }
    }
}

pub(crate) fn set(file: &cap_std::fs::File, mode: u32) -> Result<()> {
    let mut permissions = file.metadata()?.permissions();
    #[cfg(unix)]
    {
        use cap_std::fs::PermissionsExt;
        permissions.set_mode(mode);
    }
    #[cfg(windows)]
    permissions.set_readonly(mode & WRITE_BITS == 0);
    Ok(file.set_permissions(permissions)?)
}

#[cfg(unix)]
const PERMISSION_BITS: u32 = 0o777;
#[cfg(windows)]
const WRITE_BITS: u32 = 0o222;
#[cfg(windows)]
const READONLY_MODE: u32 = 0o444;
#[cfg(windows)]
const REGULAR_MODE: u32 = 0o644;
