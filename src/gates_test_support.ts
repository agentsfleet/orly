// Test harness for the gate suites (gates.test.ts, gates_spec.test.ts).
// Extracted per the code standard's length rule (FLL): inline test
// support is the first cut on an over-long file, because coverage instruments
// count harness code written inline as product.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CONFIG_PATH } from "./config";
import { RulesModel } from "./model";

const GIT = "git";
const QUIET = "-q";
const COMMIT = "commit";
const CONFIG = "config";
const ADD = "add";
const MESSAGE = "-m";
const PIPE_OUTPUT = "pipe";
const TRUE_COMMAND = "true";
const ACCEPTANCE_RUBRIC_HEADING = "Acceptance Rubric";
const FIXTURE = "fixture";

export const ROOT = resolve(import.meta.dir, "..");
const SPEC_RELATIVE = "docs/v1/active/M99_001_P2_CLI_FIXTURE.md";
const FIXTURE_TEST = "fixture_test";
export const FIXTURE_CONFIG = { schema_version: 1, packs: [], commands: { conform: [[TRUE_COMMAND]], "verify.unit": [[TRUE_COMMAND]] } };

const temporaryDirectories: string[] = [];
const GIT_SCOPE_VARIABLES = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_PREFIX", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"];

// git exports GIT_DIR and GIT_INDEX_FILE to its hooks, and .githooks/pre-commit
// runs this suite through `make audit`. Inherited, they scope every git call at
// the dotfiles checkout: relative values resolve fixture-locally by luck in a
// plain repository and fatally in a linked worktree, whose .git is a file, so
// .git/index reads as "Not a directory". Bun does not propagate a deletion from
// process.env to a spawned child, so the scrubbed copy is passed explicitly.
const HERMETIC_ENVIRONMENT = hermeticEnvironment();

// Each suite registers this in its own afterEach — the array is module state
// shared by every importer, so a suite that skips it leaks its fixtures.
export function cleanupTemporaryDirectories(): void {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
}

export function names(report: { results: Array<{ name: string }> }): string[] {
  return report.results.map((result) => result.name).sort();
}

export function orly(project: string, registry: string, ...args: string[]): { code: number; output: string } {
  const result = Bun.spawnSync(["bun", join(ROOT, "src/cli.ts"), "--root", registry, ...args], { cwd: project, env: HERMETIC_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT });
  return { code: result.exitCode, output: `${result.stdout.toString()}${result.stderr.toString()}` };
}

// A minimal registry root: the gate verbs read the repository's own config and
// never render, so the full pack inventory is not needed.
export function fixtureRegistry(project: string): string {
  const root = temporaryDirectory();
  Bun.write(join(root, "registry.json"), JSON.stringify({ schema_version: 1, core_documents: [], packs: {}, rules: [] }));
  writeFixtureConfig(project);
  return root;
}

// The gate resolves commands from `.orly/orly.json` in the repository under
// test, so every fixture repository carries one.
export function writeFixtureConfig(project: string, surfaces?: { user: string[]; docs: string[] }, extraCommands?: Record<string, string[][]>): void {
  const config: Record<string, unknown> = structuredClone(FIXTURE_CONFIG);
  if (surfaces) config.surfaces = surfaces;
  if (extraCommands) config.commands = { ...(config.commands as Record<string, unknown>), ...extraCommands };
  mkdirSync(join(project, ".orly"), { recursive: true });
  writeFileSync(join(project, CONFIG_PATH), JSON.stringify(config, undefined, 2));
  // Committed, exactly as a real repository carries it: a linked worktree gets
  // its rules config from the checkout, and an uncommitted one would also make
  // every git.tree criterion read dirty.
  git(project, ADD, CONFIG_PATH);
  git(project, COMMIT, QUIET, MESSAGE, "chore: orly config");
}

export async function modelFor(
  project: string,
  surfaces?: { user: string[]; docs: string[] },
  extraCommands?: Record<string, string[][]>,
): Promise<RulesModel> {
  writeFixtureConfig(project, surfaces, extraCommands);
  return RulesModel.load(ROOT);
}

export function newRepository(): string {
  const project = temporaryDirectory();
  git(project, "init", QUIET);
  git(project, CONFIG, "user.email", "orly-tests@example.invalid");
  git(project, CONFIG, "user.name", "Orly Tests");
  Bun.write(join(project, "README.md"), "fixture\n");
  git(project, ADD, ".");
  git(project, COMMIT, QUIET, MESSAGE, "test: init");
  return project;
}

export function newSpecRepository(): string {
  const project = newRepository();
  mkdirSync(join(project, "docs/v1/active"), { recursive: true });
  writeFileSync(join(project, SPEC_RELATIVE), specFixture());
  git(project, ADD, ".");
  git(project, COMMIT, QUIET, MESSAGE, "test: add fixture spec");
  return project;
}

// A spec in the template's current shape, with every slot filled: the gate
// reads a spec only for leftover slots, so these fixtures prove its code and
// Git criteria behave the same with a spec on the branch.
function specFixture(): string {
  const sections = [
    "PR Intent & comprehension handshake",
    "Overview",
    "Implementing agent — read these first",
    "Files Changed (blast radius)",
    "Applicable Rules",
    "Applicable Gates",
    "Prior-Art / Reference Implementations",
    "Interfaces",
    "Failure Modes",
    "Invariants",
    "Metrics & Observability",
    ACCEPTANCE_RUBRIC_HEADING,
    "Dead Code Sweep",
    "Out of Scope",
    "Product Clarity (authoring record)",
    "Decomposition & alternatives",
    "Discovery (consult log)",
  ].map((heading) =>
    // The rubric quotes the declared commands, the way a real spec's S-rows do.
    heading === ACCEPTANCE_RUBRIC_HEADING
      ? `## ${heading}\n\n| # | Criterion | Verify | Expected | Priority | Graded |\n|---|---|---|---|---|---|\n| S1 | Declared checks | \`${TRUE_COMMAND}\` | exit 0 | P0 | |\n`
      : heading.startsWith("Implementing agent") ? `## ${heading}\n\n1. \`README.md\` — fixture reference.\n`
      : `## ${heading}\n\nFixture content for ${heading}.\n`,
  );
  return [
    "# M99_001: Fixture milestone",
    "",
    "**Status:** IN_PROGRESS",
    "**Priority:** P2, fixture",
    "",
    "## Sections (implementation slices)",
    "",
    "### §1 — Fixture slice",
    "",
    `- **Dimension 1.1** — DONE — fixture behaviour → Test \`${FIXTURE_TEST}\` (unit): valid input is accepted`,
    "",
    ...sections,
  ].join("\n");
}

function hermeticEnvironment(): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = { ...process.env };
  for (const name of GIT_SCOPE_VARIABLES) delete environment[name];
  return environment;
}

export function git(project: string, ...args: string[]): void {
  const result = Bun.spawnSync([GIT, ...args], { cwd: project, env: HERMETIC_ENVIRONMENT, stdout: "ignore", stderr: PIPE_OUTPUT });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

export function gitOutput(project: string, ...args: string[]): string {
  const result = Bun.spawnSync([GIT, ...args], { cwd: project, env: HERMETIC_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT });
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}

export function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "orly-gates-test-"));
  temporaryDirectories.push(path);
  return path;
}
