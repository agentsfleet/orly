import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import type { CriterionContext } from "./criteria_support";
import { specBaseline } from "./criteria_spec";
import { cleanupTemporaryDirectories, git, gitOutput, modelFor, newRepository } from "./gates_test_support";

const CONFIG_PATH = ".oracle/orly.json";
const UNIT = "**Test Baseline:** unit=12 integration=4";
const EVIDENCE = "**Baseline evidence:** README.md";
const NO_CODE = "**Test Baseline:** n/a — no code on this branch";

afterEach(cleanupTemporaryDirectories);

async function fixture(): Promise<CriterionContext> {
  const root = newRepository();
  const model = await modelFor(root, undefined, { "verify.integration": [["true"]] });
  const revision = gitOutput(root, "rev-parse", "HEAD");
  git(root, "checkout", "-b", "feat/baseline");
  await Bun.write(join(root, "changed.rs"), "pub const VALUE: u8 = 1;\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "test: code change");
  return { root, model, acceptDirty: false, specPath: "docs/v1/active/baseline.md", specText: `${UNIT}\n**Baseline revision:** ${revision}\n${EVIDENCE}` };
}

describe("baseline evidence requirements", () => {
  test("records declared counts and an existing comparison commit and report", async () => {
    const context = await fixture();
    expect(specBaseline().evaluate(context)).toEqual({ name: "spec.baseline", ok: true, detail: "baseline counts, comparison revision, and evidence reference recorded; report contents require review" });
  });

  test.each([
    [UNIT, "**Test Baseline:** pending", "no count for unit"],
    [UNIT, "**Test Baseline:** unit=12 integration=pending", "no count for integration"],
    [UNIT, "**Test Baseline:** unit=12oops integration=4", "no count for unit"],
    [UNIT, NO_CODE, "n/a cannot replace"],
    [EVIDENCE, "**Baseline evidence:** missing-report.txt", "existing report"],
    [EVIDENCE, "", "existing report"],
  ])("rejects incomplete evidence: %s → %s", async (old, replacement, finding) => {
    const context = await fixture();
    context.specText = (context.specText ?? "").replace(old, replacement);
    const verdict = specBaseline().evaluate(context);
    expect(verdict.ok).toBeFalse();
    expect(verdict.detail).toContain(finding);
  });

  test("a missing header cannot disappear into an empty spec", async () => {
    const context = await fixture();
    context.specText = "# Spec without baseline";
    expect(specBaseline().evaluate(context).detail).toContain("no Test Baseline header");
  });

  test("a run URL is a reference for review, not a claim of fetched evidence", async () => {
    const context = await fixture();
    context.specText = (context.specText ?? "").replace(EVIDENCE, "**Baseline evidence:** https://example.com/runs/123");
    expect(specBaseline().evaluate(context).ok).toBeTrue();
  });

  test("a revision must be a full existing ancestor", async () => {
    const context = await fixture();
    const text = context.specText ?? "";
    for (const revision of ["main", "0".repeat(40)]) {
      context.specText = text.replace(/\*\*Baseline revision:\*\* .+/, `**Baseline revision:** ${revision}`);
      expect(specBaseline().evaluate(context).ok).toBeFalse();
    }
  });

  test("a documentation branch can explain why no baseline applies", async () => {
    const context = await fixture();
    context.surfaces = { changed: ["notes.md"], code: [], docs: [], userSurface: [] };
    context.specText = NO_CODE;
    expect(specBaseline().evaluate(context).ok).toBeTrue();
  });

  test("repositories without baseline lanes use an explicit reason", async () => {
    const context = await fixture();
    await Bun.write(join(context.root, CONFIG_PATH), JSON.stringify({ schema_version: 1, commands: { "verify.custom": [["true"]] } }));
    expect(specBaseline().evaluate(context).detail).toContain("no baseline lanes declared");
    context.specText = "**Test Baseline:** n/a — no unit or integration lane declared";
    expect(specBaseline().evaluate(context).ok).toBeTrue();
  });

  test("missing configuration cannot validate a claimed baseline", async () => {
    const context = await fixture();
    const root = newRepository();
    expect(specBaseline().evaluate({ ...context, root }).detail).toContain("repository's declared commands");
  });

  test("malformed configuration reports a failure without aborting the gate", async () => {
    const context = await fixture();
    await Bun.write(join(context.root, CONFIG_PATH), "{");
    const verdict = specBaseline().evaluate(context);
    expect(verdict.ok).toBeFalse();
    expect(verdict.detail).toContain("cannot read baseline configuration");
  });
});
