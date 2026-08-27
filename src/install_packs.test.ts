import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { RulesModel } from "./model";

const SOURCE_EXTENSIONS = ["rs", "ts", "tsx", "js", "jsx", "py", "sh", "sql", "zig", "mdx"];
const RECORDER = "audits/doc-read.sh";
const RECORDER_LIBRARY = "audits/rule-ledger-lib.sh";
// Read from package.json rather than restated here: a hand-synced copy goes
// stale at the next release and the test then proves an install at a version
// that no longer ships.
const ENGINE_VERSION = (await Bun.file(join(ROOT, "package.json")).json()).version;

afterEach(cleanupTemporaryDirectories);

describe("opt-in pack selection", () => {
  // An opt-in pack may cite a file another opt-in pack owns, and every such
  // citation has to be gated by the pack that provides it. Ungated, the install
  // is refused for skipping rules the repository was never meant to take:
  // `product.agentsfleet` ships the doc-read table, `workflow.governance` ships
  // the governance façade that table once named unconditionally.
  test("one opt-in pack installs without dragging in the others", async () => {
    const model = await RulesModel.load(ROOT);
    const repo = newRepository();
    for (const extension of SOURCE_EXTENSIONS) await Bun.write(join(repo, `src/source.${extension}`), "\n");
    await Bun.write(join(repo, ".oracle/orly.json"), JSON.stringify({ schema_version: 1, orly_version: "", packs: ["product.agentsfleet"], commands: {}, managed: [] }));

    const result = await install(model, { targetRoot: repo, force: false, installHooks: true, orlyVersion: ENGINE_VERSION });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.packs).toContain("product.agentsfleet");
    expect(result.packs).not.toContain("workflow.governance");
    expect(existsSync(join(repo, "docs/EXECUTE_DOC_READS.md"))).toBe(true);
    expect(existsSync(join(repo, "dispatch/edit_rules.md"))).toBe(false);
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
    await Bun.write(join(repo, ".oracle/orly.json"), JSON.stringify({ schema_version: 1, orly_version: "", packs: [], commands: {}, managed: [] }));

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
