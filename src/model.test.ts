import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import { assertWritableInside, readJsonObject, RulesModel } from "./model";
import { cleanupTemporaryDirectories, temporaryDirectory } from "./gates_test_support";

const ROOT = resolve(import.meta.dir, "..");
const FIRST_LINK = "first-link";
const SECOND_LINK = "second-link";
const MISSING = "missing-destination";

afterEach(cleanupTemporaryDirectories);

test("a dangling multi-link destination refuses before creating outside content", () => {
  const root = temporaryDirectory();
  const outside = temporaryDirectory();
  symlinkSync(join(outside, MISSING), join(root, SECOND_LINK));
  symlinkSync(SECOND_LINK, join(root, FIRST_LINK));
  expect(() => assertWritableInside(root, FIRST_LINK, "probe")).toThrow("unresolved symbolic link");
  expect(() => assertWritableInside(root, `${FIRST_LINK}/child`, "probe")).toThrow("unresolved symbolic link");
  expect(existsSync(join(outside, MISSING))).toBe(false);
});

describe("RulesModel", () => {
  test("validates the current registry", async () => {
    const model = await RulesModel.load(ROOT);

    expect(() => model.validate()).not.toThrow();
  });

  test("rejects the declared invalid registry fixture", async () => {
    const registry = await readJsonObject(resolve(ROOT, "fixtures/registry-invalid.json"));
    const model = new RulesModel(ROOT, registry);

    expect(() => model.validate()).toThrow();
  });

  test("rejects missing mechanical rule fixtures", async () => {
    const source = await RulesModel.load(ROOT);
    const registry = structuredClone(source.registry);
    if (!Array.isArray(registry.rules) || typeof registry.rules[0] !== "object" || registry.rules[0] === null) throw new Error("mechanical rule missing");
    registry.rules[0] = { ...registry.rules[0], fixtures: { pass: ["fixtures/missing.json"], fail: ["fixtures/registry-invalid.json"] } };
    const model = new RulesModel(source.root, registry);

    expect(() => model.validate()).toThrow("fixture source is missing");
  });
});
