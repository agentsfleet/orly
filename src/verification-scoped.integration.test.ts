import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, git, gitOutput, orly, ROOT } from "./gates_test_support";
import { runGate } from "./gates";
import { CONFIG_PATH } from "./config";
import { attemptPaths, verificationCount, verificationFixture } from "./verification_test_support";

const INPUTS = ["verify-fixture.ts", "tracked-input.txt"];
afterEach(cleanupTemporaryDirectories);

test("documentation commits reuse a scoped lane through the CLI", async () => {
  const { root } = await verificationFixture(INPUTS);
  const originalRevision = gitOutput(root, "rev-parse", "HEAD");
  const fresh = orly(root, ROOT, "gate", "pr");
  expect(fresh.code, fresh.output).toBe(0);
  expect(verificationCount(root)).toBe(1);
  const original = completion(root);
  writeFileSync(join(root, "README.md"), "Document the fixture.\n");
  commit(root);
  const acceptedRevision = gitOutput(root, "rev-parse", "HEAD");
  const reused = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(reused.code, reused.output).toBe(0);
  expect(reused.output).toContain(`from ${originalRevision} for ${acceptedRevision}`);
  expect(reused.output).toContain("fixture report: 7 checks passed");
  expect(verificationCount(root)).toBe(1);
  expect(completion(root)).toMatchObject({ format: 1, executed_revision: originalRevision, accepted_revision: acceptedRevision, executed_at: original.executed_at, origin: original.origin, scope: original.scope });
  writeFileSync(join(root, "tracked-input.txt"), "changed input");
  commit(root);
  const changed = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(changed.code, changed.output).toBe(0);
  expect(changed.output).toContain("fresh run");
  expect(verificationCount(root)).toBe(2);
});

test.each(["add", "delete", "rename", "content", "mode"])("tracked changes invalidate scoped evidence: %s", async (kind) => {
  const { root, model } = await verificationFixture(["verify-fixture.ts", "src/"]);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/a.txt"), "first");
  writeFileSync(join(root, "src/b.txt"), "second");
  commit(root);
  expect(runGate(model, root, "pr").ok).toBeTrue();
  if (kind === "add") writeFileSync(join(root, "src/c.txt"), "third");
  else if (kind === "delete") unlinkSync(join(root, "src/b.txt"));
  else if (kind === "rename") renameSync(join(root, "src/b.txt"), join(root, "src/c.txt"));
  else if (kind === "content") writeFileSync(join(root, "src/b.txt"), "updated");
  else chmodSync(join(root, "src/b.txt"), 0o755);
  commit(root);
  const result = runGate(model, root, "pr", false, true);
  expect(result.ok, JSON.stringify(result.results)).toBeTrue();
  expect(verificationCount(root)).toBe(2);
  expect(result.results.at(-1)?.detail).toContain("fresh run");
});

test("scoped directory boundaries exclude similarly named siblings", async () => {
  const { root, model } = await verificationFixture(["verify-fixture.ts", "src"]);
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "src-other"));
  writeFileSync(join(root, "src/café.txt"), "selected");
  writeFileSync(join(root, "src-other/data.txt"), "unselected");
  commit(root);
  expect(runGate(model, root, "pr").ok).toBeTrue();
  writeFileSync(join(root, "src-other/data.txt"), "updated sibling");
  commit(root);
  const reused = runGate(model, root, "pr", false, true);
  expect(reused.ok, JSON.stringify(reused.results)).toBeTrue();
  expect(reused.results.at(-1)?.detail).toContain("reused run");
  expect(verificationCount(root)).toBe(1);
  writeFileSync(join(root, "src/café.txt"), "updated selected file");
  commit(root);
  expect(runGate(model, root, "pr", false, true).ok).toBeTrue();
  expect(verificationCount(root)).toBe(2);
});

test("out of scope edits during execution still block completion", async () => {
  const { root, model } = await verificationFixture(["verify-fixture.ts"]);
  writeFileSync(join(root, ".git/change-verification-input"), "inject an excluded tracked edit");
  const result = runGate(model, root, "pr");
  expect(result.ok).toBeFalse();
  expect(result.results.at(-1)).toMatchObject({ status: "blocked", ok: false });
  expect(result.results.at(-1)?.detail).toContain("inputs changed during the attempt");
  expect(completion(root).binding).toBeNull();
  expect(verificationCount(root)).toBe(1);
});

