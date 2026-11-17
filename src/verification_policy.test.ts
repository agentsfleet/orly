import { expect, test } from "bun:test";
import { ZodError } from "zod";

import { parseConfig, serialiseConfig } from "./config";
import { OrlyError, type JsonObject } from "./model";

const BASE = { schema_version: 1, commands: { conform: [["true"]], "verify.unit": [["true"]], "verify.integration": [["true"]] } };
const POLICY = { hermetic: true as const, max_age_ms: 3600000, toolchain: [["bun", "--version"]], inputs: [] };

test("reuse_policy_is_strict_and_round_trips", () => {
  const config = parseConfig({ ...BASE, reuse: { "verify.unit": POLICY } });
  expect(parseConfig(JSON.parse(serialiseConfig(config)))).toEqual(config);
  expect(config.reuse?.["verify.unit"]).toEqual(POLICY);
  expect(parseConfig(BASE).reuse).toBeUndefined();
});

test("scoped policy round trips and rejects invalid selectors", () => {
  const policy = { ...POLICY, tracked_inputs: ["src/", "bun.lock"] };
  const config = parseConfig({ ...BASE, reuse: { "verify.unit": policy } });
  expect(parseConfig(JSON.parse(serialiseConfig(config))).reuse?.["verify.unit"]).toEqual(policy);
  for (const tracked_inputs of [[], [""], ["../src"], ["/src"], [".git/index"], ["src/../x"], ["src/*"], ["src/?"], ["src/[a]"], ["src/{a,b}"], ["src\\x"], ["C:/src"], ["./src"], ["src//x"], ["src\0x"]]) {
    const error = rejected({ ...BASE, reuse: { "verify.unit": { ...POLICY, tracked_inputs } } });
    expect(error.issues.some((issue) => issue.path.join(".").startsWith("reuse.verify.unit.tracked_inputs"))).toBeTrue();
  }
});

test.each([
  ["invalid_value", { hermetic: false }], ["too_small", { max_age_ms: 0 }], ["too_small", { max_age_ms: -1 }], ["invalid_type", { max_age_ms: 1.5 }],
  ["too_small", { toolchain: [] }], ["too_small", { toolchain: [[]] }], ["too_small", { toolchain: [[""]] }],
  ["custom", { inputs: ["../outside"] }], ["custom", { inputs: ["/outside"] }], ["custom", { inputs: [".git/index"] }],
  ["custom", { inputs: ["nested/../outside"] }], ["custom", { inputs: ["bad\0path"] }], ["unrecognized_keys", { unknown: true }],
] as const)("invalid reuse policy is refused: %s %j", (code, invalid) => {
  const error = rejected({ ...BASE, reuse: { "verify.unit": { ...POLICY, ...invalid } } });
  expect(error.issues.some((issue) => issue.code === code && issue.path[0] === "reuse" && issue.path[1] === "verify.unit")).toBeTrue();
});

test.each(["conform", "verify.missing", "verify.integration", "verify.memory"])("ineligible lane %s cannot opt in", (lane) => {
  const error = rejected({ ...BASE, reuse: { [lane]: POLICY } });
  expect(error.issues.some((issue) => issue.code === "custom" && issue.path.join(".") === `reuse.${lane}`)).toBeTrue();
});

function rejected(config: JsonObject): ZodError {
  try { parseConfig(config); }
  catch (error) {
    expect(error).toBeInstanceOf(OrlyError);
    if (error instanceof OrlyError && error.cause instanceof ZodError) return error.cause;
    throw error;
  }
  throw new Error("invalid policy was accepted");
}
