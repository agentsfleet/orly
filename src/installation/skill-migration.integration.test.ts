import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { CONFIG_PATH, readConfig } from "../config";
import { cleanupTemporaryDirectories, git, newRepository, ROOT, temporaryDirectory } from "../gates_test_support";
import { install } from "../install";
import { RulesModel } from "../model";

const OLD = ".orly/skills/orly-build/SKILL.md";
const RUNTIMES = [".agents", ".claude", ".opencode"];
const JOURNAL = ".orly/install-journal.json";
afterEach(cleanupTemporaryDirectories);

test("runtime skills contain their instructions without private copies", async () => {
  const root = newRepository();
  const model = await RulesModel.load(ROOT);
  const options = { targetRoot: root, force: false, installHooks: false, orlyVersion: "0.50.0" };
  expect((await install(model, options)).errors).toEqual([]);
  for (const runtime of RUNTIMES) {
    expect(readFileSync(join(root, runtime, "skills/orly-build/SKILL.md"), "utf8")).toContain("**Build each Section.**");
  }
  expect(readFileSync(join(root, ".claude/agents/orly-standards-reviewer.md"), "utf8")).toContain("the root `AGENTS.md`");
  expect(existsSync(join(root, ".orly/skills"))).toBeFalse();
  expect((await install(model, options)).written).toEqual([]);
});

test("skill migration preserves owner content and refuses dirty copies", async () => {
  const { root, model, options } = await oldInstallation();
  const custom = join(root, ".orly/skills/custom/SKILL.md");
  mkdirSync(dirname(custom), { recursive: true });
  writeFileSync(custom, "owner instruction");
  const before = readFileSync(join(root, OLD), "utf8");
  writeFileSync(join(root, OLD), "uncommitted owner edit");
  for (const force of [false, true]) {
    const refused = await install(model, { ...options, force });
    expect(refused.ok).toBeFalse();
    expect(refused.errors[0]?.message).toContain("uncommitted changes");
    expect(readFileSync(join(root, OLD), "utf8")).toBe("uncommitted owner edit");
    expect(existsSync(join(root, JOURNAL))).toBeFalse();
  }
  writeFileSync(join(root, OLD), before);
  expect((await install(model, options)).errors).toEqual([]);
  expect(existsSync(join(root, OLD))).toBeFalse();
  expect(readFileSync(custom, "utf8")).toBe("owner instruction");
  expect((await readConfig(root))?.managed).not.toContain(OLD);
});

test.each(["ignored", "skip-worktree", "assume-unchanged"])("skill migration refuses hidden owner edits: %s", async (kind) => {
  const { root, model, options } = await oldInstallation();
  if (kind === "ignored") {
    git(root, "rm", "--cached", OLD);
    writeFileSync(join(root, ".gitignore"), `${OLD}\n`);
    git(root, "add", ".gitignore");
    git(root, "commit", "-qm", "test: ignore private skill");
  } else git(root, "update-index", `--${kind}`, OLD);
  writeFileSync(join(root, OLD), "hidden owner edit");
  for (const force of [false, true]) {
    const result = await install(model, { ...options, force });
    expect(result.ok).toBeFalse();
    expect(result.errors[0]?.message).toContain("migration conflict");
    expect(readFileSync(join(root, OLD), "utf8")).toBe("hidden owner edit");
    expect(existsSync(join(root, JOURNAL))).toBeFalse();
  }
});

test("interrupted skill migration resumes before removing private copies", async () => {
  const { root, model, options } = await oldInstallation();
  const interrupted = await install(model, { ...options, checkpoint(stage) { if (stage === "metadata") throw new Error("fixture interruption"); } });
  expect(interrupted.errors[0]?.message).toBe("fixture interruption");
  expect(existsSync(join(root, OLD))).toBeTrue();
  for (const runtime of RUNTIMES) expect(readFileSync(join(root, runtime, "skills/orly-build/SKILL.md"), "utf8")).toContain("**Build each Section.**");
  expect((await install(model, options)).errors).toEqual([]);
  expect(existsSync(join(root, ".orly/skills"))).toBeFalse();
  expect(existsSync(join(root, JOURNAL))).toBeFalse();
  expect((await install(model, options)).written).toEqual([]);
});

test.each([true, false])("recovery preserves a mode-only edit with core.fileMode=%s", async (fileMode) => {
  const { root, model, options } = await oldInstallation();
  await install(model, { ...options, checkpoint(stage) { if (stage === "metadata") throw new Error("fixture interruption"); } });
  git(root, "config", "core.fileMode", String(fileMode));
  const before = readFileSync(join(root, OLD), "utf8");
  chmodSync(join(root, OLD), 0o755);
  await expect(install(model, options)).rejects.toThrow("must remain tracked and clean");
  expect(existsSync(join(root, JOURNAL))).toBeTrue();
  expect(readFileSync(join(root, OLD), "utf8")).toBe(before);
  expect(statSync(join(root, OLD)).mode & 0o777).toBe(0o755);
});

test("migration preserves executable edits hidden from Git status", async () => {
  const { root, model, options } = await oldInstallation();
  git(root, "config", "core.fileMode", "false");
  chmodSync(join(root, OLD), 0o755);
  for (const force of [false, true]) {
    const result = await install(model, { ...options, force });
    expect(result.ok).toBeFalse();
    expect(result.errors[0]?.message).toContain("migration conflict");
    expect(statSync(join(root, OLD)).mode & 0o777).toBe(0o755);
    expect(existsSync(join(root, JOURNAL))).toBeFalse();
  }
});

test("migration refuses a symlink instead of deleting its target", async () => {
  const { root, model, options } = await oldInstallation();
  const other = temporaryDirectory();
  const file = join(other, "owner.md");
  writeFileSync(file, "owner content");
  git(root, "rm", OLD);
  mkdirSync(dirname(join(root, OLD)), { recursive: true });
  symlinkSync(file, join(root, OLD));
  const result = await install(model, options);
  expect(result.ok).toBeFalse();
  expect(result.errors[0]?.message).toContain("symlink");
  expect(readFileSync(file, "utf8")).toBe("owner content");
});

test("governance installation delivers the architecture page dependencies", async () => {
  const root = newRepository();
  const model = await RulesModel.load(ROOT);
  const result = await install(model, { targetRoot: root, force: false, installHooks: false, orlyVersion: "0.50.0", requestedPacks: ["workflow.governance"] });
  expect(result.errors).toEqual([]);
  expect(existsSync(join(root, ".orly/docs/architecture/installation.md"))).toBeTrue();
  expect(existsSync(join(root, ".orly/docs/BURST.md"))).toBeTrue();
});

async function oldInstallation() {
  const root = newRepository();
  const model = await RulesModel.load(ROOT);
  const options = { targetRoot: root, force: false, installHooks: false, orlyVersion: "0.50.0" };
  expect((await install(model, options)).errors).toEqual([]);
  mkdirSync(dirname(join(root, OLD)), { recursive: true });
  writeFileSync(join(root, OLD), "old private skill\n");
  for (const runtime of RUNTIMES) writeFileSync(join(root, runtime, "skills/orly-build/SKILL.md"), `Read ${OLD}\n`);
  const config = await readConfig(root);
  if (!config) throw new Error("fixture installation is missing configuration");
  config.managed.push(OLD);
  config.orly_version = "0.42.0";
  writeFileSync(join(root, CONFIG_PATH), JSON.stringify(config));
  git(root, "add", ".");
  git(root, "commit", "-qm", "test: private skill installation");
  return { root, model, options };
}
