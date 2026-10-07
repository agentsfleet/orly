import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, git, newRepository, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const SCOPED_AUDITS = ["ufs.sh", "logging.sh", "rust-error.sh", "deinit-pairs.sh", "sql-mod.sh", "design-tokens.sh"];
const SOURCE = "lib/odd 'quoted.ts";
const CLEAN = "export const MESSAGE = 'staged';\n";
const BAD = 'export function first() { return "duplicate value"; }\nexport function second() { return "duplicate value"; }\n';
const CHECKOUT = "checkout-index";
const TIMEOUT_MS = 30_000;
const TOOL_MODE = 0o755;

afterEach(cleanupTemporaryDirectories);

async function runScan(project: string, leaf: string, failPreflight = false) {
  const tools = temporaryDirectory();
  const scratch = temporaryDirectory();
  const calls = join(tools, "calls.jsonl");
  const realGit = Bun.which("git")!;
  mkdirSync(join(tools, "bin"));
  writeFileSync(join(tools, "bin/git"), `#!${process.execPath}
const args = Bun.argv.slice(2);
const file = Bun.file(process.env.SNAPSHOT_CALLS);
await Bun.write(file, (await file.exists() ? await file.text() : "") + JSON.stringify(args) + "\\n");
if (process.env.FAIL_PREFLIGHT === "1" && args.includes("--quiet")) process.exit(2);
const result = Bun.spawnSync([process.env.REAL_GIT, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode);
`, { mode: TOOL_MODE });
  const result = Bun.spawnSync(["/bin/bash", join(ROOT, "audits", leaf), "--staged"], {
    cwd: project, env: { ...UNSCOPED_ENVIRONMENT, PATH: `${join(tools, "bin")}:${process.env.PATH}`, TMPDIR: scratch,
      SNAPSHOT_CALLS: calls, REAL_GIT: realGit, FAIL_PREFLIGHT: failPreflight ? "1" : "0" },
    stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS,
  });
  const commands: string[][] = (await Bun.file(calls).text()).trim().split("\n").map((line) => JSON.parse(line));
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString(),
    checkouts: commands.filter((args) => args[0] === CHECKOUT).length, leftovers: readdirSync(scratch) };
}

test.each(SCOPED_AUDITS)("%s skips repository checkout for a documentation-only index", async (leaf) => {
  const project = newRepository();
  await Bun.write(join(project, "README.md"), "Changed documentation.\n");
  git(project, "add", "README.md");
  const result = await runScan(project, leaf);
  expect(result.code, result.output).toBe(0);
  expect(result.checkouts).toBe(0);
  expect(result.leftovers).toEqual([]);
});

test.each([true, false])("relevant source snapshot checks staged bytes with violation %s", async (badIndex) => {
  const project = newRepository();
  await Bun.write(join(project, SOURCE), badIndex ? BAD : CLEAN);
  git(project, "add", SOURCE);
  await Bun.write(join(project, SOURCE), badIndex ? CLEAN : BAD);
  const result = await runScan(project, "ufs.sh");
  expect(result.code, result.output).toBe(badIndex ? 1 : 0);
  expect(result.checkouts).toBe(1);
  expect(result.leftovers).toEqual([]);
});

test("a failed staged filename query refuses instead of reporting an empty scope", async () => {
  const project = newRepository();
  const result = await runScan(project, "ufs.sh", true);
  expect(result.code).toBe(2);
  expect(result.output).toContain("cannot select staged audit files");
  expect(result.checkouts).toBe(0);
  expect(result.leftovers).toEqual([]);
});

test("a deleted source path needs no repository checkout", async () => {
  const project = newRepository();
  await Bun.write(join(project, SOURCE), CLEAN);
  git(project, "add", SOURCE);
  git(project, "commit", "-qm", "test: seed source");
  git(project, "rm", SOURCE);
  const result = await runScan(project, "ufs.sh");
  expect(result.code, result.output).toBe(0);
  expect(result.checkouts).toBe(0);
  expect(result.leftovers).toEqual([]);
});
