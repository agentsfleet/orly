import { afterEach, expect, mock, spyOn, test } from "bun:test";
import * as fileSystem from "node:fs";
import { join } from "node:path";

import { EvaluationRun, EXECUTION_ERROR, sourceIdentity } from "../evals/judgments/comparison/execution";
import { cleanupTemporaryDirectories, temporaryDirectory } from "./gates_test_support";
import { createOwnership, OWNER_ERROR, recoverStaleOwnership } from "../evals/judgments/comparison/recovery";

const INPUT_FILE = "input.txt";
const INITIAL_CONTENT = "2\n3\n";
const BUN_EVAL = "-e";
const COMMAND_SUCCESS = 'process.stdout.write("measured\\n")';
const COMMAND_FAILURE = 'process.stderr.write("required refusal\\n");process.exit(2)';
const COMMAND_WAIT = 'process.stdout.write("ready\\n");setInterval(()=>{},1000)';
const COMMAND_OUTPUT = 'process.stdout.write("x".repeat(1000000));setInterval(()=>{},1000)';
const SUCCESS_LIMITS = { timeout_ms: 2_000, output_bytes: 4_096 };
const DEADLINE_LIMITS = { timeout_ms: 150, output_bytes: SUCCESS_LIMITS.output_bytes };
const OUTPUT_LIMITS = { timeout_ms: SUCCESS_LIMITS.timeout_ms, output_bytes: 128 };
const TEST_TIMEOUT_MS = 10_000;
const READY_POLL_MS = 10;
const { existsSync } = fileSystem;
const START_SENTINEL = "child-started.txt";
const SENTINEL_COMMAND = `await Bun.write('${START_SENTINEL}','started')`;
const ALLOCATION_FAILURE = "second temporary-directory allocation failed";
type SyncOptions = NonNullable<Parameters<typeof Bun.spawnSync>[1]>;

afterEach(() => { mock.restore(); cleanupTemporaryDirectories(); });

test("task_receipts_bind_actual_execution", async () => {
  const run = await EvaluationRun.create();
  try {
    await Bun.write(join(run.workspace, INPUT_FILE), INITIAL_CONTENT);
    const actual = await run.execute([process.execPath, BUN_EVAL, COMMAND_SUCCESS], [INPUT_FILE], SUCCESS_LIMITS);
    expect(actual.result.exit_code).toBe(0);
    expect(actual.stdout).toBe("measured\n");
    expect(actual.result.output_bytes).toBe(new TextEncoder().encode(actual.stdout).byteLength);
    expect(actual.source_before).toBe(await sourceIdentity(run.workspace, [INPUT_FILE]));
    expect(() => run.verify(actual)).not.toThrow();
    expect(() => run.verify({ ...actual, result: { ...actual.result, exit_code: 2 } })).toThrow(EXECUTION_ERROR);
    expect(() => run.verify({ ...actual, command: ["true"] })).toThrow(EXECUTION_ERROR);
    await Bun.write(join(run.workspace, INPUT_FILE), "9\n");
    expect(await sourceIdentity(run.workspace, [INPUT_FILE])).not.toBe(actual.source_after);
  } finally { await run.close(); }
});

test("offline_tasks_bound_and_clean_owned_work", async () => {
  const sentinel = join(temporaryDirectory(), "unrelated.txt");
  await Bun.write(sentinel, INITIAL_CONTENT);
  const controls = [
    { command: COMMAND_SUCCESS, limits: SUCCESS_LIMITS, exit: 0, failure: undefined },
    { command: COMMAND_FAILURE, limits: SUCCESS_LIMITS, exit: 2, failure: undefined },
    { command: COMMAND_WAIT, limits: DEADLINE_LIMITS, exit: null, failure: "deadline exceeded" },
    { command: COMMAND_OUTPUT, limits: OUTPUT_LIMITS, exit: null, failure: "output limit exceeded" },
  ];
  for (const control of controls) {
    const run = await EvaluationRun.create();
    const owned = run.ownership;
    try {
      const receipt = await run.execute([process.execPath, BUN_EVAL, control.command], [], control.limits);
      run.verify(receipt);
      if (control.failure === undefined) expect(receipt.result.exit_code).toBe(control.exit);
      else expect(receipt.result.failure).toBe(control.failure);
      expect(existsSync(receipt.receipt_directory)).toBe(false);
      if (receipt.child_pid !== null) expect(() => process.kill(receipt.child_pid ?? 0, 0)).toThrow();
    } finally { await run.close(); }
    expect(existsSync(owned.workspace)).toBe(false);
    expect(existsSync(owned.receipts)).toBe(false);
    expect(await Bun.file(sentinel).text()).toBe(INITIAL_CONTENT);
  }
}, TEST_TIMEOUT_MS);

