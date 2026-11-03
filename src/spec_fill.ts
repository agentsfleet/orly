import type { DocFinding, DocScanOptions } from "./doc_rules";

const DOC_FILL = "DOCFILL";
const SPEC_RECORD = /^docs\/v\d+(?:\.\d+)*\/(pending|active|done)\//;
const NEWLINE = /\r?\n/;
// A whole slot, or the opening of a guidance comment, as the spec template
// writes them. A slot opener named in prose has no closing braces and passes.
const LEFTOVERS: Array<[RegExp, string]> = [
  [/\{\{fill:[^}\n]*\}\}/, "unfilled template slot (SPEC-FILL)"],
  [/<!--\s*tpl:/, "template guidance comment left in (SPEC-FILL)"],
];

// Specs keep their own dense register and stay outside the prose rules.
export function isSpecRecord(file: string): boolean {
  return SPEC_RECORD.test(file);
}

// The one mechanical check a changed spec line gets: nothing copied from the
// template is left unfilled.
export function specFillFindings(file: string, text: string, options: DocScanOptions = {}): DocFinding[] {
  const findings: DocFinding[] = [];
  for (const [index, line] of text.split(NEWLINE).entries()) {
    const number = index + 1;
    if (options.lines && !options.lines.has(number)) continue;
    for (const [pattern, message] of LEFTOVERS) {
      if (pattern.test(line)) findings.push({ file, line: number, code: DOC_FILL, message, weight: 1 });
    }
  }
  return findings;
}
