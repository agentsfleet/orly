import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, temporaryDirectory } from "../gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "../git_env";
import { captureProcess, streamProcess } from "./process";

afterEach(cleanupTemporaryDirectories);

test.each(["deadline", "cancelled", "parent-exit"])("capture reaps descendants holding output pipes after %s", async (kind) => {
  const root = temporaryDirectory();
  const pidFile = join(root, "child.pid");
  const controller = new AbortController();
  // The pid file appears whole, by rename, so a reader never sees it empty,
  // and the deadline falls after it exists, however loaded the machine is.
  const pending = captureProcess(["sh", "-c", 'sleep 30 & printf "%s" "$!" > "$1.tmp" && mv "$1.tmp" "$1"; if test "$2" != parent-exit; then wait; fi', "fixture", pidFile, kind], {
    env: UNSCOPED_ENVIRONMENT, timeoutMs: kind === "deadline" ? 1_500 : 5_000, signal: controller.signal,
  });
  await waitFor(() => existsSync(pidFile));
  if (kind === "cancelled") controller.abort();
  const result = await pending;
  expect(result.code === 0).toBe(kind === "parent-exit");
  if (kind !== "parent-exit") expect(result.stderr).toContain(`stopped by ${kind}`);
  const pid = Number(readFileSync(pidFile, "utf8"));
  expect(pid).toBeGreaterThan(1);
  await waitFor(() => !running(pid));
  expect(running(pid)).toBeFalse();
});

test("already cancelled commands never launch", async () => {
  const marker = join(temporaryDirectory(), "launched");
  const signal = AbortSignal.abort();
  await expect(captureProcess(["touch", marker], { env: UNSCOPED_ENVIRONMENT, timeoutMs: 1_000, signal })).rejects.toThrow("cancelled before command launch");
  expect(await streamProcess(["touch", marker], { env: UNSCOPED_ENVIRONMENT, deadline: Date.now() + 1_000, signal, lines() {} })).toEqual({ stopped: "cancelled" });
  expect(existsSync(marker)).toBeFalse();
});

test("capture reports a clean exit and bounded output", async () => {
  expect(await captureProcess(["printf", "done"], { env: UNSCOPED_ENVIRONMENT, timeoutMs: 1_000 })).toEqual({ code: 0, stdout: "done", stderr: "" });
  await expect(captureProcess([process.execPath, "-e", "process.stdout.write('a'.repeat(17 * 1024 * 1024)); setInterval(() => {}, 1000)"], {
    env: UNSCOPED_ENVIRONMENT, timeoutMs: 2_000,
  })).rejects.toThrow("command output exceeded");
});

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error("fixture state did not settle");
    await Bun.sleep(10);
  }
}

function running(pid: number): boolean {
  const state = Bun.spawnSync(["ps", "-o", "stat=", "-p", String(pid)], { stdout: "pipe", stderr: "pipe" });
  const value = state.stdout.toString().trim();
  return state.exitCode === 0 && value !== "" && !value.startsWith("Z");
}
