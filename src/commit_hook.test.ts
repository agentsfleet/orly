import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const HOOK = ".githooks/pre-commit";
const CALLS = "orly-calls.txt";
const ENGINE = "bin/orly";

afterEach(cleanupTemporaryDirectories);

// A scratch checkout whose own bin/orly records its arguments and exits as
// told, so the hook is judged on what it runs rather than on the gate's verdict.
function runHook(engineExit: number) {
  const root = newRepository();
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, ENGINE), `#!/bin/sh\nprintf '%s\\n' "$*" > ${CALLS}\nexit ${engineExit}\n`);
  chmodSync(join(root, ENGINE), 0o755);
  const result = Bun.spawnSync(["/bin/bash", join(ROOT, HOOK)], { cwd: root, env: UNSCOPED_ENVIRONMENT, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  return { root, exitCode: result.exitCode };
}

test("a commit runs the work gate", async () => {
  const passing = runHook(0);
  const failing = runHook(1);

  expect(passing.exitCode).toBe(0);
  expect(await Bun.file(join(passing.root, CALLS)).text()).toBe("gate work\n");
  expect(failing.exitCode).toBe(1);
});
