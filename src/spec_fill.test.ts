import { expect, test } from "bun:test";

import { isSpecRecord, specFillFindings } from "./spec_fill";

const SPEC = "docs/v2/active/M1_001_P2_CLI_DEMO.md";
const TEXT = [
  "# M1_001: Demo",
  "",
  "**Goal (testable):** {{fill:one sentence that could be a test name}}",
  "",
  "<!-- tpl: SPEC-GOAL, SPEC-GOLDEN. -->",
  "",
  "A leftover `{{fill:` opener named in prose is not a slot.",
].join("\n");

test("docs language flags unfilled template slots", () => {
  expect(specFillFindings(SPEC, TEXT)).toEqual([
    { file: SPEC, line: 3, code: "DOCFILL", message: "unfilled template slot (SPEC-FILL)", weight: 1 },
    { file: SPEC, line: 5, code: "DOCFILL", message: "template guidance comment left in (SPEC-FILL)", weight: 1 },
  ]);
  // Only changed lines count, and the prose line names an opener, not a slot.
  expect(specFillFindings(SPEC, TEXT, { lines: new Set([5]) }).map((finding) => finding.line)).toEqual([5]);
  expect(specFillFindings(SPEC, TEXT, { lines: new Set([7]) })).toEqual([]);
  // Spec records get the check; the template itself and other pages do not.
  expect(isSpecRecord(SPEC)).toBeTrue();
  expect(isSpecRecord("docs/v1/done/M04_001_P1_SKILL_DEMO.md")).toBeTrue();
  expect(isSpecRecord("standards/spec-template.md")).toBeFalse();
  expect(isSpecRecord("docs/architecture/installation.md")).toBeFalse();
});
