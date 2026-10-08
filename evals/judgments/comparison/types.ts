import { z } from "zod";

import { CATALOG_VERSION, CHOICE, MAX_EVIDENCE, MAX_REQUIREMENT_LENGTH, MAX_STATE_BYTES, MODEL, QUESTIONS, ROLE } from "../../../src/judgments/constants";

export const CANDIDATE = {
  obligation: "plan.obligation_coverage", evidence: "evidence.sufficiency", wiring: "verify.production_wiring",
  failure: "review.failure_coverage", resolution: "review.finding_resolution",
} as const;
export const CLASSIFICATION = {
  supported: "supported", defective: "defective", ambiguous: "ambiguous", insufficient: CHOICE.insufficient,
} as const;
export const CASE_CLASS = {
  healthy: "healthy", defective: CLASSIFICATION.defective, ambiguous: CLASSIFICATION.ambiguous, insufficient: "insufficient-evidence",
} as const;
export const SPLIT = { development: "development", heldout: "heldout" } as const;
export const NATIVE = { yes: "yes", no: "no", abstain: "abstain" } as const;
export const ADJUDICATION = { resolved: "resolved", pending: "pending", disputed: "disputed" } as const;
export const LABEL_AUTHORITY = { oracle: "oracle", reviewer: "reviewer" } as const;
export const MIN_RESOLVED_PER_GROUP = 2;
export const OBSERVATION = { valid: "valid", invalid: "invalid", unavailable: "unavailable" } as const;
export const MEASUREMENT = { synthetic: "synthetic", editable: "editable-replay", independent: "independent-measured", live: "live-provider" } as const;
export const TASK_FAMILY = {
  obligation: "missing-obligation", wiring: "missing-production-caller", failure: "missing-failure-proof",
  finding: "unresolved-finding", permission: "required-permission", evidence: "circular-expectation",
} as const;
export const TASK_FILES = { entry: "src/cli.ts", linked: "src/linked.test.ts", input: "input.txt", helper: "src/sum.ts", owner: "owner-policy.txt" } as const;
export const TASK_STATE = { completed: "completed", failed: "failed", blocked: "blocked" } as const;
export const TASK_CONTROL = { healthy: CASE_CLASS.healthy, falseCompletion: "false-completion" } as const;
export const TASK_PERMISSION = { scoped: "existing-scope", missing: "owner-approval-required" } as const;
export const taskDefinitionsSchema = z.array(z.strictObject({
  id: z.enum(Object.values(TASK_FAMILY)), intent: z.string().trim().min(1).max(MAX_REQUIREMENT_LENGTH),
  allowed_actions: z.array(z.string().min(1).max(MAX_REQUIREMENT_LENGTH)).min(1).max(MAX_EVIDENCE),
  permission: z.enum(Object.values(TASK_PERMISSION)),
})).length(Object.keys(TASK_FAMILY).length);
export type TaskDefinition = z.infer<typeof taskDefinitionsSchema>[number];
export const MAX_CASES = 512;
const EVIDENCE_ROLE = {
  obligation: "obligation", dimensions: "dimensions", question: "question", sources: "sources", dependencies: "dependencies",
  entrypoint: "entrypoint", chain: "call_chain", configuration: "configuration", failure: "failure", handler: "handler",
  finding: "finding", original: "original", repair: "repair", regression: "regression",
} as const;
export const CANDIDATE_ROLES = {
  [CANDIDATE.obligation]: [EVIDENCE_ROLE.obligation, EVIDENCE_ROLE.dimensions, ROLE.rule],
  [CANDIDATE.evidence]: [EVIDENCE_ROLE.question, EVIDENCE_ROLE.sources, EVIDENCE_ROLE.dependencies],
  [CANDIDATE.wiring]: [EVIDENCE_ROLE.entrypoint, EVIDENCE_ROLE.chain, EVIDENCE_ROLE.configuration, ROLE.implementation],
  [CANDIDATE.failure]: [EVIDENCE_ROLE.failure, EVIDENCE_ROLE.handler, ROLE.test],
  [CANDIDATE.resolution]: [EVIDENCE_ROLE.finding, EVIDENCE_ROLE.original, EVIDENCE_ROLE.repair, EVIDENCE_ROLE.regression],
} as const;
export const CHECK_ERROR = {
  schema: "Comparison catalog does not match the bounded schema.",
  baseline: "Comparison baseline differs from the six runtime question definitions.",
  candidates: "Comparison must contain each of the five candidates exactly once.",
  roles: "Candidate evidence roles differ from the required complete input set.",
  cases: "Comparison cases do not match the bounded schema.",
  duplicate: "Comparison contains a duplicate case or copied evidence under another identity.",
  split: "An originating family crosses development and held-out splits.",
  evidence: "Case evidence roles are incomplete or duplicated.",
  source: "Case evidence does not match its source digest and complete selected text.",
  labels: "Comparison labels do not match the bounded schema.",
  labelIdentity: "Label identity, fixture author or task class differs from its case.",
  independence: "A resolved label lacks matching independently verified evidence.",
  minimum: "Every question, class and split requires two independently resolved labels.",
  native: "The expected native answer does not belong to this question's answer type.",
  observations: "Comparison observations do not match every attempted case exactly once.",
} as const;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const text = z.string().trim().min(1).max(MAX_REQUIREMENT_LENGTH);
const candidateSchema = z.strictObject({
  question: z.enum(Object.values(CANDIDATE)),
  required_roles: z.array(text).min(1).max(Object.keys(EVIDENCE_ROLE).length),
  instructions: text,
  criteria: z.strictObject({
    [CLASSIFICATION.supported]: text, [CLASSIFICATION.defective]: text,
    [CLASSIFICATION.ambiguous]: text, [CLASSIFICATION.insufficient]: text,
  }),
  action: text,
});
export const catalogSchema = z.strictObject({
  schema_version: z.literal(CATALOG_VERSION),
  model: z.literal(MODEL),
  baseline: z.array(z.strictObject({ question: z.enum(QUESTIONS), definition_digest: z.string().regex(DIGEST_PATTERN) })).length(QUESTIONS.length),
  candidates: z.array(candidateSchema).length(Object.keys(CANDIDATE).length),
});
export type ComparisonCatalog = z.infer<typeof catalogSchema>;
const sourceSchema = z.strictObject({ path: text, digest: z.string().regex(DIGEST_PATTERN) });
export const casesSchema = z.array(z.strictObject({
  id: text,
  question: z.enum([...QUESTIONS, ...Object.values(CANDIDATE)]),
  origin: text,
  split: z.enum(Object.values(SPLIT)),
  classification: z.enum(Object.values(CASE_CLASS)),
  author: text,
  requirement: text,
  evidence: z.array(z.strictObject({ role: text, content: z.string().trim().min(1).max(MAX_STATE_BYTES), source: sourceSchema })).min(1).max(MAX_EVIDENCE),
})).min(1).max(MAX_CASES);
export type ComparisonCase = z.infer<typeof casesSchema>[number];
export type CaseClassification = ComparisonCase["classification"];
export const corpusCasesSchema = z.array(casesSchema.element.omit({ evidence: true }).extend({
  evidence: z.array(z.strictObject({ role: text, content: z.string().trim().min(1).max(MAX_STATE_BYTES) })).min(1).max(MAX_EVIDENCE),
})).min(1).max(MAX_CASES);
const nativeAnswer = z.enum([...Object.values(NATIVE), ...Object.values(CHOICE), ...Object.values(CLASSIFICATION)]);
const authoritySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(LABEL_AUTHORITY.oracle), name: text }),
  z.strictObject({ kind: z.literal(LABEL_AUTHORITY.reviewer), name: text }),
]);
export const labelsSchema = z.array(z.strictObject({
  case_id: text, classification: z.enum(Object.values(CASE_CLASS)), expected_native: nativeAnswer,
  rationale: text, author: text, adjudication: z.enum(Object.values(ADJUDICATION)), authority: authoritySchema,
  source: sourceSchema.extend({ revision: z.string().regex(/^[a-f0-9]{40}$/), selected: text }),
})).min(1).max(MAX_CASES);
export type IndependentLabel = z.infer<typeof labelsSchema>[number];
export type NativeAnswer = IndependentLabel["expected_native"];
export type OracleResult = { expected_native: NativeAnswer; classification: CaseClassification; source_digest: string; revision: string };
export type LabelOracle = (entry: ComparisonCase, label: IndependentLabel) => Promise<OracleResult>;
const probability = z.number().finite().min(0).max(1);
export const observationSchema = z.strictObject({
  case_id: text, identity: z.string().regex(DIGEST_PATTERN), model: z.literal(MODEL),
  measurement: z.enum(Object.values(MEASUREMENT)), status: z.enum(Object.values(OBSERVATION)),
  answer: z.union([z.null(), z.strictObject({ decision: nativeAnswer, strength: probability })]),
});
export type Observation = z.infer<typeof observationSchema>;
