use crate::support::platform::{symlink_directory, symlink_file as symlink};
use orly::{Result, core::document::ObjectDocument};
use orly_fs::digest::ContentDigest;
use orly_fs::file_input::RegularInput;
use orly_fs::filesystem::{FileState, RepositoryFs};
use orly_fs::path::RelativePath;
use serde::Deserialize;
use std::{fs, io::Read};

#[derive(Deserialize, schemars::JsonSchema)]
struct Document {
    value: String,
}

#[test]
fn anchored_writes_stay_in_the_open_directory_after_an_ancestor_swap() -> Result<()> {
    let root = tempfile::tempdir()?;
    let outside = tempfile::tempdir()?;
    fs::create_dir(root.path().join("managed"))?;
    let filesystem = RepositoryFs::open(root.path())?;
    let path = RelativePath::new("managed/input")?;
    let write = filesystem.atomic(&path)?;
    fs::rename(root.path().join("managed"), root.path().join("original"))?;
    symlink_directory(outside.path(), root.path().join("managed"))?;
    write.write(b"owned", 0o640)?;
    assert_eq!(fs::read(root.path().join("original/input"))?, b"owned");
    assert!(!outside.path().join("input").exists());
    assert!(filesystem.read(&path, 16).is_err());
    assert!(filesystem.write(&path, b"refused", 0o600).is_err());
    assert!(filesystem.remove(&path).is_err());
    assert!(filesystem.link(&path, "target").is_err());
    assert!(filesystem.lock_file(&path).is_err());
    assert!(!outside.path().join("input").exists());
    Ok(())
}

#[test]
fn regular_inputs_refuse_directories_and_byte_overflow() -> Result<()> {
    let root = tempfile::tempdir()?;
    fs::write(root.path().join("input"), b"12345")?;
    assert!(RegularInput::open(&root.path().join("input"), 4).is_err());
    assert!(RegularInput::open(root.path(), 16).is_err());
    let input = RegularInput::open(&root.path().join("input"), 5)?;
    fs::write(root.path().join("input"), b"123456")?;
    assert!(input.read().is_err());
    assert_eq!(
        RegularInput::open(&root.path().join("input"), 6)?.read()?,
        b"123456"
    );
    Ok(())
}

#[cfg(unix)]
#[test]
fn fifo_inputs_and_locks_refuse_without_waiting_for_a_writer() -> Result<()> {
    let root = tempfile::tempdir()?;
    let path = root.path().join("pipe");
    nix::unistd::mkfifo(&path, nix::sys::stat::Mode::S_IRUSR)?;
    assert!(Document::read_json(&path).is_err());
    assert!(ContentDigest::file(&path).is_err());
    assert!(
        RepositoryFs::open(root.path())?
            .lock_file(&RelativePath::new("pipe")?)
            .is_err()
    );
    Ok(())
}

#[test]
fn atomic_copy_preserves_modes_and_refuses_changed_sources_and_links() -> Result<()> {
    let root = tempfile::tempdir()?;
    let source = tempfile::tempdir()?;
    let input = source.path().join("input");
    fs::write(&input, b"first")?;
    let digest = ContentDigest::file(&input)?;
    let filesystem = RepositoryFs::open(root.path())?;
    let path = RelativePath::new("binary")?;
    filesystem.atomic(&path)?.copy(&input, &digest, 0o755)?;
    assert_eq!(
        filesystem.inspect(&path, false)?,
        FileState::File {
            digest: digest.clone(),
            mode: orly_fs::permissions::normalize_mode(0o755)
        }
    );
    fs::write(&input, b"changed")?;
    assert!(
        filesystem
            .atomic(&path)?
            .copy(&input, &digest, 0o755)
            .is_err()
    );
    assert_eq!(fs::read(path.join(root.path()))?, b"first");
    symlink(&input, root.path().join("link"))?;
    assert!(
        filesystem
            .write(&RelativePath::new("link")?, b"refused", 0o600)
            .is_err()
    );
    assert_eq!(fs::read(&input)?, b"changed");
    Ok(())
}
impl ObjectDocument for Document {}

