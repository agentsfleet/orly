import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { contentDigest } from "./config";
import { cleanupTemporaryDirectories, git, gitOutput, orly, ROOT } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { recordOverride, runGate } from "./gates";
import { RulesModel } from "./model";
import { attemptPaths, verificationCount, verificationFixture } from "./verification_test_support";
import { verificationState } from "./verification_store";

afterEach(cleanupTemporaryDirectories);

test("explicit_reuse_executes_a_hermetic_group_once", async () => {
  const { root } = await verificationFixture();
  for (const expected of [1, 2]) {
    const result = orly(root, ROOT, "gate", "pr");
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("fresh run");
    expect(verificationCount(root)).toBe(expected);
  }
  const second = attemptPaths(root).at(-1)!;
  const result = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain("reused run");
  expect(result.output).toContain(second.split("/").at(-1)!);
  expect(result.output).toContain("fixture report: 7 checks passed");
  expect(verificationCount(root)).toBe(2);
  expect(attemptPaths(root)).toHaveLength(3);
});

test("in-process gates preserve reuse and refuse an older pass after a failed fresh retry", async () => {
  const { root } = await verificationFixture();
  const model = await RulesModel.load(ROOT);
  const first = runGate(model, root, "pr");
  expect(first.ok).toBeTrue();
  expect(first.results.at(-1)).toMatchObject({ name: "cmd.verify.unit", status: "passed" });
  const reused = runGate(model, root, "pr", false, true);
  expect(reused.ok).toBeTrue();
  expect(reused.results.at(-1)?.detail).toContain("reused run");
  expect(reused.results.at(-1)?.detail).toContain("fixture report: 7 checks passed");
  expect(verificationCount(root)).toBe(1);
  writeFileSync(join(root, ".git/fail-verification"), "inject native assertion failure");
  for (const reuse of [false, true]) {
    const failed = runGate(model, root, "pr", false, reuse);
    expect(failed.ok).toBeFalse();
    expect(failed.results.at(-1)).toMatchObject({ name: "cmd.verify.unit", status: "failed" });
    expect(failed.results.at(-1)?.detail).not.toContain("reused run");
  }
  expect(verificationCount(root)).toBe(3);
});

test("the reuse flag alone never skips an undeclared lane", async () => {
  const { root, config } = await verificationFixture();
  delete config.reuse;
  writeFileSync(join(root, ".orly/orly.json"), JSON.stringify(config));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: fresh-only verification");
  git(root, "push", "-q");
  for (const expected of [1, 2]) {
    const result = orly(root, ROOT, "gate", "pr", "--reuse-verification");
    expect(result.code, result.output).toBe(0);
    expect(verificationCount(root)).toBe(expected);
  }
  expect(existsSync(join(root, ".git/orly-verification"))).toBeFalse();
});

test.each(["output", "manifest", "key"])("damaged %s evidence executes fresh", async (kind) => {
  const { root } = await verificationFixture();
  expect(orly(root, ROOT, "gate", "pr").code).toBe(0);
  const latest = attemptPaths(root).at(-1)!;
  if (kind === "key") rmSync(join(verificationState(root), "signing.key"));
  else writeFileSync(join(latest, kind === "output" ? "output.log" : "complete.json"), "damaged");
  const result = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain("fresh run");
  expect(verificationCount(root)).toBe(2);
});

test("a failed fresh retry cannot select an older successful execution", async () => {
  const { root } = await verificationFixture();
  expect(orly(root, ROOT, "gate", "pr").code).toBe(0);
  const original = readFileSync(join(attemptPaths(root)[0]!, "complete.json"), "utf8");
  writeFileSync(join(root, ".git/fail-verification"), "inject failure");
  expect(orly(root, ROOT, "gate", "pr").code).toBe(1);
  const refused = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(refused.code, refused.output).toBe(1);
  expect(refused.output).not.toContain("reused run");
  expect(verificationCount(root)).toBe(3);
  expect(readFileSync(join(attemptPaths(root)[0]!, "complete.json"), "utf8")).toBe(original);
});

test("verification_input_changes_during_execution_are_refused", async () => {
  const { root } = await verificationFixture();
  writeFileSync(join(root, ".git/change-verification-input"), "inject change");
  const result = orly(root, ROOT, "gate", "pr");
  expect(result.code).toBe(1);
  expect(result.output).toContain("inputs changed during the attempt");
  expect(result.output).toContain("[blocked]");
  expect(verificationCount(root)).toBe(1);
});

