import { OrlyError } from "../../../src/model";
import { KIBIBYTE, MAX_SOURCE_BYTES, QUESTIONS } from "../../../src/judgments/constants";
import { byteLength, containedFile, digest, readBounded } from "../../../src/judgments/files";
import { CATALOG } from "../../../src/judgments/questions";
import { CANDIDATE_ROLES, CHECK_ERROR, catalogSchema, casesSchema, corpusCasesSchema, type ComparisonCase, type ComparisonCatalog } from "./types";

const MAX_VERIFIED_SOURCE_BYTES = 16 * KIBIBYTE * KIBIBYTE;

export function validateCatalog(value: unknown): ComparisonCatalog {
  const parsed = catalogSchema.safeParse(value);
  if (!parsed.success) throw new OrlyError(CHECK_ERROR.schema);
  const catalog = parsed.data;
  for (const [index, entry] of catalog.baseline.entries()) {
    const expected = digest(JSON.stringify(CATALOG[entry.question]));
    if (entry.question !== QUESTIONS[index] || entry.definition_digest !== expected) throw new OrlyError(CHECK_ERROR.baseline);
  }
  const seen = new Set<string>();
  for (const candidate of catalog.candidates) {
    if (seen.has(candidate.question)) throw new OrlyError(CHECK_ERROR.candidates);
    seen.add(candidate.question);
    const expected = [...CANDIDATE_ROLES[candidate.question]].sort();
    if (JSON.stringify([...candidate.required_roles].sort()) !== JSON.stringify(expected)) throw new OrlyError(CHECK_ERROR.roles);
  }
  return catalog;
}

export async function validateCases(root: string, catalog: ComparisonCatalog, value: unknown): Promise<ComparisonCase[]> {
  const parsed = casesSchema.safeParse(value);
  if (!parsed.success) throw new OrlyError(CHECK_ERROR.cases);
  const seen = new Set<string>();
  const payloads = new Set<string>();
  const origins = new Map<string, string>();
  const sources = new Map<string, string>();
  let verifiedBytes = 0;
  for (const entry of parsed.data) {
    const identity = digest(JSON.stringify({ question: entry.question, requirement: entry.requirement,
      evidence: entry.evidence.map(({ role, content }) => ({ role, content })).sort((left, right) => left.role.localeCompare(right.role)) }));
    if (seen.has(entry.id) || payloads.has(identity)) throw new OrlyError(CHECK_ERROR.duplicate);
    seen.add(entry.id); payloads.add(identity);
    const split = origins.get(entry.origin);
    if (split !== undefined && split !== entry.split) throw new OrlyError(CHECK_ERROR.split);
    origins.set(entry.origin, entry.split);
    validateRoles(catalog, entry);
    for (const evidence of entry.evidence) {
      const path = containedFile(root, evidence.source.path);
      let source = sources.get(path);
      if (source === undefined) {
        source = await readBounded(path, Math.min(MAX_SOURCE_BYTES, MAX_VERIFIED_SOURCE_BYTES - verifiedBytes));
        verifiedBytes += byteLength(source);
        sources.set(path, source);
      }
      if (digest(source) !== evidence.source.digest || !containsSelectedEvidence(source, entry.id, evidence)) throw new OrlyError(CHECK_ERROR.source);
    }
  }
  return parsed.data;
}

function containsSelectedEvidence(source: string, id: string, evidence: ComparisonCase["evidence"][number]): boolean {
  if (source.includes(evidence.content)) return true;
  try {
    const parsed = corpusCasesSchema.safeParse(JSON.parse(source));
    return parsed.success && parsed.data.some((entry) => entry.id === id && entry.evidence.some((item) => item.role === evidence.role && item.content === evidence.content));
  } catch { return false; }
}

function validateRoles(catalog: ComparisonCatalog, entry: ComparisonCase): void {
  const roles = new Set(entry.evidence.map((item) => item.role));
  if (roles.size !== entry.evidence.length) throw new OrlyError(CHECK_ERROR.evidence);
  const baseline = catalog.baseline.find((item) => item.question === entry.question);
  if (baseline) {
    const definition = CATALOG[baseline.question];
    if (definition.requiredRoles.some((role) => !roles.has(role)) ||
      (definition.oneOfRoles.length > 0 && !definition.oneOfRoles.some((role) => roles.has(role)))) throw new OrlyError(CHECK_ERROR.evidence);
    return;
  }
  const candidate = catalog.candidates.find((item) => item.question === entry.question);
  if (!candidate || candidate.required_roles.some((role) => !roles.has(role))) throw new OrlyError(CHECK_ERROR.evidence);
}
