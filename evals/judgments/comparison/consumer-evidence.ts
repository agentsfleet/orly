import { lstatSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { MAX_SOURCE_BYTES } from "../../../src/judgments/constants";
import { digest, readBounded } from "../../../src/judgments/files";
import { CONSUMER_SCENARIOS, type ConsumerScenario } from "./consumer-checks";

const MAX_PACKAGE_FILES = 1024;
const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
const CHECK = { clockUs: "caller-clock-en-US", clockGb: "caller-clock-en-GB", exactGb: "exact-locale-en-GB", absoluteGb: "caller-absolute-en-GB" } as const;
const PROBE_CHECKS = ["exact-locale-en-US", CHECK.clockUs, "caller-absolute-en-US", CHECK.exactGb, CHECK.clockGb, CHECK.absoluteGb, "invalid-clock-not-a-date", "invalid-caller-not-a-date", "invalid-clock-", "invalid-caller-"];
const SUBMITTED_CHECKS = ["output-exists"];
const checksSchema = z.array(z.strictObject({ name: z.string(), passed: z.boolean(), error: z.string().optional() })).max(PROBE_CHECKS.length);

export function validConsumerChecks(stdout: string, hidden: boolean, scenario?: ConsumerScenario): boolean {
  try {
    const checks = checksSchema.parse(JSON.parse(stdout));
    const names = hidden ? PROBE_CHECKS : SUBMITTED_CHECKS;
    const failed = scenario === undefined ? [] : expectedFailures(scenario);
    return checks.length === names.length && checks.every((check, index) => check.name === names[index] && check.passed === !failed.includes(check.name));
  } catch { return false; }
}

function expectedFailures(scenario: ConsumerScenario): string[] {
  if (scenario === CONSUMER_SCENARIOS[0] || scenario === CONSUMER_SCENARIOS[4]) return [CHECK.exactGb, CHECK.absoluteGb];
  if (scenario === CONSUMER_SCENARIOS[3]) return PROBE_CHECKS.filter((name) => name.startsWith("invalid-"));
  return [CHECK.clockUs, CHECK.clockGb];
}

export async function packageIdentity(root: string): Promise<{ digest: string; files: number; bytes: number }> {
  const selected: Array<{ path: string; digest: string }> = [];
  let bytes = 0;
  for await (const path of new Bun.Glob("**/*").scan({ cwd: root, dot: true, onlyFiles: true, followSymlinks: false })) {
    if (path.startsWith("node_modules/")) continue;
    if (selected.length >= MAX_PACKAGE_FILES || lstatSync(join(root, path)).isSymbolicLink()) throw new Error("Package inventory is not bounded regular files.");
    const content = await readBounded(join(root, path), MAX_SOURCE_BYTES);
    bytes += Buffer.byteLength(content);
    if (bytes > MAX_PACKAGE_BYTES) throw new Error("Package inventory exceeds its byte budget.");
    selected.push({ path, digest: digest(content) });
  }
  if (selected.length === 0) throw new Error("Package inventory is empty.");
  selected.sort((left, right) => left.path.localeCompare(right.path));
  return { digest: digest(JSON.stringify(selected)), files: selected.length, bytes };
}