test("unavailable optional identity does not hide a tracked input change", async () => {
  const { root, config } = await verificationFixture();
  config.reuse!["verify.unit"]!.inputs = ["missing-extra-input"];
  writeFileSync(join(root, ".orly/orly.json"), JSON.stringify(config));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: unavailable optional identity");
  git(root, "push", "-q");
  writeFileSync(join(root, ".git/change-verification-input"), "inject change");
  const result = orly(root, ROOT, "gate", "pr");
  expect(result.code).toBe(1);
  expect(result.output).toContain("inputs changed during the attempt");
});

test("tracked symlinks disable reuse while preserving fresh execution", async () => {
  const { root } = await verificationFixture();
  symlinkSync("tracked-input.txt", join(root, "source-link"));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: tracked symlink");
  git(root, "push", "-q");
  for (const expected of [1, 2]) {
    const result = orly(root, ROOT, "gate", "pr", "--reuse-verification");
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("reuse unavailable: symlink inputs");
    expect(verificationCount(root)).toBe(expected);
  }
});

test("a run on an uncommitted tree is reused once that tree is committed and pushed", async () => {
  const { root } = await verificationFixture();
  writeFileSync(join(root, "tracked-input.txt"), "edited before the commit");
  const dirty = orly(root, ROOT, "gate", "pr", "--accept-dirty");
  expect(dirty.code, dirty.output).toBe(0);
  expect(dirty.output).toContain("evidence keyed to this tree, reusable once it is committed and pushed");
  const parent = gitOutput(root, "rev-parse", "HEAD");
  commitAndPush(root);
  const reused = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(reused.code, reused.output).toBe(0);
  expect(reused.output).toContain(`from ${parent} with uncommitted changes for ${gitOutput(root, "rev-parse", "HEAD")}`);
  expect(reused.output).toContain("fixture report: 7 checks passed");
  expect(verificationCount(root)).toBe(1);
});

test("an uncommitted run never vouches for a different committed tree", async () => {
  const { root } = await verificationFixture();
  writeFileSync(join(root, "tracked-input.txt"), "edited before the commit");
  expect(orly(root, ROOT, "gate", "pr", "--accept-dirty").code).toBe(0);
  writeFileSync(join(root, "README.md"), "edited after the run\n");
  commitAndPush(root);
  const next = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(next.code, next.output).toBe(0);
  expect(next.output).toContain("fresh run");
  expect(verificationCount(root)).toBe(2);
});

test("an untracked file present during a run keeps it from being reused", async () => {
  const { root } = await verificationFixture();
  writeFileSync(join(root, "tracked-input.txt"), "edited before the commit");
  writeFileSync(join(root, "scratch.txt"), "a file the command may have read");
  const dirty = orly(root, ROOT, "gate", "pr", "--accept-dirty");
  expect(dirty.output).toContain("reuse unavailable: untracked files are outside the tree; add or remove them");
  rmSync(join(root, "scratch.txt"));
  commitAndPush(root);
  const next = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(next.code, next.output).toBe(0);
  expect(next.output).toContain("fresh run");
  expect(verificationCount(root)).toBe(2);
});

test("existing owner override cannot waive an unexecuted policy lane", async () => {
  const { root } = await verificationFixture();
  recordOverride(root, "cmd.verify.unit", "fixture owner waiver of an executed failure");
  git(root, "push", "-q");
  mkdirSync(join(verificationState(root), "lock"), { mode: 0o700 });
  const result = orly(root, ROOT, "gate", "pr");
  expect(result.code).toBe(1);
  expect(result.output).toContain("[blocked]");
  expect(existsSync(join(root, ".git/verification-count"))).toBeFalse();
});

