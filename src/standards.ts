import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

// A standard is a Markdown page of rule blocks. Each block opens with
// `### <ID> — <statement>` and carries the five fields below as
// `- **<Field>:** <value>` lines. Anything else on the page (a template, a
// table) is reference text, not a rule.
export type RuleField = (typeof RULE_FIELDS)[number];

export type RuleBlock = {
  id: string;
  statement: string;
  line: number;
  fields: Partial<Record<RuleField, string>>;
};

// The inventory accounts for every identifier that predates the standards:
// each one has a home today or a recorded reason it was removed.
type Inventory = z.infer<typeof inventorySchema>;

export const STANDARDS_DIRECTORY = "standards";
export const RULE_INVENTORY = "fixtures/standards-rule-ids.json";
export const MAX_STANDARD_LINES = 400;
export const SPEC_TEMPLATE = `${STANDARDS_DIRECTORY}/spec-template.md`;
export const SPEC_STANDARD = `${STANDARDS_DIRECTORY}/spec.md`;

const RULE_FIELDS = ["Applies to", "Checked by", "Bad", "Good", "Why"] as const;
const STANDARD_PATTERN = "**/*.md";
const RULE_HEADING = /^### ([A-Z][A-Z0-9-]*[a-z]?) — (.+)$/;
const FIELD_LINE = /^- \*\*([A-Za-z ]+):\*\* (.+)$/;
const ANY_HEADING = /^#{1,3} /;
const NEWLINE = /\r?\n/;
const UTF8 = "utf8";
// Zig and Redis left the owner's stack, and RULE UFS was removed by decision.
const RETIRED_STACK = /\b(zig|redis|ufs)\b/i;
const RELATIVE_LINK = /\]\((?!https?:|#|mailto:)([^)#\s]+)(?:#[^)]*)?\)/g;
const SPEC_CITATION = /\bSPEC-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;
const inventorySchema = z.object({ identifiers: z.array(z.string()), removed: z.record(z.string(), z.string()) });

// The one implementation of the catalogue's rules: `orly verify` reports these
// findings, and the catalogue tests assert them. Each finding names its file.
export function catalogueFindings(root: string): string[] {
  const files = existsSync(join(root, STANDARDS_DIRECTORY)) ? standardFiles(root) : [];
  if (files.length === 0) return [`${STANDARDS_DIRECTORY}/: no standard pages`];
  const texts = new Map(files.map((file) => [file, readFileSync(join(root, file), UTF8)]));
  return [
    ...files.flatMap((file) => pageFindings(root, file, texts.get(file) ?? "")),
    ...inventoryFindings(root, texts),
    ...citationFindings(texts),
  ];
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

function standardFiles(root: string): string[] {
  const glob = new Bun.Glob(STANDARD_PATTERN);
  return [...glob.scanSync({ cwd: join(root, STANDARDS_DIRECTORY) })]
    .map((path) => `${STANDARDS_DIRECTORY}/${path}`)
    .sort();
}

function missingFields(block: RuleBlock): RuleField[] {
  return RULE_FIELDS.filter((field) => !block.fields[field]);
}

function pageFindings(root: string, file: string, text: string): string[] {
  const lines = text.split("\n");
  const count = lineCount(lines);
  const incomplete = ruleBlocks(text).filter((block) => missingFields(block).length > 0)
    .map((block) => `${file}:${block.line} ${block.id} lacks ${missingFields(block).join(", ")}`);
  const retired = lines.flatMap((line, index) => RETIRED_STACK.test(line) ? [`${file}:${index + 1} names a retired stack`] : []);
  const long = count > MAX_STANDARD_LINES ? [`${file}: ${count} lines, at most ${MAX_STANDARD_LINES}`] : [];
  const broken = [...text.matchAll(RELATIVE_LINK)].map((match) => match[1] ?? "")
    .filter((target) => !existsSync(join(root, dirname(file), target)))
    .map((target) => `${file}: link to ${target} does not resolve`);
  return [...incomplete, ...retired, ...long, ...broken];
}

// Lines as `wc -l` counts them: the empty string after a final newline is not
// a line, so a 400-line page sits at the cap rather than over it.
function lineCount(lines: string[]): number {
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

function inventoryFindings(root: string, texts: Map<string, string>): string[] {
  const inventory = readInventory(root);
  if (typeof inventory === "string") return [inventory];
  const homes = new Map<string, string[]>();
  for (const [file, text] of texts) {
    for (const block of ruleBlocks(text)) homes.set(block.id, [...homes.get(block.id) ?? [], file]);
  }
  // `Object.hasOwn`, not `in`: an identifier such as `toString` must not count
  // as removed just because every object inherits that name.
  const removed = (id: string) => Object.hasOwn(inventory.removed, id);
  return [
    ...[...homes].filter(([, places]) => places.length > 1).map(([id, places]) => `${id} has ${places.length} homes: ${places.join(", ")}`),
    ...inventory.identifiers.filter((id) => !homes.has(id) && !removed(id)).map((id) => `${RULE_INVENTORY}: ${id} has no home and no removal reason`),
    ...Object.keys(inventory.removed).filter((id) => homes.has(id)).map((id) => `${RULE_INVENTORY}: ${id} is recorded as removed but still has a home`),
  ];
}

function readInventory(root: string): Inventory | string {
  const path = join(root, RULE_INVENTORY);
  if (!existsSync(path)) return `${RULE_INVENTORY}: missing`;
  let text: string;
  try {
    text = readFileSync(path, UTF8);
  } catch (error) {
    return `${RULE_INVENTORY}: cannot be read: ${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    const parsed = inventorySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : `${RULE_INVENTORY}: needs an identifiers list and a removed map`;
  } catch {
    return `${RULE_INVENTORY}: not valid JSON`;
  }
}

// A template that cites a rule the standard dropped sends its author to a rule
// that no longer exists.
function citationFindings(texts: Map<string, string>): string[] {
  const template = texts.get(SPEC_TEMPLATE);
  if (template === undefined) return [];
  const defined = new Set(ruleBlocks(texts.get(SPEC_STANDARD) ?? "").map((block) => block.id));
  const cited = new Set(template.match(SPEC_CITATION) ?? []);
  return [...cited].filter((id) => !defined.has(id)).map((id) => `${SPEC_TEMPLATE} cites ${id}, which ${SPEC_STANDARD} does not define`);
}

function isRuleField(name: string): name is RuleField {
  return (RULE_FIELDS as readonly string[]).includes(name);
}
