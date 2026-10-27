import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { specTests } from "./criteria_spec";
import { runGate } from "./gates";
import {
  cleanupTemporaryDirectories, FIXTURE_TEST, modelFor, newRepository, newSpecRepository, ROOT, SPEC_RELATIVE, specFixture, temporaryDirectory,
} from "./gates_test_support";
import { RulesModel } from "./model";
import { unacknowledgedObligations } from "./spec_obligations";

const DIMENSION_LINE = `- **Dimension 1.1** — DONE — fixture behaviour → Test \`${FIXTURE_TEST}\``;
const DIMENSIONS = "spec.dimensions";
const DEFERRALS = "spec.deferrals";
const TESTS = "spec.tests";
const ACK_PREFIX = '> Owner (Kishore, Oct 05, 2026 14:30): "';
const INDY_ACK_PREFIX = '> Indy (Oct 05, 2026: 02:30 PM): "';
const ACK_SUFFIX = '" — context: the named deferred item.';
const DEFER_ITEM = "defer 1.2";
const DEFERRED_DIMENSION = "Dimension 1.2";
const DEFERRED_CLAIM = `- ${DEFERRED_DIMENSION} was deferred to follow-up.`;
const TEMPLATE_PATH = "docs/TEMPLATE.md";
const BODY_HEADING = "# Spec Body — Copy Everything Below This Line";
const PACK_MARKER = "oracle-packs:";

afterEach(cleanupTemporaryDirectories);

async function verdict(rewrite: (source: string) => string, criterion: string) {
  const root = newSpecRepository();
  const model = await modelFor(root);
  const path = join(root, SPEC_RELATIVE);
  writeFileSync(path, rewrite(readFileSync(path, "utf8")));
  return runGate(model, root, "pr").results.find((result) => result.name === criterion)!;
}

function quoted(prefix: string, words = DEFER_ITEM): string {
  return `${prefix}${words}${ACK_SUFFIX}`;
}

// Renames the fixture's test in its Dimension line and its Test Specification row.
function renamedTest(source: string, name: string): string {
  return source.replaceAll(`\`${FIXTURE_TEST}\``, `\`${name}\``);
}

// The obligations a spec still owes when Discovery holds only this quote.
function obligationsFor(quote: string): string[] {
  return unacknowledgedObligations(`## Sections\n\n${DEFERRED_CLAIM}\n\n## Discovery (consult log)\n\n${quote}\n`);
}

for (const marker of ["NOT_DONE", "UNDONE", "DONE_LATER", "IN_PROGRESS — DONE mentioned in the explanation"]) {
  test(`a ${marker} Dimension remains incomplete`, async () => {
    const result = await verdict((source) => source.replace(DIMENSION_LINE, DIMENSION_LINE.replace(" — DONE —", ` — ${marker} —`)), DIMENSIONS);
    expect(result.ok).toBeFalse();
    expect(result.detail).toContain("1.1");
  });
}

test("example and quoted Dimension markers cannot supply completion", async () => {
  const result = await verdict((source) => source.replace(DIMENSION_LINE, `\`\`\`markdown\n${DIMENSION_LINE}\n\`\`\`\n\n> ${DIMENSION_LINE}`), DIMENSIONS);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("no Dimensions");
});

test("an exact DONE marker completes the declared Dimension", async () => {
  expect((await verdict((source) => source, DIMENSIONS)).ok).toBeTrue();
});

function withClaim(source: string, quote: string): string {
  return source.replace("Fixture content for Discovery (consult log).", `${DEFERRED_CLAIM}\n\n${quote}`);
}

test("an unrelated owner quote cannot acknowledge another Dimension", async () => {
  const result = await verdict((source) => withClaim(source, quoted(ACK_PREFIX, "defer 9.2")), DEFERRALS);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain(DEFERRED_DIMENSION);
  expect(result.detail).toContain("no item-bound owner quote");
});

