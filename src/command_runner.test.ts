import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./command_runner";
import { criteriaFor } from "./criteria";
import { CONFIG_PATH } from "./config";
import { cleanupTemporaryDirectories, modelFor, newRepository } from "./gates_test_support";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const PERMISSION_MASK = 0o777;
const CHILD_FILE = "child.pid";
const UNIT_LANE = "verify.unit";
const roots: string[] = [];

afterEach(() => {
  cleanupTemporaryDirectories();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "orly-command-test-"));
  roots.push(root);
  return root;
}

function receipt(detail: string): string {
  const path = detail.split("complete captured output: ")[1];
  expect(path).toBeDefined();
  roots.push(path!);
  expect(statSync(path!).mode & PERMISSION_MASK).toBe(PRIVATE_DIRECTORY_MODE);
  for (const file of ["stdout.log", "stderr.log"]) expect(statSync(join(path!, file)).mode & PERMISSION_MASK).toBe(PRIVATE_FILE_MODE);
  return path!;
}

async function expectChildStopped(root: string): Promise<void> {
  expect(existsSync(join(root, CHILD_FILE))).toBeTrue();
  const pid = Number(readFileSync(join(root, CHILD_FILE), "utf8").trim());
  for (let attempt = 0; attempt < 100; attempt++) {
    try { process.kill(pid, 0); } catch { return; }
    await Bun.sleep(10);
  }
  throw new Error(`owned child ${pid} survived the command limit`);
}

test("a deadline stops the owned child group and keeps captured output", async () => {
  const root = scratch();
  const result = runCommand(root, ["sh", "-c", `sleep 30 & echo $! > ${CHILD_FILE}; echo started; echo detail >&2; wait`], { timeout_ms: 300, output_bytes: 4096 });
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("deadline exceeded");
  expect(result.detail).toContain("300 ms deadline");
  const path = receipt(result.detail);
  expect(readFileSync(join(path, "stdout.log"), "utf8")).toBe("started\n");
  expect(readFileSync(join(path, "stderr.log"), "utf8")).toBe("detail\n");
  await expectChildStopped(root);
});

test("the output budget covers both streams and stops the owned child group", async () => {
  const root = scratch();
  const chunk = "123456789012345678901234";
  const started = performance.now();
  const result = runCommand(root, ["sh", "-c", `sleep 30 & echo $! > ${CHILD_FILE}; printf ${chunk}; printf ${chunk} >&2; wait`], { timeout_ms: 3000, output_bytes: 32 });
  expect(performance.now() - started).toBeLessThan(1500);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("output limit exceeded");
  expect(result.detail).toContain("48 bytes / 32 bytes");
  const path = receipt(result.detail);
  expect(readFileSync(join(path, "stdout.log"), "utf8")).toBe(chunk);
  expect(readFileSync(join(path, "stderr.log"), "utf8")).toBe(chunk);
  await expectChildStopped(root);
});

test("an explicit lane override applies through the public gate criteria", async () => {
  const root = newRepository();
  const model = await modelFor(root);
  writeFileSync(join(root, CONFIG_PATH), JSON.stringify({
    schema_version: 1, commands: { conform: [["true"]], [UNIT_LANE]: [["sh", "-c", "echo measured; sleep 3"]] },
    limits: { [UNIT_LANE]: { timeout_ms: 200, output_bytes: 4096 } },
  }));
  const context = { root, model, acceptDirty: false };
  const check = criteriaFor("pr", context).find((entry) => entry.name === `cmd.${UNIT_LANE}`)!;
  const result = check.evaluate(context);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("200 ms deadline");
  expect(readFileSync(join(receipt(result.detail), "stdout.log"), "utf8")).toBe("measured\n");
});
