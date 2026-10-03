#[path = "judge/common.rs"]
mod common;
#[path = "judge/evaluation_helpers.rs"]
mod evaluation_helpers;
#[path = "judge/evaluation_review.rs"]
mod evaluation_review;
use orly::judge::{
    bank::Bank,
    calibration::Calibrator,
    evaluation::{Corpus, Evaluator, Label, Metrics, Prediction, disagreement},
    policy::TuningCandidate,
    wire::Answer,
};
use std::collections::BTreeMap;

#[test]
fn test_judge_evaluation_corpus_and_offline_validation() {
    let corpus = Corpus::compiled().unwrap();
    let bank = Bank::compiled().unwrap();
    let check = corpus.validate(&bank).unwrap();
    assert_eq!(check.complete, 480);
    assert!(!check.owner_reviewed);
    for definition in bank.definitions().values() {
        let candidate = TuningCandidate::new(
            definition,
            orly::judge::engine::EngineIdentity::jev(),
            0.8,
            &"a".repeat(40),
        )
        .unwrap();
        let evaluator = Evaluator {
            bank: &bank,
            candidate: &candidate,
        };
        let predictions = evaluation_helpers::predictions(&corpus, &bank);
        let metrics = evaluator
            .measure(
                &definition.id,
                &corpus.cases,
                &predictions,
                &BTreeMap::new(),
            )
            .unwrap();
        assert_eq!(metrics.total, 20);
        assert_eq!(metrics.substantive, 20);
        assert!(
            metrics.passes(&definition.question),
            "failed metrics for {}: {:?}",
            definition.id,
            metrics
        );
    }
}
#[test]
fn absent_labels_predictions_and_ranking_pairs_fail_quality() {
    let bank = Bank::compiled().unwrap();
    for definition in bank.definitions().values() {
        assert!(!Metrics::default().passes(&definition.question));
    }
    let mut metrics = Metrics {
        total: 20,
        substantive: 20,
        correct: 20,
        ..Metrics::default()
    };
    assert!(!metrics.passes(&bank.get("judge.scope_contradiction").unwrap().question));
    assert!(!metrics.passes(&bank.get("judge.rule_relevance").unwrap().question));
    metrics.true_positive = 8;
    metrics.false_positive = 2;
    metrics.missed_positive = 2;
    assert!(!metrics.passes(&bank.get("judge.scope_contradiction").unwrap().question));
}
#[test]
fn duplicate_and_mislabeled_corpora_are_rejected() {
    let bank = Bank::compiled().unwrap();
    let mut corpus = Corpus::compiled().unwrap();
    corpus.cases.push(corpus.cases[0].clone());
    assert!(corpus.validate(&bank).is_err());
    let mut corpus = Corpus::compiled().unwrap();
    corpus.cases[0].label = Label::Score { level: 99 };
    assert!(corpus.validate(&bank).is_err());
}
#[test]
fn every_repeat_is_required_and_disagreement_is_reported() {
    assert!(disagreement(&[]).is_err());
    let first = BTreeMap::from([(
        "case.unit".into(),
        Prediction {
            answer: Some(Answer::Noul { noul: 0.9 }),
            requests: 1,
            input_tokens: 1,
            output_tokens: 1,
            latency_millis: 1,
        },
    )]);
    let mut second = first.clone();
    second.get_mut("case.unit").unwrap().answer = Some(Answer::Noul { noul: 0.1 });
    assert_eq!(disagreement(&[first.clone(), second, first]).unwrap(), 1);
}
#[test]
fn calibration_uses_tuning_only_and_missing_predictions_cannot_pass() {
    let bank = Bank::compiled().unwrap();
    let corpus = Corpus::compiled().unwrap();
    let calibrator = Calibrator {
        bank: &bank,
        corpus: &corpus,
        reviewed_commit: &"a".repeat(40),
    };
    let mut predictions = evaluation_helpers::predictions(&corpus, &bank);
    let selected = calibrator.calibrate(&predictions).unwrap();
    assert!(
        selected
            .values()
            .all(|result| result.candidate.as_ref().unwrap().threshold == 0.95)
    );
    for case in corpus
        .cases
        .iter()
        .filter(|case| case.split == orly::judge::evaluation::Split::HeldOut)
    {
        predictions.remove(&case.id);
    }
    let tuning_only = calibrator.calibrate(&predictions).unwrap();
    assert_eq!(
        serde_json::to_value(selected).unwrap(),
        serde_json::to_value(tuning_only).unwrap()
    );
    assert!(
        calibrator
            .calibrate(&BTreeMap::new())
            .unwrap()
            .values()
            .all(|result| result.candidate.is_none())
    );
}
#[test]
fn independent_agent_report_requires_exact_held_out_identity_and_typed_answers() {
    let bank = Bank::compiled().unwrap();
    let corpus = Corpus::compiled().unwrap();
    let mut predictions = evaluation_helpers::predictions(&corpus, &bank);
    for case in corpus
        .cases
        .iter()
        .filter(|case| case.split == orly::judge::evaluation::Split::Tuning)
    {
        predictions.remove(&case.id);
    }
    let mut report = orly::judge::evaluation_run::AgentReport {
        corpus_digest: corpus.digest().unwrap(),
        author: "independent-test-agent".into(),
        predictions,
    };
    report.validate(&bank, &corpus).unwrap();
    let key = report.predictions.keys().next().unwrap().clone();
    let prediction = report.predictions.remove(&key).unwrap();
    assert!(report.validate(&bank, &corpus).is_err());
    report.predictions.insert(key, prediction);
    report.corpus_digest = "different-evidence".into();
    assert!(report.validate(&bank, &corpus).is_err());
}
