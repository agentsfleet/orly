import { z } from "zod";

import { OrlyError } from "../../../../src/model";
import { CHOICE, MAX_SOURCE_BYTES, QUESTIONS } from "../../../../src/judgments/constants";
import { digest, readBounded } from "../../../../src/judgments/files";
import { DOMAIN, ORACLE_NAME, REFERENCE, REFERENCE_REVISION } from "../corpus";
import { CANDIDATE, CASE_CLASS, CHECK_ERROR, CLASSIFICATION, LABEL_AUTHORITY, NATIVE,
  type CaseClassification, type ComparisonCase, type IndependentLabel, type NativeAnswer, type OracleResult } from "../types";

const TEXT = z.string().min(1).max(256);
const STRINGS = z.array(TEXT).max(8);
const CONTEXT = z.strictObject({ domain: z.enum(Object.values(DOMAIN)), input: STRINGS.min(1),
  requirements: STRINGS.min(1), alternatives: z.array(STRINGS).max(2), missing: STRINGS });
const FACTS = z.strictObject({ names: STRINGS.optional(), observed: z.string().max(256).optional(),
  expected: z.string().max(256).optional(), trigger: TEXT.optional(), exception: z.boolean().optional(),
  edges: z.array(z.tuple([TEXT, TEXT])).max(8).optional(), enabled: z.boolean().optional(),
  target: TEXT.optional(), entry: TEXT.optional(), mutants: STRINGS.optional() });
const PROBE_ERROR = "Independent oracle cannot ground this selected fixture.";
const LOCALE = "en-GB";
const ZONE = "UTC";
const TWO_DIGITS = "2-digit";
const FORMAT = { year: "numeric", month: "short", day: TWO_DIGITS, hour: TWO_DIGITS, minute: TWO_DIGITS, hour12: false, timeZone: ZONE } as const;
const ROLES = { spec: "spec", implementation: "implementation", test: "test", rule: "rule", claim: "claim",
  obligation: "obligation", dimensions: "dimensions", question: "question", sources: "sources", dependencies: "dependencies",
  entrypoint: "entrypoint", chain: "call_chain", configuration: "configuration", failure: "failure", handler: "handler",
  finding: "finding", original: "original", repair: "repair", regression: "regression" } as const;
const MUTANT = "wrong-result";
const REFUSAL = "exit=2;stdout=;released=true";
export type LabelContext = z.infer<typeof CONTEXT>;

export function independentlyExpected(entry: ComparisonCase) {
  const context = CONTEXT.parse(JSON.parse(entry.requirement));
  const facts = new Map(entry.evidence.map((item) => [item.role, FACTS.parse(JSON.parse(item.content))]));
  const fact = (role: string) => { const value = facts.get(role); if (!value) throw new OrlyError(PROBE_ERROR); return value; };
  const reference = context.domain === DOMAIN.counts ? REFERENCE.counts : REFERENCE.locale;
  let classification: CaseClassification;
  if ([...facts.values()].some((value) => Object.keys(value).length === 0)) classification = CASE_CLASS.insufficient;
  else if (context.alternatives.length > 1 && JSON.stringify(context.alternatives[0]) !== JSON.stringify(context.alternatives[1])) classification = CASE_CLASS.ambiguous;
  else classification = propertySupported(entry.question, context, fact) ? CASE_CLASS.healthy : CASE_CLASS.defective;
  return { classification, expected_native: nativeAnswer(entry.question, classification), reference };
}

