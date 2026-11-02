import { afterEach, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, git, gitOutput, newRepository, ROOT } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const TOOL_DIRECTORY = "tools";
const HOOK = ".githooks/pre-push";
const NEW_BRANCH = "0000000000000000000000000000000000000000";

afterEach(cleanupTemporaryDirectories);

// Only git, and gitleaks when an exit status is given, are on PATH: a hook
// that reaches for anything else fails here.
function runHook(scannerExit?: number, root = newRepository(), pushed?: string) {
  const gitPath = Bun.which("git");
  if (!gitPath) throw new Error("git is not on PATH");
  const tools = join(root, TOOL_DIRECTORY);
  mkdirSync(tools);
  symlinkSync(gitPath, join(tools, "git"));
  if (scannerExit !== undefined) writeFileSync(join(tools, "gitleaks"), `#!/bin/sh\nexit ${scannerExit}\n`, { mode: 0o755 });
  const stdin = pushed === undefined ? "ignore" : Buffer.from(pushed);
  return Bun.spawnSync(["/bin/bash", join(ROOT, HOOK)], { cwd: root, env: { ...UNSCOPED_ENVIRONMENT, PATH: tools }, stdin, stdout: "pipe", stderr: "pipe" });
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

// A new branch whose commit touches src/ once made the hook run `make audit`;
// CI runs that audit now, so the push needs nothing but a clean scan.
test("a push needs only gitleaks", () => {
  const root = newRepository();
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/governed.ts"), "export const governed = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "feat: touch a governed path");
  const head = gitOutput(root, "rev-parse", "HEAD");

  const result = runHook(0, root, `refs/heads/feat ${head} refs/heads/feat ${NEW_BRANCH}\n`);

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe("");
});
