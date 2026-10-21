import { expect, test } from "bun:test";
import { realpathSync } from "node:fs";

import { judgmentCommand } from "./command";
import { JSON_FLAG, PROJECT_FLAG, REFRESH_FLAG } from "./constants";
import { DEFAULT_MIN_SCORE, MIN_SCORE_FLAG, SPEC_COMMAND } from "./spec_rubric";
import { parseSpecOptions } from "./spec_command";
import { SPEC_FILE, TestProject } from "./test_support";

test("the spec subcommand parses a path with explicit project, threshold and refresh", () => {
  using project = new TestProject();
  expect(parseSpecOptions([SPEC_FILE, PROJECT_FLAG, project.root, MIN_SCORE_FLAG, "92.5", REFRESH_FLAG, JSON_FLAG])).toEqual({
    path: SPEC_FILE, root: realpathSync(project.root), minScore: 92.5, refresh: true, json: true,
  });
  expect(parseSpecOptions([SPEC_FILE]).minScore).toBe(DEFAULT_MIN_SCORE);
});

test.each([
  [], [SPEC_FILE, SPEC_FILE], [SPEC_FILE, "--unknown"], [SPEC_FILE, REFRESH_FLAG, REFRESH_FLAG],
  [SPEC_FILE, PROJECT_FLAG], [SPEC_FILE, MIN_SCORE_FLAG], [SPEC_FILE, MIN_SCORE_FLAG, "NaN"],
  [SPEC_FILE, MIN_SCORE_FLAG, "0"], [SPEC_FILE, MIN_SCORE_FLAG, "101"], [SPEC_FILE, MIN_SCORE_FLAG, "0x5a"],
  [SPEC_FILE, MIN_SCORE_FLAG, "90", MIN_SCORE_FLAG, "80"],
].map((args) => ({ args })))("invalid spec arguments cannot start a judgment: %j", ({ args }) => {
  expect(() => parseSpecOptions(args)).toThrow();
});

test("the actual command dispatches spec input and reports incomplete without network access", async () => {
  using project = new TestProject();
  project.spec();
  expect(await judgmentCommand([SPEC_COMMAND, SPEC_FILE, PROJECT_FLAG, project.root, JSON_FLAG])).toBe(2);
});

test("spec-specific help is reachable through the real judgment command", async () => {
  expect(await judgmentCommand([SPEC_COMMAND, "--help"])).toBe(0);
});
