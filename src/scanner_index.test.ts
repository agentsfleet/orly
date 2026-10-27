import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, git, newRepository, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { scan, SCANNER_TIMEOUT_MS, STAGED, staged } from "./scanner_test_support";

const SOURCE = "lib/a.ts";
const CLEAN = "export const MESSAGE = \"once\";\n";
const DUPLICATE = "export function first() { return \"duplicate value\"; }\nexport function second() { return \"duplicate value\"; }\n";
const FLAGGED = `string-dup-file ${SOURCE} "duplicate value" 2`;
const MARKED = `export const VALUE = "M${"9"}_001";\n`;
const MISSING_INDEX = "commit index is missing";
const SPEC = "docs/v1/active/M1_001_P2_CLI_FIXTURE.md";
const COMMIT_MESSAGE = "test: commit through the hook";
// The prologue orly generates for hooks (src/installation/hooks.ts).
const PROLOGUE = [
  "#!/usr/bin/env bash",
  'case "${GIT_INDEX_FILE:-}" in "") ORLY_INDEX_FILE="" ;; /*) ORLY_INDEX_FILE="$GIT_INDEX_FILE" ;; *) ORLY_INDEX_FILE="$PWD/$GIT_INDEX_FILE" ;; esac',
  "export ORLY_INDEX_FILE",
  "unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE",
];

setDefaultTimeout(SCANNER_TIMEOUT_MS);
afterEach(cleanupTemporaryDirectories);

function installHook(project: string, lines: string[]): void {
  mkdirSync(join(project, "hooks"), { recursive: true });
  writeFileSync(join(project, "hooks/pre-commit"), `${lines.join("\n")}\n`, { mode: 0o755 });
  git(project, "config", "core.hooksPath", "hooks");
}

function commit(project: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "commit", "-q", "-m", COMMIT_MESSAGE, ...args], {
    cwd: project, env: { ...UNSCOPED_ENVIRONMENT, TMPDIR: temporaryDirectory() }, stdout: "pipe", stderr: "pipe",
  });
  return { code: result.exitCode, text: result.stdout.toString() + result.stderr.toString() };
}

async function seeded(): Promise<string> {
  const project = newRepository();
  await staged(project, SOURCE, CLEAN);
  git(project, "commit", "-q", "-m", "test: seed");
  await Bun.write(join(project, SOURCE), DUPLICATE);
  return project;
}

test.each([{ flags: ["-a"] }, { flags: ["--", SOURCE] }])("a staged audit in the hook grades the commit's own index: git commit $flags", async ({ flags }) => {
  const project = await seeded();
  installHook(project, [...PROLOGUE, `exec bash ${JSON.stringify(join(ROOT, "audits/ufs.sh"))} --staged`]);
  const result = commit(project, ...flags);
  expect(result.code).not.toBe(0);
  expect(result.text).toContain(FLAGGED);
});

test("orly hands the commit's index on to the audits it runs from a hook of the repository's own", async () => {
  const project = await seeded();
  const runner = `import {UNSCOPED_ENVIRONMENT} from ${JSON.stringify(join(ROOT, "src/git_env.ts"))};
const result = Bun.spawnSync(["bash", ${JSON.stringify(join(ROOT, "audits/ufs.sh"))}, "--staged"], { env: UNSCOPED_ENVIRONMENT, stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode ?? 1);`;
  writeFileSync(join(project, "run-audit.ts"), runner);
  installHook(project, ["#!/usr/bin/env bash", `exec bun ${JSON.stringify(join(project, "run-audit.ts"))}`]);
  const result = commit(project, "-a");
  expect(result.code).not.toBe(0);
  expect(result.text).toContain(FLAGGED);
});

test.each(["audits/ufs.sh", "audits/msid-ui.sh"])("%s ignores a commit index inherited from another repository", async (script) => {
  const other = newRepository();
  await staged(other, SOURCE, `${DUPLICATE}${MARKED}`);
  const project = newRepository();
  const result = scan(project, script, [STAGED], { ORLY_INDEX_FILE: join(other, ".git/index") });
  expect(result.code).toBe(0);
  expect(result.text).not.toContain(SOURCE);
});

test.each([["audits/ufs.sh", [STAGED]], ["audits/msid-ui.sh", [STAGED]], ["audits/doc-read.sh", ["check"]], ["audits/spec-template.sh", [STAGED]]])(
  "%s refuses a missing commit index in its own repository", (script, args) => {
    const project = newRepository();
    const result = scan(project, script, args, { ORLY_INDEX_FILE: join(project, ".git/next-index-0.lock") });
    expect(result.code).toBe(2);
    expect(result.text).toMatch(/commit index is missing|cannot read the commit index/);
  });

test("the staged spec audit grades a spec committed with git commit -a", async () => {
  const project = newRepository();
  await staged(project, ".orly/orly.json", JSON.stringify({ schema_version: 1, packs: [], commands: { conform: [["true"]] } }));
  await staged(project, SPEC, "# M1_001: Fixture\n\n**Status:** PENDING\n");
  git(project, "commit", "-q", "-m", "test: seed spec");
  await Bun.write(join(project, SPEC), "# M1_001: Fixture\n\n**Status:** PENDING\n\n## Estimated effort\n\nTwo days.\n");
  installHook(project, [...PROLOGUE, `exec bash ${JSON.stringify(join(ROOT, "audits/spec-template.sh"))} --staged`]);
  const result = commit(project, "-a");
  expect(result.code).not.toBe(0);
  expect(result.text).toContain("Estimated effort section heading");
  expect(result.text).not.toContain(MISSING_INDEX);
});
