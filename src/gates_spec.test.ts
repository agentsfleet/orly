import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { activeSpecPath, closedSpecPath, runGate, specPathFor } from "./gates";
import {
  cleanupTemporaryDirectories, closedSpecRepository, fixtureRegistry, git, modelFor,
  newRepository, newSpecRepository, orly, SPEC_RELATIVE, specFixture,
} from "./gates_test_support";

const BASELINE_FIXTURE = "**Test Baseline:** unit=0 integration=0";
const OTHER_ACTIVE_SPEC = "docs/v1/active/M100_001_P2_CLI_OTHER.md";
const CLOSED_SPEC = "docs/v1/done/M99_001_P2_CLI_FIXTURE.md";
const CLOSED_BRANCH = "feat/closed-owner";
const OTHER_BRANCH = "feat/other";
const ACTIVE_SPECS_DIRECTORY = "docs/v1/active";

afterEach(cleanupTemporaryDirectories);

describe("spec discovery", () => {
  test("no spec tree: spec criteria skip and quality gates still run", async () => {
    const project = newRepository();
    const model = await modelFor(project);
    git(project, "checkout", "-q", "-b", "fix/adhoc");

    const verify = runGate(model, project, "pr");
    expect(verify.results.find((result) => result.name === "spec.dimensions")?.detail).toContain("no active spec");
    expect(runGate(model, project, "work").results.find((result) => result.name === "cmd.conform")?.ok).toBeTrue();
  });

  test("cache-kit style docs/v0.9.2/ layout is discovered", () => {
    const project = newRepository();
    mkdirSync(join(project, "docs/v0.9.2/active"), { recursive: true });
    Bun.write(join(project, "docs/v0.9.2/active/M05_001_P2_CLI_X.md"), specFixture());

    expect(activeSpecPath(project)).toContain("docs/v0.9.2/active");
  });

  test.each([false, true])("active ownership follows the branch with quoted header %s", async (quoted) => {
    const project = newSpecRepository();
    const branch = "feat/owned";
    git(project, "checkout", "-q", "-b", branch);
    const header = quoted ? `**Branch:** \`${branch}\`` : `**Branch:** ${branch}`;
    await Bun.write(join(project, SPEC_RELATIVE), specFixture(undefined, undefined, [header]));
    await Bun.write(join(project, OTHER_ACTIVE_SPEC), specFixture(undefined, OTHER_BRANCH));

    expect(activeSpecPath(project)).toBe(join(project, SPEC_RELATIVE));
  });

  test.each([false, true])("an unrelated active spec cannot hide a closed owner with quoted header %s", async (quoted) => {
    const branch = CLOSED_BRANCH;
    const project = closedSpecRepository(branch);
    const path = join(project, CLOSED_SPEC);
    const header = quoted ? `**Branch:** \`${branch}\`` : `**Branch:** ${branch}`;
    await Bun.write(path, specFixture("DONE", undefined, [header]));
    mkdirSync(join(project, ACTIVE_SPECS_DIRECTORY), { recursive: true });
    await Bun.write(join(project, OTHER_ACTIVE_SPEC), specFixture(undefined, OTHER_BRANCH));

    expect(specPathFor(project)).toEqual({ path, closed: true });
  });

  test("an active spec without branch ownership still gates", async () => {
    const project = closedSpecRepository(CLOSED_BRANCH);
    mkdirSync(join(project, ACTIVE_SPECS_DIRECTORY), { recursive: true });
    await Bun.write(join(project, SPEC_RELATIVE), specFixture());

    expect(specPathFor(project)).toEqual({ path: join(project, SPEC_RELATIVE), closed: false });
  });

  test("two active owners on the current branch remain an error", async () => {
    const project = newSpecRepository();
    const branch = "feat/shared-owners";
    git(project, "checkout", "-q", "-b", branch);
    await Bun.write(join(project, SPEC_RELATIVE), specFixture(undefined, branch));
    await Bun.write(join(project, OTHER_ACTIVE_SPEC), specFixture(undefined, branch));

    expect(() => activeSpecPath(project)).toThrow("one stream per worktree");
  });

  test("two active specs are a hard error — one stream per worktree", () => {
    const project = newSpecRepository();
    mkdirSync(join(project, "docs/v2/active"), { recursive: true });
    Bun.write(join(project, "docs/v2/active/M02_001_P2_CLI_Y.md"), specFixture());

    expect(() => activeSpecPath(project)).toThrow("one stream per worktree");
  });

  test.each([false, true])("a folded active spec yields ownership with quoted header %s", async (quoted) => {
    const project = newSpecRepository();
    mkdirSync(join(project, "docs/v2/active"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/active/M100_001_P2_CLI_FOLDED.md"),
      specFixture(undefined, undefined, [quoted ? "**Folded-into:** `M99_001`" : "**Folded-into:** M99_001"]),
    );

    expect(activeSpecPath(project)).toEndWith("M99_001_P2_CLI_FIXTURE.md");
  });

  test("a folded active spec must name the exact owner", async () => {
    const project = newSpecRepository();
    mkdirSync(join(project, "docs/v2/active"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/active/M100_001_P2_CLI_FOLDED.md"),
      specFixture(undefined, undefined, ["**Folded-into:** `M404_001`"]),
    );

    expect(() => activeSpecPath(project)).toThrow("must name their owner M99_001");
  });

  test("a folded active spec cannot name itself", async () => {
    const project = newSpecRepository();
    mkdirSync(join(project, "docs/v2/active"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/active/M100_001_P2_CLI_FOLDED.md"),
      specFixture(undefined, undefined, ["**Folded-into:** `M100_001`"]),
    );

    expect(() => activeSpecPath(project)).toThrow("cannot fold into themselves");
  });

  test("every active spec folded leaves no owning stream", async () => {
    const project = newRepository();
    mkdirSync(join(project, "docs/v2/active"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/active/M100_001_P2_CLI_FOLDED.md"),
      specFixture(undefined, undefined, ["**Folded-into:** `M99_001`"]),
    );
    await Bun.write(
      join(project, "docs/v2/active/M101_001_P2_CLI_ALSO_FOLDED.md"),
      specFixture(undefined, undefined, ["**Folded-into:** `M99_001`"]),
    );

    expect(() => activeSpecPath(project)).toThrow("one owning stream is required");
  });

  test("a folded active spec still gates through its owner", async () => {
    const project = newSpecRepository();
    const model = await modelFor(project);
    mkdirSync(join(project, "docs/v2/active"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/active/M100_001_P2_CLI_FOLDED.md"),
      specFixture(undefined, undefined, ["**Folded-into:** `M99_001`"]),
    );

    expect(runGate(model, project, "work").results.find((result) => result.name === "cmd.conform")?.ok).toBeTrue();
  });
});

describe("closed-spec follow-through", () => {
  test("two owning specs naming one branch remain a hard error", async () => {
    const project = closedSpecRepository("feat/shared");
    mkdirSync(join(project, "docs/v2/done"), { recursive: true });
    await Bun.write(join(project, "docs/v2/done/M100_001_P2_CLI_SECOND.md"), specFixture("DONE", "feat/shared"));

    expect(() => closedSpecPath(project)).toThrow("one stream per worktree");
  });

  test.each([false, true])("a folded closed spec yields ownership with quoted header %s", async (quoted) => {
    const project = closedSpecRepository("feat/shared");
    mkdirSync(join(project, "docs/v2/done"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/done/M100_001_P2_CLI_FOLDED.md"),
      specFixture("DONE", "feat/shared", [quoted ? "**Folded-into:** `M99_001`" : "**Folded-into:** M99_001"]),
    );

    expect(closedSpecPath(project)).toEndWith("M99_001_P2_CLI_FIXTURE.md");
  });

  test("a folded spec must name the exact owner on its branch", async () => {
    const project = closedSpecRepository("feat/shared");
    mkdirSync(join(project, "docs/v2/done"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/done/M100_001_P2_CLI_FOLDED.md"),
      specFixture("DONE", "feat/shared", ["**Folded-into:** `M404_001`"]),
    );

    expect(() => closedSpecPath(project)).toThrow("must name their owner M99_001");
  });

  test("a folded spec cannot name itself", async () => {
    const project = closedSpecRepository("feat/shared");
    mkdirSync(join(project, "docs/v2/done"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/done/M100_001_P2_CLI_FOLDED.md"),
      specFixture("DONE", "feat/shared", ["**Folded-into:** `M100_001`"]),
    );

    expect(() => closedSpecPath(project)).toThrow("cannot fold into themselves");
  });

  test("a branch name is not a prefix match", async () => {
    const project = newRepository();
    git(project, "checkout", "-q", "-b", "feat/foo");
    mkdirSync(join(project, "docs/v1/done"), { recursive: true });
    await Bun.write(join(project, "docs/v1/done/M99_001_P2_CLI_OTHER.md"), specFixture("DONE", "feat/foo-2"));

    expect(closedSpecPath(project)).toBeUndefined();
  });

  test("prose mentioning a branch does not declare ownership", async () => {
    const project = newRepository();
    git(project, "checkout", "-q", "-b", "feat/foo");
    mkdirSync(join(project, "docs/v1/done"), { recursive: true });
    await Bun.write(
      join(project, "docs/v1/done/M99_001_P2_CLI_OTHER.md"),
      specFixture("DONE", undefined, ["**Branch:** folded into `feat/foo` rather than taken as its own tree"]),
    );

    expect(closedSpecPath(project)).toBeUndefined();
  });

  test("gate help does not discover specs", async () => {
    const project = closedSpecRepository("feat/shared");
    mkdirSync(join(project, "docs/v2/done"), { recursive: true });
    await Bun.write(join(project, "docs/v2/done/M100_001_P2_CLI_SECOND.md"), specFixture("DONE", "feat/shared"));

    const result = orly(project, fixtureRegistry(project), "gate", "--help");
    expect(result.code).toBe(0);
    expect(result.output).toContain("orly gate");
  });

  test("a spec closed to done/ is discovered by its Branch: header and still gated", async () => {
    const project = closedSpecRepository("feat/closed");
    const model = await modelFor(project);

    const pr = runGate(model, project, "pr");
    expect(pr.results.find((result) => result.name === "spec.dimensions")?.detail).not.toContain("no active spec");
    expect(pr.results.find((result) => result.name === "spec.moved")?.ok).toBeTrue();
    expect(pr.results.find((result) => result.name === "spec.ordering")?.ok).toBeTrue();
    expect(pr.results.find((result) => result.name === "spec.baseline")?.ok).toBeTrue();
  });

  // CHORE(open) declares the header and the boundary fills it. The gate that
  // grades the boundary is `pr`, so `pending` surviving to here is the
  // measurement skipped rather than the measurement not yet due.
  test("a Test Baseline still reading `pending` is red at the Pull Request gate", async () => {
    const project = newRepository();
    const model = await modelFor(project);
    git(project, "checkout", "-q", "-b", "feat/pending-baseline");
    mkdirSync(join(project, "docs/v1/active"), { recursive: true });
    await Bun.write(
      join(project, SPEC_RELATIVE),
      specFixture("IN_PROGRESS", "feat/pending-baseline").replace(BASELINE_FIXTURE, "**Test Baseline:** pending — measured before the Pull Request"),
    );
    git(project, "add", ".");
    git(project, "commit", "-q", "-m", "chore(open): the spec declares its baseline");

    const baseline = runGate(model, project, "pr").results.find((result) => result.name === "spec.baseline");
    expect(baseline?.ok).toBeFalse();
    expect(baseline?.detail).toContain("carries no count");
  });

  test("a branch carrying no code records n/a and spec.baseline is green", async () => {
    const project = newRepository();
    const model = await modelFor(project);
    git(project, "checkout", "-q", "-b", "feat/no-code-baseline");
    mkdirSync(join(project, "docs/v1/active"), { recursive: true });
    await Bun.write(
      join(project, SPEC_RELATIVE),
      specFixture("IN_PROGRESS", "feat/no-code-baseline").replace(BASELINE_FIXTURE, "**Test Baseline:** n/a — no code on this branch"),
    );
    git(project, "add", ".");
    git(project, "commit", "-q", "-m", "chore(open): a docs-only stream measures nothing");

    const baseline = runGate(model, project, "pr").results.find((result) => result.name === "spec.baseline");
    expect(baseline?.ok).toBeTrue();
    expect(baseline?.detail).toContain("not applicable");
  });

  test("Status: DONE while the spec still lives under active/ is red on spec.moved", async () => {
    const project = newRepository();
    const model = await modelFor(project);
    git(project, "checkout", "-q", "-b", "feat/undone");
    mkdirSync(join(project, "docs/v1/active"), { recursive: true });
    await Bun.write(join(project, SPEC_RELATIVE), specFixture("DONE", "feat/undone"));
    git(project, "add", ".");
    git(project, "commit", "-q", "-m", "chore: spec says done but never moved");

    const moved = runGate(model, project, "pr").results.find((result) => result.name === "spec.moved");
    expect(moved?.ok).toBeFalse();
    expect(moved?.detail).toContain("still lives under active/");
  });

  test("code committed before the spec is red on spec.ordering", async () => {
    const project = newRepository();
    const model = await modelFor(project);
    git(project, "checkout", "-q", "-b", "feat/rush");
    await Bun.write(join(project, "src/rushed.ts"), "export const RUSHED = 1;\n");
    git(project, "add", ".");
    git(project, "commit", "-q", "-m", "feat: code before any spec");
    mkdirSync(join(project, "docs/v1/active"), { recursive: true });
    await Bun.write(join(project, SPEC_RELATIVE), specFixture("IN_PROGRESS", "feat/rush"));
    git(project, "add", ".");
    git(project, "commit", "-q", "-m", "chore: spec arrives late");

    const ordering = runGate(model, project, "pr").results.find((result) => result.name === "spec.ordering");
    expect(ordering?.ok).toBeFalse();
    expect(ordering?.detail).toContain("carries no spec file");
  });

  test("a deferral claim needs the Indy ack quote", async () => {
    const bare = closedSpecRepository("feat/defer", ["- Dimension 1.2 was deferred to follow-up"]);
    const bareModel = await modelFor(bare);
    const red = runGate(bareModel, bare, "pr").results.find((result) => result.name === "spec.deferrals");
    expect(red?.ok).toBeFalse();
    expect(red?.detail).toContain("agent-unilateral");

    const acked = closedSpecRepository("feat/defer", [
      "- Dimension 1.2 was deferred to follow-up",
      '## Discovery\n\n> Indy (2026-08-11 09:00): "defer 1.2, ship the rest" — context: fixture',
    ]);
    const ackedModel = await modelFor(acked);
    expect(runGate(ackedModel, acked, "pr").results.find((result) => result.name === "spec.deferrals")?.ok).toBeTrue();
  });
});
