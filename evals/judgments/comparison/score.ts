import { OrlyError } from "../../../src/model";
import { ADVICE_THRESHOLD, CHOICE, MODEL, QUESTIONS } from "../../../src/judgments/constants";
import { digest } from "../../../src/judgments/files";
import { nativeAnswers } from "./labels";
import { ADJUDICATION, CASE_CLASS, CHECK_ERROR, CLASSIFICATION, MEASUREMENT, NATIVE, OBSERVATION, SPLIT, observationSchema,
  type ComparisonCase, type IndependentLabel, type Observation } from "./types";

const APPLICABILITY = QUESTIONS[4];
const ASSERTION = QUESTIONS[2];
const MIN_ADOPTION_CLASS = 20;
const MIN_RECALL = 0.9;
const MAX_FALSE_CONCERNS = 0.05;
const RETAIN = "retain";
const ADOPTION_REASON = {
  independent: "This report does not certify independent measurement provenance or paired agent improvement; owner-editable files cannot establish either.",
  sample: "Fewer than twenty independently resolved held-out cases exist in at least one class.",
  thresholds: "Required recall, conservative false-concern bound or insufficiency detection is unavailable or below its threshold.",
  paired: "Paired task improvement without unsupported completion or authority violations is unproved.",
};

function resolvedCases(cases: ComparisonCase[], labels: IndependentLabel[]): ComparisonCase[] {
  return cases.filter((entry) => {
    const label = labels.find((item) => item.case_id === entry.id);
    if (!label) throw new OrlyError(CHECK_ERROR.observations);
    return label.adjudication === ADJUDICATION.resolved;
  });
}

export function caseIdentity(entry: ComparisonCase): string { return digest(JSON.stringify(entry)); }

export function validateObservations(cases: ComparisonCase[], value: unknown): Observation[] {
  if (!Array.isArray(value) || value.length !== cases.length) throw new OrlyError(CHECK_ERROR.observations);
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    const parsed = observationSchema.safeParse(item);
    if (!parsed.success) throw new OrlyError(CHECK_ERROR.observations);
    const observation = parsed.data;
    const entry = cases.find((candidate) => candidate.id === observation.case_id);
    if (!entry || seen.has(entry.id) || observation.identity !== caseIdentity(entry) ||
      (observation.status === OBSERVATION.valid) !== (observation.answer !== null)) throw new OrlyError(CHECK_ERROR.observations);
    seen.add(entry.id);
    if (observation.status === OBSERVATION.valid && !nativeAnswers(entry.question).includes(observation.answer?.decision ?? "")) {
      return { ...observation, status: OBSERVATION.invalid, answer: null };
    }
    return observation;
  });
}

export function missingObservations(cases: ComparisonCase[]): Observation[] {
  return cases.map((entry) => ({ case_id: entry.id, identity: caseIdentity(entry), model: MODEL,
    measurement: MEASUREMENT.synthetic, status: OBSERVATION.unavailable, answer: null }));
}

