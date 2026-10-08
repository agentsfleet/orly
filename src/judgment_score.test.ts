import { expect, test } from "bun:test";

import { adoptionDecision, missingObservations, scoreQuestion, validateObservations } from "../evals/judgments/comparison/score";
import { ADJUDICATION, CANDIDATE, CASE_CLASS, CHECK_ERROR, CLASSIFICATION, LABEL_AUTHORITY, MEASUREMENT, NATIVE, OBSERVATION, SPLIT,
  type ComparisonCase, type IndependentLabel, type Observation } from "../evals/judgments/comparison/types";
import { CHOICE, MODEL, QUESTIONS } from "./judgments/constants";
import { OrlyError } from "./model";

const CERTAIN = 1;
const UNCERTAIN = 0.5;
const TEST_AUTHOR = "score-fixture-author";
const TEST_ORACLE = "unit-boundary-oracle";
const DIGEST_LENGTH = 64;
const REVISION_LENGTH = 40;
const REFERENCE_SOURCE = "reference.md";

function fixture(question: ComparisonCase["question"], classifications: ComparisonCase["classification"][], expected: IndependentLabel["expected_native"][]) {
  const cases: ComparisonCase[] = classifications.map((classification, index) => ({ id: `case-${index}`, question, classification,
    origin: `family-${index}`, split: SPLIT.heldout, author: TEST_AUTHOR, requirement: "Assert the sourced result.", evidence: [] }));
  const labels: IndependentLabel[] = cases.map((entry, index) => {
    const answer = expected[index];
    if (!answer) throw new Error("Missing unit expectation.");
    return { case_id: entry.id, classification: entry.classification, expected_native: answer, rationale: "Exact unit boundary expectation.",
      author: TEST_AUTHOR, adjudication: ADJUDICATION.resolved, authority: { kind: LABEL_AUTHORITY.oracle, name: TEST_ORACLE },
      source: { path: REFERENCE_SOURCE, digest: "0".repeat(DIGEST_LENGTH), revision: "0".repeat(REVISION_LENGTH), selected: "Expected result." } };
  });
  const observations: Observation[] = missingObservations(cases).map((entry, index) => {
    const decision = expected[index];
    if (!decision) throw new Error("Missing unit answer.");
    return { ...entry, status: OBSERVATION.valid, answer: { decision, strength: CERTAIN } };
  });
  return { cases, labels, observations };
}

test("metrics_preserve_missing_outcomes", () => {
  const { cases, labels, observations } = fixture(QUESTIONS[0], [CASE_CLASS.healthy, CASE_CLASS.defective, CASE_CLASS.ambiguous, CASE_CLASS.insufficient],
    [NATIVE.yes, NATIVE.no, NATIVE.abstain, NATIVE.abstain]);
  const mixed = observations.map((item, index) => index === 0 ? { ...item, status: OBSERVATION.unavailable, answer: null } : item);
  const result = scoreQuestion(QUESTIONS[0], cases, labels, validateObservations(cases, mixed));
  expect(result.native_correctness).toEqual({ numerator: 3, denominator: 4, value: 0.75 });
  expect(result.defect_recall).toEqual({ numerator: 1, denominator: 1, value: 1 });
  expect(result.false_concerns_bound).toEqual({ numerator: 1, denominator: 1, value: 1 });
  expect(result.insufficient_detection).toBeNull();
  expect(result.shared_abstention).toEqual({ numerator: 2, denominator: 2, value: 1 });
  expect(() => validateObservations(cases, mixed.slice(1))).toThrow(new OrlyError(CHECK_ERROR.observations));
});

test("healthy_applicable_yes_is_native_correctness_without_defect_metrics", () => {
  const { cases, labels, observations } = fixture(QUESTIONS[4], [CASE_CLASS.healthy], [NATIVE.yes]);
  const result = scoreQuestion(QUESTIONS[4], cases, labels, observations);
  expect(result.native_correctness?.value).toBe(1);
  expect(result.false_concerns).toBeNull();
  expect(result.defect_recall).toBeNull();
});

