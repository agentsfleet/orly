import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupTemporaryDirectories, git, gitOutput, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { readConfig } from "./config";
import { RulesModel } from "./model";

afterEach(cleanupTemporaryDirectories);


describe("install", () => {
  test("materialises the packs its own sources imply, hooks, and a config into a fresh repository", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, "src/lib.rs"), "pub fn main() {}\n");

    const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    expect(result.ok).toBe(true);
    expect(result.packs).toContain("language.rust");
    expect(result.packs).not.toContain("language.zig");
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(repo, ".orly/dispatch/write_rust.md"))).toBe(true);
    expect(existsSync(join(repo, ".orly/hooks/pre-commit"))).toBe(true);
    expect(existsSync(join(repo, ".orly/orly.json"))).toBe(true);
  });

  test("a second install over the same target reports zero writes", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    const second = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    expect(second.ok).toBe(true);
    expect(second.written).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
  });

  test("refuses to replace a managed file edited after installation", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, "src/lib.rs"), "pub fn main() {}\n");
    await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });
    await Bun.write(join(repo, ".orly/dispatch/write_rust.md"), "hand-edited\n");

    const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
    expect(await Bun.file(join(repo, ".orly/dispatch/write_rust.md")).text()).toBe("hand-edited\n");
  });

  // The other half of the same rule: authorship decides. A file orly never
  // wrote is the repository's, and is never replaced without being asked twice.
  test("refuses a file it never wrote, names it, and leaves the tree untouched", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, "src/lib.rs"), "pub fn main() {}\n");
    await Bun.write(join(repo, ".orly/dispatch/write_rust.md"), "the repository's own file\n");

    const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.path === ".orly/dispatch/write_rust.md")).toBeTrue();
    expect(await Bun.file(join(repo, ".orly/dispatch/write_rust.md")).text()).toBe("the repository's own file\n");
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
  });

  test("--force overwrites a hand-edited managed file", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, "src/lib.rs"), "pub fn main() {}\n");
    await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });
    await Bun.write(join(repo, ".orly/dispatch/write_rust.md"), "hand-edited\n");

    const result = await install(model, { targetRoot: repo, force: true, installHooks: true, orlyVersion: "0.4.0" });

    expect(result.ok).toBe(true);
    expect(await Bun.file(join(repo, ".orly/dispatch/write_rust.md")).text()).not.toBe("hand-edited\n");
  });

  test("rejects a target that is not a git repository, naming the fix", async () => {
    const model = await RulesModel.load(ROOT);
    const notARepo = mkdtempSync(join(tmpdir(), "orly-install-not-a-repo-"));
    try {
      await expect(install(model, { targetRoot: notARepo, force: false, installHooks: true, orlyVersion: "0.4.0" })).rejects.toThrow("git init");
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });

  test("rejects a target directory that does not exist at all", async () => {
    const model = await RulesModel.load(ROOT);
    await expect(install(model, { targetRoot: join(tmpdir(), "orly-install-never-created"), force: false, installHooks: true, orlyVersion: "0.4.0" })).rejects.toThrow("does not exist");
  });

  test("rejects an unknown pack named by the repository's own config, before writing anything", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, ".orly/orly.json"), JSON.stringify({ schema_version: 1, packs: ["language.cobol"], commands: {} }));

    await expect(install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" })).rejects.toThrow("unknown pack");
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
  });

  test("sets core.hooksPath and installs both hooks with the git-scope-unsetting preamble", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();

    await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    expect(gitOutput(repo, "config", "--get", "core.hooksPath")).toBe(".orly/hooks");
    for (const hook of ["pre-commit", "pre-push"]) {
      const text = await Bun.file(join(repo, ".orly/hooks", hook)).text();
      expect(text).toContain("GIT_DIR");
    }
  });

  test("--no-hooks skips hook installation and leaves core.hooksPath unset", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();

    await install(model, { targetRoot: repo, force: false, installHooks: false, orlyVersion: "0.4.0" });

    expect(existsSync(join(repo, ".orly/hooks"))).toBe(false);
    expect(gitOutput(repo, "config", "--get", "core.hooksPath")).toBe("");
  });

  test("refuses when the pointer host is a symlink escaping the target repository", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    const outside = mkdtempSync(join(tmpdir(), "orly-install-outside-"));
    try {
      const victim = join(outside, "victim.md");
      await Bun.write(victim, "PRIVATE\n");
      symlinkSync(victim, join(repo, "AGENTS.md"));

      const result = await install(model, { targetRoot: repo, force: false, installHooks: false, orlyVersion: "0.4.0" });

      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.message.includes("outside the target repository"))).toBe(true);
      expect(await Bun.file(victim).text()).toBe("PRIVATE\n");
      expect(existsSync(join(repo, ".orly/AGENTS.md"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  // assertWritableInside validated only the parent directory, so a symlinked
  // *file* passed: its ancestor is squarely inside the repository. --force
  // skips the authorship check, which was the only thing catching it.
  test("--force still refuses a hook that is a symlink out of the repository", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    const outside = mkdtempSync(join(tmpdir(), "orly-install-outside-"));
    try {
      const victim = join(outside, "hookvictim");
      await Bun.write(victim, "VICTIM\n");
      mkdirSync(join(repo, ".orly/hooks"), { recursive: true });
      symlinkSync(victim, join(repo, ".orly/hooks/pre-commit"));

      const result = await install(model, { targetRoot: repo, force: true, installHooks: true, orlyVersion: "0.4.0" });

      expect(result.ok).toBe(false);
      expect(await Bun.file(victim).text()).toBe("VICTIM\n");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("refuses when a managed file's path is a symlink escaping the target repository", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    const outside = mkdtempSync(join(tmpdir(), "orly-install-outside-"));
    try {
      mkdirSync(join(repo, ".orly"), { recursive: true });
      symlinkSync(outside, join(repo, ".orly/dispatch"));

      const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.message.includes("outside the target repository"))).toBe(true);
      expect(existsSync(join(outside, "write_rust.md"))).toBe(false);
      expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("refuses when the hooks directory path is a symlink escaping the target repository", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    const outside = mkdtempSync(join(tmpdir(), "orly-install-outside-hooks-"));
    try {
      mkdirSync(join(repo, ".orly"), { recursive: true });
      symlinkSync(outside, join(repo, ".orly/hooks"));

      const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.message.includes("outside the target repository"))).toBe(true);
      expect(existsSync(join(outside, "pre-commit"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("refuses when the .orly lock directory path is a symlink escaping the target repository", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    const outside = mkdtempSync(join(tmpdir(), "orly-install-outside-oracle-"));
    try {
      symlinkSync(outside, join(repo, ".orly"));

      const result = await install(model, { targetRoot: repo, force: false, installHooks: false, orlyVersion: "0.4.0" });

      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.message.includes("outside the target repository"))).toBe(true);
      expect(existsSync(join(outside, "orly.json"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  // Adversarial review, reproduced with a real cross-filesystem mount: staging
  // in the OS tmp dir means `rename(2)` can be asked to cross a filesystem
  // boundary, which it cannot do — every install against a target on a
  // different filesystem than $TMPDIR (an external drive, a devcontainer's
  // bind-mounted workspace) hard-crashed with EXDEV. Staging inside the
  // target's own .orly/ makes that structurally impossible to reintroduce:
  // assert no stage directory or leftover ever appears outside the target.
  test("stages inside the target repository, not the OS tmp dir", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    const tmpBefore = readdirSync(tmpdir()).filter((name) => name.startsWith("orly-install-"));

    const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    expect(result.ok).toBe(true);
    const tmpAfter = readdirSync(tmpdir()).filter((name) => name.startsWith("orly-install-"));
    expect(tmpAfter).toEqual(tmpBefore);
  });

  // The bug this milestone's own atomicity test caught while fixing the
  // above: cleaning up an empty .orly/ on a refused install must not also
  // fire on the success path, where .orly/ is legitimately empty for one
  // instant before the caller writes orly.json into it.
  test("a successful install leaves .orly/ intact for the lock the caller writes next", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();

    const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    expect(result.ok).toBe(true);
    expect(existsSync(join(repo, ".orly", "orly.json"))).toBe(true);
  });

  test("the written config records the engine version and every materialised file", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, "src/lib.rs"), "pub fn main() {}\n");

    await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

    const config = await readConfig(repo);
    expect(config).toBeDefined();
    expect(config?.orly_version).toBe("0.4.0");
    expect(config?.managed).toContain(".orly/dispatch/write_rust.md");
    expect(config?.managed).toContain(".orly/hooks/pre-commit");
  });

  test("refuses atomically when a selected pack's file cites a façade no selected pack provides", async () => {
    // The §4 registry defects (dispatch/lifecycle.md owned by no pack;
    // dispatch/name_architecture.md behind a pack universal prose didn't
    // select) were exactly this shape: a synthetic engine root with one pack
    // whose only managed file cites a dispatch/ path nothing installs.
    const engineRoot = mkdtempSync(join(tmpdir(), "orly-install-broken-engine-"));
    try {
      await Bun.write(join(engineRoot, "core.md"), "core\n");
      await Bun.write(join(engineRoot, "broken.md"), "cites dispatch/missing.md\n");

      const registry = {
        schema_version: 1,
        core_documents: ["core.md"],
        packs: { broken: { extensions: [], managed_files: [{ source: "broken.md", target: "broken.md" }] } },
        rules: [],
      };
      const model = new RulesModel(engineRoot, registry);
      const repo = newRepository();

      const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" });

      expect(result.ok).toBe(false);
      expect(result.errors[0]?.message).toContain("missing dispatch reference");
      expect(existsSync(join(repo, "broken.md"))).toBe(false);
      expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
      expect(existsSync(join(repo, ".orly"))).toBe(false);
    } finally {
      rmSync(engineRoot, { recursive: true, force: true });
    }
  });

  test("two packs disagreeing on one target's source is a registry error, not a silent pick", async () => {
    const engineRoot = mkdtempSync(join(tmpdir(), "orly-install-conflict-engine-"));
    try {
      await Bun.write(join(engineRoot, "core.md"), "core\n");
      await Bun.write(join(engineRoot, "a.md"), "from pack a\n");
      await Bun.write(join(engineRoot, "b.md"), "from pack b\n");

      const registry = {
        schema_version: 1,
        core_documents: ["core.md"],
        packs: {
          a: { extensions: [], managed_files: [{ source: "a.md", target: "shared.md" }] },
          b: { extensions: [], managed_files: [{ source: "b.md", target: "shared.md" }] },
        },
        rules: [],
      };
      const model = new RulesModel(engineRoot, registry);
      const repo = newRepository();

      await expect(install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: "0.4.0" })).rejects.toThrow("packs disagree on shared.md");
    } finally {
      rmSync(engineRoot, { recursive: true, force: true });
    }
  });
});
