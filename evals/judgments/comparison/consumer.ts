import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { z } from "zod";

import { MAX_SOURCE_BYTES, MAX_STATE_BYTES, NEWLINE } from "../../../src/judgments/constants";
import { digest, readBounded } from "../../../src/judgments/files";
import { EvaluationRun, type ExecutedReceipt } from "./execution";
import { packageIdentity, validConsumerChecks } from "./consumer-evidence";
import { CONSUMER_BRANCH, CONSUMER_CONFIG, CONSUMER_REVISION, CONSUMER_SCENARIOS, CONSUMER_SOURCE, OWNER_FILES, consumerProbe, mutateConsumer, type ConsumerScenario } from "./consumer-checks";

const GIT = "git";
const DIRECTORY_FLAG = "-C";
const UPDATE = ["update", "--no-hooks"];
const VERSION = "0.13.0";
const SOURCE_CAPTURE = "consumer-source.txt";
const PROBE_FILE = "probe.ts";
const SUCCESS = 0;
const EXPECTED_REJECTION = 1;
const configSchema = z.object({ orly_version: z.string(), commands: z.unknown(), surfaces: z.unknown() });
const packageSchema = z.object({ name: z.literal("@agentsfleet/orly"), version: z.literal(VERSION) });
const argsSchema = z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]);
const report: { attempts: unknown[]; failures: string[]; metadata: Record<string, unknown> } = { attempts: [], failures: [], metadata: {} };

async function capture(root: string, paths: string[]): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const path of paths) {
    if (lstatSync(join(root, path)).isSymbolicLink()) throw new Error("Rehearsal refuses symlinked owner files.");
    values[path] = digest(await readBounded(join(root, path), MAX_SOURCE_BYTES));
  }
  return values;
}

async function execute(run: EvaluationRun, label: string, argv: string[], expected: number,
  probe?: { hidden: boolean; scenario?: ConsumerScenario }): Promise<ExecutedReceipt> {
  try {
    const receipt = await run.execute(argv, [SOURCE_CAPTURE, PROBE_FILE], undefined, undefined, { TZ: "UTC" });
    run.verify(receipt);
    const checksValid = probe === undefined || validConsumerChecks(receipt.stdout, probe.hidden, probe.scenario);
    report.attempts.push({ label, expected, checks_valid: checksValid, receipt });
    if (!checksValid || receipt.result.failure !== undefined || receipt.result.exit_code !== expected) report.failures.push(label);
    return receipt;
  } catch (error) {
    report.attempts.push({ label, expected, state: "incomplete", error: String(error) });
    throw error;
  }
}

async function assertFixture(run: EvaluationRun, root: string): Promise<void> {
  const git = async (...args: string[]) => (await execute(run, args.join(" "), [GIT, DIRECTORY_FLAG, root, ...args], SUCCESS)).stdout.trim();
  if (await git("branch", "--show-current") !== CONSUMER_BRANCH || await git("rev-parse", "HEAD") !== CONSUMER_REVISION ||
    !lstatSync(join(root, ".git")).isFile() || await git("status", "--porcelain") !== "") throw new Error("Use a clean isolated rehearsal worktree at the pinned revision and branch.");
}