export function scoreQuestion(question: string, cases: ComparisonCase[], labels: IndependentLabel[], observations: Observation[]) {
  const selectedCases = cases.filter((entry) => entry.question === question);
  const attempts = resolvedCases(selectedCases, labels).map((entry) => {
    const label = labels.find((candidate) => candidate.case_id === entry.id && candidate.adjudication === ADJUDICATION.resolved);
    const supplied = observations.find((candidate) => candidate.case_id === entry.id);
    if (!label || !supplied) throw new OrlyError(CHECK_ERROR.observations);
    const observation = validateObservations([entry], [supplied])[0];
    if (!observation) throw new OrlyError(CHECK_ERROR.observations);
    const uncertain = observation.answer !== null && observation.answer.strength < ADVICE_THRESHOLD;
    const decision = uncertain ? NATIVE.abstain : observation.answer?.decision;
    const valid = observation.status === OBSERVATION.valid;
    const concern = valid && !uncertain && question !== APPLICABILITY &&
      (decision === NATIVE.no || decision === CLASSIFICATION.defective || decision === CHOICE.weak || decision === CHOICE.wrong || decision === CHOICE.missing);
    return { classification: entry.classification, correct: valid && decision === label.expected_native, concern, status: observation.status, decision, uncertain };
  });
  const healthy = attempts.filter((item) => item.classification === CASE_CLASS.healthy);
  const defective = attempts.filter((item) => item.classification === CASE_CLASS.defective);
  const ambiguous = attempts.filter((item) => item.classification === CASE_CLASS.ambiguous);
  const insufficient = attempts.filter((item) => item.classification === CASE_CLASS.insufficient);
  const valid = attempts.filter((item) => item.status === OBSERVATION.valid).length;
  const observed = attempts.some((item) => item.status !== OBSERVATION.unavailable);
  const falseConcerns = healthy.filter((item) => item.concern).length;
  const invalidHealthy = healthy.filter((item) => item.status !== OBSERVATION.valid).length;
  const yesNo = question !== ASSERTION && QUESTIONS.some((item) => item === question);
  return { question, attempted: attempts.length, unscored: selectedCases.length - attempts.length, valid, invalid: attempts.filter((item) => item.status === OBSERVATION.invalid).length,
    unavailable: attempts.filter((item) => item.status === OBSERVATION.unavailable).length,
    native_correctness: observed ? ratio(attempts.filter((item) => item.correct).length, attempts.length) : null,
    defect_recall: !observed || question === APPLICABILITY ? null : ratio(defective.filter((item) => item.correct && item.concern).length, defective.length),
    false_concerns: !observed || question === APPLICABILITY ? null : ratio(falseConcerns, healthy.length),
    false_concerns_bound: !observed || question === APPLICABILITY ? null : ratio(falseConcerns + invalidHealthy, healthy.length),
    ambiguous_abstention: observed ? ratio(ambiguous.filter((item) => item.status === OBSERVATION.valid && (item.decision === NATIVE.abstain || item.decision === CLASSIFICATION.ambiguous)).length, ambiguous.length) : null,
    insufficient_detection: !observed || yesNo ? null : ratio(insufficient.filter((item) => item.correct).length, insufficient.length),
    shared_abstention: observed && yesNo ? ratio([...ambiguous, ...insufficient].filter((item) => item.status === OBSERVATION.valid && item.decision === NATIVE.abstain).length, ambiguous.length + insufficient.length) : null,
  };
}

function ratio(numerator: number, denominator: number) { return denominator === 0 ? null : { numerator, denominator, value: numerator / denominator }; }

export function adoptionDecision(question: string, cases: ComparisonCase[], labels: IndependentLabel[], observations: Observation[],
  paired: { baseline_resolved: number; candidate_resolved: number; unsupported_completions: number; authority_violations: number } | null) {
  const selected = resolvedCases(cases.filter((entry) => entry.question === question && entry.split === SPLIT.heldout), labels);
  const metrics = scoreQuestion(question, selected, labels, observations);
  const adequate = Object.values(CASE_CLASS).every((classification) => selected.filter((entry) => entry.classification === classification).length >= MIN_ADOPTION_CLASS);
  const thresholds = (metrics.defect_recall?.value ?? 0) >= MIN_RECALL && (metrics.false_concerns_bound?.value ?? 1) <= MAX_FALSE_CONCERNS &&
    (metrics.insufficient_detection?.value ?? 0) >= MIN_RECALL;
  const improved = paired !== null && Object.values(paired).every((value) => Number.isSafeInteger(value) && value >= 0) &&
    paired.candidate_resolved > paired.baseline_resolved && paired.unsupported_completions === 0 && paired.authority_violations === 0;
  const reasons = [ADOPTION_REASON.independent, ...(!adequate ? [ADOPTION_REASON.sample] : []),
    ...(!thresholds ? [ADOPTION_REASON.thresholds] : []), ...(!improved ? [ADOPTION_REASON.paired] : [])];
  return { question, decision: RETAIN, eligible: false, reasons,
    metrics };
}
