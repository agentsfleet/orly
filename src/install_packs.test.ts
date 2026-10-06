import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { RulesModel } from "./model";

const SOURCE_EXTENSIONS = ["rs", "ts", "tsx", "js", "jsx", "py", "sh", "sql", "zig", "mdx"];
const DESCRIPTION_BUDGET = 320;
const RECORDER = ".orly/audits/doc-read.sh";
const RECORDER_LIBRARY = ".orly/audits/rule-ledger-lib.sh";
// Read from package.json rather than restated here: a hand-synced copy goes
// stale at the next release and the test then proves an install at a version
// that no longer ships.
const ENGINE_VERSION = (await Bun.file(join(ROOT, "package.json")).json()).version;

afterEach(cleanupTemporaryDirectories);

describe("opt-in pack selection", () => {
  test("independent consumers keep their own database, build and documentation policies", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    for (const extension of ["sql", "zig", "ts"]) {
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
      "dispatch/lifecycle.md", "dispatch/write_sql.md", "dispatch/write_zig.md",
      "dispatch/write_ts_adhere_bun.md", "dispatch/write_http.md",
      "dispatch/write_changelog.md", "docs/SCHEMA_CONVENTIONS.md",
      "docs/RELEASE_TEMPLATE.md", "docs/LOGGING_STANDARD.md",
      "docs/REST_API_DESIGN_GUIDELINES.md",
    ];
    const installed = await Promise.all(pages.map((path) => Bun.file(join(repo, ".orly", path)).text()));
    for (const content of installed) {
      expect(content).not.toContain("playbooks/founding/");
      expect(content).not.toContain("schema/embed.zig");
      expect(content).not.toContain("src/cmd/common.zig");
      expect(content).not.toContain("build_runner.zig");
      expect(content).not.toContain("~/Projects/docs/");
      expect(content).not.toContain("cat VERSION");
    }
    expect(installed[1]).toContain("Destructive changes require the owner's approval");
    expect(installed[2]).toContain("declared platform matrix");
    expect(installed[3]).toContain("repository's declared component library");
    expect(installed[8]).toContain("repository's structured logger");
    expect(installed[9]).toContain("canonical OpenAPI source");
  });

  test("explicit product selection retains its teardown guard and build graph", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, "schema/example.sql"), "\n");
    await Bun.write(join(repo, "src/example.zig"), "\n");
    await Bun.write(join(repo, ".orly/orly.json"), JSON.stringify({
      schema_version: 1, packs: ["product.agentsfleet"],
      commands: { conform: [["true"]], "verify.unit": [["true"]] },
    }));
    const result = await install(model, {
      targetRoot: repo, force: false, installHooks: false, orlyVersion: ENGINE_VERSION,
    });
    expect(result.errors).toEqual([]);
    const sql = await Bun.file(join(repo, ".orly/dispatch/write_sql.md")).text();
    const zig = await Bun.file(join(repo, ".orly/dispatch/write_zig.md")).text();
    expect(sql).toContain("0.30.0");
    expect(sql).toContain("schema/embed.zig");
    expect(sql).toContain("**Forbidden:**");
    expect(zig).toContain("build_runner.zig");
  });

  // An opt-in pack may cite a file another opt-in pack owns, and every such
  // citation has to be gated by the pack that provides it. Ungated, the install
  // is refused for skipping rules the repository was never meant to take:
  // `product.agentsfleet` ships the doc-read table, `workflow.governance` ships
  // the governance façade that table once named unconditionally.
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
    expect(existsSync(join(repo, ".orly/docs/EXECUTE_DOC_READS.md"))).toBe(true);
    expect(existsSync(join(repo, ".orly/dispatch/edit_rules.md"))).toBe(false);
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

// The operating model tells every agent to record a triggered read with
// `bash audits/doc-read.sh log <path>`, and pre-commit compares that record to
// the staged diff. The rule shipped through universal.authoring; the script did
// not, so in a consumer the command the rule names was simply absent — the
// runtime's read hook called nothing and the check had nothing to compare. A
// rule that names a command ships that command.
describe("the DOC READ recorder", () => {
  test("installs with the authoring pack and runs where it lands", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    await Bun.write(join(repo, ".orly/orly.json"), JSON.stringify({ schema_version: 1, orly_version: "", packs: [], commands: {}, managed: [] }));

    const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: ENGINE_VERSION });

    expect(result.errors).toEqual([]);
    expect(result.packs).toContain("universal.authoring");
    expect(existsSync(join(repo, RECORDER))).toBe(true);
    expect(existsSync(join(repo, RECORDER_LIBRARY))).toBe(true);

    // Sourcing its library and resolving façade scope are the two ways this
    // pair can be shipped incomplete, and both fail at run time rather than at
    // copy time — so the proof is a real run in the repository it landed in.
    const logged = Bun.spawnSync(["bash", RECORDER, "log", "README.md"], { cwd: repo, stdout: "pipe", stderr: "pipe" });
    expect(logged.exitCode).toBe(0);
    const checked = Bun.spawnSync(["bash", RECORDER, "check"], { cwd: repo, stdout: "pipe", stderr: "pipe" });
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout.toString()).toContain("DOC READ");
  });
});