test("noul_half_probability_abstains_without_inventing_insufficiency", () => {
  const { cases, labels, observations } = fixture(QUESTIONS[0], [CASE_CLASS.insufficient], [NATIVE.abstain]);
  const answer = observations.map((item) => ({ ...item, answer: { decision: NATIVE.yes, strength: UNCERTAIN } }));
  const result = scoreQuestion(QUESTIONS[0], cases, labels, answer);
  expect(result.shared_abstention?.value).toBe(1);
  expect(result.insufficient_detection).toBeNull();
});

test("zero_responses_and_empty_denominators_are_unavailable", () => {
  const { cases, labels } = fixture(CANDIDATE.obligation, [CASE_CLASS.healthy], [CLASSIFICATION.supported]);
  const result = scoreQuestion(CANDIDATE.obligation, cases, labels, missingObservations(cases));
  expect(result.attempted).toBe(1);
  expect(result.unavailable).toBe(1);
  expect(result.native_correctness).toBeNull();
  expect(result.defect_recall).toBeNull();
  expect(result.false_concerns_bound).toBeNull();
  expect(scoreQuestion(CANDIDATE.wiring, [], [], []).native_correctness).toBeNull();
});

test("invalid_defective_answers_are_misses_and_invalid_healthy_answers_raise_the_bound", () => {
  const { cases, labels, observations } = fixture(CANDIDATE.failure, [CASE_CLASS.healthy, CASE_CLASS.defective], [CLASSIFICATION.supported, CLASSIFICATION.defective]);
  const answer = observations.map((item, index) => index === 0 ? item : { ...item, status: OBSERVATION.invalid, answer: null });
  const result = scoreQuestion(CANDIDATE.failure, cases, labels, answer);
  expect(result.native_correctness?.value).toBe(0.5);
  expect(result.defect_recall?.value).toBe(0);
  expect(result.invalid).toBe(1);
});

test("weak_low_confidence_assertion_is_an_abstention", () => {
  const { cases, labels, observations } = fixture(QUESTIONS[2], [CASE_CLASS.defective], [CHOICE.weak]);
  const answer = observations.map((item) => ({ ...item, answer: { decision: CHOICE.weak, strength: UNCERTAIN } }));
  const result = scoreQuestion(QUESTIONS[2], cases, labels, answer);
  expect(result.native_correctness?.value).toBe(0);
  expect(result.defect_recall?.value).toBe(0);
});

test("explicit_choice_insufficiency_is_scored_separately", () => {
  const { cases, labels, observations } = fixture(QUESTIONS[2], [CASE_CLASS.insufficient], [CHOICE.insufficient]);
  expect(scoreQuestion(QUESTIONS[2], cases, labels, observations).insufficient_detection?.value).toBe(1);
});

test("observations_reject_stale_duplicate_unknown_and_executable_answers", () => {
  const { cases, observations } = fixture(CANDIDATE.wiring, [CASE_CLASS.healthy, CASE_CLASS.defective], [CLASSIFICATION.supported, CLASSIFICATION.defective]);
  expect(() => validateObservations(cases, observations.map((item) => ({ ...item, identity: "0".repeat(DIGEST_LENGTH) })))).toThrow(CHECK_ERROR.observations);
  expect(() => validateObservations(cases, [observations[0], observations[0]])).toThrow(CHECK_ERROR.observations);
  expect(() => validateObservations(cases, observations.map((item) => ({ ...item, execute: "true" })))).toThrow(CHECK_ERROR.observations);
  expect(() => validateObservations(cases.map((item) => ({ ...item, requirement: "Edited required behavior." })), observations)).toThrow(CHECK_ERROR.observations);
});

test("adoption_requires_independent_measured_benefit", () => {
  const { cases, labels, observations } = fixture(CANDIDATE.resolution, Object.values(CASE_CLASS), Object.values(CLASSIFICATION));
  const decision = adoptionDecision(CANDIDATE.resolution, cases, labels, missingObservations(cases), null);
  expect(decision.eligible).toBe(false);
  expect(decision.reasons.length).toBe(4);
  expect(decision.decision).toBe("retain");
  expect(adoptionDecision(CANDIDATE.resolution, cases, labels, observations, null).eligible).toBe(false);
});

