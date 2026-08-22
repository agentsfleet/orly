import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository } from "./gates_test_support";
import { install } from "./install";
import { RulesModel } from "./model";

afterEach(cleanupTemporaryDirectories);

describe("install package location", () => {
  test("materialises managed files when the engine package is nested in a consumer repository", async () => {
    const repo = newRepository();
    const engineRoot = join(repo, "node_modules", "@agentsfleet", "orly");
    mkdirSync(engineRoot, { recursive: true });
    await Bun.write(join(engineRoot, "core.md"), "core\n");
    await Bun.write(join(engineRoot, "rules.md"), "fixture rules\n");

    const model = new RulesModel(engineRoot, {
      schema_version: 1,
      core_documents: ["core.md"],
      packs: { base: { extensions: [], managed_files: [{ source: "rules.md", target: "rules.md" }] } },
      rules: [],
    });

    const result = await install(model, { targetRoot: repo, force: false, installHooks: false, orlyVersion: "0.5.0" });

    expect(result.ok).toBe(true);
    expect(result.written).toContain("rules.md");
    expect(await Bun.file(join(repo, "rules.md")).text()).toBe("fixture rules\n");
  });
});
