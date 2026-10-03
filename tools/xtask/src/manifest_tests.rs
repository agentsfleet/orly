use crate::{
    error::Result,
    manifest_model::{Disposition, PortManifest},
    manifest_proofs::ProofBook,
};
use orly::core::document::ObjectDocument;
use orly_fs::path::RelativePath;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

struct InventoryFixture {
    root: PathBuf,
    manifest: PortManifest,
}
impl InventoryFixture {
    fn read() -> Result<Self> {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        Ok(Self {
            manifest: PortManifest::read(&root)?,
            root,
        })
    }
}

#[test]
fn test_port_inventory_has_no_unassigned_path() -> Result<()> {
    let fixture = InventoryFixture::read()?;
    let report = fixture.manifest.check(&fixture.root)?;
    assert_eq!(report.tracked_paths, fixture.manifest.entries.len());
    assert!(report.native_proofs > 0 && report.frozen_proofs > 0);
    let mut missing = fixture.manifest.clone();
    missing.entries.pop();
    assert!(missing.check(&fixture.root).is_err());
    let mut duplicate = fixture.manifest.clone();
    duplicate.entries.push(duplicate.entries[0].clone());
    assert!(duplicate.check(&fixture.root).is_err());
    let mut extra = fixture.manifest;
    extra.entries[0].path = RelativePath::new("untracked-entry")?;
    assert!(extra.check(&fixture.root).is_err());
    Ok(())
}

#[test]
fn inventory_refuses_unmapped_executables_and_unknown_proof_references() -> Result<()> {
    let fixture = InventoryFixture::read()?;
    let index = fixture
        .manifest
        .entries
        .iter()
        .position(|entry| !entry.obligations.is_empty())
        .unwrap();
    let mut missing = fixture.manifest.clone();
    missing.entries[index].obligations.clear();
    assert!(missing.check(&fixture.root).is_err());
    let mut unknown = fixture.manifest;
    unknown.entries[index].obligations[0].proof = "invented-proof".into();
    assert!(unknown.check(&fixture.root).is_err());
    Ok(())
}

#[test]
fn inventory_requires_replacement_proofs_and_refuses_executable_data() -> Result<()> {
    let fixture = InventoryFixture::read()?;
    fixture.manifest.check(&fixture.root)?;
    for path in [
        "bin/orly",
        "src/cli.ts",
        "Makefile",
        "package.json",
        ".github/workflows/release.yml",
    ] {
        let mut hidden = fixture.manifest.clone();
        let entry = hidden
            .entries
            .iter_mut()
            .find(|entry| entry.path.as_str() == path)
            .unwrap();
        entry.obligations.clear();
        if path == "bin/orly" {
            entry.disposition = Disposition::PreservedData;
        }
        assert!(
            hidden.check(&fixture.root).is_err(),
            "missing behavior proof: {path}"
        );
    }
    let mut redundant = serde_json::to_value(&fixture.manifest)?;
    redundant["entries"][0]["executable"] = false.into();
    assert!(PortManifest::from_json(&serde_json::to_vec(&redundant)?).is_err());
    Ok(())
}

#[test]
fn test_native_command_declarations_and_lane_ownership() -> Result<()> {
    let fixture = InventoryFixture::read()?;
    let config = orly::core::config::Configuration::read_json(
        &fixture.root.join("fixtures/port/native-orly.json"),
    )?;
    config.validate()?;
    assert_eq!(config.engine, orly::core::constants::ENGINE_VERSION);
    assert!(
        config
            .commands
            .values()
            .all(|command| command.argv[0] == "cargo")
    );
    let mut undeclared = config.clone();
    undeclared.allowed_executables.clear();
    assert!(undeclared.validate().is_err());
    let mut recursive = config;
    recursive.commands.get_mut("conform").unwrap().argv = vec!["orly".into()];
    recursive.allowed_executables.insert("orly".into());
    assert!(recursive.validate().is_err());
    for scopes in [
        ["src/judge", "src/judge"],
        ["src/judge", "src/judge/client.rs"],
        ["src", "src/judge"],
    ] {
        let mut overlap = fixture.manifest.clone();
        overlap.ownership = BTreeMap::from([
            ("first".into(), vec![RelativePath::new(scopes[0])?]),
            ("second".into(), vec![RelativePath::new(scopes[1])?]),
        ]);
        assert!(overlap.check(&fixture.root).is_err());
    }
    let mut adjacent = fixture.manifest;
    adjacent.ownership = BTreeMap::from([
        ("first".into(), vec![RelativePath::new("src/judge")?]),
        ("second".into(), vec![RelativePath::new("src/judge_extra")?]),
    ]);
    adjacent.check(&fixture.root)?;
    Ok(())
}

#[test]
fn proof_references_require_real_test_items_and_exact_comparison_bytes() -> Result<()> {
    let fixture = tempfile::tempdir()?;
    let reference = serde_json::json!({"kind":"native_test","path":"proof.rs","test":"real_test"});
    let bytes = serde_json::to_vec(
        &serde_json::json!({"proofs":{"case":{"positive":reference,"negative":reference}}}),
    )?;
    let book = ProofBook::from_json(&bytes)?;
    fs::write(
        fixture.path().join("proof.rs"),
        "#[test]\nfn real_test() {}\n",
    )?;
    book.check(fixture.path(), "unused")?;
    for source in [
        "// #[test]\n// fn real_test() {}\n",
        "fn real_test() {}\n",
        "#[test]\nfn another_test() {}\n",
        "invalid rust {",
    ] {
        fs::write(fixture.path().join("proof.rs"), source)?;
        assert!(book.check(fixture.path(), "unused").is_err());
    }
    let root = InventoryFixture::read()?;
    let invalid =
        serde_json::json!({"kind":"frozen_file","path":"src/cli.test.ts","digest":"wrong"});
    let bytes = serde_json::to_vec(
        &serde_json::json!({"proofs":{"case":{"positive":invalid,"negative":invalid}}}),
    )?;
    assert!(
        ProofBook::from_json(&bytes)?
            .check(&root.root, &root.manifest.revision)
            .is_err()
    );
    Ok(())
}

#[test]
fn inventory_rejects_unknown_fields_unknown_dispositions_and_traversal() -> Result<()> {
    let fixture = InventoryFixture::read()?;
    let value = serde_json::to_value(&fixture.manifest)?;
    let mut wrong = value.clone();
    wrong["unused"] = true.into();
    assert!(PortManifest::from_json(&serde_json::to_vec(&wrong)?).is_err());
    for (key, replacement) in [("disposition", "anything"), ("path", "../outside")] {
        let mut wrong = value.clone();
        wrong["entries"][0][key] = replacement.into();
        assert!(PortManifest::from_json(&serde_json::to_vec(&wrong)?).is_err());
    }
    Ok(())
}