test("unmeasured_candidates_remain_evaluation_only", () => {
  for (const question of Object.values(CANDIDATE)) {
    const { cases, labels } = fixture(question, [CASE_CLASS.healthy], [CLASSIFICATION.supported]);
    const result = adoptionDecision(question, cases, labels, missingObservations(cases), null);
    expect(result.eligible).toBe(false);
    expect(result.metrics.native_correctness).toBeNull();
  }
  expect(QUESTIONS.length).toBe(6);
});

test("development_cases_cannot_fill_the_heldout_adoption_minimum", () => {
  const { cases, labels, observations } = fixture(CANDIDATE.wiring, [CASE_CLASS.healthy], [CLASSIFICATION.supported]);
  const result = adoptionDecision(CANDIDATE.wiring, cases.map((entry) => ({ ...entry, split: SPLIT.development })), labels,
    observations.map((entry) => ({ ...entry, measurement: MEASUREMENT.independent })), { baseline_resolved: 0, candidate_resolved: 1, unsupported_completions: 0, authority_violations: 0 });
  expect(result.eligible).toBe(false);
  expect(result.metrics.attempted).toBe(0);
});

test("answers_from_another_question_format_count_as_invalid_attempts", () => {
  const { cases, labels, observations } = fixture(CANDIDATE.wiring, [CASE_CLASS.healthy], [CLASSIFICATION.supported]);
  const malformed = observations.map((entry) => ({ ...entry, answer: { decision: NATIVE.yes, strength: CERTAIN } }));
  const validated = validateObservations(cases, malformed);
  expect(validated.map((entry) => entry.status)).toEqual([OBSERVATION.invalid]);
  const result = scoreQuestion(CANDIDATE.wiring, cases, labels, malformed);
  expect(result.invalid).toBe(1);
  expect(result.valid).toBe(0);
  expect(result.false_concerns_bound?.value).toBe(1);
});

test("pending_extra_cases_are_unscored_and_do_not_change_denominators", () => {
  const { cases, labels, observations } = fixture(CANDIDATE.evidence, [CASE_CLASS.healthy, CASE_CLASS.healthy], [CLASSIFICATION.supported, CLASSIFICATION.supported]);
  const pending = labels.map((entry, index) => index === 0 ? entry : { ...entry, adjudication: ADJUDICATION.pending });
  const result = scoreQuestion(CANDIDATE.evidence, cases, pending, observations);
  expect(result.attempted).toBe(1);
  expect(result.unscored).toBe(1);
  expect(result.native_correctness).toEqual({ numerator: 1, denominator: 1, value: 1 });
});

test("fabricated_measurement_enums_and_paired_counts_never_qualify_for_adoption", () => {
  const minimum = 20;
  const classes = Object.values(CASE_CLASS).flatMap((classification) => Array.from({ length: minimum }, () => classification));
  const answers = Object.values(CLASSIFICATION).flatMap((answer) => Array.from({ length: minimum }, () => answer));
  const { cases, labels, observations } = fixture(CANDIDATE.resolution, classes, answers);
  const fabricated = observations.map((entry) => ({ ...entry, measurement: MEASUREMENT.independent }));
  const invalidPair = { baseline_resolved: -1, candidate_resolved: 0, unsupported_completions: 0, authority_violations: 0 };
  const ordinaryPair = { ...invalidPair, baseline_resolved: 1, candidate_resolved: 2 };
  for (const pair of [invalidPair, ordinaryPair]) {
    const result = adoptionDecision(CANDIDATE.resolution, cases, labels, fabricated, pair);
    expect(result.eligible).toBe(false);
    expect(result.decision).toBe("retain");
    expect(result.reasons.some((reason) => reason.includes("provenance"))).toBe(true);
  }
});
