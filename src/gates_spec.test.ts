import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { activeSpecPath, closedSpecPath, runGate } from "./gates";
import {
  cleanupTemporaryDirectories, closedSpecRepository, fixtureRegistry, git, modelFor,
  newRepository, newSpecRepository, orly, SPEC_RELATIVE, specFixture,
} from "./gates_test_support";

afterEach(cleanupTemporaryDirectories);

describe("spec discovery", () => {
  test("no spec tree: spec criteria skip and quality gates still run", async () => {
    const project = newRepository();
    const model = await modelFor(project);
    git(project, "checkout", "-q", "-b", "fix/adhoc");

    const verify = runGate(model, project, "verify");
    expect(verify.results.find((result) => result.name === "spec.dimensions")?.detail).toContain("no active spec");
    expect(runGate(model, project, "work").results.find((result) => result.name === "cmd.conform")?.ok).toBeTrue();
  });

  test("cache-kit style docs/v0.9.2/ layout is discovered", () => {
    const project = newRepository();
    mkdirSync(join(project, "docs/v0.9.2/active"), { recursive: true });
    Bun.write(join(project, "docs/v0.9.2/active/M05_001_P2_CLI_X.md"), specFixture());

    expect(activeSpecPath(project)).toContain("docs/v0.9.2/active");
  });

  test("two active specs are a hard error — one stream per worktree", () => {
    const project = newSpecRepository();
    mkdirSync(join(project, "docs/v2/active"), { recursive: true });
    Bun.write(join(project, "docs/v2/active/M02_001_P2_CLI_Y.md"), specFixture());

    expect(() => activeSpecPath(project)).toThrow("one stream per worktree");
  });
});

describe("closed-spec follow-through", () => {
  test("two owning specs naming one branch remain a hard error", async () => {
    const project = closedSpecRepository("feat/shared");
    mkdirSync(join(project, "docs/v2/done"), { recursive: true });
    await Bun.write(join(project, "docs/v2/done/M100_001_P2_CLI_SECOND.md"), specFixture("DONE", "feat/shared"));

    expect(() => closedSpecPath(project)).toThrow("one stream per worktree");
  });

  test("a folded spec yields ownership to the spec it names", async () => {
    const project = closedSpecRepository("feat/shared");
    mkdirSync(join(project, "docs/v2/done"), { recursive: true });
    await Bun.write(
      join(project, "docs/v2/done/M100_001_P2_CLI_FOLDED.md"),
      specFixture("DONE", "feat/shared", ["**Folded-into:** `M99_001`"]),
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
      '> Indy (2026-08-11 09:00): "defer 1.2, ship the rest" — context: fixture',
    ]);
    const ackedModel = await modelFor(acked);
    expect(runGate(ackedModel, acked, "pr").results.find((result) => result.name === "spec.deferrals")?.ok).toBeTrue();
  });
});
