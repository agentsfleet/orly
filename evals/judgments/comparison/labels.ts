import { OrlyError } from "../../../src/model";
import { ANSWER_KIND, CHOICE, MAX_SOURCE_BYTES, QUESTIONS } from "../../../src/judgments/constants";
import { containedFile, digest, readBounded } from "../../../src/judgments/files";
import { CATALOG } from "../../../src/judgments/questions";
import { ADJUDICATION, CASE_CLASS, CHECK_ERROR, CLASSIFICATION, LABEL_AUTHORITY, MIN_RESOLVED_PER_GROUP, NATIVE, SPLIT,
  labelsSchema, type ComparisonCase, type ComparisonCatalog, type IndependentLabel, type LabelOracle } from "./types";

export async function validateLabels(root: string, catalog: ComparisonCatalog, cases: ComparisonCase[], value: unknown,
  oracle: LabelOracle): Promise<IndependentLabel[]> {
  const parsed = labelsSchema.safeParse(value);
  if (!parsed.success) throw new OrlyError(CHECK_ERROR.labels);
  const seen = new Set<string>();
  const groups = new Map<string, number>();
  for (const label of parsed.data) {
    const entry = cases.find((item) => item.id === label.case_id);
    if (!entry || seen.has(label.case_id) || label.author !== entry.author || label.classification !== entry.classification) {
      throw new OrlyError(CHECK_ERROR.labelIdentity);
    }
    seen.add(label.case_id);
    validateNative(entry, label);
    if (label.adjudication !== ADJUDICATION.resolved) continue;
    await verifyLabel(root, entry, label, oracle);
    const key = groupKey(entry.question, entry.classification, entry.split);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  if (seen.size !== cases.length) throw new OrlyError(CHECK_ERROR.labelIdentity);
  for (const question of [...catalog.baseline, ...catalog.candidates]) {
    for (const classification of Object.values(CASE_CLASS)) for (const split of Object.values(SPLIT)) {
      if ((groups.get(groupKey(question.question, classification, split)) ?? 0) < MIN_RESOLVED_PER_GROUP) {
        throw new OrlyError(CHECK_ERROR.minimum);
      }
    }
  }
  return parsed.data;
}

function groupKey(question: string, classification: string, split: string): string {
  return JSON.stringify([question, classification, split]);
}

function validateNative(entry: ComparisonCase, label: IndependentLabel): void {
  if (!nativeAnswers(entry.question).some((answer) => answer === label.expected_native)) throw new OrlyError(CHECK_ERROR.native);
}

export function nativeAnswers(question: string): readonly string[] {
  const baseline = QUESTIONS.find((item) => item === question);
  return baseline ? CATALOG[baseline].question.type === ANSWER_KIND.noul ? Object.values(NATIVE) : [...Object.values(CHOICE), NATIVE.abstain]
    : Object.values(CLASSIFICATION);
}

async function verifyLabel(root: string, entry: ComparisonCase, label: IndependentLabel, oracle: LabelOracle): Promise<void> {
  if (label.authority.name === entry.author) throw new OrlyError(CHECK_ERROR.independence);
  if (label.authority.kind === LABEL_AUTHORITY.oracle && entry.evidence.some((item) => item.source.path === label.source.path)) {
    throw new OrlyError(CHECK_ERROR.independence);
  }
  const source = await readBounded(containedFile(root, label.source.path), MAX_SOURCE_BYTES);
  if (digest(source) !== label.source.digest || !source.includes(label.source.selected)) throw new OrlyError(CHECK_ERROR.independence);
  const verified = await oracle(entry, label);
  if (verified.expected_native !== label.expected_native || verified.classification !== label.classification ||
    verified.source_digest !== label.source.digest || verified.revision !== label.source.revision) throw new OrlyError(CHECK_ERROR.independence);
}
