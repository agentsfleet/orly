import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { join } from "node:path";
import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { readConfig } from "./config";
import { RulesModel } from "./model";

afterEach(() => { mock.restore(); cleanupTemporaryDirectories(); });

test("strong_assertion_exposes_real_defect", async () => {
  const model = await RulesModel.load(ROOT);
  const repo = newRepository();
  const options = { targetRoot: repo, force: false, installHooks: false, orlyVersion: "0.12.0" };
  expect((await install(model, options)).ok).toBe(true);
  const config = await readConfig(repo);
  const target = config!.managed.find((path) => path.endsWith("dispatch/write_any.md"))!;
  const edited = "Owner correction that must survive an ordinary update.\n";
  await Bun.write(join(repo, target), edited);
  const result = await install(model, options);
  // Existence alone passes even when the updater destroys the correction.
  expect(await Bun.file(join(repo, target)).exists()).toBe(true);
  expect(await Bun.file(join(repo, target)).text()).toBe(edited);
  expect(result.ok).toBe(false);
  expect(result.errors.some((error) => error.path === target)).toBe(true);
});

test.each([".orly/orly.json", ".orly/AGENTS.md", "AGENTS.md"])("an owner edit to %s during staging refuses without overwriting it", async (target) => {
  const model = await RulesModel.load(ROOT);
  const repo = newRepository();
  const options = { targetRoot: repo, force: false, installHooks: false, orlyVersion: "0.11.0" };
  expect((await install(model, options)).ok).toBe(true);
  const write = Bun.write.bind(Bun);
  const edited = "Owner edit saved while installation is staging.\n";
  let injected = 0;
  spyOn(Bun, "write").mockImplementation(async (destination, input, settings) => {
    if (!injected && String(destination).includes("/install-stage-")) {
      injected++;
      await write(join(repo, target), edited);
    }
    return Reflect.apply(write, Bun, [destination, input, settings]);
  });
  const result = await install(model, options);
  expect(injected).toBe(1);
  expect(result.ok).toBe(false);
  expect(result.errors.map((error) => error.message).join("\n")).toContain("changed after planning");
  expect(await Bun.file(join(repo, target)).text()).toBe(edited);
  expect(await Bun.file(join(repo, ".orly/install-journal.json")).exists()).toBe(false);
});
