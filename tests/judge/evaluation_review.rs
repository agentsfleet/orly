use orly::judge::evaluation_review::ReviewedCorpus;
use std::path::Path;

fn revision(root: &Path, bank: &[u8]) -> git2::Oid {
    let repository =
        git2::Repository::open(root).unwrap_or_else(|_| git2::Repository::init(root).unwrap());
    for (path, bytes) in [
        ("questions/bank.json", bank),
        (
            "fixtures/questions/corpus.json",
            include_bytes!("../../fixtures/questions/corpus.json").as_slice(),
        ),
    ] {
        let path = root.join(path);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }
    let mut index = repository.index().unwrap();
    index.add_path(Path::new("questions/bank.json")).unwrap();
    index
        .add_path(Path::new("fixtures/questions/corpus.json"))
        .unwrap();
    let tree = repository.find_tree(index.write_tree().unwrap()).unwrap();
    let identity = git2::Signature::now("Evaluation test", "tests@example.invalid").unwrap();
    repository
        .commit(
            None,
            &identity,
            &identity,
            "freeze evaluation test inputs",
            &tree,
            &[],
        )
        .unwrap()
}
#[test]
fn reviewed_revision_must_exist_and_contain_the_exact_compiled_bank_and_corpus() {
    let root = tempfile::tempdir().unwrap();
    let frozen = revision(root.path(), include_bytes!("../../questions/bank.json"));
    let reviewed = ReviewedCorpus::open(root.path(), &frozen.to_string()).unwrap();
    assert_eq!(reviewed.revision(), frozen.to_string());
    let changed = revision(root.path(), b"[]");
    assert!(matches!(
        ReviewedCorpus::open(root.path(), &changed.to_string()),
        Err(orly::Error::Stale)
    ));
    assert!(ReviewedCorpus::open(root.path(), &"0".repeat(40)).is_err());
}
