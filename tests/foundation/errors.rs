use orly::{
    Error, Result,
    error::{INVALID_INPUT, IO_FAILURE, JSON_FAILURE, PATH_CONFLICT, STALE_IDENTITY},
};
use orly_fs::{filesystem::RepositoryFs, path::RelativePath};

#[test]
fn filesystem_errors_keep_native_details_across_the_application_boundary() -> Result<()> {
    let root = tempfile::tempdir()?;
    let filesystem = RepositoryFs::open(root.path())?;
    let native = filesystem
        .read(&RelativePath::new("missing.json")?, 16)
        .unwrap_err();
    let orly_fs::Error::Io(cause) = &native else {
        panic!("missing file must return a native filesystem error");
    };
    let expected = (cause.kind(), cause.raw_os_error());
    let error = Error::from(native);
    assert_eq!(error.code(), IO_FAILURE);
    let Error::Io(cause) = error else {
        panic!("application conversion must preserve the native error type");
    };
    assert_eq!((cause.kind(), cause.raw_os_error()), expected);
    Ok(())
}

#[test]
fn document_errors_keep_json_classification_and_source_position() {
    let input = "{\n  \"value\":\n}";
    let parse = || serde_json::from_str::<serde_json::Value>(input).unwrap_err();
    let expected = parse();
    let filesystem = Error::from(orly_fs::Error::Json(parse()));
    let decision = Error::from(orly_decision::Error::Json(parse()));
    for error in [filesystem, decision] {
        assert_eq!(error.code(), JSON_FAILURE);
        let Error::Json(cause) = error else {
            panic!("application conversion must preserve the JSON error type");
        };
        assert_eq!(cause.classify(), expected.classify());
        assert_eq!(
            (cause.line(), cause.column()),
            (expected.line(), expected.column())
        );
    }
}

#[test]
fn semantic_rejections_keep_their_categories_and_payloads_across_crates() {
    let reason = "refused fixture input";
    let path = std::path::PathBuf::from("owned/document.json");
    let errors = [
        (
            Error::from(orly_fs::Error::Invalid(reason.into())),
            INVALID_INPUT,
        ),
        (
            Error::from(orly_fs::Error::Conflict(path.clone())),
            PATH_CONFLICT,
        ),
        (Error::from(orly_fs::Error::Stale), STALE_IDENTITY),
        (
            Error::from(orly_decision::Error::Invalid(reason.into())),
            INVALID_INPUT,
        ),
        (Error::from(orly_decision::Error::Stale), STALE_IDENTITY),
    ];
    for (error, category) in errors {
        assert_eq!(error.code(), category);
        match error {
            Error::Invalid(actual) => assert_eq!(actual, reason),
            Error::Conflict(actual) => assert_eq!(actual, path),
            Error::Stale => {}
            _ => panic!("application conversion must preserve the semantic rejection"),
        }
    }
    let native = semver::Version::parse("invalid-version").unwrap_err();
    let expected = native.to_string();
    let error = Error::from(orly_decision::Error::Version(native));
    assert_eq!(error.code(), INVALID_INPUT);
    let Error::Version(cause) = error else {
        panic!("application conversion must preserve the version parsing error");
    };
    assert_eq!(cause.to_string(), expected);
}

#[test]
fn schema_rejections_keep_the_instance_path_and_native_cause() -> Result<()> {
    let schema =
        serde_json::json!({"type": "object", "properties": {"nested": {"type": "object"}}});
    let value = serde_json::json!({"nested": []});
    let native = jsonschema::validator_for(&schema)?
        .validate(&value)
        .unwrap_err();
    let error = Error::from(native);
    assert_eq!(error.code(), JSON_FAILURE);
    let Error::Schema(cause) = error else {
        panic!("schema rejection must preserve the native validation error");
    };
    assert_eq!(cause.instance_path().as_str(), "/nested");
    assert!(matches!(
        cause.kind(),
        jsonschema::error::ValidationErrorKind::Type { .. }
    ));
    Ok(())
}
