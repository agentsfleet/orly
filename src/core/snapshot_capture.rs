use super::*;
use orly_fs::file_input::RegularInput;
use orly_fs::filesystem::RepositoryFs;

pub(super) struct SnapshotCapture<'a> {
    root: &'a Path,
    filesystem: RepositoryFs,
    source: &'a SourceKind,
    alternate_index: Option<&'a OsString>,
    files: BTreeMap<RelativePath, CapturedFile>,
    dependencies: Dependencies,
    total: usize,
}

impl<'a> SnapshotCapture<'a> {
    fn new(
        root: &'a Path,
        source: &'a SourceKind,
        alternate_index: Option<&'a OsString>,
    ) -> Result<Self> {
        Ok(Self {
            root,
            filesystem: RepositoryFs::open(root)?,
            source,
            alternate_index,
            files: BTreeMap::new(),
            dependencies: Dependencies::default(),
            total: 0,
        })
    }

    fn resolve_revisions(&self, base: &str) -> Result<(String, String)> {
        let (base, head) = if let SourceKind::Event { base, head } = self.source {
            if base.is_empty() || head.is_empty() {
                return Err(Error::Invalid(
                    "remote event requires explicit base and head identities".into(),
                ));
            }
            (base.as_str(), head.as_str())
        } else {
            (base, HEAD_REF)
        };
        Ok((
            git::Git::text(self.root, &[REV_PARSE, VERIFY_REVISION, base])?,
            git::Git::text(self.root, &[REV_PARSE, VERIFY_REVISION, head])?,
        ))
    }

    fn index_digest(&self) -> Result<String> {
        let path = if let Some(alternate) = self.alternate_index {
            PathBuf::from(alternate)
        } else {
            git::Git::state_path(self.root, "index")?
        };
        Ok(ContentDigest::file(&if path.is_absolute() {
            path
        } else {
            self.root.join(path)
        })?)
    }

    fn capture_tracked(&mut self, head: &str) -> Result<()> {
        let repository = git::ObjectStore::open(self.root)?;
        let entries = match self.source {
            SourceKind::Head {} | SourceKind::Event { .. } => repository.revision_entries(head)?,
            _ => {
                repository.index_entries(self.root, self.alternate_index.map(|s| s.as_os_str()))?
            }
        };
        for entry in entries {
            let file = if matches!(self.source, SourceKind::WorkingTree { .. }) {
                match self.working_file(&entry.path) {
                    Ok(file) => {
                        #[cfg(windows)]
                        let file = if file.mode != FileMode::Symlink {
                            CapturedFile::new(entry.mode, file.bytes)
                        } else {
                            file
                        };
                        file
                    }
                    Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                        continue;
                    }
                    Err(error) => return Err(error),
                }
            } else {
                CapturedFile::new(entry.mode, repository.blob(&entry)?)
            };
            self.record(entry.path, file)?;
        }
        Ok(())
    }

    fn capture_untracked(&mut self) -> Result<()> {
        if let SourceKind::WorkingTree { untracked } = self.source {
            for path in untracked {
                if self.files.contains_key(path) {
                    return Err(Error::Invalid(
                        "untracked selection names a tracked file".into(),
                    ));
                }
                let file = self.working_file(path)?;
                self.record(path.to_owned(), file)?;
            }
        }
        Ok(())
    }

    fn capture_dependencies(&mut self, paths: &BTreeSet<RelativePath>) -> Result<()> {
        for path in paths {
            if self.files.contains_key(path) {
                return Err(Error::Invalid(
                    "declared untracked dependency names a tracked input".into(),
                ));
            }
            let file = self.working_file(path)?;
            if file.mode == FileMode::Symlink {
                return Err(Error::Invalid(
                    "untracked dependency must be a regular file".into(),
                ));
            }
            self.dependencies
                .record(path.to_owned(), file.mode, file.digest())?;
            self.record(path.to_owned(), file)?;
        }
        Ok(())
    }

    fn record(&mut self, path: RelativePath, file: CapturedFile) -> Result<()> {
        let total = self.total + file.bytes.len();
        if total > MAX_SNAPSHOT_BYTES {
            return Err(Error::Invalid("snapshot exceeds byte budget".into()));
        }
        self.total = total;
        self.files.insert(path, file);
        Ok(())
    }

    fn working_file(&self, path: &RelativePath) -> Result<CapturedFile> {
        let (mode, bytes) = if self.filesystem.is_link(path)? {
            (
                FileMode::Symlink,
                self.filesystem
                    .read_link(path)?
                    .as_os_str()
                    .as_encoded_bytes()
                    .to_vec(),
            )
        } else {
            let file = self.filesystem.open_regular(path)?;
            let mode = if executable(path, &file.metadata()?) {
                FileMode::Executable
            } else {
                FileMode::Regular
            };
            let bytes = RegularInput::from_file(file, MAX_SOURCE_BYTES)?.read()?;
            (mode, bytes)
        };
        Ok(CapturedFile::new(mode, bytes))
    }

    fn validate_consistency(&self, head: &str, index_digest: Option<&str>) -> Result<()> {
        if let Some(expected) = index_digest
            && self.index_digest()? != expected
        {
            return Err(Error::Stale);
        }
        if !matches!(self.source, SourceKind::Event { .. })
            && git::Git::text(self.root, &[REV_PARSE, VERIFY_REVISION, HEAD_REF])? != head
        {
            return Err(Error::Stale);
        }
        Ok(())
    }

    fn manifest_digest(&self) -> Result<String> {
        Ok(ContentDigest::identity(
            &self
                .files
                .iter()
                .map(|(path, file)| (path, &file.mode, file.digest()))
                .collect::<Vec<_>>(),
        )?)
    }

    fn into_files(self) -> (BTreeMap<RelativePath, CapturedFile>, Dependencies) {
        (self.files, self.dependencies)
    }
}

