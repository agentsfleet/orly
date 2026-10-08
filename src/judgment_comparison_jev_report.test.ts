import { expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadCases } from "../evals/judgments/comparison/corpus";
import { corpusJevExamples, gradeJev, jevInput, JEV_PREFLIGHT_ERROR, type JevAttempt, type JevExample } from "../evals/judgments/comparison/jev";
import { JEV_MODE, jevReport, renderJevReport, replayJev } from "../evals/judgments/comparison/jev-report";
import { CANDIDATE, CASE_CLASS, CLASSIFICATION, labelsSchema, MEASUREMENT, NATIVE, OBSERVATION } from "../evals/judgments/comparison/types";
import { validateCatalog } from "../evals/judgments/comparison/validate";
import { ANSWER_KIND, MODEL, REPLY_KEY } from "./judgments/constants";
import { digest } from "./judgments/files";
import type { Reply } from "./judgments/wire";

const ROOT = resolve(import.meta.dir, "..");
const MISSING = "Request failed before a usable reply.";

async function inputs() {
  const catalog = validateCatalog(await Bun.file(resolve(ROOT, "evals/judgments/comparison/catalog.json")).json());
  const cases = await loadCases(ROOT);
  const labels = labelsSchema.parse(await Bun.file(resolve(ROOT, "evals/judgments/comparison/labels.json")).json());
  return { catalog, cases, labels, examples: corpusJevExamples(catalog, cases, labels) };
}

function attempt(entry: JevExample, reply: Reply | null = null): JevAttempt {
  return { id: entry.id, question: entry.question, identity: entry.identity, request_digest: digest(entry.input.request),
    requests: reply === null ? 0 : 1, elapsed_ms: 0, reply, failure: reply === null ? MISSING : null };
}

function reply(entry: JevExample, decision: string, strength = 1): Reply {
  const question = entry.input.definition.question;
  const keys = Object.keys(question.criteria);
  return { model: MODEL, answers: { [REPLY_KEY]: question.type === ANSWER_KIND.noul ? { type: question.type, noul: strength } : {
    type: question.type, choice: decision, confidence: strength,
    probabilities: Object.fromEntries(keys.map((key) => [key, key === decision ? strength : (1 - strength) / (keys.length - 1)])),
  } }, usage: { input_tokens: 100, output_tokens: 20 } };
}

test("jev_inputs_exclude_expected_labels_and_freeze_native_questions", async () => {
  const { catalog, cases, labels, examples } = await inputs();
  for (const entry of examples) {
    const request = JSON.parse(entry.input.request);
    expect(request.model).toBe(MODEL);
    expect(Object.keys(request.questions)).toEqual([REPLY_KEY]);
    expect(request.questions[REPLY_KEY]).toEqual(entry.input.definition.question);
    expect(Object.keys(request.state).sort()).toEqual(["evidence", "requirement"]);
    expect(request.state.evidence.every((item: Record<string, unknown>) => JSON.stringify(Object.keys(item).sort()) === JSON.stringify(["role", "text"]))).toBe(true);
  }
  const first = cases[0];
  const original = examples[0];
  if (!first || !original) throw new Error("Missing cases.");
  const changed = corpusJevExamples(catalog, [{ ...first, classification: CASE_CLASS.defective, author: "different-author", id: first.id }], labels)[0];
  expect(changed?.input.request).toBe(original.input.request);
  expect(changed?.identity).not.toBe(original.identity);
  expect(() => jevInput(original.input.definition.question, { ...JSON.parse(original.input.request).state, expected: NATIVE.yes })).toThrow();
});

test("jev_report_grades_actual_answers_without_model_accuracy_substitution", async () => {
  const { cases, labels, examples } = await inputs();
  const attempts = examples.map((entry) => attempt(entry));
  const yesIndex = examples.findIndex((entry) => entry.expected === NATIVE.yes);
  const noIndex = examples.findIndex((entry) => entry.expected === NATIVE.no);
  const candidateIndex = examples.findIndex((entry) => entry.question === CANDIDATE.wiring && entry.expected === CLASSIFICATION.defective);
  const uncertainIndex = examples.findIndex((entry) => entry.question === CANDIDATE.wiring && entry.expected === CLASSIFICATION.supported);
  for (const [index, choice, strength] of [[yesIndex, NATIVE.yes, 1], [noIndex, NATIVE.yes, 1],
    [candidateIndex, CLASSIFICATION.supported, 1], [uncertainIndex, CLASSIFICATION.supported, 0.4]] as const) {
    const entry = examples[index];
    if (!entry) throw new Error("Missing selected case.");
    attempts[index] = attempt(entry, reply(entry, choice, strength));
  }
  const report = jevReport(examples, attempts, cases, labels, [], JEV_MODE.live, true);
  expect(report.results[yesIndex]?.status).toBe("pass");
  expect(report.results[noIndex]?.status).toBe("fail");
  expect(report.results[candidateIndex]?.actual).toBe(CLASSIFICATION.supported);
  expect(report.results[candidateIndex]?.status).toBe("fail");
  expect(report.results[uncertainIndex]).toMatchObject({ actual: CLASSIFICATION.supported, graded: NATIVE.abstain, uncertain: true, status: "fail" });
  expect(report.observations[uncertainIndex]).toMatchObject({ status: OBSERVATION.valid, answer: { decision: CLASSIFICATION.supported, strength: 0.4 } });
  expect(report.observations.every((entry) => entry.measurement === MEASUREMENT.live)).toBe(true);
  expect(report.adoption.every((entry) => !entry.eligible && entry.decision === "retain")).toBe(true);
  expect(report.requests).toBe(4);
  expect(report.usage).toEqual({ input_tokens: 400, output_tokens: 80 });
  expect(report.scores).toHaveLength(22);
  expect(report.results.filter((entry) => entry.status === "unavailable")).toHaveLength(examples.length - 4);
  const rendered = renderJevReport(report);
  for (const glyph of ["✅", "❌", "⚪"]) expect(rendered).toContain(glyph);
  expect(rendered).toContain("(uncertain)");
  expect(rendered).toContain("not measured autonomous agent improvement");
});

