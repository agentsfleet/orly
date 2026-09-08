import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { auditSpec } from "../audits/spec-template";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { cleanupTemporaryDirectories, git, modelFor, newSpecRepository, ROOT, SPEC_RELATIVE, specFixture } from "./gates_test_support";

const CONFIG_PATH = ".oracle/orly.json";
const STAGED = "--staged";
const FILE = "--file";
const RESIDUE = "path/to/file.ext";
const GOOD = specFixture();
const VALID_CONFIG = { commands: { conform: [["true"]], "verify.unit": [["true"]] } };

afterEach(cleanupTemporaryDirectories);

function run(project: string, ...args: string[]) {
  const result = Bun.spawnSync(["bash", join(ROOT, "audits/spec-template.sh"), ...args], {
    cwd: project, env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe",
  });
  return { code: result.exitCode, output: `${result.stdout}${result.stderr}` };
}

describe("spec audit through real Git and file boundaries", () => {
  test("an invalid index fails even when its working copy was repaired", async () => {
    const project = newSpecRepository();
    await modelFor(project);
    await Bun.write(join(project, SPEC_RELATIVE), `${GOOD}\n${RESIDUE}\n`);
    git(project, "add", SPEC_RELATIVE);
    await Bun.write(join(project, SPEC_RELATIVE), GOOD);
    const result = run(project, STAGED);
    expect(result.code).toBe(1);
    expect(result.output).toContain("unfilled template placeholder");
  });

  test("a repaired index passes despite invalid unstaged content and config", async () => {
    const project = newSpecRepository();
    await modelFor(project);
    await Bun.write(join(project, SPEC_RELATIVE), `${GOOD}\nReady.\n`);
    git(project, "add", SPEC_RELATIVE);
    await Bun.write(join(project, SPEC_RELATIVE), RESIDUE);
    await Bun.write(join(project, CONFIG_PATH), "invalid json");
    const result = run(project, STAGED);
    expect(result.code).toBe(0);
    expect(result.output).toContain("sections, references, test mappings");
  });

  test("read-first references are resolved from the index", async () => {
    const project = newSpecRepository();
    await modelFor(project);
    git(project, "rm", "README.md");
    await Bun.write(join(project, "README.md"), "unstaged replacement");
    const errors = await auditSpec([SPEC_RELATIVE, SPEC_RELATIVE, STAGED], project);
    expect(errors.join("\n")).toContain("pointer does not resolve: README.md");
  });

  test("file mode checks working content and configuration", async () => {
    const project = newSpecRepository();
    await modelFor(project);
    expect(await auditSpec([SPEC_RELATIVE, SPEC_RELATIVE, FILE], project)).toEqual([]);
    await Bun.write(join(project, CONFIG_PATH), JSON.stringify({ commands: { "verify.custom": [["custom", "check"]] } }));
    expect((await auditSpec([SPEC_RELATIVE, SPEC_RELATIVE, FILE], project)).join("\n")).toContain("custom check");
  });

  test.each([
    ["invalid JSON", "{"],
    ["missing commands", "{}"],
    ["empty commands", '{"commands":{}}'],
    ["empty group", '{"commands":{"conform":[]}}'],
    ["invalid invocation", '{"commands":{"conform":[[]]}}'],
    ["nonstring argument", '{"commands":{"conform":[[3]]}}'],
    ["nonarray group", '{"commands":{"conform":true}}'],
  ])("refuses %s without skipping parity", async (_label, config) => {
    const project = newSpecRepository();
    await Bun.write(join(project, CONFIG_PATH), config);
    await expect(auditSpec([SPEC_RELATIVE, SPEC_RELATIVE, FILE], project)).rejects.toThrow();
    expect(run(project, FILE, SPEC_RELATIVE).code).toBe(1);
  });

  test("missing config, staged config, and arguments fail explicitly", async () => {
    const project = newSpecRepository();
    await expect(auditSpec([], project)).rejects.toThrow("expected spec path");
    await expect(auditSpec([SPEC_RELATIVE, SPEC_RELATIVE, FILE], project)).rejects.toThrow();
    await Bun.write(join(project, CONFIG_PATH), JSON.stringify(VALID_CONFIG));
    await expect(auditSpec([SPEC_RELATIVE, SPEC_RELATIVE, STAGED], project)).rejects.toThrow("from the index");
  });

  test("bulk scans retain their prohibited-pattern scope", async () => {
    const project = newSpecRepository();
    await Bun.write(join(project, SPEC_RELATIVE), "# historical incomplete spec\n");
    expect(run(project, "--all").code).toBe(0);
    await Bun.write(join(project, SPEC_RELATIVE), "# Spec\n## Estimated effort\n");
    const result = run(project, "--all");
    expect(result.code).toBe(1);
    expect(result.output).toContain("Estimated effort");
  });
});
