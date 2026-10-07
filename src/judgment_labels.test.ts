import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import catalogInput from "../evals/judgments/comparison/catalog.json";
import { validateLabels } from "../evals/judgments/comparison/labels";
import { validateCatalog } from "../evals/judgments/comparison/validate";
import { ADJUDICATION, CANDIDATE, CASE_CLASS, CHECK_ERROR, CLASSIFICATION, LABEL_AUTHORITY, MIN_RESOLVED_PER_GROUP, NATIVE, SPLIT,
  type ComparisonCase, type IndependentLabel, type LabelOracle } from "../evals/judgments/comparison/types";
import { cleanupTemporaryDirectories, temporaryDirectory } from "./gates_test_support";
import { CHOICE, QUESTIONS } from "./judgments/constants";
import { digest } from "./judgments/files";

const FIXTURE_AUTHOR = "label-fixture-author";
const ORACLE_NAME = "independent-test-boundary";
const SOURCE_PATH = "reference.md";
const SOURCE_CONTENT = "An independently sourced expected value is compared with the selected result.\n";
const REVISION_LENGTH = 40;
const REVISION = "1".repeat(REVISION_LENGTH);
const catalog = validateCatalog(catalogInput);

afterEach(cleanupTemporaryDirectories);

function nativeAnswer(question: string, classification: ComparisonCase["classification"]): IndependentLabel["expected_native"] {
  if (question === QUESTIONS[2]) return classification === CASE_CLASS.healthy ? CHOICE.exact : classification === CASE_CLASS.defective ? CHOICE.weak
    : classification === CASE_CLASS.ambiguous ? NATIVE.abstain : CHOICE.insufficient;
  if (QUESTIONS.some((item) => item === question)) return classification === CASE_CLASS.healthy ? NATIVE.yes
    : classification === CASE_CLASS.defective ? NATIVE.no : NATIVE.abstain;
  return classification === CASE_CLASS.healthy ? CLASSIFICATION.supported : classification === CASE_CLASS.defective ? CLASSIFICATION.defective
    : classification === CASE_CLASS.ambiguous ? CLASSIFICATION.ambiguous : CLASSIFICATION.insufficient;
}

async function fixture() {
  const root = temporaryDirectory();
  await Bun.write(join(root, SOURCE_PATH), SOURCE_CONTENT);
  const cases: ComparisonCase[] = [];
  const labels: IndependentLabel[] = [];
  for (const question of [...QUESTIONS, ...Object.values(CANDIDATE)]) for (const classification of Object.values(CASE_CLASS)) {
    for (const split of Object.values(SPLIT)) for (let index = 0; index < MIN_RESOLVED_PER_GROUP; index++) {
      const id = `${question}-${classification}-${split}-${index}`;
      cases.push({ id, question, classification, split, author: FIXTURE_AUTHOR, origin: `${question}-${split}`,
        requirement: `Independent unit boundary ${id}`, evidence: [] });
      labels.push({ case_id: id, classification, expected_native: nativeAnswer(question, classification), rationale: SOURCE_CONTENT.trim(),
        author: FIXTURE_AUTHOR, adjudication: ADJUDICATION.resolved, authority: { kind: LABEL_AUTHORITY.oracle, name: ORACLE_NAME },
        source: { path: SOURCE_PATH, digest: digest(SOURCE_CONTENT), revision: REVISION, selected: SOURCE_CONTENT.trim() } });
    }
  }
  const oracle: LabelOracle = async (entry) => ({ classification: entry.classification, expected_native: nativeAnswer(entry.question, entry.classification),
    source_digest: digest(SOURCE_CONTENT), revision: REVISION });
  return { root, cases, labels, oracle };
}

test("labels_require_independent_evidence", async () => {
  const { root, cases, labels, oracle } = await fixture();
  expect(await validateLabels(root, catalog, cases, labels, oracle)).toEqual(labels);
  const selfReviewed = labels.map((label) => ({ ...label, authority: { kind: LABEL_AUTHORITY.reviewer, name: FIXTURE_AUTHOR } }));
  await expect(validateLabels(root, catalog, cases, selfReviewed, oracle)).rejects.toThrow(CHECK_ERROR.independence);
});

test("all_pending_and_all_disputed_labels_cannot_satisfy_minimums", async () => {
  const { root, cases, labels, oracle } = await fixture();
  for (const adjudication of [ADJUDICATION.pending, ADJUDICATION.disputed]) {
    await expect(validateLabels(root, catalog, cases, labels.map((label) => ({ ...label, adjudication })), oracle)).rejects.toThrow(CHECK_ERROR.minimum);
  }
});

