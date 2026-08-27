import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { readConfig } from "./config";
import { RulesModel } from "./model";

afterEach(cleanupTemporaryDirectories);

const VERSION = "0.9.0";

async function installInto(repo: string) {
  const model = await RulesModel.load(ROOT);
  return install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: VERSION });
}

describe("runtime loaders", () => {
  // The gap these close: every runtime decides for itself what it loads, and a
  // markdown link is a request an agent may not honour. Each assertion below is
  // one runtime's deterministic way in.
  test("a fresh repository gets a loader for every runtime that has one", async () => {
    const repo = newRepository();

    const result = await installInto(repo);

    expect(result.ok).toBe(true);
    expect(result.written).toContain("CLAUDE.md");
    expect(result.written).toContain("opencode.json");
    // Claude Code reads CLAUDE.md and nothing else, so the chain starts there
    // and passes through the repository's own file on the way to orly's.
    expect(await Bun.file(join(repo, "CLAUDE.md")).text()).toContain("\n@AGENTS.md\n");
    expect(JSON.parse(await Bun.file(join(repo, "opencode.json")).text()).instructions)
      .toEqual(["AGENTS.md", "AGENTS.orly.md"]);
  });

  // The line that does the work. Backticked it is decoration, which is what the
  // pointer block shipped as before: a runtime resolves an import only when it
  // stands alone and unquoted.
  test("the pointer block carries a bare import line, not a fenced one", async () => {
    const repo = newRepository();

    await installInto(repo);

    const host = await Bun.file(join(repo, "AGENTS.md")).text();
    expect(host).toContain("\n@AGENTS.orly.md\n");
    expect(host).not.toContain("`@AGENTS.orly.md`");
  });

  test("loaders are idempotent — a second install writes nothing", async () => {
    const repo = newRepository();
    await installInto(repo);

    const second = await installInto(repo);

    expect(second.written).toEqual([]);
    expect(second.skipped).toContain("CLAUDE.md");
    expect(second.skipped).toContain("opencode.json");
  });

  // The loaders are the repository's files, not orly's: they carry the same
  // authorship rule as the pointer host and stay out of the managed list, so
  // `orly doctor` never reports drift on a file its owner is free to edit.
  test("loaders are never claimed as managed files", async () => {
    const repo = newRepository();

    await installInto(repo);

    const managed = (await readConfig(repo))?.managed ?? [];
    expect(managed).not.toContain("CLAUDE.md");
    expect(managed).not.toContain("opencode.json");
    expect(managed).not.toContain("AGENTS.md");
  });

  test("a repository's own CLAUDE.md is reported, never edited", async () => {
    const repo = newRepository();
    const theirs = "# Our own Claude instructions\n";
    await Bun.write(join(repo, "CLAUDE.md"), theirs);

    const result = await installInto(repo);

    expect(result.ok).toBe(true);
    expect(await Bun.file(join(repo, "CLAUDE.md")).text()).toBe(theirs);
    expect(result.written).not.toContain("CLAUDE.md");
    expect(result.skipped).toContain("CLAUDE.md");
  });

  // The other supported wiring, and the one a delimited edit would ruin: a
  // write through the link lands in AGENTS.md and imports it into itself.
  test("a CLAUDE.md symlinked at the host counts as delivery and is left alone", async () => {
    const repo = newRepository();
    await Bun.write(join(repo, "AGENTS.md"), "# Ours\n");
    symlinkSync("AGENTS.md", join(repo, "CLAUDE.md"));

    const result = await installInto(repo);

    expect(result.ok).toBe(true);
    expect(result.written).not.toContain("CLAUDE.md");
    const host = await Bun.file(join(repo, "AGENTS.md")).text();
    expect(host).toContain("# Ours");
    // One block, reached through the link — not a second copy written via it.
    expect(host.split("<!-- orly:begin -->").length - 1).toBe(1);
  });

  test("an existing opencode.json keeps its own keys and gains only what is missing", async () => {
    const repo = newRepository();
    await Bun.write(join(repo, "opencode.json"), JSON.stringify({ model: "anthropic/claude-fable-5", instructions: ["AGENTS.md"] }));

    const result = await installInto(repo);

    const config = JSON.parse(await Bun.file(join(repo, "opencode.json")).text());
    expect(config.model).toBe("anthropic/claude-fable-5");
    expect(config.instructions).toEqual(["AGENTS.md", "AGENTS.orly.md"]);
    expect(result.written).toContain("opencode.json");
  });

  // Rewriting a file whose shape we do not understand is how an install eats
  // someone's settings.
  test("an unparseable opencode.json survives byte for byte", async () => {
    const repo = newRepository();
    const theirs = "{ not json at all\n";
    await Bun.write(join(repo, "opencode.json"), theirs);

    const result = await installInto(repo);

    expect(result.ok).toBe(true);
    expect(await Bun.file(join(repo, "opencode.json")).text()).toBe(theirs);
    expect(result.skipped).toContain("opencode.json");
  });

  // Same guard the pointer host earned: a committed link out of the repository
  // otherwise carries a write wherever it leads and reports it as a success.
  test("refuses a loader symlinked outside the target repository", async () => {
    const outside = newRepository();
    const victim = join(outside, "victim.md");
    await Bun.write(victim, "not orly's to write\n");
    const repo = newRepository();
    symlinkSync(victim, join(repo, "opencode.json"));

    const result = await installInto(repo);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.path === "opencode.json")).toBeTrue();
    expect(await Bun.file(victim).text()).toBe("not orly's to write\n");
    expect(existsSync(join(repo, "AGENTS.orly.md"))).toBe(false);
  });
});
