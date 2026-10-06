import { afterEach, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const TOOL_DIRECTORY = "tools";
const HOOK = ".githooks/pre-push";

afterEach(cleanupTemporaryDirectories);

function runHook(scannerExit?: number) {
  const root = newRepository();
  const tools = join(root, TOOL_DIRECTORY);
  mkdirSync(tools);
  symlinkSync(Bun.which("git")!, join(tools, "git"));
  if (scannerExit !== undefined) writeFileSync(join(tools, "gitleaks"), `#!/bin/sh\nexit ${scannerExit}\n`, { mode: 0o755 });
  return Bun.spawnSync(["/bin/bash", join(ROOT, HOOK)], { cwd: root, env: { ...UNSCOPED_ENVIRONMENT, PATH: tools }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
}

test("a push fails when its required scanner is missing", () => {
  const result = runHook();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("required gitleaks is not installed");
});

test("a clean scan permits an unrelated push", () => {
  expect(runHook(0).exitCode).toBe(0);
});

test("a scanner finding blocks the push", () => {
  const result = runHook(1);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("gitleaks found a secret");
});
