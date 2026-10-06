import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { CONFIG_PATH, contentDigest, readConfig } from "../config";
import { cleanupTemporaryDirectories, newRepository, temporaryDirectory } from "../gates_test_support";
import { install } from "../install";
import { RulesModel } from "../model";
import { AGENTS_FILENAME } from "../loaders";
import { PREVIOUS_CONFIG } from "./migration";
import { HOOKS_DIRECTORY, hooksPath } from "./hooks";
import type { FileWrite } from "./transaction";
import { UNSCOPED_ENVIRONMENT } from "../git_env";
import { chmodSync } from "node:fs";

const OLD_RULE = "dispatch/check.md";
const OLD_AGENTS = "AGENTS.orly.md";
const OWNER_RULES = "# Owner rules\nKeep this instruction.\n";
const OLD_BODY = "old managed content\n";
const OWNER_NOTE = ".oracle/owner-note";
const UNOWNED_BODY = "unowned state\n";
const CURRENT_RULE = ".orly/dispatch/check.md";
const CONTENT_ENCODING = "base64";
const VERSION = "0.12.0";
const JOURNAL = ".orly/install-journal.json";
const WRITE_COUNT = 6;
const HOOK_WRITE_COUNT = 8;
const JOURNAL_STAGE = "journal";
const WRITE_STAGE = "write";
const DELETE_STAGE = "delete";
const METADATA_STAGE = "metadata";
const INTERRUPTION = "injected interruption";
const OWNER_HOOKS = ".owner-hooks";
const OPENCODE = "opencode.json";
const OWNER_DOCUMENT = "owner.md";
const STEPS: Array<[string, number]> = [
  [JOURNAL_STAGE, 0], ...Array.from({ length: WRITE_COUNT }, (_, index): [string, number] => [WRITE_STAGE, index]),
  [METADATA_STAGE, 0], [DELETE_STAGE, 0], [DELETE_STAGE, 1], [DELETE_STAGE, 2],
];
const HOOK_STEPS: Array<[string, number]> = [
  [JOURNAL_STAGE, 0], ...Array.from({ length: HOOK_WRITE_COUNT }, (_, index): [string, number] => [WRITE_STAGE, index]),
  [METADATA_STAGE, 0], [DELETE_STAGE, 0], [DELETE_STAGE, 1], [DELETE_STAGE, 2],
];

afterEach(cleanupTemporaryDirectories);

test.each([".git/hooks", ".githooks"])("an active owner hook in %s remains connected", async (directory) => {
  const { repo, model, options } = await fixture();
  const path = join(repo, directory, "commit-msg");
  const owner = "#!/bin/sh\nexit 0\n";
  await Bun.write(path, owner);
  chmodSync(path, 0o755);
  if (directory === ".githooks") {
    const config = await Bun.file(join(repo, PREVIOUS_CONFIG)).json();
    config.managed.push(".githooks/pre-commit", ".githooks/pre-push");
    await Bun.write(join(repo, PREVIOUS_CONFIG), JSON.stringify(config));
    expect(Bun.spawnSync(["git", "-C", repo, "config", "core.hooksPath", directory]).exitCode).toBe(0);
  }
  const before = hooksPath(repo);
  const result = await install(model, { ...options, installHooks: true });
  expect(result.ok).toBe(false);
  expect(result.errors.map((error) => error.message).join("\n")).toContain("--no-hooks");
  expect(hooksPath(repo)).toBe(before);
  expect(await Bun.file(path).text()).toBe(owner);
  expect((await install(model, options)).ok).toBe(true);
  expect(hooksPath(repo)).toBe(before);
  expect(await Bun.file(path).text()).toBe(owner);
});

async function fixture() {
  const repo = newRepository();
  const engine = temporaryDirectory();
  await Bun.write(join(engine, "core.md"), "new operating model\n");
  await Bun.write(join(engine, "guide.md"), "new managed guide\n");
  const model = new RulesModel(engine, { core_documents: ["core.md"], packs: { base: { extensions: [], managed_files: [{ source: "guide.md", target: OLD_RULE }] } }, rules: [] });
  await Bun.write(join(repo, OLD_RULE), OLD_BODY);
  await Bun.write(join(repo, OLD_AGENTS), OLD_BODY);
  await Bun.write(join(repo, AGENTS_FILENAME), OWNER_RULES);
  await Bun.write(join(repo, PREVIOUS_CONFIG), JSON.stringify({
    schema_version: 1, orly_version: "0.11.0", packs: [], commands: { conform: [["true"]], "verify.unit": [["true"]] },
    managed: [OLD_RULE, OLD_AGENTS], digests: { [OLD_RULE]: contentDigest(Buffer.from(OLD_BODY)), [OLD_AGENTS]: contentDigest(Buffer.from(OLD_BODY)) },
  }));
  await Bun.write(join(repo, OWNER_NOTE), UNOWNED_BODY);
  return { repo, model, options: { targetRoot: repo, force: false, installHooks: false, orlyVersion: VERSION } };
}