fn executable(path: &RelativePath, metadata: &std::fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        let _ = path;
        orly_fs::permissions::mode(metadata) & 0o111 != 0
    }
    #[cfg(windows)]
    {
        let _ = metadata;
        std::path::Path::new(path.as_str())
            .extension()
            .is_some_and(|extension| {
                extension.eq_ignore_ascii_case("exe") || extension.eq_ignore_ascii_case("com")
            })
    }
}
const REV_PARSE: &str = "rev-parse";
const VERIFY_REVISION: &str = "--verify";

impl Snapshot {
    pub(super) fn capture(
        root: &Path,
        source: SourceKind,
        base: &str,
        config_digest: String,
        alternate_index: Option<OsString>,
    ) -> Result<Self> {
        Self::capture_observed(root, source, base, config_digest, alternate_index, |_| {
            Ok(())
        })
    }

    pub(super) fn capture_observed(
        root: &Path,
        source: SourceKind,
        base: &str,
        config_digest: String,
        alternate_index: Option<OsString>,
        mut observe: impl FnMut(CaptureBoundary) -> Result<()>,
    ) -> Result<Self> {
        let root = fs::canonicalize(root)?;
        let mut capture = SnapshotCapture::new(&root, &source, alternate_index.as_ref())?;
        let (base, head) = capture.resolve_revisions(base)?;
        let index_digest = matches!(
            source,
            SourceKind::Index {} | SourceKind::WorkingTree { .. }
        )
        .then(|| capture.index_digest())
        .transpose()?;
        observe(CaptureBoundary::IdentitiesResolved)?;
        capture.capture_tracked(&head)?;
        capture.capture_untracked()?;
        observe(CaptureBoundary::FilesRead)?;
        capture.validate_consistency(&head, index_digest.as_deref())?;
        let manifest_digest = capture.manifest_digest()?;
        let (files, dependencies) = capture.into_files();
        let source = if matches!(source, SourceKind::Event { .. }) {
            SourceKind::Event {
                base: base.to_owned(),
                head: head.to_owned(),
            }
        } else {
            source
        };
        Ok(Self {
            identity: SnapshotIdentity {
                source,
                base,
                head,
                manifest_digest,
                configuration_digest: config_digest,
                engine: ENGINE_VERSION.into(),
                dependencies,
            },
            root,
            alternate_index,
            index_digest,
            files,
        })
    }

    pub fn capture_dependencies(
        root: &Path,
        source: SourceKind,
        base: &str,
        config_digest: String,
        alternate_index: Option<OsString>,
        dependencies: &BTreeSet<RelativePath>,
    ) -> Result<Self> {
        Self::capture(root, source, base, config_digest, alternate_index)?
            .with_dependencies(dependencies)
    }

    pub(super) fn with_dependencies(
        mut self,
        dependencies: &BTreeSet<RelativePath>,
    ) -> Result<Self> {
        let mut capture = SnapshotCapture::new(
            &self.root,
            &self.identity.source,
            self.alternate_index.as_ref(),
        )?;
        capture.total = self.files.values().map(|file| file.bytes.len()).sum();
        capture.files = std::mem::take(&mut self.files);
        capture.dependencies = std::mem::take(&mut self.identity.dependencies);
        capture.capture_dependencies(dependencies)?;
        let manifest_digest = capture.manifest_digest()?;
        let (files, dependencies) = capture.into_files();
        self.files = files;
        self.identity.dependencies = dependencies;
        self.identity.manifest_digest = manifest_digest;
        Ok(self)
    }

    pub(super) fn current_index_digest(&self) -> Result<String> {
        SnapshotCapture::new(
            &self.root,
            &self.identity.source,
            self.alternate_index.as_ref(),
        )?
        .index_digest()
    }
}
