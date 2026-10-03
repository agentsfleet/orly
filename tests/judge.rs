#[path = "judge/builders.rs"]
mod builders;
#[path = "judge/client.rs"]
mod client;
#[path = "judge/common.rs"]
mod common;
#[path = "judge/engine.rs"]
mod engine;
#[path = "judge/policy.rs"]
mod policy;
#[path = "judge/policy_helpers.rs"]
mod policy_helpers;
#[path = "judge/runner.rs"]
mod runner;
#[path = "judge/wire.rs"]
mod wire;

#[test]
fn test_question_bank_covers_declared_semantic_families() {
    let bank = orly::judge::bank::Bank::compiled().unwrap();
    let corpus = orly::judge::evaluation::Corpus::compiled().unwrap();
    let result = corpus.validate(&bank).unwrap();
    assert_eq!(result.families, 12);
    assert_eq!(result.cases, 504);
    assert_eq!(result.complete, 480);
    assert!(!result.owner_reviewed);
    for definition in bank.definitions().values() {
        definition.validate().unwrap();
    }
}

#[test]
fn incomplete_and_duplicate_bank_entries_are_rejected() {
    use orly::judge::bank::Bank;
    let definitions: serde_json::Value =
        serde_json::from_slice(include_bytes!("../questions/bank.json")).unwrap();
    let first = definitions[0].clone();
    assert!(
        Bank::parse(&serde_json::to_vec(&vec![first.clone(), first.clone()]).unwrap()).is_err()
    );
    let mut invalid = first;
    invalid["source_clause"] = serde_json::json!("");
    assert!(Bank::parse(&serde_json::to_vec(&vec![invalid]).unwrap()).is_err());
}
#[path = "judge/adapter.rs"]
mod adapter;
#[path = "judge/calibration.rs"]
mod calibration;
