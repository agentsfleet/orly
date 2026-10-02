use orly::Result;
use std::path::Path;

pub fn symlink_file(target: impl AsRef<Path>, link: impl AsRef<Path>) -> Result<()> {
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link)?;
    #[cfg(windows)]
    std::os::windows::fs::symlink_file(target, link)?;
    Ok(())
}

pub fn symlink_directory(target: impl AsRef<Path>, link: impl AsRef<Path>) -> Result<()> {
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link)?;
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(target, link)?;
    Ok(())
}
