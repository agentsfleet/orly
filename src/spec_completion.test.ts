import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runGate } from "./gates";
import { cleanupTemporaryDirectories, modelFor, newSpecRepository, SPEC_RELATIVE } from "./gates_test_support";

const DIMENSION_LINE = "- **Dimension 1.1** — DONE — fixture behaviour → Test `fixture_test`";
const DIMENSIONS = "spec.dimensions";
const DEFERRALS = "spec.deferrals";
const ACK_PREFIX = '> Indy (Oct 05, 2026: 02:30 PM): "';
const ACK_SUFFIX = '" — context: the named deferred item.';

afterEach(cleanupTemporaryDirectories);

async function verdict(rewrite: (source: string) => string, criterion: string) {
  const root = newSpecRepository();
  const model = await modelFor(root);
  const path = join(root, SPEC_RELATIVE);
  writeFileSync(path, rewrite(readFileSync(path, "utf8")));
  return runGate(model, root, "pr").results.find((result) => result.name === criterion)!;
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
  return source.replace("Fixture content for Discovery (consult log).", `- Dimension 1.2 was deferred to follow-up.\n\n${quote}`);
}

test("an unrelated owner quote cannot acknowledge another Dimension", async () => {
  const result = await verdict((source) => withClaim(source, `${ACK_PREFIX}defer 9.2${ACK_SUFFIX}`), DEFERRALS);
  expect(result.ok).toBeFalse();
  expect(result.detail).toContain("Dimension 1.2");
});

test("a quote in a code example cannot acknowledge a deferral", async () => {
  const result = await verdict((source) => withClaim(source, `\`\`\`markdown\n${ACK_PREFIX}defer 1.2${ACK_SUFFIX}\n\`\`\``), DEFERRALS);
  expect(result.ok).toBeFalse();
});

test("a quote outside Discovery cannot acknowledge a deferral", async () => {
  const result = await verdict((source) => withClaim(source, "").replace("Fixture content for Overview.", `${ACK_PREFIX}defer 1.2${ACK_SUFFIX}`), DEFERRALS);
  expect(result.ok).toBeFalse();
});

test("an item-bound owner quote acknowledges only the named deferral", async () => {
  const quote = `${ACK_PREFIX}defer 1.2, ship the rest${ACK_SUFFIX}`;
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
