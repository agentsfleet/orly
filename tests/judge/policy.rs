use super::common::batch;
use super::policy_helpers::{
    assert_advisory_state, calibrated, choose, mixed_batch, plan, record, reseal,
};
use orly::{
    core::plan::CompiledAction,
    judge::{
        policy::{DeclaredPolicy, Disposition, PlanComposer},
        runner::Outcome,
        wire::Answer,
    },
};
use std::collections::{BTreeMap, BTreeSet};

#[test]
fn test_all_three_primitives_have_real_plan_consumers() {
    let bank = orly::judge::bank::Bank::compiled().unwrap();
    let batches = vec![mixed_batch()];
    assert_eq!(batches[0].pairs().len(), 3);
    let mut outcomes = BTreeMap::from([(batches[0].digest().into(), record(&batches[0], false))]);
    if let Outcome::Recorded { record, .. } = outcomes.values_mut().next().unwrap() {
        choose(
            record
                .response
                .answers
                .get_mut("judge.work_recipe")
                .unwrap(),
            "focused",
        );
    }
    reseal(&batches, &mut outcomes);
    let consumed = bank.definitions().keys().cloned().collect();
    let calibrations = calibrated(&[
        "judge.work_recipe",
        "judge.scope_contradiction",
        "judge.rule_relevance",
    ]);
    let commands = BTreeSet::from(["verify.focused".into()]);
    let capabilities = BTreeSet::from(["review.spec".into(), "rule.security".into()]);
    let candidates = BTreeSet::from(["rule.security".into()]);
    let policy = DeclaredPolicy {
        consumed: &consumed,
        calibrations: &calibrations,
        commands: &commands,
        capabilities: &capabilities,
        candidates: &candidates,
    };
    let assessment = PlanComposer::new(plan(), &policy)
        .unwrap()
        .compose(&batches, &outcomes)
        .unwrap();
    assert_eq!(assessment.plan.nodes.len(), 5);
    assert!(
        assessment
            .plan
            .nodes
            .iter()
            .any(|node| matches!(&node.action,
        CompiledAction::Command { command_id } if command_id == "verify.focused"))
    );
    assert_eq!(assessment.ranked_candidates, vec![("rule.security", 4.0)]);
    assert!(assessment.plan.nodes[..2].iter().all(|node| node.required));
}
#[test]
fn test_advisory_policy_preserves_all_constituents() {
    let batches = vec![
        batch("source", "judge.scope_contradiction"),
        batch("source", "judge.documentation_support"),
        batch("source", "judge.single_behavior"),
        batch("source", "judge.error_paths"),
    ];
    let mut outcomes: BTreeMap<_, _> = batches[..3]
        .iter()
        .map(|batch| (batch.digest().into(), record(batch, true)))
        .collect();
    if let Outcome::Recorded { record, .. } = outcomes.get_mut(batches[2].digest()).unwrap() {
        record
            .response
            .answers
            .insert("judge.single_behavior".into(), Answer::Noul { noul: 0.5 });
    }
    reseal(&batches, &mut outcomes);
    let calibrations = BTreeMap::new();
    let declarations = BTreeSet::new();
    let consumed = batches
        .iter()
        .flat_map(|batch| {
            batch
                .pairs()
                .values()
                .map(|pair| pair.definition.id.clone())
        })
        .collect();
    let policy = DeclaredPolicy {
        consumed: &consumed,
        calibrations: &calibrations,
        commands: &declarations,
        capabilities: &declarations,
        candidates: &declarations,
    };
    let assessment = PlanComposer::new(plan(), &policy)
        .unwrap()
        .compose(&batches, &outcomes)
        .unwrap();
    assert_advisory_state(&assessment);
    let mut reversed = batches.clone();
    reversed.reverse();
    let reordered = PlanComposer::new(plan(), &policy)
        .unwrap()
        .compose(&reversed, &outcomes)
        .unwrap();
    assert_eq!(assessment.plan.digest, reordered.plan.digest);
}
#[test]
fn test_judgment_routing_does_not_inflate_coverage() {
    let batches = vec![batch("source", "judge.scope_contradiction")];
    let outcomes = BTreeMap::from([(batches[0].digest().into(), record(&batches[0], true))]);
    let empty = BTreeSet::new();
    let calibrations = BTreeMap::new();
    let consumed = batches
        .iter()
        .flat_map(|batch| {
            batch
                .pairs()
                .values()
                .map(|pair| pair.definition.id.clone())
        })
        .collect();
    let policy = DeclaredPolicy {
        consumed: &consumed,
        calibrations: &calibrations,
        commands: &empty,
        capabilities: &empty,
        candidates: &empty,
    };
    let assessment = PlanComposer::new(plan(), &policy)
        .unwrap()
        .compose(&batches, &outcomes)
        .unwrap();
    assert_eq!(assessment.constituents.len(), 1);
    assert_eq!(
        assessment.constituents[0].source_clause,
        batches[0]
            .pairs()
            .values()
            .next()
            .unwrap()
            .definition
            .source_clause
    );
    assert_eq!(assessment.plan.nodes.len(), 2);
}
#[test]
fn test_primitive_composition_preserves_serious_conditions() {
    let batches = vec![
        batch("source", "judge.resource_cleanup"),
        batch("source", "judge.rule_relevance"),
    ];
    let outcomes = batches
        .iter()
        .map(|batch| (batch.digest().into(), record(batch, false)))
        .collect();
    let calibrations = calibrated(&["judge.resource_cleanup"]);
    let empty = BTreeSet::new();
    let capabilities = BTreeSet::from(["review.resources".into()]);
    let candidates = BTreeSet::from(["rule.security".into()]);
    let consumed = batches
        .iter()
        .flat_map(|batch| {
            batch
                .pairs()
                .values()
                .map(|pair| pair.definition.id.clone())
        })
        .collect();
    let policy = DeclaredPolicy {
        consumed: &consumed,
        calibrations: &calibrations,
        commands: &empty,
        capabilities: &capabilities,
        candidates: &candidates,
    };
    let assessment = PlanComposer::new(plan(), &policy)
        .unwrap()
        .compose(&batches, &outcomes)
        .unwrap();
    assert!(assessment.plan.nodes.iter().any(|node|matches!(&node.action,CompiledAction::Check{capability} if capability=="review.resources")));
    assert_eq!(assessment.ranked_candidates[0].1, 4.0);
}
#[test]
fn stale_record_and_unknown_routes_are_rejected() {
    let batches = vec![batch("source", "judge.scope_contradiction")];
    let mut outcomes = BTreeMap::from([(batches[0].digest().into(), record(&batches[0], true))]);
    let empty = BTreeSet::new();
    let calibrations = calibrated(&["judge.scope_contradiction"]);
    let consumed = batches
        .iter()
        .flat_map(|batch| {
            batch
                .pairs()
                .values()
                .map(|pair| pair.definition.id.clone())
        })
        .collect();
    let policy = DeclaredPolicy {
        consumed: &consumed,
        calibrations: &calibrations,
        commands: &empty,
        capabilities: &empty,
        candidates: &empty,
    };
    assert!(
        PlanComposer::new(plan(), &policy)
            .unwrap()
            .compose(&batches, &outcomes)
            .is_err()
    );
    if let Outcome::Recorded { record, .. } = outcomes.values_mut().next().unwrap() {
        record.batch_digest = "stale".into();
    }
    assert!(matches!(
        PlanComposer::new(plan(), &policy)
            .unwrap()
            .compose(&batches, &outcomes),
        Err(orly::Error::Stale)
    ));
}

