import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ROOT } from "./gates_test_support";
import { missingFields, ruleBlocks, standardFiles } from "./standards";

const FIXTURE = "fixtures/standards-rule-ids.json";
const UTF8 = "utf8";
const MAX_STANDARD_LINES = 400;
// Zig and Redis left the owner's stack, and RULE UFS was removed by decision.
const RETIRED_STACK = /\b(zig|redis|ufs)\b/i;
const RELATIVE_LINK = /\]\((?!https?:|#|mailto:)([^)#\s]+)(?:#[^)]*)?\)/g;

type Fixture = { identifiers: string[]; removed: Record<string, string> };

const files = standardFiles(ROOT);
const text = (file: string) => readFileSync(join(ROOT, file), UTF8);

describe("standards catalogue", () => {
  test("standards exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("every rule declares its five fields", () => {
    const incomplete = files.flatMap((file) => ruleBlocks(text(file))
      .filter((block) => missingFields(block).length > 0)
      .map((block) => `${file}:${block.line} ${block.id} lacks ${missingFields(block).join(", ")}`));
    expect(incomplete).toEqual([]);
  });

  test("every rule identifier has one home", () => {
    const fixture = JSON.parse(readFileSync(join(ROOT, FIXTURE), UTF8)) as Fixture;
    const homes = new Map<string, string[]>();
    for (const file of files) {
      for (const block of ruleBlocks(text(file))) homes.set(block.id, [...homes.get(block.id) ?? [], file]);
    }
    const duplicated = [...homes].filter(([, places]) => places.length > 1).map(([id, places]) => `${id}: ${places.join(", ")}`);
    const homeless = fixture.identifiers.filter((id) => !homes.has(id) && !(id in fixture.removed));
    const removedButPresent = Object.keys(fixture.removed).filter((id) => homes.has(id));
    expect({ duplicated, homeless, removedButPresent }).toEqual({ duplicated: [], homeless: [], removedButPresent: [] });
  });

  test("standards name no retired stack", () => {
    const hits = files.flatMap((file) => text(file).split("\n")
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => RETIRED_STACK.test(line))
      .map(({ index }) => `${file}:${index + 1}`));
    expect(hits).toEqual([]);
  });

  test("standards stay short and links resolve", () => {
    const long = files.filter((file) => text(file).split("\n").length > MAX_STANDARD_LINES);
    const broken = files.flatMap((file) => [...text(file).matchAll(RELATIVE_LINK)]
      .map((match) => match[1] ?? "")
      .filter((target) => !existsSync(join(ROOT, dirname(file), target)))
      .map((target) => `${file} → ${target}`));
    expect({ long, broken }).toEqual({ long: [], broken: [] });
  });
});
