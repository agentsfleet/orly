import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const BASH = "bash";
const PIPE = "pipe";
const OWNER_FILE = "owner.txt";
const OWNER_CONTENT = "caller-owned bytes\n";
const LEDGER_LIBRARY = "evals/ledger/lib.sh";
const TEST_TIMEOUT_MS = 20_000;
const INTERRUPTED_EXIT = 143;
const FAILURE_EXIT = 7;

afterEach(cleanupTemporaryDirectories);

function environment(root: string) {
  writeFileSync(join(root, OWNER_FILE), OWNER_CONTENT);
  return { ...UNSCOPED_ENVIRONMENT, TMPDIR: root, LEDGER_LIBRARY: join(ROOT, LEDGER_LIBRARY) };
}

function expectClean(root: string) {
  expect(readdirSync(root)).toEqual([OWNER_FILE]);
  expect(readFileSync(join(root, OWNER_FILE), "utf8")).toBe(OWNER_CONTENT);
}

for (const script of ["evals/ledger/run.sh", "evals/dispatch/parity.sh"]) {
  test(`evaluation cleanup preserves caller state after ${script}`, () => {
    const root = temporaryDirectory();
    const result = Bun.spawnSync([BASH, join(ROOT, script)], { cwd: ROOT, env: environment(root), stdout: PIPE, stderr: PIPE, timeout: TEST_TIMEOUT_MS });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("passed, 0 failed");
    expectClean(root);
  }, TEST_TIMEOUT_MS);
}

test("ledger command-substitution fixtures are removed after a failing caller", () => {
  const root = temporaryDirectory();
  const result = Bun.spawnSync([BASH, "-c", 'source "$LEDGER_LIBRARY"; sb="$(mk_root)"; [[ -d "$sb" ]] || exit 1; exit 7'], { env: environment(root), stdout: PIPE, stderr: PIPE });
  expect(result.exitCode).toBe(FAILURE_EXIT);
  expectClean(root);
});

test("ledger command-substitution fixtures are removed after termination", async () => {
  const root = temporaryDirectory();
  const child = Bun.spawn([BASH, "-c", 'source "$LEDGER_LIBRARY"; sb="$(mk_root)"; printf "%s\\n" "$sb"; read -r pending'], { env: environment(root), stdin: PIPE, stdout: PIPE, stderr: PIPE });
  try {
    const reader = child.stdout.getReader();
    const ready = await reader.read();
    expect(ready.done).toBeFalse();
    const fixture = new TextDecoder().decode(ready.value).trim();
    expect(existsSync(fixture)).toBeTrue();
    expect(fixture.startsWith(root)).toBeTrue();
    child.kill("SIGTERM");
    expect(await child.exited).toBe(INTERRUPTED_EXIT);
    expectClean(root);
  } finally {
    child.stdin.end();
    child.kill();
    await child.exited;
  }
}, TEST_TIMEOUT_MS);
