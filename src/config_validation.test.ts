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
  ["orly_version", {}], ["orly_version", "yesterday"], ["schema_version", 2],
  ["unknown_setting", true], ["limits", []], ["limits", { [UNIT_LANE]: { timeout_ms: 0 } }],
  ["limits", { [UNIT_LANE]: { output_bytes: -1 } }], ["limits", { [UNIT_LANE]: { timeout_ms: 1.5 } }],
  ["limits", { [UNIT_LANE]: { typo: 10 } }], ["limits", { [UNIT_LANE]: null }],
  ["burst", []], ["burst", { setup: "make setup" }], ["burst", { setup: [[]] }], ["burst", { warm: [[""]] }],
  ["burst", { secrets: { API_TOKEN: "Vault/item/field" } }], ["burst", { secrets: { "1API": "op://v/i/f" } }],
  ["burst", { secrets: { OP_SERVICE_ACCOUNT_TOKEN: "op://v/i/f" } }], ["burst", { secrets: { TS_OAUTH_CLIENT_SECRET: "op://v/i/f" } }],
  ["burst", { secrets: { E2E_API_KEY: "op://v/i/f" } }], ["burst", { secrets: { AWS_SECRET_ACCESS_KEY: "op://v/i/f" } }], ["burst", { secrets: { API_TOKEN: "op://v/i/f\nx" } }],
  ["burst", { artifacts: ["../outside"] }], ["burst", { artifacts: ["/abs/path"] }], ["burst", { artifacts: [".git/config"] }],
  ["burst", { e2e: { location: "Mumbai" } }], ["burst", { e2e: { region: "Chennai" } }], ["burst", { aws: { instance_types: [] } }],
  ["burst", { aws: { image: "ubuntu" } }], ["burst", { aws: { region: "Mumbai" } }],
  ["burst", { lanes: {} }], ["burst", { directories: ["TOOLBOX_DIR", "TOOLBOX_DIR"] }], ["burst", { directories: ["1DIR"] }],
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

test.each(["burst.Acceptance", "burst.", "burst.has space", "burst.this-lane-name-is-far-too-long"])("command %s is refused as a burst lane name", (lane) => {
  expect(() => parseConfig({ ...BASE, commands: { ...BASE.commands, [lane]: [["true"]] } })).toThrow(`commands.${lane}: a burst lane is burst.<name>`);
});

test("a burst object survives a rewrite exactly, with no fields it did not have", () => {
  const burst = { setup: [["make", "setup"]], secrets: { API_TOKEN: "op://Burst Vault/api/credential" }, artifacts: ["ui/report"] };
  const config = parseConfig({ ...BASE, commands: { ...BASE.commands, "burst.acceptance": [["make", "acceptance"]] }, burst });

  expect(JSON.parse(serialiseConfig(config)).burst).toEqual(burst);
  expect(parseConfig(JSON.parse(serialiseConfig(config)))).toEqual(config);
});

test("configuration limits survive a rewrite and override only their named lane", () => {
  const limits = { [UNIT_LANE]: { timeout_ms: 200, output_bytes: 4096 }, conform: { timeout_ms: 500 } };
  const config = parseConfig({ ...BASE, limits });
  expect(parseConfig(JSON.parse(serialiseConfig(config)))).toEqual(config);
  expect(limitsFor(config.limits, UNIT_LANE)).toEqual(limits[UNIT_LANE]);
  expect(limitsFor(config.limits, "conform")).toEqual({ timeout_ms: 500, output_bytes: DEFAULT_COMMAND_OUTPUT_BYTES });
  expect(limitsFor(config.limits, "verify.integration")).toEqual({ timeout_ms: DEFAULT_COMMAND_TIMEOUT_MS, output_bytes: DEFAULT_COMMAND_OUTPUT_BYTES });
});

test("a 0.27 configuration's digests are dropped, not refused", () => {
  const config = parseConfig({ ...BASE, digests: { "AGENTS.md": "sha256:0" } });
  expect(serialiseConfig(config)).not.toContain("digests");
});

test("a minimal seeded configuration normalizes optional ownership records", () => {
  const config = parseConfig({ schema_version: 1 });
  expect(config.packs).toEqual([]);
  expect(config.managed).toEqual([]);
  expect(config.orly_version).toBe("");
});

// The schema is strict and has no `execution` key, so a configuration that
// still carries one is refused by name rather than silently ignored.
test("a configuration with execution is refused", () => {
  const stale: JsonObject = { ...BASE, execution: { remote: { mode: "disabled" } } };

  expect(() => parseConfig(stale)).toThrow('root: Unrecognized key: "execution"');
});
