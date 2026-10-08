import { join } from "node:path";
import { z } from "zod";

import { OrlyError } from "../../../src/model";
import { MAX_SOURCE_BYTES, ROLE } from "../../../src/judgments/constants";
import { digest, readBounded } from "../../../src/judgments/files";
import { selectSyntax } from "../../../src/judgments/syntax";
import { CONSUMER_REVISION, CONSUMER_SCENARIOS, CONSUMER_SOURCE, CONSUMER_TEST, OWNER_FILES, consumerProbe, mutateConsumer, type ConsumerScenario } from "./consumer-checks";
import { validConsumerChecks } from "./consumer-evidence";
import { jevInput, providerQuestion, type JevExample } from "./jev";
import { CANDIDATE, CANDIDATE_ROLES, CLASSIFICATION, NATIVE, type ComparisonCatalog, type NativeAnswer } from "./types";

export const CONSUMER_JEV_ERROR = "Actual consumer evidence is missing, stale or does not prove the required rehearsal outcomes.";
const SOURCE_CAPTURE = "consumer-source.txt";
const PROBE_FILE = "probe.ts";
const VERSION = "0.13.0";
const STEP = { submitted: "submitted", hidden: "hidden", repaired: "repaired" } as const;
const HASH = z.string().regex(/^[a-f0-9]{64}$/);
const commandSchema = z.object({ source_before: HASH, source_after: HASH, stdout: z.string(),
  result: z.object({ exit_code: z.number().int().nullable(), failure: z.string().optional() }) });
export const consumerReceiptSchema = z.object({ passed: z.literal(true), failures: z.array(z.string()).length(0),
  metadata: z.object({ revision: z.literal(CONSUMER_REVISION), version: z.literal(VERSION), preservation: z.literal(true),
    original_source: HASH, restored_source: HASH, owner_files: z.record(z.string(), HASH) }),
  attempts: z.array(z.object({ label: z.string(), checks_valid: z.boolean(), receipt: commandSchema })).min(26).max(64) });
type RoleEvidence = { role: string; text: string };

export async function consumerJevExamples(root: string, receiptPath: string, catalog: ComparisonCatalog): Promise<JevExample[]> {
  const report = consumerReceiptSchema.parse(JSON.parse(await readBounded(receiptPath, MAX_SOURCE_BYTES)));
  if (new Set(report.attempts.map((entry) => entry.label)).size !== report.attempts.length) throw new OrlyError(CONSUMER_JEV_ERROR);
  const original = await readBounded(join(root, CONSUMER_SOURCE), MAX_SOURCE_BYTES);
  if (digest(original) !== report.metadata.original_source || digest(original) !== report.metadata.restored_source) throw new OrlyError(CONSUMER_JEV_ERROR);
  for (const file of OWNER_FILES) if (digest(await readBounded(join(root, file), MAX_SOURCE_BYTES)) !== report.metadata.owner_files[file]) throw new OrlyError(CONSUMER_JEV_ERROR);
  const tests = await readBounded(join(root, CONSUMER_TEST), MAX_SOURCE_BYTES);
  const examples: JevExample[] = [];
  for (const scenario of CONSUMER_SCENARIOS) {
    const mutation = mutateConsumer(original, scenario);
    for (const [suffix, hidden, source, exit] of [[STEP.submitted, false, mutation, 0], [STEP.hidden, true, mutation, 1], [STEP.repaired, true, original, 0]] as const) {
      const attempt = report.attempts.find((entry) => entry.label === `${scenario}:${suffix}`);
      const identity = snapshotIdentity(source, consumerProbe(root, hidden));
      if (!attempt || !attempt.checks_valid || attempt.receipt.source_before !== identity || attempt.receipt.source_after !== identity ||
        attempt.receipt.result.exit_code !== exit || attempt.receipt.result.failure !== undefined ||
        !validConsumerChecks(attempt.receipt.stdout, hidden, suffix === STEP.hidden ? scenario : undefined)) throw new OrlyError(CONSUMER_JEV_ERROR);
    }
    examples.push(scenarioExample(root, catalog, original, original, tests, scenario, true));
    examples.push(scenarioExample(root, catalog, mutation, original, tests, scenario, false));
  }
  const span = await selectSyntax(join(root, CONSUMER_SOURCE), original, { kind: "function", name: "formatTimeClock" });
  const selected = original.slice(span.start, span.end);
  for (const supplied of [true, false]) examples.push(contextExample(catalog, selected, supplied));
  return examples;
}

