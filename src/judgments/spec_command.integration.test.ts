import { expect, test } from "bun:test";
import { join } from "node:path";

import { JSON_FLAG, PROJECT_FLAG } from "./constants";
import { writeReplay } from "./replay";
import { prepareSpec } from "./spec_input";
import { SPEC_COMMAND, SPEC_RUBRIC, SPEC_STATUS } from "./spec_rubric";
import { noulReply, SPEC_FILE, TestProject } from "./test_support";

const BIN = join(import.meta.dir, "../../bin/orly");
const JUDGE = "judge";
const MAX_OUTPUT_BYTES = 64 * 1024;
const TIMEOUT_MS = 5_000;

async function seed(project: TestProject, weakest: number): Promise<void> {
  project.spec();
  const prepared = await prepareSpec(project.root, SPEC_FILE);
  for (const check of prepared.checks) await writeReplay(project.root, check, noulReply(check.id === SPEC_RUBRIC[2].id ? weakest : 0.99), 1);
}

function run(project: TestProject) {
  const result = Bun.spawnSync(["bash", BIN, JUDGE, SPEC_COMMAND, SPEC_FILE, PROJECT_FLAG, project.root, JSON_FLAG], {
    env: { ...Bun.env, ORLY_TELEMETRY_OFF: "1" }, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES,
  });
  return { exitCode: result.exitCode, report: JSON.parse(result.stdout.toString()), stderr: result.stderr.toString() };
}

test("the executable returns exit 0 for an exact passing spec replay", async () => {
  using project = new TestProject();
  await seed(project, 0.95);
  const result = run(project);
  expect(result.exitCode).toBe(0);
  expect(result.report).toMatchObject({ status: SPEC_STATUS.ready, score: 95, requests: 0 });
});

test("the executable returns exit 1 for a confident negative spec judgment", async () => {
  using project = new TestProject();
  await seed(project, 0.03);
  const result = run(project);
  expect(result.exitCode).toBe(1);
  expect(result.report).toMatchObject({ status: SPEC_STATUS.review, score: 3, blocked: [SPEC_RUBRIC[2].id], requests: 0 });
});

test("the executable returns exit 2 for changed inputs without uploading them", async () => {
  using project = new TestProject();
  await seed(project, 0.95);
  project.write(SPEC_FILE, `${await Bun.file(join(project.root, SPEC_FILE)).text()}\nChanged required outcome.`);
  const result = run(project);
  expect(result.exitCode).toBe(2);
  expect(result.report).toMatchObject({ status: SPEC_STATUS.incomplete, score: null, requests: 0 });
  expect(result.report.reason).toContain("No exact replay");
});