test("ordinary invocation storage failures report blocked and not_run", async () => {
  const { root, config } = await verificationFixture();
  delete config.reuse;
  config.commands["verify.first"] = [["true"]];
  writeFileSync(join(root, ".orly/orly.json"), JSON.stringify(config));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: ordinary native lanes");
  git(root, "push", "-q");
  const result = Bun.spawnSync([process.execPath, join(ROOT, "src/cli.ts"), "--root", ROOT, "gate", "pr"], {
    cwd: root, env: { ...UNSCOPED_ENVIRONMENT, TMPDIR: join(root, ".git/nonexistent-temporary-directory") }, stdout: "pipe", stderr: "pipe",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toContain("cmd.verify.first [blocked]");
  expect(result.stdout.toString()).toContain("cmd.verify.unit [not_run]");
  expect(existsSync(join(root, ".git/verification-count"))).toBeFalse();
});

test("failed Git status cannot prove a clean worktree", async () => {
  const { root } = await verificationFixture();
  const directory = join(root, ".git/fake-git");
  mkdirSync(directory);
  const realGit = Bun.which("git")!;
  writeFileSync(join(directory, "git"), `#!/bin/sh\nif [ "$1" = status ]; then exit 73; fi\nexec '${realGit}' "$@"\n`);
  chmodSync(join(directory, "git"), 0o700);
  const result = Bun.spawnSync([process.execPath, join(ROOT, "src/cli.ts"), "--root", ROOT, "gate", "pr"], {
    cwd: root, env: { ...UNSCOPED_ENVIRONMENT, PATH: `${directory}:${UNSCOPED_ENVIRONMENT.PATH}` }, stdout: "pipe", stderr: "pipe",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toContain("git.tree [blocked]");
  expect(existsSync(join(root, ".git/verification-count"))).toBeFalse();
});

test("evidence_write_failure_preserves_execution_truth", async () => {
  const { root } = await verificationFixture();
  const state = verificationState(root);
  const lane = join(state, contentDigest("verify.unit").slice("sha256:".length));
  writeFileSync(lane, "not a directory");
  const blocked = orly(root, ROOT, "gate", "pr");
  expect(blocked.code).toBe(1);
  expect(existsSync(join(root, ".git/verification-count"))).toBeFalse();
  rmSync(lane);
  writeFileSync(join(root, ".git/poison-completion"), "inject publication failure");
  const first = orly(root, ROOT, "gate", "pr");
  expect(first.code, first.output).toBe(0);
  expect(first.output).toContain("completion could not be saved; reuse disabled");
  expect(orly(root, ROOT, "gate", "pr", "--reuse-verification").code).toBe(1);
  rmSync(state, { recursive: true });
  const next = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(next.code, next.output).toBe(0);
  expect(next.output).toContain("fresh run");
  expect(verificationCount(root)).toBe(2);
});

test("a new pushed revision executes fresh", async () => {
  const { root } = await verificationFixture();
  expect(orly(root, ROOT, "gate", "pr").code).toBe(0);
  writeFileSync(join(root, "tracked-input.txt"), "new revision");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: changed input");
  git(root, "push", "-q");
  const result = orly(root, ROOT, "gate", "pr", "--reuse-verification");
  expect(result.code, result.output).toBe(0);
  expect(verificationCount(root)).toBe(2);
});

test("reuse flag requires the named pr gate and rejects unknown options", async () => {
  const { root } = await verificationFixture();
  for (const [args, code] of [
    [["verify", "--reuse-verification"], "ORLY-GATE-002"],
    [["pr", "--reuse-verificaton"], "ORLY-GATE-001"],
    [["pr", "verify"], "ORLY-GATE-001"],
  ] as const) {
    const result = orly(root, ROOT, "gate", ...args);
    expect(result.code).toBe(1);
    expect(result.output).toContain(`[${code}]`);
  }
  expect(existsSync(join(root, ".git/verification-count"))).toBeFalse();
});

async function waitFor(check: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (check()) return;
    await Bun.sleep(10);
  }
  throw new Error(`fixture never reached ${description}`);
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

test("interrupted_and_concurrent_attempts_never_select_an_old_pass", async () => {
  const { root } = await verificationFixture();
  expect(orly(root, ROOT, "gate", "pr").code).toBe(0);
  writeFileSync(join(root, ".git/pause-verification"), "inject pause");
  const gate = Bun.spawn([process.execPath, join(ROOT, "src/cli.ts"), "--root", ROOT, "gate", "pr"], { cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe" });
  let child: number | undefined;
  try {
    await waitFor(() => existsSync(join(root, ".git/verification-child")), "active workload");
    child = Number(readFileSync(join(root, ".git/verification-child"), "utf8"));
    const concurrent = orly(root, ROOT, "gate", "pr", "--reuse-verification");
    expect(concurrent.code).toBe(1);
    expect(concurrent.output).toContain("already running");
    expect(verificationCount(root)).toBe(2);
    gate.kill("SIGKILL");
    await gate.exited;
    const blocked = orly(root, ROOT, "gate", "pr", "--reuse-verification");
    expect(blocked.code).toBe(1);
    expect(blocked.output).toContain("already running or interrupted");
    expect(verificationCount(root)).toBe(2);
    await waitFor(() => !processAlive(child!), "owned workload cleanup");
    rmSync(verificationState(root), { recursive: true });
    rmSync(join(root, ".git/pause-verification"));
    const recovered = orly(root, ROOT, "gate", "pr", "--reuse-verification");
    expect(recovered.code, recovered.output).toBe(0);
    expect(recovered.output).toContain("fresh run");
    expect(verificationCount(root)).toBe(3);
  } finally {
    gate.kill("SIGKILL");
    await gate.exited;
    if (child && processAlive(child)) process.kill(-child, "SIGKILL");
  }
}, 20000);

function commitAndPush(root: string): void {
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: commit the verified tree");
  git(root, "push", "-q");
}
