import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { DOC_DASH, DOC_HEADING, DOC_PARAGRAPH, DOC_SENTENCE, DOC_WORD, scanDocument } from "./doc_rules";

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

function dashPage(wordCount: number, dashes: number): string {
  return ["# Guide", `Read ${"— ".repeat(dashes)}carefully.`, ...Array(wordCount - 3).fill("Read.")].join("\n\n");
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

  test("allows two dashes from 300 prose words and reports only the overage", () => {
    expect(codes(dashPage(299, 2))).toEqual([DOC_DASH]);
    expect(codes(dashPage(300, 2))).toEqual([]);
    const findings = scanDocument(PAGE, dashPage(300, 3));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(DOC_DASH);
    expect(findings[0]?.weight).toBe(1);
  });

  test("applies the full-page dash budget only when a touched paragraph has a dash", () => {
    const history = dashPage(300, 3) + "\n\nRead the updated guide.\n";
    expect(scanDocument(PAGE, history, { lines: new Set([history.split("\n").length - 1]) })).toEqual([]);
    const edited = dashPage(300, 2) + "\n\nRead — carefully.\nFollow the updated guide.\n";
    const findings = scanDocument(PAGE, edited, { lines: new Set([edited.split("\n").length - 1]) });
    expect(findings.map((finding) => finding.code)).toEqual([DOC_DASH]);
    expect(findings[0]?.weight).toBe(1);
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

  test("rejects announcement filler in changed prose", () => {
    expect(codes("# Page\n\nIt is worth noting that the setting is saved.\n")).toContain(DOC_WORD);
    expect(codes("# Page\n\nWe're excited to add search.\n")).toContain(DOC_WORD);
  });

  test("reads indented MDX headings under the generated page title", () => {
    expect(scanDocument("page.mdx", "---\ntitle: Page\n---\n\n  ## Install\n\nRun `bun install`.\n")).toEqual([]);
    expect(scanDocument("page.mdx", "---\ntitle: Page\n---\n\n  ### Skipped level\n").map((finding) => finding.code)).toContain(DOC_HEADING);
  });

  test("does not join paragraphs across MDX component boundaries", () => {
    const text = "---\ntitle: Page\n---\n<Tip>\nOne sentence. Two sentences.\n</Tip>\n<Note>\nThree sentences. Four sentences.\n</Note>\n";
    expect(scanDocument("page.mdx", text)).toEqual([]);
  });

  test("exempts the changelog bullet separator while rejecting prose dashes", () => {
    expect(codes("# Page\n\n- **Retries** — You can retry a failed run.\n")).toEqual([]);
    expect(codes("# Page\n\n1. **Rule — Short sentences.** Keep sentences short.\n")).toEqual([]);
    expect(codes("# Page\n\nYou can retry — after a failure.\n")).toContain(DOC_DASH);
  });

  test("reports a whole edited paragraph when its first line did not change", () => {
    const text = "# Page\n\nOne sentence. Two sentences.\nThree sentences. Four sentences.\n";
    const findings = scanDocument(PAGE, text, { lines: new Set([4]) });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(DOC_PARAGRAPH);
    expect(findings[0]?.line).toBe(3);
  });

  test("ignores old prose and page budgets when other text changes", () => {
    const text = "We leverage a robust tool — it works.\n\nRead the new guide.\n";
    expect(scanDocument(PAGE, text, { lines: new Set([3]) })).toEqual([]);
  });

  test("rejects a banned word on an unchanged line of an edited paragraph", () => {
    const text = "# Page\n\nWe leverage tools.\nRead the updated guide.\n";
    const findings = scanDocument(PAGE, text, { lines: new Set([4]) });
    expect(findings.map((finding) => finding.code)).toEqual([DOC_WORD]);
    expect(findings[0]?.line).toBe(3);
  });

  test("rejects filler phrases wrapped across lines", () => {
    expect(codes("# Page\n\nIt is worth\nnoting that you can retry.\n")).toContain(DOC_WORD);
  });

  test("keeps nested fence examples exempt from prose checks", () => {
    const text = "# Page\n\n````md\n```sh\nexecute robust\n```\n````\n\nRead the guide.\n";
    expect(scanDocument(PAGE, text)).toEqual([]);
    expect(codes(text + "\nWe leverage tools.\n")).toContain(DOC_WORD);
  });

  test("allows a snippet heading without a page title", () => {
    expect(scanDocument("snippets/install.mdx", "## Install\n\nRun `bun install`.\n")).toEqual([]);
  });

  test("rejects a hierarchy jump created by deleting an earlier heading", () => {
    const findings = scanDocument(PAGE, "# Guide\n\n\n### Detail\n", { lines: new Set([2, 3]), headingsChanged: true });
    expect(findings.map((finding) => finding.code)).toContain(DOC_HEADING);
    expect(findings[0]?.line).toBe(4);
  });

  test("honors a reasoned page exception without suppressing other rules", () => {
    const text = "---\nlint-ignore: DOC-05 — Official terminology\n---\n# Guide\n\nWe leverage robust tools.\n";
    const findings = scanDocument(PAGE, text);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("robust");
  });

  test("honors DOC-14b page exceptions while retaining other vocabulary rules", () => {
    const text = "---\nlint-ignore: DOC-14b — Named vocabulary\n---\n# Guide\n\nWe delve and leverage robust tools.\n";
    expect(scanDocument(PAGE, text).map((finding) => finding.message)).toEqual([
      'banned word "leverage" (DOC-05)', 'banned word "robust" (DOC-07)',
    ]);
  });

  test("scopes a DOC-14b comment exception to its paragraph", () => {
    const text = "# Guide\n\n<!-- lint-ignore: DOC-14b — Named vocabulary -->\nWe delve and leverage robust tools.\n\nWe delve again.\n";
    expect(scanDocument(PAGE, text).map((finding) => finding.message)).toEqual([
      'banned word "leverage" (DOC-05)', 'banned word "robust" (DOC-07)', 'banned word "delve" (DOC-14b)',
    ]);
  });

  test("exempts HTML code blocks and resumes prose checks after them", () => {
    const text = "# Guide\n\n<pre>\nexecute robust\n</pre>\n\n<code>\nexecute robust\n</code>\n\nRead the guide.\n";
    expect(scanDocument(PAGE, text)).toEqual([]);
    expect(codes(text + "\nWe leverage tools.\n")).toContain(DOC_WORD);
  });

  test("keeps an HTML opener inside a fence from hiding following prose", () => {
    const text = "# Guide\n\n```html\n<pre>\n```\n\nWe leverage robust tools.\n";
    expect(codes(text)).toEqual([DOC_WORD, DOC_WORD]);
  });

  test("exempts nested HTML code blocks without hiding following prose", () => {
    const text = "# Guide\n\n<pre><code>\nexecute robust\n</code></pre>\n\nRead the guide.\n";
    expect(codes(text)).toEqual([]);
    expect(codes(text + "\nWe leverage tools.\n")).toEqual([DOC_WORD]);
  });
});