test("a quote in a code example cannot acknowledge a deferral", async () => {
  const result = await verdict((source) => withClaim(source, `\`\`\`markdown\n${quoted(ACK_PREFIX)}\n\`\`\``), DEFERRALS);
  expect(result.ok).toBeFalse();
});

test("a quote outside Discovery cannot acknowledge a deferral", async () => {
  const result = await verdict((source) => withClaim(source, "").replace("Fixture content for Overview.", quoted(ACK_PREFIX)), DEFERRALS);
  expect(result.ok).toBeFalse();
});

test("an item-bound owner quote acknowledges only the named deferral", async () => {
  const quote = quoted(ACK_PREFIX, `${DEFER_ITEM}, ship the rest`);
  expect((await verdict((source) => withClaim(source, quote), DEFERRALS)).ok).toBeTrue();
  const result = await verdict((source) => withClaim(source, `${quote}\n\n- Dimension 1.3 was deferred to follow-up.`), DEFERRALS);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("Dimension 1.3");
});

test("an unnamed deferral must name its obligation before acknowledgement", async () => {
  const result = await verdict((source) => source.replace("Fixture content for Discovery (consult log).", "- Performance proof was deferred to follow-up."), DEFERRALS);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("unnamed obligation");
});

test("an owner quote names both who decided and when", () => {
  expect(obligationsFor(quoted(ACK_PREFIX))).toEqual([]);
  for (const prefix of ['> Owner (): "', '> Owner (Kishore): "', '> Owner (, Oct 05, 2026 14:30): "', '> Owner (Kishore, ): "']) {
    expect(obligationsFor(quoted(prefix))).toEqual([DEFERRED_DIMENSION]);
  }
});

test("the earlier Indy quote form still acknowledges a deferral", () => {
  expect(obligationsFor(quoted(INDY_ACK_PREFIX))).toEqual([]);
});

test("the owner quote form the template documents acknowledges a deferral", async () => {
  const template = await Bun.file(join(ROOT, TEMPLATE_PATH)).text();
  const form = template.match(/`(> Owner \([^`]+)`/)![1]!;
  const filled = form.replace("<name>", "Kishore").replace("<MMM DD, YYYY HH:MM>", "Oct 27, 2026 12:25")
    .replace("<quote>", DEFER_ITEM).replace("<item, why>", `${DEFERRED_DIMENSION}, waits on the release`);
  expect(filled).not.toContain("<");
  expect(obligationsFor(filled)).toEqual([]);
});

test("a named test defined in a tracked source file passes spec.tests", async () => {
  const result = await verdict((source) => source, TESTS);
  expect(result.ok).toBeTrue();
  expect(result.detail).toContain("1 named test(s) found");
});

test("a named test that only the spec mentions fails spec.tests", async () => {
  const result = await verdict((source) => renamedTest(source, "absent_test"), TESTS);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("absent_test (Dimension 1.1)");
});

test("a name found only inside a longer word fails spec.tests", async () => {
  const result = await verdict((source) => renamedTest(source, FIXTURE_TEST.slice(0, -1)), TESTS);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain(`closest: ${FIXTURE_TEST}`);
});

test("a manual-tier test needs no source file", async () => {
  const result = await verdict((source) => renamedTest(source, "operator_signs_off").replace("| 1.1 | unit |", "| 1.1 | manual |"), TESTS);
  expect(result.ok).toBeTrue();
  expect(result.detail).toContain("outside tier manual");
});

test("spec.tests skips a branch without a spec", async () => {
  const root = newRepository();
  const result = runGate(await modelFor(root), root, "pr").results.find((entry) => entry.name === TESTS)!;
  expect(result.ok).toBeTrue();
  expect(result.detail).toContain("no active spec");
});

test("spec.tests fails closed when git cannot search the tree", async () => {
  const root = temporaryDirectory();
  const result = specTests().evaluate({ root, specPath: SPEC_RELATIVE, specText: specFixture(), model: await RulesModel.load(ROOT), acceptDirty: false });
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("cannot search tracked test sources");
});

test("a MOVED rubric row needs an owner quote naming the rows it maps", () => {
  const rubric = "## Acceptance Rubric (single scoring surface)\n\n| # | Criterion | Priority | Graded |\n|---|---|---|---|\n| R3 | Export works | P0 | MOVED to M15_001 R2 |\n";
  expect(unacknowledgedObligations(`${rubric}\n## Discovery (consult log)\n\n- none\n`)).toEqual(["R3", "R2"]);
  const quote = quoted(ACK_PREFIX, "move R3 to M15_001 as its R2");
  expect(unacknowledgedObligations(`${rubric}\n## Discovery (consult log)\n\n${quote}\n`)).toEqual([]);
});