test("clean pushed excluded edits still trip the full-source comparison", async () => {
  const { root, model } = await verificationFixture(INPUTS);
  writeFileSync(join(root, ".git/commit-verification-edit"), "commit a concurrent excluded edit");
  const result = runGate(model, root, "pr");
  expect(result.results.at(-1)).toMatchObject({ status: "blocked", ok: false });
  expect(result.results.at(-1)?.detail).toContain("inputs changed during the attempt");
  expect(gitOutput(root, "status", "--porcelain")).toBe("");
  expect(gitOutput(root, "rev-parse", "HEAD")).toBe(gitOutput(root, "rev-parse", "@{upstream}"));
  expect(completion(root).binding).toBeNull();
});

test("the final source snapshot follows toolchain probes", async () => {
  const { root, model, config, policy } = await verificationFixture(INPUTS);
  policy.toolchain = [[process.execPath, "-e", `
    const count = Bun.file(".git/probe-count");
    const next = (await count.exists() ? Number(await count.text()) : 0) + 1;
    await Bun.write(count, String(next));
    if (next === 2) await Bun.write("README.md", "Changed by the final probe.");
    console.log("unchanged toolchain output");
  `]];
  writeFileSync(join(root, CONFIG_PATH), JSON.stringify(config));
  commit(root);
  const result = runGate(model, root, "pr");
  expect(readFileSync(join(root, ".git/probe-count"), "utf8")).toBe("2");
  expect(result.results.at(-1)).toMatchObject({ status: "blocked", ok: false });
  expect(result.results.at(-1)?.detail).toContain("inputs changed during the attempt");
  expect(completion(root).binding).toBeNull();
});

test("missing scoped inputs and newer failures cannot reuse older evidence", async () => {
  const { root, model } = await verificationFixture(INPUTS);
  expect(runGate(model, root, "pr").ok).toBeTrue();
  writeFileSync(join(root, ".git/fail-verification"), "inject failure");
  expect(runGate(model, root, "pr").ok).toBeFalse();
  unlinkSync(join(root, ".git/fail-verification"));
  writeFileSync(join(root, "README.md"), "Document the retry.\n");
  commit(root);
  expect(runGate(model, root, "pr", false, true).ok).toBeTrue();
  expect(verificationCount(root)).toBe(3);
  unlinkSync(join(root, "tracked-input.txt"));
  commit(root);
  for (const expected of [4, 5]) {
    const result = runGate(model, root, "pr", false, true);
    expect(result.ok, JSON.stringify(result.results)).toBeTrue();
    expect(result.results.at(-1)?.detail).toContain("reuse unavailable");
    expect(completion(root).binding).toBeNull();
    expect(verificationCount(root)).toBe(expected);
  }
});

test("scoped evidence still requires explicit reuse and a clean pushed revision", async () => {
  const { root, model } = await verificationFixture(INPUTS);
  expect(runGate(model, root, "pr").ok).toBeTrue();
  writeFileSync(join(root, "README.md"), "Document the fixture.\n");
  const dirty = runGate(model, root, "pr", false, true);
  expect(dirty.ok).toBeFalse();
  expect(verificationCount(root)).toBe(1);
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: documentation");
  expect(runGate(model, root, "pr", false, true).ok).toBeFalse();
  expect(verificationCount(root)).toBe(1);
  git(root, "push", "-q");
  expect(runGate(model, root, "pr").ok).toBeTrue();
  expect(verificationCount(root)).toBe(2);
});

test("unscoped policies still execute after documentation commits", async () => {
  const { root, model } = await verificationFixture();
  expect(runGate(model, root, "pr").ok).toBeTrue();
  writeFileSync(join(root, "README.md"), "Document the fixture.\n");
  commit(root);
  expect(runGate(model, root, "pr", false, true).ok).toBeTrue();
  expect(verificationCount(root)).toBe(2);
});

function commit(root: string): void {
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: update verification inputs");
  git(root, "push", "-q");
}

function completion(root: string) {
  const path = attemptPaths(root).at(-1);
  if (!path) throw new Error("fixture did not publish an attempt");
  return JSON.parse(readFileSync(join(path, "complete.json"), "utf8")).payload;
}
