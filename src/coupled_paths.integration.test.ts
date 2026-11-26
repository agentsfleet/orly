import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH } from "./config";
import { recordOverride, runGate } from "./gates";
import { cleanupTemporaryDirectories, git, modelFor, newRepository } from "./gates_test_support";

const CRITERION = "paths.coupled";
const WIRE = "src/wire/";
// Outside the wire prefix, so a version change alone triggers nothing.
const VERSION = "protocol/VERSION";

afterEach(cleanupTemporaryDirectories);

// A repository whose wire format and protocol version must move together, with
// a branch cut from main; each test commits what its branch changes.
async function coupledRepository(coupled: unknown = [{ when: [WIRE], then: [VERSION] }]) {
  const root = newRepository();
  mkdirSync(join(root, WIRE), { recursive: true });
  mkdirSync(join(root, "protocol"));
  writeFileSync(join(root, "src/wire/frame.ts"), "export const FRAME = 1;\n");
  writeFileSync(join(root, VERSION), "1\n");
  const model = await modelFor(root);
  const config = JSON.parse(readFileSync(join(root, CONFIG_PATH), "utf8"));
  writeFileSync(join(root, CONFIG_PATH), JSON.stringify({ ...config, coupled }));
  commit(root, "chore: couple the wire and its version");
  git(root, "checkout", "-q", "-b", "feat/wire");
  return { root, model };
}

function commit(root: string, message: string): void {
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", message);
}

function coupledResult(root: string, model: Awaited<ReturnType<typeof modelFor>>) {
  return runGate(model, root, "pr").results.find((result) => result.name === CRITERION);
}

test("a wire change without its version change fails and names both sides", async () => {
  const { root, model } = await coupledRepository();
  writeFileSync(join(root, "src/wire/frame.ts"), "export const FRAME = 2;\n");
  commit(root, "feat: widen the frame");
  const result = coupledResult(root, model);
  expect(result).toMatchObject({ ok: false, status: "failed" });
  expect(result?.detail).toStartWith(`src/wire/frame.ts changed under ${WIRE}, but nothing under ${VERSION} did`);
  expect(result?.detail).toContain(`orly override ${CRITERION} --reason <REASON>`);
});

test("a wire change that moves its version passes", async () => {
  const { root, model } = await coupledRepository();
  writeFileSync(join(root, "src/wire/frame.ts"), "export const FRAME = 2;\n");
  writeFileSync(join(root, VERSION), "2\n");
  commit(root, "feat: widen the frame and bump the protocol");
  expect(coupledResult(root, model)).toMatchObject({ ok: true, status: "passed", detail: "1 coupled path group(s) changed together or not at all" });
});

test("a coupling runs one way: the version alone may move", async () => {
  const { root, model } = await coupledRepository();
  writeFileSync(join(root, VERSION), "2\n");
  commit(root, "chore: bump the protocol");
  expect(coupledResult(root, model)?.ok).toBeTrue();
});

test("each broken group is named, and an unrelated change breaks none", async () => {
  const { root, model } = await coupledRepository([{ when: [WIRE], then: [VERSION] }, { when: ["schemas/"], then: ["src/config.ts"] }, { when: ["docs/"], then: ["README.md"] }]);
  mkdirSync(join(root, "schemas"));
  writeFileSync(join(root, "schemas/profile.json"), "{}\n");
  writeFileSync(join(root, "src/wire/frame.ts"), "export const FRAME = 3;\n");
  commit(root, "feat: two one-sided changes");
  const detail = coupledResult(root, model)?.detail ?? "";
  expect(detail).toContain(`but nothing under ${VERSION} did`);
  expect(detail).toContain("schemas/profile.json changed under schemas/, but nothing under src/config.ts did");
  expect(detail).not.toContain("README.md");
});

test("a sibling that only shares a prefix's spelling is matched as the prefix says", async () => {
  const { root, model } = await coupledRepository([{ when: ["src/wire/frame"], then: [VERSION] }]);
  writeFileSync(join(root, "src/wire/frame_test_data.ts"), "export const SAMPLE = 1;\n");
  commit(root, "test: add frame data");
  expect(coupledResult(root, model)?.ok).toBeFalse();
});

test("an owner override satisfies a broken coupling without turning it green", async () => {
  const { root, model } = await coupledRepository();
  writeFileSync(join(root, "src/wire/frame.ts"), "export const FRAME = 2;\n");
  commit(root, "refactor: rename inside the frame");
  recordOverride(root, CRITERION, "a rename with no wire effect");
  expect(coupledResult(root, model)).toMatchObject({ ok: true, override: "a rename with no wire effect" });
});

test("a repository with no coupling declared passes and says so", async () => {
  const root = newRepository();
  const model = await modelFor(root);
  git(root, "checkout", "-q", "-b", "feat/plain");
  writeFileSync(join(root, "frame.ts"), "export const FRAME = 1;\n");
  commit(root, "feat: add a frame");
  expect(coupledResult(root, model)).toMatchObject({ ok: true, detail: "no coupled paths declared in .orly/orly.json" });
});
