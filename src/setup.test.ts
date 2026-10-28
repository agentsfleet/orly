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
  ["rs", "rust"], ["py", "python"], ["ts", "typescript"], ["go", "go"],
] as const;

afterEach(cleanupTemporaryDirectories);

// `orly doctor` also checks the gstack and EGM installs under the user's home.
// An empty home has no agent runtime, so the verdict is the repository's alone
// and does not depend on what the machine running the suite has installed.
function doctor(root: string): { code: number; output: string } {
  const home = temporaryDirectory();
  const env = { ...UNSCOPED_ENVIRONMENT, HOME: home, CODEX_HOME: join(home, ".codex") };
  const result = Bun.spawnSync(["bun", join(ROOT, "src/cli.ts"), "--root", ROOT, "doctor"], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, output: `${result.stdout.toString()}${result.stderr.toString()}` };
}

describe("setup completeness", () => {
  for (const [extension, language] of LANGUAGE_CASES) {
    test(`${language} init reports missing commands without guessing a toolchain`, async () => {
      const root = newRepository();
      await Bun.write(join(root, `source.${extension}`), "\n");
      const installed = orly(root, ROOT, "init", "--json");
      expect(installed.code).toBe(0);
      const result = JSON.parse(installed.output);
      expect(result.packs).toContain(`language.${language}`);
      // `conform` is optional, so the one missing role is a verify.* lane.
      expect(result.setupErrors).toHaveLength(1);
      expect(result.setupErrors.join(" ")).not.toContain(CONFORM);
      expect(result.setupErrors.join(" ")).toContain("verify.*");
      const checked = doctor(root);
      expect(checked.code).toBe(1);
      expect(checked.output).toContain("setup incomplete");
    });
  }

  test("text output explains how to finish setup", () => {
    const installed = orly(newRepository(), ROOT, "init");
    expect(installed.code).toBe(0);
    expect(installed.output).toContain("setup incomplete");
    expect(installed.output).toContain("orly doctor");
  });

  for (const commands of [{}, { build: TRUE }, { [CONFORM]: TRUE }, { [CONFORM]: TRUE, "verify.": TRUE }]) {
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

  test("gates accept a verify.* command without conform", async () => {
    const root = newRepository();
    await Bun.write(join(root, CONFIG_PATH), JSON.stringify({ schema_version: 1, commands: { [VERIFY_DOCS]: TRUE } }));
    const model = await RulesModel.load(ROOT);
    for (const gate of ["work", "verify", "pr"] as const) {
      const result = runGate(model, root, gate).results.find((entry) => entry.name === CONFIG_CRITERION);
      expect(result?.ok).toBe(true);
    }
  });
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
      expect(doctor(root)).toEqual({ code: 0, output: expect.stringContaining("no agent runtime on this machine") });

      // Use a fresh executable directory, as a global package installation would.
      const binaries = temporaryDirectory();
      // Hermetic hook routing; the packed evaluation separately runs real bunx.
      const launcher = join(binaries, "bunx");
      await Bun.write(launcher, '#!/bin/sh\nset -eu\ntest "$1" = "--bun"\ncase "$2" in @agentsfleet/orly@*) ;; *) exit 9 ;; esac\nshift 2\nexec "$ORLY_TEST_ENTRY" "$@"\n');
      chmodSync(launcher, 0o755);
      symlinkSync(process.execPath, join(binaries, "bun"));
      git(root, "add", ".");
      const commit = Bun.spawnSync(["/usr/bin/git", "commit", "-qm", "docs: initialize checks"], {
        cwd: root, env: { ...UNSCOPED_ENVIRONMENT, PATH: `${binaries}:/usr/bin:/bin`, ORLY_TELEMETRY_OFF: "1", ORLY_TEST_ENTRY: join(ROOT, "bin/orly") }, stdout: "pipe", stderr: "pipe",
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

test("missing bunx fails the hook without running a different installer", async () => {
  const root = newRepository();
  expect(orly(root, ROOT, "init").code).toBe(0);
  const binaries = temporaryDirectory();
  const marker = join(binaries, "installer-ran");
  const installer = join(binaries, "bun");
  await Bun.write(installer, '#!/bin/sh\nprintf ran > "$ORLY_TEST_MARKER"\n');
  chmodSync(installer, 0o755);

  for (const hook of ["pre-commit", "pre-push"]) {
    const result = Bun.spawnSync(["/bin/bash", `.orly/hooks/${hook}`], {
      cwd: root, env: { ...process.env, PATH: binaries, ORLY_TEST_MARKER: marker }, stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode).toBe(127);
    expect(result.stderr.toString()).toContain("bunx");
    expect(existsSync(marker)).toBe(false);
  }
});