#[test]
fn unused_speculative_uncertainty_keeps_consumed_safety_requirement() {
    let batches = vec![
        batch("source", "judge.resource_cleanup"),
        batch("source", "judge.single_behavior"),
    ];
    let mut outcomes: BTreeMap<_, _> = batches
        .iter()
        .map(|batch| (batch.digest().into(), record(batch, false)))
        .collect();
    if let Outcome::Recorded { record, .. } = outcomes.get_mut(batches[1].digest()).unwrap() {
        record
            .response
            .answers
            .insert("judge.single_behavior".into(), Answer::Noul { noul: 0.5 });
    }
    reseal(&batches, &mut outcomes);
    let consumed = BTreeSet::from(["judge.resource_cleanup".into()]);
    let calibrations = calibrated(&["judge.resource_cleanup"]);
    let empty = BTreeSet::new();
    let capabilities = BTreeSet::from(["review.resources".into()]);
    let policy = DeclaredPolicy {
        consumed: &consumed,
        calibrations: &calibrations,
        commands: &empty,
        capabilities: &capabilities,
        candidates: &empty,
    };
    let assessment = PlanComposer::new(plan(), &policy)
        .unwrap()
        .compose(&batches, &outcomes)
        .unwrap();
    assert_eq!(assessment.plan.nodes.len(), 3);
    let unused = assessment
        .constituents
        .iter()
        .find(|item| item.question_id == "judge.single_behavior")
        .unwrap();
    assert_eq!(unused.disposition, Disposition::Unused);
    assert!(unused.answer.is_some());
    assert!(unused.selected_node.is_none());
}
