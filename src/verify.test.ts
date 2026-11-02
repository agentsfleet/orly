import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { RulesModel } from "./model";
import { packSourceErrors, verifyRuleset } from "./verify";

const ROOT = resolve(import.meta.dir, "..");
const PACK = "language.demo";
const SOURCE = "packs/demo/rules.md";
const TARGET = "standards/languages/demo.md";
const BODY = "# Demo\n\nOne rule, stated once.\n";

// A checkout carrying one pack whose source and target are different paths —
// the shape `planFiles` never writes into, and therefore the only shape that
// can drift.
function sandbox(target?: string): { model: RulesModel; root: string } {
  const root = mkdtempSync(join(tmpdir(), "orly-packs-"));
  mkdirSync(join(root, "packs/demo"), { recursive: true });
  writeFileSync(join(root, SOURCE), BODY);
  if (target !== undefined) {
    mkdirSync(join(root, "standards/languages"), { recursive: true });
    writeFileSync(join(root, TARGET), target);
  }
  const registry = { packs: { [PACK]: { extensions: [], managed_files: [{ source: SOURCE, target: TARGET }] } } };
  return { model: new RulesModel(root, registry), root };
}

// verify validates the registry before any check, so an invalid registry
// stops the run instead of producing three green lines.
test("verify refuses an invalid registry before any check", async () => {
  const { model, root } = sandbox();
  try {
    await expect(verifyRuleset(model)).rejects.toThrow("registry schema_version must equal 1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack targets match their sources", async () => {
  const model = await RulesModel.load(ROOT);
  const local = Object.keys(model.registry.packs as Record<string, unknown>).sort();

  expect(await packSourceErrors(model, local)).toEqual([]);
});

test("pack target drift names the pack and both paths", async () => {
  const { model, root } = sandbox(`${BODY}and a second rule the source never gained.\n`);
  try {
    const findings = await packSourceErrors(model, [PACK]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(TARGET);
    expect(findings[0]).toContain(SOURCE);
    expect(findings[0]).toContain(PACK);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pack target the checkout does not carry is not drift", async () => {
  const { model, root } = sandbox();
  try {
    expect(await packSourceErrors(model, [PACK])).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The trailing newline managedContent appends is part of what a consumer
// receives, so a target missing it is drift like any other byte.
test("a matched pack target reports clean", async () => {
  const { model, root } = sandbox(BODY);
  try {
    expect(await packSourceErrors(model, [PACK])).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify reports pack parity beside the catalogue and the root render", async () => {
  const checks = await verifyRuleset(await RulesModel.load(ROOT));

  expect(checks.map((check) => [check.name, check.result])).toEqual([
    ["standards.catalogue", "pass"], ["generated.root.current", "pass"], ["packs.sources.current", "pass"],
  ]);
});
