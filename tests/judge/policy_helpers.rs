use super::common::{batch, response};
use orly::{
    core::plan::{CompiledAction, DecisionPlan, PAYLOAD_CHECK, PlanNode, SNAPSHOT_CHECK},
    judge::{batch::Batch, constants::VERSION, replay::Record, runner::Outcome},
};
use std::collections::{BTreeMap, BTreeSet};

pub fn mixed_batch() -> Batch {
    let bank = orly::judge::bank::Bank::compiled().unwrap();
    let mut pairs = BTreeMap::new();
    let mut state = serde_json::Map::new();
    for id in [
        "judge.work_recipe",
        "judge.scope_contradiction",
        "judge.rule_relevance",
    ] {
        let single = batch("source", id);
        pairs.extend(single.pairs().clone());
        for field in &bank.get(id).unwrap().evidence {
            state.insert(
                field.clone(),
                serde_json::json!(format!("complete {field} evidence")),
            );
        }
    }
    Batch::new("source".into(), state.into(), pairs).unwrap()
}
pub fn plan() -> DecisionPlan {
    let mut plan = DecisionPlan {
        version: 1,
        snapshot_digest: "source".into(),
        configuration_digest: "config".into(),
        policy_digest: "policy".into(),
        decisions_digest: "decisions".into(),
        pack_digests: BTreeMap::new(),
        digest: String::new(),
        nodes: [SNAPSHOT_CHECK, PAYLOAD_CHECK]
            .into_iter()
            .map(|id| PlanNode {
                id: id.into(),
                dependencies: BTreeSet::new(),
                required: true,
                action: CompiledAction::Check {
                    capability: id.into(),
                },
            })
            .collect(),
    };
    plan.digest = plan.compute_digest().unwrap();
    plan
}
pub fn record(batch: &orly::judge::batch::Batch, replayed: bool) -> Outcome {
    Outcome::Recorded {
        record: Record {
            version: VERSION,
            batch_digest: batch.digest().into(),
            source_digest: batch.source_digest().into(),
            run_id: orly_fs::digest::ContentDigest::identity(&(
                batch.digest(),
                1_u64,
                0_u64,
                response(batch),
            ))
            .unwrap(),
            created_seconds: 1,
            ordinal: 0,
            response: response(batch),
        },
        replayed,
    }
}

pub fn reseal(batches: &[Batch], outcomes: &mut BTreeMap<String, Outcome>) {
    for batch in batches {
        if let Some(Outcome::Recorded { record, .. }) = outcomes.get_mut(batch.digest()) {
            record.run_id = orly_fs::digest::ContentDigest::identity(&(
                batch.digest(),
                record.created_seconds,
                record.ordinal,
                &record.response,
            ))
            .unwrap();
        }
    }
}

pub fn calibrated(ids: &[&str]) -> BTreeMap<String, orly::judge::policy::Calibration> {
    use orly::judge::{
        bank::Bank,
        engine::EngineIdentity,
        evaluation::Metrics,
        policy::{Calibration, HELD_OUT_REPEATS, TuningCandidate},
    };
    let bank = Bank::compiled().unwrap();
    ids.iter()
        .map(|id| {
            let definition = bank.get(id).unwrap();
            let candidate =
                TuningCandidate::new(definition, EngineIdentity::jev(), 0.8, &"a".repeat(40))
                    .unwrap();
            let measured = Metrics {
                total: 20,
                substantive: 20,
                correct: 20,
                true_positive: 10,
                ranking_pairs: 20,
                ordered_pairs: 20,
                ..Metrics::default()
            };
            (
                (*id).into(),
                Calibration::from_held_out(definition, candidate, vec![measured; HELD_OUT_REPEATS])
                    .unwrap(),
            )
        })
        .collect()
}
pub fn choose(answer: &mut orly::judge::wire::Answer, option: &str) {
    let orly::judge::wire::Answer::Choice {
        choice,
        probabilities,
        ..
    } = answer
    else {
        panic!("expected a Choice answer");
    };
    *choice = option.into();
    for (key, probability) in probabilities {
        *probability = f64::from(key == option);
    }
}
pub fn assert_advisory_state(assessment: &orly::judge::policy::Assessment<'_>) {
    use orly::{
        core::evidence::{CriterionResult, EvidencePacket},
        judge::policy::Disposition,
    };
    assert_eq!(assessment.constituents.len(), 4);
    for expected in [
        Disposition::Finding,
        Disposition::Quiet,
        Disposition::Uncertain,
        Disposition::Missing,
    ] {
        assert!(
            assessment
                .constituents
                .iter()
                .any(|item| item.disposition == expected)
        );
    }
    let mut exact = EvidencePacket::new("source".into(), "config".into());
    exact.required.insert("exact".into());
    exact
        .results
        .insert("exact".into(), CriterionResult::failed("exact_failure"));
    assessment.report_into(&mut exact);
    assert_eq!(exact.exit_code(), 1);
    assert_eq!(
        exact.results["exact"],
        CriterionResult::failed("exact_failure")
    );
}
