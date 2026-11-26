import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH } from "./config";
import { cleanupTemporaryDirectories, newRepository, orly, ROOT, writeFixtureConfig } from "./gates_test_support";

const SPEC = "docs/v2/active/M40_001_P2_CLI_FIXTURE_NOTES.md";
const OTHER = "docs/v2/active/M41_001_P2_CLI_OTHER_NOTES.md";
const QUOTE = "ship it without the alias";
const STAMPED = /^- > Owner \(Indy, [A-Z][a-z]{2} \d{2}, \d{4} \d{2}:\d{2}\): "ship it without the alias"/;
const DISCOVERY = [
  "## Discovery (consult log)",
  "",
  "- **Model reviews** — none yet.",
  "",
  "```text",
  "## not a heading inside a fence",
  "```",
  "",
].join("\n");

afterEach(cleanupTemporaryDirectories);

// A repository that selects the persona pack naming its owner, with one spec
// whose Discovery holds a fenced heading and is followed by another section.
function noteRepository(packs = ["persona.indy"], specs: Record<string, string> = { [SPEC]: `# M40_001: Fixture\n\n${DISCOVERY}\n## Appendix\n\nLater text.\n` }): string {
  const root = newRepository();
  writeFixtureConfig(root);
  const config = JSON.parse(readFileSync(join(root, CONFIG_PATH), "utf8"));
  writeFileSync(join(root, CONFIG_PATH), JSON.stringify({ ...config, packs }));
  mkdirSync(join(root, "docs/v2/active"), { recursive: true });
  for (const [path, text] of Object.entries(specs)) writeFileSync(join(root, path), text);
  return root;
}

function lines(root: string, path = SPEC): string[] {
  return readFileSync(join(root, path), "utf8").split("\n");
}

test("a note lands dated at the end of Discovery, before the next section", () => {
  const root = noteRepository();
  const result = orly(root, ROOT, "note", QUOTE, "--context", "NLG: no alias beside the renamed flag");
  expect(result.code, result.output).toBe(0);
  const written = lines(root);
  const at = written.findIndex((line) => STAMPED.test(line));
  expect(written[at]).toEndWith(`"${QUOTE}" — context: NLG: no alias beside the renamed flag`);
  expect(written[at - 1]).toBe("```");
  expect(written[at + 2]).toBe("## Appendix");
  expect(result.output).toContain(`noted in ${SPEC} Discovery`);
});

test("a second note follows the first, and a note without context ends at the quote", () => {
  const root = noteRepository(["persona.indy"], { [SPEC]: `# M40_001: Fixture\n\n${DISCOVERY}` });
  expect(orly(root, ROOT, "note", "first ruling").code).toBe(0);
  expect(orly(root, ROOT, "note", QUOTE).code).toBe(0);
  const written = lines(root).filter((line) => line.startsWith("- > Owner"));
  expect(written).toHaveLength(2);
  expect(written[0]).toEndWith(`: "first ruling"`);
  expect(written[1]).toMatch(STAMPED);
  expect(written[1]).toEndWith(`"${QUOTE}"`);
});

test("a --spec path chooses among several active specs, which are otherwise refused", () => {
  const root = noteRepository(["persona.indy"], { [SPEC]: `# A\n\n${DISCOVERY}`, [OTHER]: `# B\n\n${DISCOVERY}` });
  const refused = orly(root, ROOT, "note", QUOTE);
  expect(refused.code).toBe(1);
  expect(refused.output).toContain(`2 specs are active (${SPEC}, ${OTHER}); name one with --spec <PATH>`);
  expect(orly(root, ROOT, "note", QUOTE, "--spec", OTHER).code).toBe(0);
  expect(lines(root, OTHER).some((line) => STAMPED.test(line))).toBeTrue();
  expect(lines(root, SPEC).some((line) => STAMPED.test(line))).toBeFalse();
});

test("no active spec is refused", () => {
  const root = noteRepository(["persona.indy"], {});
  const result = orly(root, ROOT, "note", QUOTE);
  expect(result.code).toBe(1);
  expect(result.output).toContain("no spec is active under docs/v*/active/; name one with --spec <PATH>");
});

test("a spec without a Discovery section is refused and left unchanged", () => {
  const text = "# M40_001: Fixture\n\n## Overview\n\n```text\n## Discovery\n```\n";
  const root = noteRepository(["persona.indy"], { [SPEC]: text });
  const result = orly(root, ROOT, "note", QUOTE);
  expect(result.code).toBe(1);
  expect(result.output).toContain(`${SPEC} has no "## Discovery" section`);
  expect(readFileSync(join(root, SPEC), "utf8")).toBe(text);
});

test("a repository whose packs name no owner is refused, never given an invented name", () => {
  const root = noteRepository([]);
  const result = orly(root, ROOT, "note", QUOTE);
  expect(result.code).toBe(1);
  expect(result.output).toContain("no selected pack names an owner");
  expect(lines(root).some((line) => line.startsWith("- > Owner"))).toBeFalse();
});

test.each([
  [["line one\nline two"], "a note is one non-empty line"],
  [["   "], "a note is one non-empty line"],
  [[QUOTE, "--context", "two\nlines"], "--context takes one non-empty line"],
  [[], "[ORLY-NOTE-001] usage"],
  [[QUOTE, "another quote"], "[ORLY-NOTE-001] usage"],
  [[QUOTE, "--reason", "wrong flag"], "[ORLY-NOTE-001] usage"],
  [[QUOTE, "--spec"], "[ORLY-NOTE-001] usage"],
  [[QUOTE, "--spec", "../outside.md"], "../outside.md is outside this repository"],
  [[QUOTE, "--spec", "docs/v2/active/missing.md"], "docs/v2/active/missing.md is not a spec file in this repository"],
])("orly note %j is refused", (args, message) => {
  const root = noteRepository();
  const before = readFileSync(join(root, SPEC), "utf8");
  const result = orly(root, ROOT, "note", ...args);
  expect(result.code).toBe(1);
  expect(result.output).toContain(message);
  expect(readFileSync(join(root, SPEC), "utf8")).toBe(before);
});

test("a spec written with CRLF line endings keeps them", () => {
  const root = noteRepository(["persona.indy"], { [SPEC]: `# M40_001: Fixture\r\n\r\n## Discovery\r\n\r\n- none\r\n` });
  expect(orly(root, ROOT, "note", QUOTE).code).toBe(0);
  const text = readFileSync(join(root, SPEC), "utf8");
  expect(text).toMatch(/- none\r\n- > Owner \(Indy, [^)]+\): "ship it without the alias"\r\n$/);
});
