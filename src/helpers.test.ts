import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, git, gitOutput, ROOT, temporaryDirectory } from "./gates_test_support";
import { helperDrift, helperPins, type HelperPins } from "./helpers";

const GSTACK_SOURCE = "https://github.com/garrytan/gstack";
const EGM_SOURCE = "https://github.com/google/elephant-goldfish-model";
const GSTACK_VERSION = "1.91.271.0";
const GSTACK_COMMIT = "584e9c15352de1f1c42d237dd3c268d6284bfdee";
const STALE_VERSION = "1.90.0";
const STALE_COMMIT = "0".repeat(40);
const FULL_COMMIT = /^[0-9a-f]{40}$/;
const RELEASE_VERSION = /^\d+\.\d+\.\d+(\.\d+)?$/;

afterEach(cleanupTemporaryDirectories);

function pins(egmCommit: string): HelperPins {
  return {
    gstack: { source: GSTACK_SOURCE, version: GSTACK_VERSION, commit: GSTACK_COMMIT },
    egm: { source: EGM_SOURCE, commit: egmCommit },
  };
}

async function writeVersion(directory: string, version: string): Promise<void> {
  mkdirSync(directory, { recursive: true });
  await Bun.write(join(directory, "VERSION"), `${version}\n`);
}

async function recordClaudePlugin(home: string, commit: string): Promise<void> {
  const record = join(home, ".claude", "plugins", "installed_plugins.json");
  await Bun.write(record, JSON.stringify({ plugins: { "egm@egm": [{ scope: "user", gitCommitSha: commit }] } }));
}

// Codex keeps an installed plugin version as a Git checkout; its HEAD is the
// commit doctor compares.
async function codexPluginCheckout(codexHome: string): Promise<string> {
  const checkout = join(codexHome, "plugins", "cache", "egm", "egm", "0.1.0");
  mkdirSync(checkout, { recursive: true });
  git(checkout, "init", "-q");
  git(checkout, "config", "user.email", "orly-tests@example.invalid");
  git(checkout, "config", "user.name", "Orly Tests");
  await Bun.write(join(checkout, "README.md"), "egm\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "egm");
  return gitOutput(checkout, "rev-parse", "HEAD");
}

describe("helper pins", () => {
  test("doctor reports helper drift with the install command", async () => {
    const home = temporaryDirectory();
    const codexHome = join(home, ".codex");
    await writeVersion(join(home, ".claude", "skills", "gstack"), STALE_VERSION);
    await recordClaudePlugin(home, STALE_COMMIT);
    await writeVersion(join(home, ".agents", "skills", "gstack"), STALE_VERSION);
    mkdirSync(codexHome, { recursive: true });
    const egmCommit = "a".repeat(40);

    const findings = helperDrift(pins(egmCommit), { home, codexHome });

    expect(findings).toHaveLength(5);
    expect(findings[0]).toContain(`gstack for Claude Code is ${STALE_VERSION}; orly pins ${GSTACK_VERSION}`);
    expect(findings[1]).toContain(`EGM for Claude Code is ${STALE_COMMIT.slice(0, 8)}`);
    expect(findings[2]).toContain("gstack is not installed for Codex");
    expect(findings[2]).toContain("./setup --host codex --no-browser");
    expect(findings[3]).toContain(`.agents/skills/gstack) is ${STALE_VERSION}`);
    expect(findings[4]).toContain(`codex plugin marketplace add google/elephant-goldfish-model --ref ${egmCommit}`);
  });

  test("doctor passes with pinned helpers", async () => {
    const home = temporaryDirectory();
    const codexHome = join(home, ".codex");
    const egmCommit = await codexPluginCheckout(codexHome);
    await writeVersion(join(home, ".claude", "skills", "gstack"), GSTACK_VERSION);
    await recordClaudePlugin(home, egmCommit);
    await writeVersion(join(codexHome, "skills", "gstack"), GSTACK_VERSION);

    expect(helperDrift(pins(egmCommit), { home, codexHome })).toEqual([]);
  });

  test("an unreadable plugin record reads as drift, not a crash", async () => {
    const home = temporaryDirectory();
    await writeVersion(join(home, ".claude", "skills", "gstack"), GSTACK_VERSION);
    await Bun.write(join(home, ".claude", "plugins", "installed_plugins.json"), "{ not json");

    const findings = helperDrift(pins(STALE_COMMIT), { home, codexHome: join(home, ".codex") });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("EGM for Claude Code is unreadable");
  });

  test("a machine with no agent runtime has no helper findings", () => {
    const home = temporaryDirectory();
    expect(helperDrift(pins(STALE_COMMIT), { home, codexHome: join(home, ".codex") })).toEqual([]);
  });

  test("the registry pins gstack by version and commit and EGM by commit", async () => {
    const registry = await Bun.file(join(ROOT, "registry.json")).json();
    const pinned = helperPins(registry);
    expect(pinned.gstack.version).toMatch(RELEASE_VERSION);
    expect(pinned.gstack.commit).toMatch(FULL_COMMIT);
    expect(pinned.egm.commit).toMatch(FULL_COMMIT);
  });

  test("a registry without both pins is refused", () => {
    expect(() => helperPins({ helpers: { gstack: {} } })).toThrow("registry helpers must pin gstack and egm");
  });
});
