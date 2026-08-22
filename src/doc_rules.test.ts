import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { DOC_DASH, DOC_HEADING, DOC_PARAGRAPH, DOC_SENTENCE, DOC_WORD, documentationSurfaces, scanDocument } from "./doc_rules";

const ROOT = resolve(import.meta.dir, "..");
const SLOP_FIXTURE = "fixtures/doc-slop.md";
const PAGE = "page.md";

// The pass fixture: one clean page written to the rules it is checked against.
// Every line here is prose the check must leave alone, so a false positive
// anywhere in the reader turns this test red.
const CLEAN = `# A clean page

orly writes this page. The check reads it and finds nothing.

## What it leaves alone

Command names keep their banned word: run \`make harness-verify\` first.
A link keeps its text and drops its [target](https://example.com/execute).

| leverage | robust |
|---|---|
| a table cell is exempt | so is this |

\`\`\`bash
# fenced code is exempt: execute the robust pipeline
orly gate verify
\`\`\`

The EXECUTE stage is a name, not a verb. A rule may quote “leverage” to ban it.

<!-- lint-ignore: DOCWORD — this paragraph names the banned words to ban them -->
Also banned: delve, foster, elevate, harness, tapestry, realm.
`;

function codes(text: string): string[] {
  return scanDocument(PAGE, text).map((finding) => finding.code);
}

describe("scanDocument", () => {
  test("passes a clean page", () => {
    expect(scanDocument(PAGE, CLEAN)).toEqual([]);
  });

  test("fails the slop fixture on every mechanical rule", () => {
    const found = codes(readFileSync(join(ROOT, SLOP_FIXTURE), "utf8"));

    expect(found).toContain(DOC_WORD);
    expect(found).toContain(DOC_DASH);
    expect(found).toContain(DOC_SENTENCE);
    expect(found).toContain(DOC_PARAGRAPH);
    expect(found).toContain(DOC_HEADING);
  });

  test("names the banned word it found", () => {
    const findings = scanDocument(PAGE, "# Page\n\nWe leverage it.\n");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("leverage");
    expect(findings[0]?.line).toBe(3);
  });

  test("counts an over-budget page by its overage", () => {
    const findings = scanDocument(PAGE, "# Page\n\nOne — two — three.\n").filter((finding) => finding.code === DOC_DASH);

    expect(findings[0]?.weight).toBe(2);
  });

  test("reads a lowercase product name as a sentence start", () => {
    const paragraph = "# Page\n\nOne here. orly two. bun three. git four.\n";

    expect(codes(paragraph)).toEqual([DOC_PARAGRAPH]);
  });

  test("leaves a hyphenated command name alone", () => {
    expect(codes("# Page\n\nRun provision-env-1password before the hook.\n")).toEqual([]);
  });

  test("counts a code span as one word, not as a hole", () => {
    const findings = scanDocument(PAGE, "# Page\n\nThe hooks run on every commit and push. `orly gate pr` then refuses it.\n");

    expect(findings).toEqual([]);
  });

  test("requires exactly one level-one heading", () => {
    expect(codes("## Only a level two\n\nProse.\n")).toContain(DOC_HEADING);
    expect(codes("# One\n\nProse.\n\n# Two\n\nMore prose.\n")).toContain(DOC_HEADING);
  });
});

describe("documentationSurfaces", () => {
  test("covers the readme and the pages orly renders", () => {
    const surfaces = documentationSurfaces(ROOT);

    expect(surfaces).toContain("README.md");
    expect(surfaces).toContain("docs/DOCUMENTATION_RULES.md");
    expect(surfaces.every((relative) => relative.endsWith(".md"))).toBeTrue();
  });
});
