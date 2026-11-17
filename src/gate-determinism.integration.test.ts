import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { branchOverrides, recordOverride, runGate, runGates } from "./gates";
import { cleanupTemporaryDirectories, git, gitOutput, modelFor, newRepository, orly, pushFixture, ROOT } from "./gates_test_support";

afterEach(cleanupTemporaryDirectories);

test("default gate executes fast verification only once at the final boundary", async () => {
  const root = newRepository();
  const model = await modelFor(root, undefined, { "verify.typecheck": [["sh", "-c", "printf check >> .git/check-count"]] });
  pushFixture(root);
  const result = runGates(model, root);
  expect(result.map((gate) => gate.gate)).toEqual(["work", "pr"]);
  expect(result.every((gate) => gate.ok)).toBeTrue();
  expect(readFileSync(join(root, ".git/check-count"), "utf8")).toBe("check");
  expect(runGate(model, root, "verify").ok).toBeTrue();
  expect(readFileSync(join(root, ".git/check-count"), "utf8")).toBe("checkcheck");
});

test("missing comparison history blocks commands instead of skipping them", async () => {
  const root = newRepository();
  const model = await modelFor(root, undefined, { "verify.integration": [["false"]], "verify.unit": [["touch", ".git/started"]] });
  pushFixture(root);
  git(root, "branch", "-d", "main");
  const result = runGate(model, root, "pr");
  expect(result.ok).toBeFalse();
  expect(result.results.find((entry) => entry.name === "git.base")).toMatchObject({ status: "blocked", ok: false });
  expect(result.results.find((entry) => entry.name === "git.base")?.detail).toContain("fetch the target branch");
  expect(result.results.find((entry) => entry.name === "cmd.verify.integration")).toMatchObject({ status: "blocked" });
  expect(existsSync(join(root, ".git/started"))).toBeFalse();
});

test("remote default branches are refused regardless of their name", async () => {
  const root = newRepository();
  const model = await modelFor(root);
  pushFixture(root);
  git(root, "branch", "-m", "develop");
  git(root, "push", "-qu", "origin", "develop");
  git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop");
  const result = runGate(model, root, "pr");
  expect(result.results.find((entry) => entry.name === "git.branch")).toMatchObject({ status: "failed", detail: "refusing to work on the default branch: develop" });
});

test("override commits leave staged edits in the index", () => {
  const root = newRepository();
  git(root, "checkout", "-qb", "feat/override");
  writeFileSync(join(root, "README.md"), "staged owner change\n");
  git(root, "add", "README.md");
  const before = gitOutput(root, "rev-parse", "HEAD^{tree}");
  recordOverride(root, "cmd.verify.e2e-check", "owner decision");
  expect(gitOutput(root, "rev-parse", "HEAD^{tree}")).toBe(before);
  expect(gitOutput(root, "diff", "--cached", "--name-only", "-z")).toBe("README.md\0");
  expect(branchOverrides(root)).toEqual([{ criterion: "cmd.verify.e2e-check", reason: "owner decision" }]);
});

test.each([["bad name", "valid reason"], ["docs.updated", "line one\nline two"], ["docs.updated", ""]])("malformed overrides create no commit: %s", (criterion, reason) => {
  const root = newRepository();
  const before = gitOutput(root, "rev-parse", "HEAD");
  expect(() => recordOverride(root, criterion, reason)).toThrow(reason ? "valid criterion name and a single-line reason" : "without a reason");
  expect(gitOutput(root, "rev-parse", "HEAD")).toBe(before);
});

test.each(["--dryrun", "--dry-rnu", "unexpected"])("unknown installation option %s never writes", (argument) => {
  const root = newRepository();
  const result = orly(root, ROOT, "init", argument);
  expect(result.code).toBe(1);
  expect(result.output).toContain("[ORLY-INSTALL-001]");
  expect(existsSync(join(root, ".orly"))).toBeFalse();
});

test.each(["bin/tool", "Makefile", "bun.lock"])("build input %s runs declared slow verification", async (path) => {
  const root = newRepository();
  const model = await modelFor(root, undefined, { "verify.integration": [["touch", ".git/integration-ran"]] });
  pushFixture(root);
  if (path.startsWith("bin/")) mkdirSync(join(root, "bin"));
  writeFileSync(join(root, path), "fixture build input\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "test: build input");
  git(root, "push", "-q");
  const result = runGate(model, root, "pr");
  expect(result.ok, JSON.stringify(result.results)).toBeTrue();
  expect(result.results.find((entry) => entry.name === "cmd.verify.integration")).toMatchObject({ status: "passed" });
  expect(existsSync(join(root, ".git/integration-ran"))).toBeTrue();
});
