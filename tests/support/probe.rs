use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
};

pub fn executable() -> &'static Path {
    static BINARY: OnceLock<(tempfile::TempDir, PathBuf)> = OnceLock::new();
    &BINARY
        .get_or_init(|| {
            let directory = tempfile::tempdir().expect("create native command fixture directory");
            let path = directory
                .path()
                .join(format!("fixture-command{}", std::env::consts::EXE_SUFFIX));
            let source =
                Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/support/command_fixture.rs");
            let status = std::process::Command::new("rustc")
                .arg("--edition=2024")
                .arg(source)
                .arg("-o")
                .arg(&path)
                .status()
                .expect("run compiler for native command fixture");
            assert!(status.success(), "native command fixture must compile");
            (directory, path)
        })
        .1
}