type Fact = z.infer<typeof FACTS>;
function propertySupported(question: string, context: LabelContext, fact: (role: string) => Fact): boolean {
  const includes = (values: string[] | undefined) => context.requirements.every((value) => values?.includes(value));
  const exact = (value: Fact) => value.expected === nativeValue(context) && value.observed === nativeValue(context);
  switch (question) {
    case QUESTIONS[0]: return includes(fact(ROLES.spec).names);
    case QUESTIONS[1]: return Boolean(fact(ROLES.spec).trigger) && fact(ROLES.spec).expected === nativeValue(context);
    case QUESTIONS[2]: return fact(ROLES.test).expected === nativeValue(context) && fact(ROLES.test).target === fact(ROLES.implementation).target;
    case QUESTIONS[3]: return fact(ROLES.implementation).observed === REFUSAL;
    case QUESTIONS[4]: return fact(ROLES.rule).trigger === fact(ROLES.implementation).trigger && !fact(ROLES.rule).exception;
    case QUESTIONS[5]: return fact(ROLES.claim).expected === nativeValue(context) && fact(ROLES.implementation).observed === nativeValue(context);
    case CANDIDATE.obligation: return includes(fact(ROLES.dimensions).names) && includes(fact(ROLES.rule).names);
    case CANDIDATE.evidence: return (fact(ROLES.dependencies).names ?? []).every((name) => fact(ROLES.sources).names?.includes(name));
    case CANDIDATE.wiring: return fact(ROLES.configuration).enabled === true && reachable(fact(ROLES.entrypoint).entry, fact(ROLES.implementation).target, fact(ROLES.chain).edges ?? []);
    case CANDIDATE.failure: return fact(ROLES.handler).observed === REFUSAL && fact(ROLES.test).observed === REFUSAL &&
      fact(ROLES.test).target === fact(ROLES.failure).target && fact(ROLES.test).mutants?.includes(MUTANT) === true;
    case CANDIDATE.resolution: return fact(ROLES.original).observed !== nativeValue(context) && fact(ROLES.repair).observed === nativeValue(context) &&
      exact(fact(ROLES.regression)) && fact(ROLES.regression).mutants?.includes(MUTANT) === true;
    default: throw new OrlyError(PROBE_ERROR);
  }
}

function reachable(entry: string | undefined, target: string | undefined, edges: string[][]): boolean {
  if (!entry || !target) throw new OrlyError(PROBE_ERROR);
  const reached = new Set([entry]);
  for (let pass = 0; pass < edges.length; pass++) for (const [from, to] of edges) if (from && to && reached.has(from)) reached.add(to);
  return reached.has(target);
}

function nativeValue(context: LabelContext): string {
  if (context.domain === DOMAIN.counts) {
    if (!context.input.every((value) => /^(0|[1-9][0-9]*)$/.test(value))) throw new OrlyError(PROBE_ERROR);
    return context.input.reduce((total, value) => total + BigInt(value), 0n).toString();
  }
  const instant = context.input[0];
  if (!instant || !Number.isFinite(Date.parse(instant))) throw new OrlyError(PROBE_ERROR);
  const parts = new Map(new Intl.DateTimeFormat(LOCALE, FORMAT).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts.get("day")} ${parts.get("month")} ${parts.get("year")}, ${parts.get("hour")}:${parts.get("minute")}`;
}

export async function verifyCaseLabel(root: string, entry: ComparisonCase, label: IndependentLabel): Promise<OracleResult> {
  const result = independentlyExpected(entry);
  if (label.authority.kind !== LABEL_AUTHORITY.oracle || label.authority.name !== ORACLE_NAME || label.source.path !== result.reference.path ||
    label.source.selected !== result.reference.selected || label.source.revision !== REFERENCE_REVISION) throw new OrlyError(CHECK_ERROR.independence);
  const source = await readBounded(`${root}/${result.reference.path}`, MAX_SOURCE_BYTES);
  // The historical bytes were checked at authoring; shallow clones retain the frozen digest.
  if (digest(source) !== result.reference.digest) throw new OrlyError(CHECK_ERROR.independence);
  return { expected_native: result.expected_native, classification: result.classification, source_digest: digest(source), revision: REFERENCE_REVISION };
}

function nativeAnswer(question: string, classification: CaseClassification): NativeAnswer {
  if (question === QUESTIONS[2]) return classification === CASE_CLASS.healthy ? CHOICE.exact : classification === CASE_CLASS.defective ? CHOICE.weak
    : classification === CASE_CLASS.ambiguous ? NATIVE.abstain : CHOICE.insufficient;
  if (QUESTIONS.some((item) => item === question)) return classification === CASE_CLASS.healthy ? NATIVE.yes : classification === CASE_CLASS.defective ? NATIVE.no : NATIVE.abstain;
  return classification === CASE_CLASS.healthy ? CLASSIFICATION.supported : classification === CASE_CLASS.defective ? CLASSIFICATION.defective
    : classification === CASE_CLASS.ambiguous ? CLASSIFICATION.ambiguous : CLASSIFICATION.insufficient;
}
