use orly_fs::{Error, Result, filesystem::RepositoryFs, path::RelativePath};

#[derive(Debug, thiserror::Error)]
enum CallerError {
    #[error(transparent)]
    Filesystem(#[from] Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("caller refused the document")]
    Refused,
}

#[test]
fn independent_writer_keeps_the_callers_error_and_prior_file() -> Result<()> {
    let root = tempfile::tempdir()?;
    let filesystem = RepositoryFs::open(root.path())?;
    let path = RelativePath::new("document.json")?;
    filesystem.write(&path, b"original", 0o600)?;
    let error = filesystem.atomic(&path)?.write_with(0o600, 16, |output| {
        output.write_all(b"partial")?;
        Err(CallerError::Refused)
    });
    assert!(matches!(error, Err(CallerError::Refused)));
    assert_eq!(filesystem.read(&path, 16)?, b"original");
    assert_eq!(std::fs::read_dir(root.path())?.count(), 1);
    Ok(())
}

#[test]
fn independent_file_operations_refuse_byte_overflow_and_traversal() -> Result<()> {
    let root = tempfile::tempdir()?;
    let filesystem = RepositoryFs::open(root.path())?;
    let path = RelativePath::new("nested/document.json")?;
    filesystem.atomic(&path)?.write_with(0o600, 4, |output| {
        Ok::<(), Error>(output.write_all(b"full")?)
    })?;
    assert!(matches!(filesystem.read(&path, 3), Err(Error::Invalid(_))));
    assert!(matches!(
        RelativePath::new("../escape"),
        Err(Error::Invalid(_))
    ));
    assert_eq!(filesystem.read(&path, 4)?, b"full");
    Ok(())
}
