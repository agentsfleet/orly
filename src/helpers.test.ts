import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, ROOT, temporaryDirectory } from "./gates_test_support";
import { helperSources, type HelperSources, missingHelpers } from "./helpers";
import { OrlyError } from "./model";

const SOURCES: HelperSources = {
  gstack: "https://github.com/garrytan/gstack",
  egm: "https://github.com/google/elephant-goldfish-model",
};
// Any version passes: doctor asks only whether gstack is there.
const ANY_VERSION = "1.90.0";

afterEach(cleanupTemporaryDirectories);

async function writeVersion(directory: string): Promise<void> {
  mkdirSync(directory, { recursive: true });
  await Bun.write(join(directory, "VERSION"), `${ANY_VERSION}\n`);
}

async function recordClaudePlugin(home: string): Promise<void> {
  const record = join(home, ".claude", "plugins", "installed_plugins.json");
  await Bun.write(record, JSON.stringify({ plugins: { "egm@egm": [{ scope: "user", gitCommitSha: "0".repeat(40) }] } }));
}

describe("helper installs", () => {
  test("doctor reports a missing helper with the install command", async () => {
    const home = temporaryDirectory();
    const codexHome = join(home, ".codex");
    await writeVersion(join(home, ".claude", "skills", "gstack"));
    mkdirSync(codexHome, { recursive: true });

    const findings = missingHelpers(SOURCES, { home, codexHome });

    expect(findings).toHaveLength(3);
    expect(findings[0]).toContain("EGM is not installed for Claude Code");
    expect(findings[0]).toContain("claude plugin marketplace add google/elephant-goldfish-model && claude plugin install egm@egm");
    expect(findings[1]).toContain("gstack is not installed for Codex");
    expect(findings[1]).toContain("./setup --host codex --no-browser");
    expect(findings[2]).toContain("codex plugin marketplace add google/elephant-goldfish-model && codex plugin add egm@egm");
  });

  test("doctor passes with helpers installed at any version", async () => {
    const home = temporaryDirectory();
    const codexHome = join(home, ".codex");
    await writeVersion(join(home, ".claude", "skills", "gstack"));
    await recordClaudePlugin(home);
    await writeVersion(join(codexHome, "skills", "gstack"));
    mkdirSync(join(codexHome, "plugins", "cache", "egm", "egm", "0.1.0"), { recursive: true });

    expect(missingHelpers(SOURCES, { home, codexHome })).toEqual([]);
  });

  test("an unreadable plugin record reads as missing, not a crash", async () => {
    const home = temporaryDirectory();
    await writeVersion(join(home, ".claude", "skills", "gstack"));
    await Bun.write(join(home, ".claude", "plugins", "installed_plugins.json"), "{ not json");

    const findings = missingHelpers(SOURCES, { home, codexHome: join(home, ".codex") });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("EGM is not installed for Claude Code");
  });

  test("Claude Code without gstack prints the clone and setup command", async () => {
    const home = temporaryDirectory();
    await recordClaudePlugin(home);

    const findings = missingHelpers(SOURCES, { home, codexHome: join(home, ".codex") });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("gstack is not installed for Claude Code");
    expect(findings[0]).toContain(`git clone ${SOURCES.gstack} ${join(home, ".claude", "skills", "gstack")} && (cd`);
    expect(findings[0]).toContain("./setup)");
  });

  for (const [name, record] of [["no plugins", { plugins: {} }], ["an empty egm@egm list", { plugins: { "egm@egm": [] } }]] as const) {
    test(`a Claude plugin record with ${name} reads as EGM missing`, async () => {
      const home = temporaryDirectory();
      await writeVersion(join(home, ".claude", "skills", "gstack"));
      await Bun.write(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify(record));

      expect(missingHelpers(SOURCES, { home, codexHome: join(home, ".codex") })).toEqual([
        expect.stringContaining("EGM is not installed for Claude Code"),
      ]);
    });
  }

  test("an empty Codex EGM cache reads as EGM missing", async () => {
    const home = temporaryDirectory();
    const codexHome = join(home, ".codex");
    await writeVersion(join(codexHome, "skills", "gstack"));
    mkdirSync(join(codexHome, "plugins", "cache", "egm", "egm"), { recursive: true });

    expect(missingHelpers(SOURCES, { home, codexHome })).toEqual([expect.stringContaining("EGM is not installed for Codex")]);
  });

  test("a machine with no agent runtime has no helper findings", () => {
    const home = temporaryDirectory();
    expect(missingHelpers(SOURCES, { home, codexHome: join(home, ".codex") })).toEqual([]);
  });

  test("the registry names the gstack and EGM sources", async () => {
    const registry = await Bun.file(join(ROOT, "registry.json")).json();
    expect(helperSources(registry)).toEqual(SOURCES);
  });

  test("a registry without both sources is refused", () => {
    const refused = () => helperSources({ helpers: { gstack: {} } });
    expect(refused).toThrow(OrlyError);
    expect(refused).toThrow("registry helpers must name the gstack and egm sources");
  });
});
