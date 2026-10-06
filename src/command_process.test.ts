import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const PROCESS_SOURCE = "src/command_process.ts";
const RESULT_FILE = "result.json";
const ENCODING = "utf8";
const TEST_TIMEOUT_MS = 5_000;
const WORKLOAD_TIMEOUT_MS = 10_000;
const CHILD_START_POLL_MS = 10;
const CHILD_START_ATTEMPTS = 200;
const REPEATED_STOP_REFUSAL = `const initialKill = process.kill;
const stoppedGroups = new Set<number>();
process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
  if (pid < 0 && signal === "SIGKILL") {
    if (stoppedGroups.has(pid)) throw Object.assign(new Error("group already stopped"), { code: "EPERM" });
    stoppedGroups.add(pid);
  }
  return initialKill(pid, signal);
}) as typeof process.kill;
`;

afterEach(cleanupTemporaryDirectories);

test("a failed pid receipt write stops the already started workload", () => {
  const root = temporaryDirectory();
  const pidFile = join(root, "owned.pid");
  const script = join(root, "command_process.ts");
  const source = readFileSync(join(ROOT, PROCESS_SOURCE), ENCODING);
  const waitForChild = `for (let attempt = 0; attempt < ${CHILD_START_ATTEMPTS} && !await Bun.file(${JSON.stringify(pidFile)}).exists(); attempt++) await Bun.sleep(${CHILD_START_POLL_MS});`;
  writeFileSync(script, source.replace("writeFileSync(join(request.receipt, COMMAND_FILES.pid),", `${waitForChild}\n  writeFileSync(join(request.receipt, COMMAND_FILES.pid),`));
  mkdirSync(join(root, "child.pid"));
  const request = join(root, "request.json");
  writeFileSync(request, JSON.stringify({ command: ["sh", "-c", `echo $$ > '${pidFile}'; exec sleep 10`], limits: { timeout_ms: WORKLOAD_TIMEOUT_MS, output_bytes: 4096 }, receipt: root, parent_pid: process.pid }));
  let pid: number | undefined;
  try {
    const supervisor = Bun.spawnSync([process.execPath, script, request], { env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe", timeout: TEST_TIMEOUT_MS });
    expect(supervisor.exitCode).not.toBe(0);
    expect(supervisor.stderr.toString()).toContain("EISDIR");
    expect(existsSync(pidFile)).toBeTrue();
    const workloadPid = Number(readFileSync(pidFile, ENCODING));
    pid = workloadPid;
    expect(() => process.kill(workloadPid, 0)).toThrow();
  } finally {
    if (pid) { try { process.kill(-pid, "SIGKILL"); } catch { /* owned group already stopped */ } }
  }
});

test("a successful deadline stop is not repeated during supervisor cleanup", () => {
  const root = temporaryDirectory();
  const script = join(root, "command_process.ts");
  writeFileSync(script, REPEATED_STOP_REFUSAL + readFileSync(join(ROOT, PROCESS_SOURCE), ENCODING));
  const request = join(root, "request.json");
  writeFileSync(request, JSON.stringify({ command: ["sh", "-c", "echo measured; sleep 3"], limits: { timeout_ms: 100, output_bytes: 4096 }, receipt: root, parent_pid: process.pid }));
  const child = Bun.spawnSync([process.execPath, script, request], { env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe", timeout: TEST_TIMEOUT_MS });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stderr.toString()).toBe("");
  expect(JSON.parse(readFileSync(join(root, RESULT_FILE), ENCODING)).failure).toBe("deadline exceeded");
  expect(readFileSync(join(root, "stdout.log"), ENCODING)).toBe("measured\n");
});

test("killing the gate owner stops its detached workload", async () => {
  const root = temporaryDirectory();
  const pidFile = join(root, "owned.pid");
  const wrapper = join(root, "gate.ts");
  writeFileSync(wrapper, `import { runCommand } from ${JSON.stringify(join(ROOT, "src/command_runner.ts"))}; runCommand(${JSON.stringify(root)}, ["sh", "-c", "echo $$ > owned.pid; sleep 10"], {timeout_ms: ${WORKLOAD_TIMEOUT_MS}, output_bytes: 4096});`);
  const gate = Bun.spawn([process.execPath, wrapper], { cwd: root, env: { ...UNSCOPED_ENVIRONMENT, TMPDIR: root }, stdout: "pipe", stderr: "pipe" });
  let pid: number | undefined;
  try {
    for (let attempt = 0; attempt < 200 && !existsSync(pidFile); attempt++) await Bun.sleep(10);
    expect(existsSync(pidFile)).toBeTrue();
    pid = Number(readFileSync(pidFile, ENCODING));
    gate.kill("SIGKILL");
    await gate.exited;
    let alive = true;
    for (let attempt = 0; attempt < 100 && alive; attempt++) {
      await Bun.sleep(10);
      try { process.kill(pid, 0); } catch { alive = false; }
    }
    expect(alive).toBeFalse();
  } finally {
    gate.kill("SIGKILL");
    await gate.exited;
    if (pid) { try { process.kill(-pid, "SIGKILL"); } catch { /* owned group already stopped */ } }
  }
}, TEST_TIMEOUT_MS);

test.each(["SIGTERM", "SIGINT", "SIGHUP"] as const)("supervisor %s stops its owned workload", async (signal) => {
  const root = temporaryDirectory();
  const request = join(root, "request.json");
  writeFileSync(request, JSON.stringify({ command: ["sh", "-c", "echo ready; sleep 10"], limits: { timeout_ms: WORKLOAD_TIMEOUT_MS, output_bytes: 4096 }, receipt: root, parent_pid: process.pid }));
  const supervisor = Bun.spawn([process.execPath, join(ROOT, PROCESS_SOURCE), request], { env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe" });
  try {
    for (let attempt = 0; attempt < 200 && !existsSync(join(root, "child.pid")); attempt++) await Bun.sleep(10);
    expect(existsSync(join(root, "child.pid"))).toBeTrue();
    await Bun.sleep(20);
    supervisor.kill(signal);
    expect(await supervisor.exited).toBe(0);
    expect(JSON.parse(readFileSync(join(root, RESULT_FILE), ENCODING)).failure).toBe(`supervisor received ${signal}`);
    const pid = Number(readFileSync(join(root, "child.pid"), ENCODING));
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    supervisor.kill("SIGKILL");
    await supervisor.exited;
  }
}, TEST_TIMEOUT_MS);