async function rehearse(run: EvaluationRun, root: string, packed: string): Promise<void> {
  await assertFixture(run, root);
  const original = await readBounded(join(root, CONSUMER_SOURCE), MAX_SOURCE_BYTES);
  const owners = await capture(root, OWNER_FILES);
  const before = configSchema.parse(JSON.parse(await readBounded(join(root, CONSUMER_CONFIG), MAX_STATE_BYTES)));
  packageSchema.parse(JSON.parse(await readBounded(join(packed, "package.json"), MAX_SOURCE_BYTES)));
  const suite = ["make", DIRECTORY_FLAG, root, "test-unit-design-system"];
  const packedIdentity = await packageIdentity(packed);
  const cli = [process.execPath, "--cwd", root, join(packed, "src/cli.ts"), "--root", packed];
  report.metadata = { revision: CONSUMER_REVISION, package: packedIdentity, original_source: digest(original), owner_files: owners, version: VERSION, model_calls: 0, native_builds: 0 };
  await execute(run, "packed-version", [...cli, "--version"], SUCCESS);
  await execute(run, "packed-update", [...cli, ...UPDATE], SUCCESS);
  await execute(run, "packed-update-idempotent", [...cli, ...UPDATE], SUCCESS);
  await execute(run, "packed-doctor", [...cli, "doctor"], SUCCESS);
  const after = configSchema.parse(JSON.parse(await readBounded(join(root, CONSUMER_CONFIG), MAX_STATE_BYTES)));
  if (after.orly_version !== VERSION || JSON.stringify(before.commands) !== JSON.stringify(after.commands) || JSON.stringify(before.surfaces) !== JSON.stringify(after.surfaces)) throw new Error("Consumer configuration was not preserved.");
  await execute(run, "baseline-design-system", suite, SUCCESS);
  try {
    for (const scenario of CONSUMER_SCENARIOS) {
      const mutation = mutateConsumer(original, scenario);
      await Bun.write(join(root, CONSUMER_SOURCE), mutation);
      await Bun.write(join(run.workspace, SOURCE_CAPTURE), mutation);
      await Bun.write(join(run.workspace, PROBE_FILE), consumerProbe(root, false));
      await execute(run, `${scenario}:submitted`, [process.execPath, PROBE_FILE], SUCCESS, { hidden: false });
      await Bun.write(join(run.workspace, PROBE_FILE), consumerProbe(root, true));
      await execute(run, `${scenario}:hidden`, [process.execPath, PROBE_FILE], EXPECTED_REJECTION, { hidden: true, scenario });
      if (scenario === CONSUMER_SCENARIOS[0]) await execute(run, "locale-defect-existing-design-system", suite, SUCCESS);
      await Bun.write(join(root, CONSUMER_SOURCE), original);
      await Bun.write(join(run.workspace, SOURCE_CAPTURE), original);
      await execute(run, `${scenario}:repaired`, [process.execPath, PROBE_FILE], SUCCESS, { hidden: true });
    }
  } finally { await Bun.write(join(root, CONSUMER_SOURCE), original); }
  await execute(run, "final-design-system", suite, SUCCESS);
  const changed = await execute(run, "final-tracked-diff", [GIT, DIRECTORY_FLAG, root, "diff", "--name-only"], SUCCESS);
  if (changed.stdout.trim() !== CONSUMER_CONFIG || JSON.stringify(await capture(root, OWNER_FILES)) !== JSON.stringify(owners) ||
    digest(await readBounded(join(root, CONSUMER_SOURCE), MAX_SOURCE_BYTES)) !== digest(original)) throw new Error("Consumer owner/source preservation failed.");
  if (JSON.stringify(await packageIdentity(packed)) !== JSON.stringify(packedIdentity)) throw new Error("Packed runtime changed during rehearsal.");
  report.metadata.restored_source = digest(original);
  report.metadata.preservation = true;
}

const [rootArgument, packedArgument, outputArgument] = argsSchema.parse(Bun.argv.slice(2));
const root = realpathSync(resolve(rootArgument));
const packed = realpathSync(resolve(packedArgument));
const output = join(realpathSync(dirname(resolve(outputArgument))), basename(outputArgument));
if (existsSync(output) || [root, packed].some((path) => output === path || output.startsWith(path + sep))) throw new Error("Report must be a new file outside consumer and installed package directories.");
let run: EvaluationRun | undefined;
try { run = await EvaluationRun.create(); await rehearse(run, root, packed); }
catch (error) { report.failures.push(error instanceof Error ? error.message : String(error)); }
finally {
  try { await run?.close(); }
  catch (error) { report.failures.push(`cleanup: ${String(error)}`); }
  finally { await Bun.write(output, JSON.stringify({ ...report, passed: report.failures.length === 0 }, null, 2) + NEWLINE); }
}
process.stdout.write(JSON.stringify({ report: output, attempts: report.attempts.length, failures: report.failures }) + NEWLINE);
process.exitCode = report.failures.length === 0 ? SUCCESS : EXPECTED_REJECTION;
