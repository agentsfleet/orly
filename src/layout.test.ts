import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { contentDigest, readConfig, writeConfig } from "./config";
import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { RulesModel } from "./model";

const ENGINE_VERSION = "0.27.0";
const SKILLS = ["orly-spec", "orly-build", "orly-ship"];
const FRONT_MATTER = /^---\n([\s\S]*?)\n---/;
const MAX_DESCRIPTION = 1_024;
const RETIRED_PAGE = ".orly/dispatch/write_rust.md";
const RETIRED_BODY = "a page the previous release installed\n";
// Every path this release deleted. A tracked file that still cites one points
// a reader at nothing.
const RETIRED_REFERENCE = /(?<![\w.-])(?:audits\/[a-z-]+\.(?:sh|ts|awk)|dispatch\/[a-z_]+\.(?:md|sh)|docs\/(?:TEMPLATE|DOCUMENTATION_RULES|LOGGING_STANDARD|REST_API_DESIGN_GUIDELINES|SCHEMA_CONVENTIONS|CHANGELOG_VOICE|EXECUTE_DOC_READS|VERIFY_TIERS|HARNESS_VERIFY_OUTPUT|JUDGMENTS)\.md|docs\/greptile-learnings)/;
// History and the spec that records the removal may name the old paths.
const HISTORY = /^(docs\/v\d+\/|docs\/CHANGELOG\.md$|evals\/release\/|src\/layout\.test\.ts$)/;

afterEach(cleanupTemporaryDirectories);

describe("skills", () => {
  test("skill front matter names its directory", async () => {
    for (const skill of SKILLS) {
      const text = await Bun.file(join(ROOT, "skills", skill, "SKILL.md")).text();
      const header = text.match(FRONT_MATTER)?.[1] ?? "";
      expect(header).toContain(`name: ${skill}`);
      const description = header.split("description:")[1]?.trim() ?? "";
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    }
  });
});

describe("install", () => {
  test("install writes only selected standards", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, "src/lib.rs"), "pub fn main() {}\n");

    const result = await install(model, { targetRoot: repo, force: false, installHooks: false, orlyVersion: ENGINE_VERSION });

    expect(result.ok).toBe(true);
    expect(existsSync(join(repo, ".orly/standards/languages/rust.md"))).toBe(true);
    expect(existsSync(join(repo, ".orly/standards/languages/go.md"))).toBe(false);
    expect(existsSync(join(repo, ".claude/agents/orly-standards-reviewer.md"))).toBe(true);
  });

  test("update retires pages and stops on edits", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await install(model, { targetRoot: repo, force: false, installHooks: false, orlyVersion: ENGINE_VERSION });
    await recordRetiredPage(repo, RETIRED_BODY);

    const retired = await install(model, { targetRoot: repo, force: false, installHooks: false, orlyVersion: ENGINE_VERSION });
    expect(retired.ok).toBe(true);
    expect(existsSync(join(repo, RETIRED_PAGE))).toBe(false);
    expect(existsSync(join(repo, ".orly/dispatch"))).toBe(false);

    await recordRetiredPage(repo, RETIRED_BODY);
    await Bun.write(join(repo, RETIRED_PAGE), "an owner's edit\n");
    const stopped = await install(model, { targetRoot: repo, force: false, installHooks: false, orlyVersion: ENGINE_VERSION });
    expect(stopped.ok).toBe(false);
    expect(stopped.errors.map((error) => error.message).join("\n")).toContain(`migration conflict: ${RETIRED_PAGE}`);
    expect(await Bun.file(join(repo, RETIRED_PAGE)).text()).toBe("an owner's edit\n");
  });
});

describe("the retired layout", () => {
  test("no reference to a retired file", async () => {
    for (const directory of ["audits", "dispatch", "packs"]) expect(existsSync(join(ROOT, directory))).toBe(false);
    const tracked = Bun.spawnSync(["git", "ls-files"], { cwd: ROOT, stdout: "pipe" }).stdout.toString().split("\n").filter(Boolean);
    const citing: string[] = [];
    for (const path of tracked.filter((file) => !HISTORY.test(file) && existsSync(join(ROOT, file)))) {
      const text = await Bun.file(join(ROOT, path)).text();
      if (RETIRED_REFERENCE.test(text)) citing.push(path);
    }
    expect(citing).toEqual([]);
  });

  test("judge is not a command", () => {
    const result = Bun.spawnSync(["bun", join(ROOT, "src/cli.ts"), "judge", "spec", "x.md"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("unknown command: judge");
  });
});

// A page the previous release wrote, recorded with the digest it was written with.
async function recordRetiredPage(repo: string, body: string): Promise<void> {
  mkdirSync(join(repo, ".orly/dispatch"), { recursive: true });
  await Bun.write(join(repo, RETIRED_PAGE), body);
  const config = await readConfig(repo);
  if (!config) throw new Error("fixture install wrote no configuration");
  await writeConfig(repo, {
    ...config,
    managed: [...config.managed, RETIRED_PAGE],
    digests: { ...config.digests, [RETIRED_PAGE]: contentDigest(Buffer.from(body)) },
  });
}