test("jev_replay_preserves_original_answers_without_new_request_credit", async () => {
  const { cases, labels, examples } = await inputs();
  const attempts = examples.map((entry) => attempt(entry));
  const first = examples[0];
  if (!first) throw new Error("Missing case.");
  attempts[0] = attempt(first, reply(first, NATIVE.yes));
  const live = jevReport(examples, attempts, cases, labels, [], JEV_MODE.live, true);
  const replay = jevReport(examples, replayJev(examples, live, []), cases, labels, [], JEV_MODE.replay, true);
  expect(replay.results).toEqual(live.results);
  expect(replay.attempts).toEqual(live.attempts);
  expect(replay.requests).toBe(0);
  expect(replay.original_requests).toBe(1);
  expect(replay.observations.every((entry) => entry.measurement === MEASUREMENT.editable)).toBe(true);
  expect(replay.adoption.every((entry) => !entry.eligible)).toBe(true);
});

test("jev_replay_rejects_changed_input_order_identity_reply_and_request_count", async () => {
  const { cases, labels, examples } = await inputs();
  const attempts = examples.map((entry) => attempt(entry));
  const first = examples[0];
  if (!first) throw new Error("Missing case.");
  attempts[0] = attempt(first, reply(first, NATIVE.yes));
  const report = jevReport(examples, attempts, cases, labels, [], JEV_MODE.live, true);
  for (const field of ["id", "question", "identity", "request_digest"] as const) {
    const changed = structuredClone(report);
    const entry = changed.attempts[0];
    if (!entry) throw new Error("Missing attempt.");
    entry[field] = "altered";
    expect(() => replayJev(examples, changed, [])).toThrow(JEV_PREFLIGHT_ERROR);
  }
  expect(() => replayJev([...examples].reverse(), report, [])).toThrow(JEV_PREFLIGHT_ERROR);
  expect(() => replayJev(examples, { ...report, attempts: attempts.slice(1) }, [])).toThrow(JEV_PREFLIGHT_ERROR);
  const firstAttempt = attempts[0];
  if (!firstAttempt) throw new Error("Missing attempt.");
  expect(() => gradeJev(first, { ...firstAttempt, requests: 0 })).toThrow(JEV_PREFLIGHT_ERROR);
});

test("jev_replay_rejects_wrong_native_types_and_invalid_probability_distributions", async () => {
  const { cases, labels, examples } = await inputs();
  const index = examples.findIndex((entry) => entry.question === CANDIDATE.wiring);
  const entry = examples[index];
  if (!entry) throw new Error("Missing Choice example.");
  const attempts = examples.map((value) => attempt(value));
  for (const answer of [
    { type: ANSWER_KIND.noul, noul: 1 },
    { type: ANSWER_KIND.choice, choice: CLASSIFICATION.supported, confidence: 1, probabilities: {} },
    { type: ANSWER_KIND.choice, choice: CLASSIFICATION.supported, confidence: 2, probabilities: {} },
  ]) {
    const report = jevReport(examples, attempts, cases, labels, [], JEV_MODE.live, true);
    const changed = { ...attempt(entry), requests: 1, failure: null,
      reply: { model: MODEL, answers: { [REPLY_KEY]: answer }, usage: { input_tokens: 1, output_tokens: 1 } } };
    expect(() => replayJev(examples, { ...report, attempts: report.attempts.map((value, position) => position === index ? changed : value) }, [])).toThrow();
  }
});

test("jev_noul_uncertainty_preserves_native_probability_and_abstains", async () => {
  const { examples } = await inputs();
  const entry = examples.find((value) => value.input.definition.question.type === ANSWER_KIND.noul);
  if (!entry) throw new Error("Missing Noul example.");
  for (const probability of [0.49, 0.5, 0.51]) {
    const native = reply(entry, NATIVE.yes, probability);
    const result = gradeJev(entry, attempt(entry, native));
    expect(result.actual).toBe(probability < 0.5 ? NATIVE.no : NATIVE.yes);
    expect(result.graded).toBe(NATIVE.abstain);
    expect(result.uncertain).toBe(true);
    expect(native.answers[REPLY_KEY]).toEqual({ type: ANSWER_KIND.noul, noul: probability });
  }
});

// Saved observations must retain the evaluator that produced them.
test("jev_replay_rejects_missing_changed_or_reordered_source_inventory", async () => {
  const { cases, labels, examples } = await inputs();
  const sources = [{ path: "score.ts", digest: digest("scorer") }, { path: "jev.ts", digest: digest("transport") }];
  const live = jevReport(examples, examples.map((entry) => attempt(entry)), cases, labels, sources, JEV_MODE.live, true);
  expect(replayJev(examples, live, sources)).toEqual(live.attempts);
  for (const changed of [undefined, [], sources.slice(1), [...sources].reverse(), [...sources, sources[0]],
    sources.map((entry) => ({ ...entry, digest: "0".repeat(64) })), sources.map((entry) => ({ ...entry, path: "other.ts" }))]) {
    expect(() => replayJev(examples, { ...live, sources: changed }, sources)).toThrow();
  }
});
