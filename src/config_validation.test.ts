import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_PATH, parseConfig, readConfig, readConfigSync, serialiseConfig } from "./config";
import { limitsFor, DEFAULT_COMMAND_TIMEOUT_MS, DEFAULT_COMMAND_OUTPUT_BYTES } from "./command_limits";
import type { JsonObject } from "./model";

const roots: string[] = [];
const UNIT_LANE = "verify.unit";
const BASE = { schema_version: 1, packs: [], commands: { conform: [["true"]], [UNIT_LANE]: [["true"]] } };

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

for (const [field, value] of [
  ["packs", null], ["packs", [false]], ["managed", {}], ["managed", [""]],
  ["digests", []], ["digests", { path: false }], ["digests", { path: "broken" }],
  ["orly_version", {}], ["orly_version", "yesterday"], ["schema_version", 2],
  ["unknown_setting", true], ["limits", []], ["limits", { [UNIT_LANE]: { timeout_ms: 0 } }],
  ["limits", { [UNIT_LANE]: { output_bytes: -1 } }], ["limits", { [UNIT_LANE]: { timeout_ms: 1.5 } }],
  ["limits", { [UNIT_LANE]: { typo: 10 } }], ["limits", { [UNIT_LANE]: null }],
] as Array<[string, unknown]>) {
  test(`both configuration readers reject invalid ${field} value ${JSON.stringify(value)}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "orly-config-validation-"));
    roots.push(root);
    mkdirSync(join(root, ".orly"));
    writeFileSync(join(root, CONFIG_PATH), JSON.stringify({ ...BASE, [field]: value }));
    expect(() => readConfigSync(root)).toThrow(field === "unknown_setting" ? "Unrecognized key" : field);
    await expect(readConfig(root)).rejects.toThrow(field === "unknown_setting" ? "Unrecognized key" : field);
  });
}

test("configuration limits survive a rewrite and override only their named lane", () => {
  const limits = { [UNIT_LANE]: { timeout_ms: 200, output_bytes: 4096 }, conform: { timeout_ms: 500 } };
  const config = parseConfig({ ...BASE, limits });
  expect(parseConfig(JSON.parse(serialiseConfig(config)))).toEqual(config);
  expect(limitsFor(config.limits, UNIT_LANE)).toEqual(limits[UNIT_LANE]);
  expect(limitsFor(config.limits, "conform")).toEqual({ timeout_ms: 500, output_bytes: DEFAULT_COMMAND_OUTPUT_BYTES });
  expect(limitsFor(config.limits, "verify.integration")).toEqual({ timeout_ms: DEFAULT_COMMAND_TIMEOUT_MS, output_bytes: DEFAULT_COMMAND_OUTPUT_BYTES });
});

test("a minimal seeded configuration normalizes optional ownership records", () => {
  const config = parseConfig({ schema_version: 1 });
  expect(config.packs).toEqual([]);
  expect(config.managed).toEqual([]);
  expect(config.digests).toEqual({});
  expect(config.orly_version).toBe("");
});

test("disabled execution settings round-trip while active remote execution refuses", () => {
  const disabled: JsonObject = { ...BASE, execution: { remote: { mode: "disabled", launcher: ["sentinel"] } } };
  const config = parseConfig(disabled);
  expect(parseConfig(JSON.parse(serialiseConfig(config)))).toEqual(config);
  expect(() => parseConfig({ ...BASE, execution: { remote: { mode: "enabled" } } })).toThrow("unsupported");
});
