import { afterEach, expect, test } from "bun:test";
import { existsSync, symlinkSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import { EvaluationRun, EXECUTION_ERROR } from "../evals/judgments/comparison/execution";
import { recoverStaleOwnership, OWNER_ERROR } from "../evals/judgments/comparison/recovery";
import { cleanupTemporaryDirectories, temporaryDirectory } from "./gates_test_support";

const RECOVERY = resolve(import.meta.dir, "../evals/judgments/comparison/recovery.ts");
const OWNER_RECEIPT = "owner.json";
const SENTINEL_CONTENT = "unrelated owner bytes\n";
const BUN_EVAL = "-e";
const TIMEOUT = 10_000;
const EXCESSIVE_TIMEOUT = 100_000;
const OUTPUT_LIMIT = 1024;
const RECOVERY_POLL_MS = 10;
const SUCCESS_COMMAND = [process.execPath, BUN_EVAL, "process.stdout.write('done')"];

afterEach(cleanupTemporaryDirectories);

test("restart_recovers_verified_stale_resources_without_completion_credit", async () => {
  const root = temporaryDirectory();
  const marker = join(root, OWNER_RECEIPT);
  const sentinel = join(root, "unrelated.txt");
  await Bun.write(sentinel, SENTINEL_CONTENT);
  const script = `import {createOwnership} from ${JSON.stringify(RECOVERY)};await Bun.write(${JSON.stringify(marker)},JSON.stringify(await createOwnership()));`;
  const owner = Bun.spawn([process.execPath, BUN_EVAL, script], { stdout: "ignore", stderr: "pipe" });
  const timeout = setTimeout(() => owner.kill(), TIMEOUT);
  try {
    expect(await owner.exited).toBe(0);
    const ownership: unknown = await Bun.file(marker).json();
    expect(await recoverStaleOwnership(ownership)).toEqual({ recovered: true, completion: false });
    expect(await Bun.file(sentinel).text()).toBe(SENTINEL_CONTENT);
    await expect(recoverStaleOwnership(ownership)).rejects.toThrow();
  } finally { clearTimeout(timeout); owner.kill(); await owner.exited; }
}, TIMEOUT);

test("foreign_paths_and_symlinked_markers_cannot_authorize_cleanup", async () => {
  const run = await EvaluationRun.create();
  const foreign = temporaryDirectory();
  const sentinel = join(foreign, "unrelated.txt");
  await Bun.write(sentinel, SENTINEL_CONTENT);
  try {
    await expect(recoverStaleOwnership({ ...run.ownership, workspace: foreign })).rejects.toThrow(OWNER_ERROR);
    symlinkSync(foreign, join(run.ownership.receipts, "foreign"));
    expect(await Bun.file(sentinel).text()).toBe(SENTINEL_CONTENT);
    expect(existsSync(run.workspace)).toBe(true);
  } finally { unlinkSync(join(run.ownership.receipts, "foreign")); await run.close(); }
});

test("invalid_limits_refuse_before_starting_any_process", async () => {
  const run = await EvaluationRun.create();
  try {
    for (const timeout_ms of [0, -1, Number.NaN, EXCESSIVE_TIMEOUT]) {
      await expect(run.execute(SUCCESS_COMMAND, [], { timeout_ms, output_bytes: OUTPUT_LIMIT })).rejects.toThrow(EXECUTION_ERROR);
    }
  } finally { await run.close(); }
});

test("one_owner_refuses_concurrent_execution_and_close_until_work_finishes", async () => {
  const run = await EvaluationRun.create();
  try {
    const pending = run.execute(SUCCESS_COMMAND, []);
    await expect(run.execute(SUCCESS_COMMAND, [])).rejects.toThrow(EXECUTION_ERROR);
    await expect(run.close()).rejects.toThrow(EXECUTION_ERROR);
    expect((await pending).result.exit_code).toBe(0);
  } finally { await run.close(); }
});

test("recovery_refuses_live_descendants_after_the_group_leader_exits", async () => {
  const root = temporaryDirectory();
  const marker = join(root, OWNER_RECEIPT);
  const groupMarker = join(root, "group.txt");
  const script = `import {createOwnership} from ${JSON.stringify(RECOVERY)};
const owner=await createOwnership();
const leader=Bun.spawn(['sh','-c','sleep 30 >/dev/null 2>&1 &'],{detached:true,stdout:'ignore',stderr:'ignore'});
await Bun.write(owner.receipts+'/command/child.pid',String(leader.pid));
await Bun.write(${JSON.stringify(groupMarker)},String(leader.pid));
await leader.exited;
await Bun.write(${JSON.stringify(marker)},JSON.stringify(owner));`;
  const owner = Bun.spawn([process.execPath, BUN_EVAL, script], { stdout: "ignore", stderr: "pipe" });
  const timeout = setTimeout(() => owner.kill(), TIMEOUT);
  try {
    expect(await owner.exited).toBe(0);
    const ownership: unknown = await Bun.file(marker).json();
    const group = Number(await Bun.file(groupMarker).text());
    process.kill(-group, 0);
    await expect(recoverStaleOwnership(ownership)).rejects.toThrow(OWNER_ERROR);
  } finally {
    clearTimeout(timeout);
    owner.kill();
    await owner.exited;
    const group = Number(await Bun.file(groupMarker).text());
    try { process.kill(-group, "SIGKILL"); } catch { /* Already exited. */ }
    const ownership: unknown = await Bun.file(marker).json();
    const deadline = Date.now() + TIMEOUT;
    while (true) {
      try { await recoverStaleOwnership(ownership); break; }
      catch (error) {
        if (Date.now() >= deadline) throw error;
        await Bun.sleep(RECOVERY_POLL_MS);
      }
    }
  }
}, TIMEOUT * 2);