test.each(STEPS)("interrupted_install_recovers at %s %d", async (stage, ordinal) => {
  await recoverInterruptedFixture(stage, ordinal, false, WRITE_COUNT);
});

test.each(HOOK_STEPS)("hook installation recovers interruption at %s %d", async (stage, ordinal) => {
  await recoverInterruptedFixture(stage, ordinal, true, HOOK_WRITE_COUNT);
});

async function recoverInterruptedFixture(stage: string, ordinal: number, installHooks: boolean, writeCount: number) {
  const { repo, model, options } = await fixture();
  options.installHooks = installHooks;
  const previous = await Bun.file(join(repo, PREVIOUS_CONFIG)).text();
  let injected = 0;
  const result = await install(model, { ...options, checkpoint: (current, index) => {
    if (current === stage && index === ordinal) { injected++; throw new Error(INTERRUPTION); }
  } });
  expect(injected).toBe(1);
  expect(result.ok).toBe(false);
  expect(result.errors.map((error) => error.message)).toEqual([INTERRUPTION]);
  await expectInterruptedState(repo, stage, ordinal, previous, writeCount);
  const configured = installHooks && (stage === METADATA_STAGE || stage === DELETE_STAGE);
  expect(hooksPath(repo)).toBe(configured ? HOOKS_DIRECTORY : null);
  expect((await install(model, options)).errors).toEqual([]);
  expect(await Bun.file(join(repo, CURRENT_RULE)).text()).toBe("new managed guide\n");
  expect(await Bun.file(join(repo, AGENTS_FILENAME)).text()).toStartWith(OWNER_RULES.trim());
  expect(await Bun.file(join(repo, OWNER_NOTE)).text()).toBe(UNOWNED_BODY);
  for (const path of [OLD_RULE, OLD_AGENTS, PREVIOUS_CONFIG, JOURNAL]) expect(await Bun.file(join(repo, path)).exists()).toBe(false);
  expect((await readConfig(repo))?.orly_version).toBe(VERSION);
  expect(hooksPath(repo)).toBe(installHooks ? HOOKS_DIRECTORY : null);
  expect((await install(model, options)).written).toEqual([]);
}

async function expectInterruptedState(repo: string, stage: string, ordinal: number, previous: string, writeCount: number): Promise<void> {
  const journal: { data: { writes: FileWrite[] } } = await Bun.file(join(repo, JOURNAL)).json();
  expect(journal.data.writes).toHaveLength(writeCount);
  const written = stage === JOURNAL_STAGE ? 0 : stage === WRITE_STAGE ? ordinal + 1 : writeCount;
  for (const [index, file] of journal.data.writes.entries()) {
    const current = Bun.file(join(repo, file.path));
    if (index < written) expect(await current.bytes()).toEqual(Buffer.from(file.content, CONTENT_ENCODING));
    else if (file.before === null) expect(await current.exists()).toBe(false);
    else expect(contentDigest(await current.bytes())).toBe(file.before);
  }
  expect((await readConfig(repo))?.orly_version).toBe(written === writeCount ? VERSION : undefined);
  const obsolete: Array<[string, string]> = [[OLD_RULE, OLD_BODY], [OLD_AGENTS, OLD_BODY], [PREVIOUS_CONFIG, previous]];
  for (const [index, [path, bytes]] of obsolete.entries()) {
    const deleted = stage === DELETE_STAGE && index <= ordinal;
    expect(await Bun.file(join(repo, path)).exists()).toBe(!deleted);
    if (!deleted) expect(await Bun.file(join(repo, path)).text()).toBe(bytes);
  }
  expect(await Bun.file(join(repo, OWNER_NOTE)).text()).toBe(UNOWNED_BODY);
  expect(await Bun.file(join(repo, AGENTS_FILENAME)).text()).toStartWith(OWNER_RULES.trim());
}

test.each([OLD_RULE, OLD_AGENTS, CURRENT_RULE])("migration_preserves_owned_content refuses edited or unowned %s", async (path) => {
  const { repo, model, options } = await fixture();
  const correction = "owner correction\n";
  await Bun.write(join(repo, path), correction);
  const before = await Bun.file(join(repo, PREVIOUS_CONFIG)).text();
  expect((await install(model, options)).ok).toBe(false);
  expect(await Bun.file(join(repo, path)).text()).toBe(correction);
  expect(await Bun.file(join(repo, PREVIOUS_CONFIG)).text()).toBe(before);
  expect(await Bun.file(join(repo, ".orly/orly.json")).exists()).toBe(false);
});

