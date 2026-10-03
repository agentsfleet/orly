use super::{
    common::batch,
    policy_helpers::{calibrated, plan, record},
};
use orly::judge::{
    bank::Bank,
    batch::Batch,
    engine::EngineIdentity,
    evaluation::Metrics,
    policy::{Calibration, DeclaredPolicy, HELD_OUT_REPEATS, PlanComposer},
    wire::Question,
};
use std::collections::{BTreeMap, BTreeSet};

#[test]
fn calibration_rejects_changed_question_builder_polarity_and_engine() {
    let input = batch("source", "judge.scope_contradiction");
    let calibrations = calibrated(&["judge.scope_contradiction"]);
    let consumed = BTreeSet::from(["judge.scope_contradiction".into()]);
    let empty = BTreeSet::new();
    let policy = DeclaredPolicy {
        consumed: &consumed,
        calibrations: &calibrations,
        commands: &empty,
        capabilities: &empty,
        candidates: &empty,
    };
    for change in 0..7 {
        let mut pairs = input.pairs().clone();
        let pair = pairs.values_mut().next().unwrap();
        let mut engine = input.engine().clone();
        match change {
            0 => pair.definition.version = "1.0.1".into(),
            1 => pair.definition.builder_version = "1.0.1".into(),
            2 => pair.definition.finding_polarity = !pair.definition.finding_polarity,
            3 => engine.provider = "different-provider".into(),
            4 => engine.model = "different-model".into(),
            5 => {
                if let Question::Noul { instructions, .. } = &mut pair.definition.question {
                    *instructions = serde_json::json!("Changed meaning");
                }
            }
            _ => {
                if let Question::Noul { criteria, .. } = &mut pair.definition.question {
                    criteria.insert("true".into(), "Changed positive meaning".into());
                }
            }
        }
        let changed =
            Batch::for_engine(engine, "source".into(), input.state().clone(), pairs).unwrap();
        let outcomes = BTreeMap::from([(changed.digest().into(), record(&changed, false))]);
        assert!(matches!(
            PlanComposer::new(plan(), &policy)
                .unwrap()
                .compose(&[changed], &outcomes),
            Err(orly::Error::Stale)
        ));
    }
}

#[test]
fn tuning_candidates_and_failed_or_partial_held_out_runs_cannot_activate_policy() {
    let bank = Bank::compiled().unwrap();
    let definition = bank.get("judge.scope_contradiction").unwrap();
    let calibration = calibrated(&["judge.scope_contradiction"]);
    let candidate = calibration["judge.scope_contradiction"].candidate().clone();
    assert!(
        serde_json::from_value::<Calibration>(serde_json::to_value(&candidate).unwrap()).is_err()
    );
    for repeats in [Vec::new(), vec![Metrics::default(); HELD_OUT_REPEATS]] {
        assert!(Calibration::from_held_out(definition, candidate.clone(), repeats).is_err());
    }
    let mut encoded = serde_json::to_value(&calibration["judge.scope_contradiction"]).unwrap();
    encoded["held_out"].as_array_mut().unwrap().pop();
    let incomplete: Calibration = serde_json::from_value(encoded).unwrap();
    assert!(
        incomplete
            .validate_for(definition, &EngineIdentity::jev())
            .is_err()
    );
    calibration["judge.scope_contradiction"]
        .validate_for(definition, &EngineIdentity::jev())
        .unwrap();
}