test("a_missing_independent_source_and_invented_selected_text_refuse_labels", async () => {
  const { root, cases, labels, oracle } = await fixture();
  const absent = labels.map((label) => ({ ...label, source: { ...label.source, path: "absent-reference.md" } }));
  await expect(validateLabels(root, catalog, cases, absent, oracle)).rejects.toThrow();
  const fabricated = labels.map((label) => ({ ...label, source: { ...label.source, selected: "Invented label approval." } }));
  await expect(validateLabels(root, catalog, cases, fabricated, oracle)).rejects.toThrow(CHECK_ERROR.independence);
});

test("an_independence_flag_cannot_replace_external_oracle_proof", async () => {
  const { root, cases, labels, oracle } = await fixture();
  await expect(validateLabels(root, catalog, cases, labels.map((label) => ({ ...label, independent: true })), oracle)).rejects.toThrow(CHECK_ERROR.labels);
  const wrongOracle: LabelOracle = async (entry, label) => ({ ...(await oracle(entry, label)), expected_native: CLASSIFICATION.defective });
  await expect(validateLabels(root, catalog, cases, labels, wrongOracle)).rejects.toThrow(CHECK_ERROR.independence);
});

test("stale_oracle_revision_and_changed_label_evidence_refuse_labels", async () => {
  const { root, cases, labels, oracle } = await fixture();
  const stale: LabelOracle = async (entry, label) => ({ ...(await oracle(entry, label)), revision: "2".repeat(REVISION_LENGTH) });
  await expect(validateLabels(root, catalog, cases, labels, stale)).rejects.toThrow(CHECK_ERROR.independence);
  await Bun.write(join(root, SOURCE_PATH), "Changed independent evidence.\n");
  await expect(validateLabels(root, catalog, cases, labels, oracle)).rejects.toThrow(CHECK_ERROR.independence);
});

test("missing_duplicate_and_mismatched_labels_refuse_scoring", async () => {
  const { root, cases, labels, oracle } = await fixture();
  await expect(validateLabels(root, catalog, cases, labels.slice(1), oracle)).rejects.toThrow(CHECK_ERROR.labelIdentity);
  await expect(validateLabels(root, catalog, cases, [...labels, labels[0]], oracle)).rejects.toThrow(CHECK_ERROR.labelIdentity);
  await expect(validateLabels(root, catalog, cases, labels.map((label) => ({ ...label, author: "invented-author" })), oracle)).rejects.toThrow(CHECK_ERROR.labelIdentity);
});

test("labels_cannot_change_answer_types_or_relabel_case_health", async () => {
  const { root, cases, labels, oracle } = await fixture();
  await expect(validateLabels(root, catalog, cases, labels.map((label) => ({ ...label, expected_native: CHOICE.exact })), oracle)).rejects.toThrow(CHECK_ERROR.native);
  await expect(validateLabels(root, catalog, cases, labels.map((label) => ({ ...label, classification: CASE_CLASS.defective })), oracle)).rejects.toThrow(CHECK_ERROR.labelIdentity);
});

test("frozen_reference_bytes_validate_without_git_history_and_reject_modified_sources", async () => {
  const { resolve } = await import("node:path");
  const { loadCases } = await import("../evals/judgments/comparison/corpus");
  const { verifyCaseLabel } = await import("../evals/judgments/comparison/hidden/label-oracle");
  const { labelsSchema } = await import("../evals/judgments/comparison/types");
  const { default: input } = await import("../evals/judgments/comparison/labels.json");
  const sourceRoot = resolve(import.meta.dir, "..");
  const label = labelsSchema.parse(input)[0];
  if (!label) throw new Error("Missing independent label.");
  const entry = (await loadCases(sourceRoot)).find((entry) => entry.id === label.case_id);
  if (!entry) throw new Error("Missing sourced case.");
  const root = temporaryDirectory();
  const source = join(root, label.source.path);
  await Bun.write(source, Bun.file(join(sourceRoot, label.source.path)));
  expect((await verifyCaseLabel(root, entry, label)).source_digest).toBe(label.source.digest);
  await Bun.write(source, "Changed reference bytes.");
  await expect(verifyCaseLabel(root, entry, label)).rejects.toThrow(CHECK_ERROR.independence);
});
