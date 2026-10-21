import { expect, test } from "bun:test";
import { symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH } from "../config";
import { specFixture } from "../gates_test_support";
import { MAX_STATE_BYTES } from "./constants";
import { assertSpecUnchanged, prepareSpec } from "./spec_input";
import { SPEC_RUBRIC } from "./spec_rubric";
import { SPEC_CONFIG, SPEC_FILE, TestProject } from "./test_support";

test("all six questions receive the full spec and every required Dimension", async () => {
  using project = new TestProject();
  project.spec();
  const prepared = await prepareSpec(project.root, SPEC_FILE);
  expect(prepared.findings).toEqual([]);
  expect(prepared.dimensions).toEqual(["1.1"]);
  expect(prepared.checks).toHaveLength(SPEC_RUBRIC.length);
  for (const check of prepared.checks) {
    const request = JSON.parse(check.request);
    expect(request.state.spec).toBe(specFixture());
    expect(request.state.requiredDimensions).toEqual(prepared.dimensions);
    expect(request.state.commands).toEqual(SPEC_CONFIG.commands);
  }
});

test("spec edits and command changes invalidate all prior identities", async () => {
  using project = new TestProject();
  project.spec();
  const original = await prepareSpec(project.root, SPEC_FILE);
  project.write(SPEC_FILE, `${specFixture()}\nAdditional requirement.`);
  const changed = await prepareSpec(project.root, SPEC_FILE);
  expect(changed.checks.every((check, index) => check.identity !== original.checks[index]?.identity)).toBeTrue();
  project.write(CONFIG_PATH, JSON.stringify({ ...SPEC_CONFIG, commands: { ...SPEC_CONFIG.commands, extra: [["true"]] } }));
  const config = await prepareSpec(project.root, SPEC_FILE);
  expect(config.checks.every((check, index) => check.identity !== changed.checks[index]?.identity)).toBeTrue();
  await expect(assertSpecUnchanged(original)).rejects.toThrow("changed during judgment");
});

test("changing the requested symlink target during judgment is detected", async () => {
  using project = new TestProject();
  project.spec();
  const link = "selected.md";
  symlinkSync(SPEC_FILE, join(project.root, link));
  const prepared = await prepareSpec(project.root, link);
  project.write("other.md", `${specFixture()}\nChanged outcome.`);
  unlinkSync(join(project.root, link));
  symlinkSync("other.md", join(project.root, link));
  await expect(assertSpecUnchanged(prepared)).rejects.toThrow("changed during judgment");
});

test("an oversized complete spec is refused rather than silently excerpted", async () => {
  using project = new TestProject();
  project.spec(`${specFixture()}\n${"x".repeat(MAX_STATE_BYTES)}`);
  await expect(prepareSpec(project.root, SPEC_FILE)).rejects.toThrow(`exceeds ${MAX_STATE_BYTES} bytes`);
});

test("unresolved decisions and missing references produce structural findings", async () => {
  using project = new TestProject();
  project.spec(`${specFixture().replace("README.md", "absent.md")}\n[?] Which input should be used?`);
  const prepared = await prepareSpec(project.root, SPEC_FILE);
  expect(prepared.findings.join("\n")).toContain("pointer does not resolve");
  expect(prepared.findings.join("\n")).toContain("[?]");
});

test("missing commands and malformed configuration are refused", async () => {
  using project = new TestProject();
  project.spec();
  project.write(CONFIG_PATH, JSON.stringify({ ...SPEC_CONFIG, commands: {} }));
  await expect(prepareSpec(project.root, SPEC_FILE)).rejects.toThrow("Declare project commands");
  project.write(CONFIG_PATH, "{");
  await expect(prepareSpec(project.root, SPEC_FILE)).rejects.toThrow("not valid JSON");
});
