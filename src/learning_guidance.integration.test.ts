import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readConfig, localSelection } from "./config";
import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { RulesModel } from "./model";
import { Renderer } from "./render";

const source = (path: string) => readFileSync(join(ROOT, path), "utf8");
afterEach(cleanupTemporaryDirectories);

const GUIDANCE_CASES = [
  ["invocation triage", "standards/tests.md", "invocation or environment prerequisite failure", "product assertion failure"],
  ["exact baseline", "standards/tests.md", "exact base revision", "isolated checkout"],
  ["focused retry", "standards/tests.md", "affected lane or job", "does not establish that a race was repaired"],
  ["review availability", "standards/pr.md", "unavailable reviewer is an incomplete review", "usage-limit response"],
  ["current-head review", "standards/pr.md", "two consecutive quiet polls", "same pushed revision"],
  ["expected skips", "standards/tests.md", "post-deploy skips stay visible", "never become passes"],
  ["evidence categories", "standards/pr.md", "authenticated live acceptance", "injected delays"],
] as const;

test.each(GUIDANCE_CASES)("learning_guidance_distinguishes_evidence: %s", (_name, path, required, boundary) => {
  const text = source(path);
  expect(text).toContain(required);
  expect(text).toContain(boundary);
});

test("learning_guidance_preserves_owner_boundaries", () => {
  const pr = source("standards/pr.md");
  const status = source("standards/spec.md");
  expect(pr).toContain("parked spec follows SPEC-STATUS");
  expect(pr).not.toContain("parked spec stays in `active/`");
  expect(status).toContain("A DEFERRED spec moves to `done/`");
  expect(pr).toContain("owner's quoted decision and reopening conditions");
  for (const path of ["skills/orly-build/SKILL.md", "skills/orly-ship/SKILL.md"]) {
    const text = source(path);
    expect(text).not.toContain("A cloud task pushes nothing");
    expect(text).toMatch(/explicit (?:user instruction|publishing authorization)/);
  }
  expect(source("skills/orly-ship/SKILL.md")).toContain("does not authorize merge, release or a consumer pin update");
  expect(source("standards/pr.md")).toContain("design before implementation");
});

test("generated_learning_guidance_matches_sources", async () => {
  const model = await RulesModel.load(ROOT);
  const selection = await localSelection(model, ROOT);
  expect(await new Renderer(model).renderText(selection.packs, selection.commands)).toBe(source("AGENTS.md"));
  const root = newRepository();
  const installed = await install(model, { targetRoot: root, force: false, installHooks: false, orlyVersion: "0.29.0" });
  expect(installed.errors).toEqual([]);
  expect(installed.ok).toBeTrue();
  const managed = (await readConfig(root))!.managed;
  const pr = managed.find((path) => path.endsWith("standards/pr.md"))!;
  expect(readFileSync(join(root, pr), "utf8")).toBe(source("standards/pr.md"));
  for (const name of ["orly-build", "orly-ship"]) {
    const canonical = `.orly/skills/${name}/SKILL.md`;
    expect(managed).toContain(canonical);
    const cloudGuidance = source(`skills/${name}/SKILL.md`).split("## Codex cloud tasks\n")[1]!.trim();
    expect(readFileSync(join(root, canonical), "utf8")).toContain(cloudGuidance);
    const paths = managed.filter((path) => path.endsWith(`/${name}/SKILL.md`));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths.filter((path) => path !== canonical)) expect(readFileSync(join(root, path), "utf8")).toContain(canonical);
  }
});