function snapshotIdentity(source: string, probe: string): string {
  return digest(JSON.stringify([{ path: SOURCE_CAPTURE, digest: digest(source) }, { path: PROBE_FILE, digest: digest(probe) }]));
}

function example(catalog: ComparisonCatalog, id: string, question: JevExample["question"], requirement: string,
  evidence: RoleEvidence[], expected: NativeAnswer): JevExample {
  const input = jevInput(providerQuestion(catalog, question), { requirement, evidence });
  return { id, question, expected, input, identity: digest(JSON.stringify({ revision: CONSUMER_REVISION, id, request: input.request })) };
}

function scenarioExample(root: string, catalog: ComparisonCatalog, source: string, original: string, tests: string,
  scenario: ConsumerScenario, healthy: boolean): JevExample {
  const id = `consumer-${scenario}-${healthy ? "restored" : STEP.submitted}`;
  const expected = healthy ? CLASSIFICATION.supported : CLASSIFICATION.defective;
  const code = { role: ROLE.implementation, text: source };
  if (scenario === CONSUMER_SCENARIOS[0]) return example(catalog, id, "document.claim",
    "Absolute date-time output must use the requested locale's Intl.DateTimeFormat result, without adding a locale label.",
    [{ role: ROLE.claim, text: "The absolute formatter produces the requested locale's native date-time format without an added label." }, code], healthy ? NATIVE.yes : NATIVE.no);
  if (scenario === CONSUMER_SCENARIOS[1]) return example(catalog, id, CANDIDATE.obligation,
    "The clock output must include hours, minutes and seconds.", [{ role: "obligation", text: "Clock output includes a two-digit seconds field." },
      { role: "dimensions", text: `The candidate clock Dimension is implemented by CLOCK_OPTIONS and formatTimeClock:\n${source}` },
      { role: ROLE.rule, text: "A concrete implementation Dimension must represent every requested output field." }], expected);
  if (scenario === CONSUMER_SCENARIOS[2]) return example(catalog, id, CANDIDATE.wiring,
    "visibleTimeLabel with format='clock' must reach formatTimeClock.", [{ role: "entrypoint", text: "visibleTimeLabel" },
      { role: "call_chain", text: source }, { role: "configuration", text: "format='clock'; locale='en-GB'; valid date input" }, code], expected);
  if (scenario === CONSUMER_SCENARIOS[3]) return example(catalog, id, CANDIDATE.failure,
    "Invalid date input to the clock helper and its caller must return the em-dash fallback without throwing.",
    [{ role: "failure", text: "An invalid or empty date is passed to formatTimeClock." }, { role: "handler", text: source }, { role: ROLE.test, text: tests }], expected);
  return example(catalog, id, CANDIDATE.resolution,
    "Repair the locale finding's cause and prove the native result; a resolved comment is insufficient.",
    [{ role: "finding", text: "Absolute formatting uses the default locale and adds the requested locale as a prefix, instead of applying it." },
      { role: "original", text: mutateConsumer(original, CONSUMER_SCENARIOS[0]) }, { role: "repair", text: source },
      { role: "regression", text: consumerProbe(root, true) }], expected);
}

function contextExample(catalog: ComparisonCatalog, selected: string, supplied: boolean): JevExample {
  return example(catalog, `consumer-context-${supplied ? "known-gap" : "unknown-dependencies"}`, CANDIDATE.evidence,
    "Is this evidence sufficient to establish the production caller reaches the clock implementation?",
    [{ role: CANDIDATE_ROLES[CANDIDATE.evidence][0], text: "Does visibleTimeLabel with format='clock' reach formatTimeClock?" },
      { role: "sources", text: `Only the complete formatTimeClock function is selected; no caller source is supplied:\n${selected}` },
      { role: "dependencies", text: supplied ? "This decision requires both formatTimeClock and the visibleTimeLabel caller source." : "The dependency summary is absent." }],
    supplied ? CLASSIFICATION.defective : CLASSIFICATION.insufficient);
}