#[test]
fn document_inputs_refuse_symlink_leaves() -> Result<()> {
    let repository = tempfile::tempdir()?;
    let external = tempfile::tempdir()?;
    fs::write(
        external.path().join("input.json"),
        br#"{"value":"outside"}"#,
    )?;
    symlink(
        external.path().join("input.json"),
        repository.path().join("leaf.json"),
    )?;
    assert!(Document::read_json(&repository.path().join("leaf.json")).is_err());
    fs::write(
        repository.path().join("input.json"),
        br#"{"value":"inside"}"#,
    )?;
    assert_eq!(
        Document::read_json(&repository.path().join("input.json"))?.value,
        "inside"
    );
    Ok(())
}

struct InterruptedReader {
    interrupted: bool,
    bytes: std::io::Cursor<Vec<u8>>,
}

impl Read for InterruptedReader {
    fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
        if !std::mem::replace(&mut self.interrupted, true) {
            return Err(std::io::ErrorKind::Interrupted.into());
        }
        self.bytes.read(output)
    }
}

#[test]
fn streaming_digests_retry_interrupted_reads_and_preserve_identity() -> Result<()> {
    let source = b"immutable input";
    let reader = InterruptedReader {
        interrupted: false,
        bytes: std::io::Cursor::new(source.to_vec()),
    };
    assert_eq!(
        ContentDigest::reader(reader, source.len())?,
        ContentDigest::digest(source)
    );
    let object = std::collections::BTreeMap::from([("value", "escaped\nUnicode: 😀")]);
    assert_eq!(
        ContentDigest::identity(&object)?,
        ContentDigest::digest(&serde_json::to_vec(&object)?)
    );
    Ok(())
}

#[test]
fn streaming_digests_stop_after_the_first_byte_exceeding_the_budget() -> Result<()> {
    const INPUT_BYTES: usize = 131_072;
    let source = vec![0; INPUT_BYTES];
    let mut reader = std::io::Cursor::new(&source);
    assert!(ContentDigest::reader(&mut reader, 3).is_err());
    assert_eq!(reader.position(), 4);
    assert_eq!(
        ContentDigest::reader(std::io::empty(), 0)?,
        ContentDigest::digest(b"")
    );
    Ok(())
}

#[test]
fn atomic_json_writes_enforce_byte_limits_and_preserve_prior_content_on_failure() -> Result<()> {
    let root = tempfile::tempdir()?;
    let filesystem = RepositoryFs::open(root.path())?;
    let path = RelativePath::new("state.json")?;
    let object = std::collections::BTreeMap::from([("value", "Unicode: 😀")]);
    let expected = serde_json::to_vec(&object)?;
    let write = filesystem.atomic(&path)?;
    write.write_with(0o600, expected.len(), |output| {
        Ok::<(), orly::Error>(serde_json::to_writer(output, &object)?)
    })?;
    assert_eq!(filesystem.read(&path, expected.len())?, expected);
    let error = write
        .write_with(0o600, expected.len() - 1, |output| {
            Ok::<(), orly::Error>(serde_json::to_writer(output, &object)?)
        })
        .unwrap_err();
    assert!(matches!(error, orly::Error::Json(ref cause)
        if cause.io_error_kind() == Some(std::io::ErrorKind::InvalidData)));
    assert_eq!(filesystem.read(&path, expected.len())?, expected);
    let unsupported = std::collections::BTreeMap::from([((1, 2), "invalid key")]);
    assert!(matches!(
        write.write_with(0o600, expected.len(), |output| {
            Ok(serde_json::to_writer(output, &unsupported)?)
        }),
        Err(orly::Error::Json(_))
    ));
    assert_eq!(filesystem.read(&path, expected.len())?, expected);
    assert_eq!(fs::read_dir(root.path())?.count(), 1);
    Ok(())
}
