import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { install } from "./install";
import { RulesModel } from "./model";

const SOURCE_EXTENSIONS = ["rs", "ts", "tsx", "js", "jsx", "py", "sh", "sql", "zig", "mdx"];
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
