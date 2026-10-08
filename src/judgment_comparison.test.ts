import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import catalog from "../evals/judgments/comparison/catalog.json";
import { CASE_CLASS, CHECK_ERROR, SPLIT } from "../evals/judgments/comparison/types";
import { validateCases, validateCatalog } from "../evals/judgments/comparison/validate";
import { OrlyError } from "./model";
import { MODEL, QUESTIONS, ROLE } from "./judgments/constants";
import { digest } from "./judgments/files";
import { cleanupTemporaryDirectories, temporaryDirectory } from "./gates_test_support";

const OTHER_MODEL = "different-model";
const DIGEST_HEX_LENGTH = 64;
const WRONG_DIGEST = "0".repeat(DIGEST_HEX_LENGTH);
const SOURCE_PATH = "requirement.md";
const SOURCE_CONTENT = "Input must include a locale. The caller supplies the locale before formatting.\n";

afterEach(cleanupTemporaryDirectories);

async function caseFixture() {
  const root = temporaryDirectory();
  await Bun.write(join(root, SOURCE_PATH), SOURCE_CONTENT);
  const entry = {
    id: "locale-prerequisite", question: QUESTIONS[0], origin: "locale-source", split: SPLIT.development,
    classification: CASE_CLASS.healthy, author: "fixture-author", requirement: "Name the required locale before formatting.",
    evidence: [{ role: ROLE.spec, content: SOURCE_CONTENT.trim(), source: { path: SOURCE_PATH, digest: digest(SOURCE_CONTENT) } }],
  };
  return { root, entry };
}

test("comparison_preserves_runtime_baseline", () => {
  const parsed = validateCatalog(catalog);
  expect(parsed.model).toBe(MODEL);
  expect(parsed.baseline.map((entry) => entry.question)).toEqual([...QUESTIONS]);
  expect(parsed.candidates.map((entry) => entry.question)).toEqual([
    "plan.obligation_coverage", "evidence.sufficiency", "verify.production_wiring",
    "review.failure_coverage", "review.finding_resolution",
  ]);
});

test("comparison_rejects_changed_model", () => {
  expect(() => validateCatalog({ ...catalog, model: OTHER_MODEL })).toThrow(new OrlyError(CHECK_ERROR.schema));
});

test("comparison_rejects_changed_baseline_definition", () => {
  const changed = structuredClone(catalog);
  for (const entry of changed.baseline) entry.definition_digest = WRONG_DIGEST;
  expect(() => validateCatalog(changed)).toThrow(new OrlyError(CHECK_ERROR.baseline));
});

test("comparison_rejects_missing_baseline_question", () => {
  expect(() => validateCatalog({ ...catalog, baseline: catalog.baseline.slice(1) })).toThrow(new OrlyError(CHECK_ERROR.schema));
});

test("comparison_rejects_duplicate_baseline_question", () => {
  const first = catalog.baseline.at(0);
  expect(first).toBeDefined();
  expect(() => validateCatalog({ ...catalog, baseline: catalog.baseline.map(() => first) })).toThrow(new OrlyError(CHECK_ERROR.baseline));
});

test("candidate_inputs_are_complete", () => {
  const parsed = validateCatalog(catalog);
  for (const candidate of parsed.candidates) {
    expect(candidate.required_roles.length).toBeGreaterThan(0);
    expect(Object.keys(candidate.criteria).sort()).toEqual(["ambiguous", "defective", "insufficient", "supported"]);
  }
});

test("comparison_rejects_missing_candidate", () => {
  expect(() => validateCatalog({ ...catalog, candidates: catalog.candidates.slice(1) })).toThrow(new OrlyError(CHECK_ERROR.schema));
});

test("comparison_rejects_duplicate_candidates", () => {
  const first = catalog.candidates.at(0);
  expect(first).toBeDefined();
  expect(() => validateCatalog({ ...catalog, candidates: catalog.candidates.map(() => first) })).toThrow(new OrlyError(CHECK_ERROR.candidates));
});

test("comparison_rejects_missing_evidence_roles", () => {
  const candidates = catalog.candidates.map((entry) => ({ ...entry, required_roles: entry.required_roles.slice(1) }));
  expect(() => validateCatalog({ ...catalog, candidates })).toThrow(new OrlyError(CHECK_ERROR.roles));
});

test("comparison_rejects_empty_question_instructions", () => {
  const candidates = catalog.candidates.map((entry) => ({ ...entry, instructions: "" }));
  expect(() => validateCatalog({ ...catalog, candidates })).toThrow(new OrlyError(CHECK_ERROR.schema));
});

test("comparison_rejects_unbounded_answer_fields", () => {
  const candidates = catalog.candidates.map((entry) => ({ ...entry, criteria: { ...entry.criteria, run_command: "true" } }));
  expect(() => validateCatalog({ ...catalog, candidates })).toThrow(new OrlyError(CHECK_ERROR.schema));
});

test("comparison_rejects_unknown_catalog_fields", () => {
  expect(() => validateCatalog({ ...catalog, enable_remote: true })).toThrow(new OrlyError(CHECK_ERROR.schema));
});

test("comparison_rejects_invalid_provenance", async () => {
  const { root, entry } = await caseFixture();
  const checked = validateCatalog(catalog);
  expect(await validateCases(root, checked, [entry])).toEqual([entry]);
  const changed = { ...entry, evidence: entry.evidence.map((item) => ({ ...item, source: { ...item.source, digest: WRONG_DIGEST } })) };
  await expect(validateCases(root, checked, [changed])).rejects.toThrow(new OrlyError(CHECK_ERROR.source));
});

test("comparison_rejects_duplicate_cases", async () => {
  const { root, entry } = await caseFixture();
  await expect(validateCases(root, validateCatalog(catalog), [entry, entry])).rejects.toThrow(new OrlyError(CHECK_ERROR.duplicate));
});

test("comparison_rejects_copied_evidence_with_changed_identity", async () => {
  const { root, entry } = await caseFixture();
  const copied = { ...entry, id: "copied-case", origin: "invented-origin", split: SPLIT.heldout };
  await expect(validateCases(root, validateCatalog(catalog), [entry, copied])).rejects.toThrow(new OrlyError(CHECK_ERROR.duplicate));
});

test("comparison_rejects_origin_crossing_splits", async () => {
  const { root, entry } = await caseFixture();
  const copied = { ...entry, id: "second-case", requirement: "State the locale needed by the formatter.", split: SPLIT.heldout };
  await expect(validateCases(root, validateCatalog(catalog), [entry, copied])).rejects.toThrow(new OrlyError(CHECK_ERROR.split));
});

test("comparison_rejects_invented_evidence_text", async () => {
  const { root, entry } = await caseFixture();
  const changed = { ...entry, evidence: entry.evidence.map((item) => ({ ...item, content: "Unrelated invented source." })) };
  await expect(validateCases(root, validateCatalog(catalog), [changed])).rejects.toThrow(new OrlyError(CHECK_ERROR.source));
});

test("comparison_rejects_incomplete_case_roles", async () => {
  const { root, entry } = await caseFixture();
  const changed = { ...entry, evidence: entry.evidence.map((item) => ({ ...item, role: ROLE.context })) };
  await expect(validateCases(root, validateCatalog(catalog), [changed])).rejects.toThrow(new OrlyError(CHECK_ERROR.evidence));
});

test("comparison_rejects_empty_case_corpus", async () => {
  const { root } = await caseFixture();
  await expect(validateCases(root, validateCatalog(catalog), [])).rejects.toThrow(new OrlyError(CHECK_ERROR.cases));
});
