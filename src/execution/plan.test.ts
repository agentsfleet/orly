import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { readConfig, seedConfig, writeConfig } from "../config";
import { cleanupTemporaryDirectories, newRepository, ROOT } from "../gates_test_support";
import { runGate } from "../gates";
import { RulesModel } from "../model";
import { readExecution } from "./config";
import { lifecyclePlan } from "./plan";

afterEach(cleanupTemporaryDirectories);

test("lifecycle_plan_names_actual_commands", async () => {
  const repo = newRepository();
  const config = await seedConfig(repo);
  config.commands = { conform: [["true"]], "verify.lint": [["true"]], "verify.unit": [["false"]], "verify.integration": [["false"]] };
  await writeConfig(repo, config);
  const plan = lifecyclePlan(repo);
  const verify = plan.stages.find((stage) => stage.name === "VERIFY")!;
  expect("pushCommands" in verify && verify.pushCommands?.map((command) => command.lane)).toEqual(["verify.lint"]);
  expect("boundaryCommands" in verify && verify.boundaryCommands?.map((command) => command.lane)).toEqual(["verify.integration", "verify.lint", "verify.unit"]);
  expect(plan.remote.evidence).toBeNull();
});

test("disabled_adapter_has_no_side_effects", async () => {
  const repo = newRepository();
  const config = await seedConfig(repo);
  const sentinel = join(repo, "worker-ran");
  config.execution = { remote: { mode: "disabled", launcher: ["touch", sentinel] } };
  config.commands = { conform: [["false"]], "verify.unit": [["true"]] };
  await writeConfig(repo, config);
  expect(lifecyclePlan(repo).remote.launches).toBe(0);
  const result = runGate(await RulesModel.load(ROOT), repo, "work", true);
  expect(result.ok).toBe(false);
  expect(result.results.find((row) => row.name === "cmd.conform")?.ok).toBe(false);
  expect(await Bun.file(sentinel).exists()).toBe(false);
  expect((await readConfig(repo))?.execution).toEqual(config.execution);
});

test.each([
  null, {}, { remote: {} }, { remote: { mode: "enabled" } },
  { remote: { mode: "disabled", launcher: "agentsfleet run" } },
  { remote: { mode: "disabled", launcher: [] } },
  { remote: { mode: "disabled", launcher: [""] } },
  { remote: { mode: "disabled", launcher: ["x\0y"] } },
  { remote: { mode: "disabled", activate: true } },
])("remote_adapter_is_disabled rejects malformed or active configuration: %j", (input) => {
  expect(() => readExecution(input)).toThrow("remote activation is unsupported");
});

test("disabled_adapter_never_becomes_pass", async () => {
  const repo = newRepository();
  const { configPath } = await import("../config");
  const config = await seedConfig(repo);
  await Bun.write(configPath(repo), JSON.stringify({ ...config, execution: { remote: { mode: "enabled" } } }));
  expect(() => lifecyclePlan(repo)).toThrow("remote activation is unsupported");
  const result = runGate(await RulesModel.load(ROOT), repo, "work", true);
  expect(result.ok).toBe(false);
  expect(result.results.find((row) => row.name === "repo.config")?.detail).toContain("remote activation is unsupported");
});

test("missing adapter defaults to disabled and missing repository fails", () => {
  expect(readExecution(undefined)).toBeUndefined();
  expect(readExecution({ remote: { mode: "disabled" } })).toEqual({ remote: { mode: "disabled" } });
  expect(() => lifecyclePlan(join(newRepository(), "uninstalled"))).toThrow("run orly init");
});
