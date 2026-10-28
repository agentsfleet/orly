import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { RulesModel } from "./model";

const SOURCE_EXTENSIONS = ["rs", "ts", "tsx", "js", "jsx", "py", "sh", "sql", "go", "mdx"];
const DESCRIPTION_BUDGET = 320;
// Read from package.json rather than restated here: a hand-synced copy goes
// stale at the next release and the test then proves an install at a version
// that no longer ships.
const ENGINE_VERSION = (await Bun.file(join(ROOT, "package.json")).json()).version;

afterEach(cleanupTemporaryDirectories);

describe("opt-in pack selection", () => {
  test("independent consumers keep their own database, build and documentation policies", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    for (const extension of ["sql", "ts"]) {
      await Bun.write(join(repo, `src/source.${extension}`), "\n");
    }
    await Bun.write(join(repo, ".orly/orly.json"), JSON.stringify({
      schema_version: 1, packs: ["domain.http", "domain.changelog"],
      commands: { conform: [["true"]], "verify.unit": [["true"]] },
    }));
    const result = await install(model, {
      targetRoot: repo, force: false, installHooks: false, orlyVersion: ENGINE_VERSION,
    });
    expect(result.errors).toEqual([]);
    expect(result.packs).not.toContain("product.agentsfleet");
    expect(existsSync(join(repo, "VERSION"))).toBe(false);
    const pages = [
      "standards/spec.md", "standards/domains/sql.md", "standards/languages/typescript.md",
      "standards/domains/http.md", "standards/changelog.md", "standards/domains/http-responses.md",
      "standards/domains/http-surface.md", "standards/domains/logging.md",
    ];
    const installed = await Promise.all(pages.map((path) => Bun.file(join(repo, ".orly", path)).text()));
    for (const [index, content] of installed.entries()) {
      const page = pages[index];
      for (const productPath of ["playbooks/founding/", "rustd/crates/afd_db/src/migration.rs", "~/Projects/docs/", "cat VERSION"]) {
        expect({ page, productPath, leaked: content.includes(productPath) }).toEqual({ page, productPath, leaked: false });
      }
    }
    expect(installed[1]).toContain("owner's approval");
  });

  // An opt-in pack may cite a file another opt-in pack owns, and every such
  // citation has to be gated by the pack that provides it. Ungated, the install
  // is refused for skipping rules the repository was never meant to take:
  // `product.agentsfleet` once shipped the doc-read table, and
  // `workflow.governance` ships the governance page that table named
  // unconditionally.
  test("one opt-in pack installs without dragging in the others", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    for (const extension of SOURCE_EXTENSIONS) await Bun.write(join(repo, `src/source.${extension}`), "\n");
    await Bun.write(join(repo, ".orly/orly.json"), JSON.stringify({ schema_version: 1, orly_version: "", packs: ["product.agentsfleet"], commands: {}, managed: [] }));

    const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: ENGINE_VERSION });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.packs).toContain("product.agentsfleet");
    expect(result.packs).not.toContain("workflow.governance");
    expect(existsSync(join(repo, ".orly/standards/languages/rust.md"))).toBe(true);
    expect(existsSync(join(repo, ".orly/standards/domains/sql.md"))).toBe(true);
    expect(existsSync(join(repo, ".orly/docs/ORLY_ARCHITECTURE.md"))).toBe(false);
  });
});

// Every host renders skill metadata into a fixed context budget and truncates
// the set when it overflows — Codex says so out loud ("descriptions were
// shortened to fit the skills context budget"). A truncated description is a
// skill the model can no longer route to correctly, and the failure is silent
// at the point it matters. The bound is checked here so a growing description
// fails a test rather than degrading discovery in the field.
describe("packaged skill metadata", () => {
  test("every description stays inside the host budget", async () => {
    const skills = new Set<string>();
    for (const entry of (await Bun.file(join(ROOT, "registry.json")).json()).packs["workflow.skills"].managed_files) skills.add(entry.source);
    expect(skills.size).toBeGreaterThan(0);

    for (const relative of [...skills].sort()) {
      const frontmatter = (await Bun.file(join(ROOT, relative)).text()).split("---")[1] ?? "";
      const description = (frontmatter.split(/^description:/m)[1] ?? "").split(/^[a-z_]+:/m)[0] ?? "";
      const rendered = description.replace(/^[>|]/, "").replace(/\s+/g, " ").trim();

      expect(rendered.length).toBeGreaterThan(0);
      expect({ skill: relative, length: rendered.length }).toEqual({ skill: relative, length: Math.min(rendered.length, DESCRIPTION_BUDGET) });
    }
  });
});