test("recovery refuses an edited destination before deleting any old source", async () => {
  const { repo, model, options } = await fixture();
  await install(model, { ...options, checkpoint: (stage) => { if (stage === "metadata") throw new Error("interruption"); } });
  await Bun.write(join(repo, CURRENT_RULE), "concurrent owner correction\n");
  await expect(install(model, options)).rejects.toThrow("changed after planning");
  expect(await Bun.file(join(repo, OLD_RULE)).text()).toBe(OLD_BODY);
  expect(await Bun.file(join(repo, PREVIOUS_CONFIG)).exists()).toBe(true);
});

test("changed journal cannot authorize recovery", async () => {
  const { repo, model, options } = await fixture();
  await install(model, { ...options, checkpoint: () => { throw new Error("interruption"); } });
  const journal = await Bun.file(join(repo, JOURNAL)).json();
  journal.data.deletes = [];
  await Bun.write(join(repo, JOURNAL), JSON.stringify(journal));
  await expect(install(model, options)).rejects.toThrow("integrity mismatch");
  expect(await Bun.file(join(repo, OLD_RULE)).text()).toBe(OLD_BODY);
});

test("a current installation preserves an independent previous configuration", async () => {
  const { repo, model, options } = await fixture();
  const independent = await Bun.file(join(repo, PREVIOUS_CONFIG)).text();
  await Bun.write(join(repo, CONFIG_PATH), JSON.stringify({ schema_version: 1, packs: [], managed: [], digests: {}, commands: {} }));
  expect((await install(model, options)).ok).toBe(true);
  expect(await Bun.file(join(repo, PREVIOUS_CONFIG)).text()).toBe(independent);
  expect(await Bun.file(join(repo, OLD_RULE)).text()).toBe(OLD_BODY);
});

test.each([true, false])("recovery preserves an owner-changed hooks setting with resumed hooks %s", async (installHooks) => {
  const { repo, model, options } = await fixture();
  const interrupted = await install(model, { ...options, installHooks: true, checkpoint: (stage) => {
    if (stage === "journal") throw new Error("interrupt before hook configuration");
  } });
  expect(interrupted.ok).toBe(false);
  const changed = Bun.spawnSync(["git", "config", "core.hooksPath", OWNER_HOOKS], { cwd: repo, env: UNSCOPED_ENVIRONMENT });
  expect(changed.exitCode).toBe(0);
  await expect(install(model, { ...options, installHooks })).rejects.toThrow("hooks setting changed");
  const current = Bun.spawnSync(["git", "config", "--get", "core.hooksPath"], { cwd: repo, env: UNSCOPED_ENVIRONMENT, stdout: "pipe" });
  expect(current.stdout.toString().trim()).toBe(OWNER_HOOKS);
  expect(await Bun.file(join(repo, OLD_RULE)).text()).toBe(OLD_BODY);
});

test("owner hook changes during destination writes are refused before metadata or cleanup", async () => {
  const { repo, model, options } = await fixture();
  const result = await install(model, { ...options, installHooks: true, checkpoint: (stage, index) => {
    if (stage === WRITE_STAGE && index === HOOK_WRITE_COUNT - 1) {
      const changed = Bun.spawnSync(["git", "config", "core.hooksPath", OWNER_HOOKS], { cwd: repo, env: UNSCOPED_ENVIRONMENT });
      expect(changed.exitCode).toBe(0);
    }
  } });
  expect(result.ok).toBeFalse();
  expect(result.errors.map((error) => error.message)).toEqual(["installation conflict: hooks setting changed after planning"]);
  expect(hooksPath(repo)).toBe(OWNER_HOOKS);
  expect(await Bun.file(join(repo, OLD_RULE)).text()).toBe(OLD_BODY);
  expect(await Bun.file(join(repo, PREVIOUS_CONFIG)).exists()).toBeTrue();
  expect(await Bun.file(join(repo, JOURNAL)).exists()).toBeTrue();
});

test("migration removes only proven obsolete instruction references", async () => {
  const { repo, model, options } = await fixture();
  await Bun.write(join(repo, OPENCODE), JSON.stringify({ instructions: [OLD_AGENTS, OWNER_DOCUMENT] }));
  expect((await install(model, options)).ok).toBe(true);
  expect((await Bun.file(join(repo, OPENCODE)).json()).instructions).toEqual([OWNER_DOCUMENT, "AGENTS.md", ".orly/AGENTS.md"]);
});