// The authoring skill copies the body with sed and no pack filter, so a pack
// marker below the body heading would land in every new spec.
test("the template's spec body carries no pack markers", async () => {
  const parts = (await Bun.file(join(ROOT, TEMPLATE_PATH)).text()).split(BODY_HEADING);
  expect(parts).toHaveLength(2);
  expect(parts[1]).not.toContain(PACK_MARKER);
});

test("the template's unfilled placeholders cannot acknowledge a deferral", async () => {
  const form = (await Bun.file(join(ROOT, TEMPLATE_PATH)).text()).match(/`(> Owner \([^`]+)`/)![1]!;
  expect(obligationsFor(form.replace("<quote>", DEFER_ITEM))).toEqual([DEFERRED_DIMENSION]);
});

const RUBRIC_HEADER = "## Acceptance Rubric (single scoring surface)\n\n| # | Criterion | Priority | Graded |\n|---|---|---|---|\n";

test("a template-shaped MOVED row is acknowledged by a quote naming its rows", () => {
  const rubric = `${RUBRIC_HEADER}| R3 | Export works (§2) | P0 | MOVED to M15_001 R2 |\n`;
  expect(unacknowledgedObligations(`${rubric}\n## Discovery (consult log)\n\n${quoted(ACK_PREFIX, "move R3 to M15_001 as its R2")}\n`)).toEqual([]);
});

test("a P0 rubric row cannot be deferred even with an owner quote", () => {
  const rubric = `${RUBRIC_HEADER}| R2 | Export works (§2) | P0 | ❌ deferred to follow-up |\n`;
  const owed = unacknowledgedObligations(`${rubric}\n## Discovery (consult log)\n\n${quoted(ACK_PREFIX, "defer R2")}\n`);
  expect(owed).toEqual(["R2 is P0 and cannot be deferred: MOVE it or return to EXECUTE"]);
});

test("an open Dimension's unwritten test is spec.dimensions' to report, not spec.tests'", async () => {
  const result = await verdict((source) => source
    .replace(DIMENSION_LINE, `${DIMENSION_LINE}\n- **Dimension 1.2** — export behaviour → Test \`export_writes_file\``)
    .replace(`| 1.1 | unit | \`${FIXTURE_TEST}\` | Valid input is accepted. |`, `$&\n| 1.2 | unit | \`export_writes_file\` | Export writes the file. |`), TESTS);
  expect(result.ok).toBeTrue();
});

test("a production identifier or a receipt is not a named test", async () => {
  const root = newSpecRepository();
  writeFileSync(join(root, "parse.ts"), "export function parse_manifest() {}\n");
  writeFileSync(join(root, "run-receipt.txt"), "PASS parse_manifest\n");
  const path = join(root, SPEC_RELATIVE);
  writeFileSync(path, renamedTest(readFileSync(path, "utf8"), "parse_manifest"));
  Bun.spawnSync(["git", "add", "."], { cwd: root });
  const result = runGate(await modelFor(root), root, "pr").results.find((entry) => entry.name === TESTS)!;
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("parse_manifest (Dimension 1.1)");
});