test("handled_interruption_captures_failure_and_removes_owned_directories", async () => {
  const run = await EvaluationRun.create();
  const owned = run.ownership;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    timer = setTimeout(() => controller.abort(), DEADLINE_LIMITS.timeout_ms);
    const receipt = await run.execute([process.execPath, BUN_EVAL, COMMAND_WAIT], [], SUCCESS_LIMITS, controller.signal);
    expect(receipt.result.failure).toBe("supervisor received SIGTERM");
    expect(receipt.stdout).toBe("ready\n");
    if (receipt.child_pid !== null) expect(() => process.kill(receipt.child_pid ?? 0, 0)).toThrow();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await run.close();
  }
  expect(existsSync(owned.workspace)).toBe(false);
  expect(existsSync(owned.receipts)).toBe(false);
}, TEST_TIMEOUT_MS);

test("recovery_refuses_live_owner_or_altered_ownership_without_deleting_resources", async () => {
  const run = await EvaluationRun.create();
  const owned = run.ownership;
  try {
    await expect(recoverStaleOwnership(owned)).rejects.toThrow(OWNER_ERROR);
    await expect(recoverStaleOwnership({ ...owned, token: crypto.randomUUID() })).rejects.toThrow(OWNER_ERROR);
    expect(existsSync(owned.workspace)).toBe(true);
    expect(existsSync(owned.receipts)).toBe(true);
  } finally { await run.close(); }
});

test("closed_evaluation_refuses_new_commands_and_double_close_is_safe", async () => {
  const run = await EvaluationRun.create();
  await run.close();
  await run.close();
  await expect(run.execute([process.execPath, BUN_EVAL, COMMAND_SUCCESS], [], SUCCESS_LIMITS)).rejects.toThrow(EXECUTION_ERROR);
});

test("cancellation_during_request_preparation_prevents_any_child_start", async () => {
  const run = await EvaluationRun.create();
  const controller = new AbortController();
  const write = Bun.write.bind(Bun);
  let injections = 0;
  try {
    spyOn(Bun, "write").mockImplementation(async (destination, input, settings) => {
      if (String(destination).endsWith("/request.json")) { injections++; controller.abort(); }
      return Reflect.apply(write, Bun, [destination, input, settings]);
    });
    await expect(run.execute([process.execPath, BUN_EVAL, SENTINEL_COMMAND], [], SUCCESS_LIMITS, controller.signal)).rejects.toThrow(EXECUTION_ERROR);
    expect(injections).toBe(1);
    expect(existsSync(join(run.workspace, START_SENTINEL))).toBe(false);
  } finally { mock.restore(); await run.close(); }
});

test("failed_process_inspection_never_authorizes_live_owner_cleanup", async () => {
  const run = await EvaluationRun.create();
  const owned = run.ownership;
  const spawn = Bun.spawnSync.bind(Bun);
  let inspections = 0;
  try {
    spyOn(Bun, "spawnSync").mockImplementation((argument: string[] | (SyncOptions & { cmd: string[] }), options?: SyncOptions) => {
      const actual = Reflect.apply(spawn, Bun, Array.isArray(argument) ? [argument, options] : [argument]);
      const argv = Array.isArray(argument) ? argument : argument.cmd;
      if (Array.isArray(argv) && argv[0] === "ps") { inspections++; return { ...actual, exitCode: 1, stdout: Buffer.alloc(0) }; }
      return actual;
    });
    await expect(recoverStaleOwnership(owned)).rejects.toThrow(OWNER_ERROR);
    expect(inspections).toBe(1);
    expect(existsSync(owned.workspace)).toBe(true);
    expect(existsSync(owned.receipts)).toBe(true);
  } finally { mock.restore(); await run.close(); }
});

test("failed_second_directory_allocation_cleans_the_real_first_directory", async () => {
  const allocate = fileSystem.mkdtempSync;
  const allocated: string[] = [];
  let attempts = 0;
  try {
    spyOn(fileSystem, "mkdtempSync").mockImplementation((prefix, options) => {
      attempts++;
      if (attempts === 2) throw new Error(ALLOCATION_FAILURE);
      const path = Reflect.apply(allocate, fileSystem, [prefix, options]);
      if (typeof path === "string") allocated.push(path);
      return path;
    });
    await expect(createOwnership()).rejects.toThrow(ALLOCATION_FAILURE);
    expect(attempts).toBe(2);
    expect(allocated.length).toBe(1);
    for (const path of allocated) expect(existsSync(path)).toBe(false);
  } finally {
    mock.restore();
    for (const path of allocated) if (existsSync(path)) fileSystem.rmSync(path, { recursive: true, force: true });
  }
});
