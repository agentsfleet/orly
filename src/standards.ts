import { join } from "node:path";

// A standard is a Markdown page of rule blocks. Each block opens with
// `### <ID> — <statement>` and carries the five fields below as
// `- **<Field>:** <value>` lines. Anything else on the page (a template, a
// table) is reference text, not a rule.
export const STANDARDS_DIRECTORY = "standards";
export const RULE_FIELDS = ["Applies to", "Checked by", "Bad", "Good", "Why"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export type RuleBlock = {
  id: string;
  statement: string;
  line: number;
  fields: Partial<Record<RuleField, string>>;
};

const STANDARD_PATTERN = "**/*.md";
const RULE_HEADING = /^### ([A-Z][A-Z0-9-]*[a-z]?) — (.+)$/;
const FIELD_LINE = /^- \*\*([A-Za-z ]+):\*\* (.+)$/;
const ANY_HEADING = /^#{1,3} /;
const NEWLINE = /\r?\n/;

export function standardFiles(root: string): string[] {
  const glob = new Bun.Glob(STANDARD_PATTERN);
  return [...glob.scanSync({ cwd: join(root, STANDARDS_DIRECTORY) })]
    .map((path) => `${STANDARDS_DIRECTORY}/${path}`)
    .sort();
}

export function ruleBlocks(text: string): RuleBlock[] {
  const blocks: RuleBlock[] = [];
  let current: RuleBlock | undefined;
  for (const [index, line] of text.split(NEWLINE).entries()) {
    const heading = line.match(RULE_HEADING);
    if (heading) {
      current = { id: heading[1] ?? "", statement: heading[2] ?? "", line: index + 1, fields: {} };
      blocks.push(current);
      continue;
    }
    if (ANY_HEADING.test(line)) {
      current = undefined;
      continue;
    }
    if (!current) continue;
    const field = line.match(FIELD_LINE);
    const name = field?.[1] ?? "";
    if (field && isRuleField(name)) current.fields[name] = (field[2] ?? "").trim();
  }
  return blocks;
}

export function missingFields(block: RuleBlock): RuleField[] {
  return RULE_FIELDS.filter((field) => !block.fields[field]);
}

function isRuleField(name: string): name is RuleField {
  return (RULE_FIELDS as readonly string[]).includes(name);
}
