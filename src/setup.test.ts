import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH, readConfig } from "./config";
import { runGate } from "./gates";
import { cleanupTemporaryDirectories, git, newRepository, orly, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { RulesModel } from "./model";

const CONFORM = "conform";
const VERIFY_DOCS = "verify.docs";
const TRUE = [["true"]];
const CONFIG_CRITERION = "repo.config";
const GUIDE = "guide";
const LANGUAGE_CASES = [
  ["rs", "rust"], ["zig", "zig"], ["py", "python"], ["ts", "typescript"], ["go", "go"],
] as const;

afterEach(cleanupTemporaryDirectories);

describe("setup completeness", () => {
  for (const [extension, language] of LANGUAGE_CASES) {
    test(`${language} init reports missing commands without guessing a toolchain`, async () => {
      const root = newRepository();
      await Bun.write(join(root, `source.${extension}`), "\n");
      const installed = orly(root, ROOT, "init", "--json");
      expect(installed.code).toBe(0);
      const result = JSON.parse(installed.output);
      expect(result.packs).toContain(`language.${language}`);
      expect(result.setupErrors).toHaveLength(2);
      expect(result.setupErrors.join(" ")).toContain(CONFORM);
      expect(result.setupErrors.join(" ")).toContain("verify.*");
      const doctor = orly(root, ROOT, "doctor");
      expect(doctor.code).toBe(1);
      expect(doctor.output).toContain("setup incomplete");
    });
  }

  test("text output explains how to finish setup", () => {
    const installed = orly(newRepository(), ROOT, "init");
    expect(installed.code).toBe(0);
    expect(installed.output).toContain("setup incomplete");
    expect(installed.output).toContain("orly doctor");
  });

  for (const commands of [{}, { build: TRUE }, { [CONFORM]: TRUE }, { [VERIFY_DOCS]: TRUE }, { [CONFORM]: TRUE, "verify.": TRUE }]) {
    test(`gates reject incomplete command roles: ${Object.keys(commands).join(", ") || "empty"}`, async () => {
      const root = newRepository();
      await Bun.write(join(root, CONFIG_PATH), JSON.stringify({ schema_version: 1, commands }));
      const model = await RulesModel.load(ROOT);
      for (const gate of ["work", "verify", "pr"] as const) {
        const result = runGate(model, root, gate).results.find((entry) => entry.name === CONFIG_CRITERION);
        expect(result?.ok).toBe(false);
        expect(result?.detail).toContain("declare");
      }
    });
  }
});

describe("documentation repositories", () => {
  for (const extension of ["md", "mdx"]) {
    test(`${extension} repositories run their own checks without application test lanes`, async () => {
      const root = newRepository();
      const page = `${GUIDE}.${extension}`;
      await Bun.write(join(root, page), "# Guide\n\nRead this page.\n");
      await Bun.write(join(root, "Makefile"), `test:\n\t@test -s ${page}\nlint:\n\t@test -s ${page}\n`);
      const commands = { [CONFORM]: [["make", "test"]], [VERIFY_DOCS]: [["make", "lint"]] };
      await Bun.write(join(root, CONFIG_PATH), JSON.stringify({ schema_version: 1, commands }));
      const installed = orly(root, ROOT, "init", "--json");
      expect(installed.code).toBe(0);
      const result = JSON.parse(installed.output);
      expect(result.setupErrors).toEqual([]);
      expect(result.packs).toContain("domain.documentation");
      expect(result.packs.includes("language.mdx")).toBe(extension === "mdx");
      expect((await readConfig(root))?.commands).toEqual(commands);
      expect(orly(root, ROOT, "doctor").code).toBe(0);

      // Use a fresh executable directory, as a global package installation would.
      const binaries = temporaryDirectory();
      symlinkSync(join(ROOT, "bin/orly"), join(binaries, "orly"));
      symlinkSync(process.execPath, join(binaries, "bun"));
      git(root, "add", ".");
      const commit = Bun.spawnSync(["/usr/bin/git", "commit", "-qm", "docs: initialize checks"], {
        cwd: root, env: { ...UNSCOPED_ENVIRONMENT, PATH: `${binaries}:/usr/bin:/bin`, ORLY_TELEMETRY_OFF: "1" }, stdout: "pipe", stderr: "pipe",
      });
      expect({ code: commit.exitCode, output: commit.stderr.toString() }).toEqual({ code: 0, output: expect.any(String) });

      const model = await RulesModel.load(ROOT);
      const checks = () => runGate(model, root, "pr").results.filter((entry) => entry.name.startsWith("cmd."));
      expect(checks().map((entry) => [entry.name, entry.ok])).toEqual([[`cmd.${VERIFY_DOCS}`, true]]);
      await Bun.write(join(root, page), "");
      expect(orly(root, ROOT, "gate", "work").code).toBe(1);
      expect(checks().map((entry) => [entry.name, entry.ok])).toEqual([[`cmd.${VERIFY_DOCS}`, false]]);
    });
  }
});

test("a missing executable prints installation guidance without running an installer", async () => {
  const root = newRepository();
  expect(orly(root, ROOT, "init").code).toBe(0);
  const binaries = temporaryDirectory();
  const marker = join(binaries, "installer-ran");
  const installer = join(binaries, "bun");
  await Bun.write(installer, '#!/bin/sh\nprintf ran > "$ORLY_TEST_MARKER"\n');
  chmodSync(installer, 0o755);

  for (const hook of ["pre-commit", "pre-push"]) {
    const result = Bun.spawnSync(["/bin/bash", `.githooks/${hook}`], {
      cwd: root, env: { ...process.env, PATH: binaries, ORLY_TEST_MARKER: marker }, stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("`bun add -g @agentsfleet/orly`");
    expect(existsSync(marker)).toBe(false);
  }
});
