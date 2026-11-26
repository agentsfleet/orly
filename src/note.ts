import type { RulesModel } from "./model";

import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH, readConfigSync } from "./config";
import { isObject, isString, OrlyError } from "./model";

type NoteRequest = { quote: string; context?: string; spec?: string; now: Date };

const ACTIVE_SPECS = "docs/v*/active/*.md";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DISCOVERY = /^#{2}[ \t]+Discovery\b/;
const HEADING = /^[ \t]{0,3}(#{1,6})[ \t]/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const LINE_BREAK = /[\r\n]/;

// Append the owner's verbatim words to the Discovery section of the active
// spec, in the form the spec standard asks a deferral to carry.
export async function appendNote(model: RulesModel, root: string, request: NoteRequest): Promise<{ spec: string; line: string }> {
  const quote = request.quote.trim();
  if (!quote || LINE_BREAK.test(quote)) throw new OrlyError("a note is one non-empty line: the owner's words, verbatim");
  if (request.context !== undefined && (!request.context.trim() || LINE_BREAK.test(request.context))) throw new OrlyError("--context takes one non-empty line");
  const owner = ownerOf(model, root);
  const spec = request.spec ?? activeSpec(root);
  const path = join(root, spec);
  if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) throw new OrlyError(`${spec} is not a spec file in this repository`);
  const text = readFileSync(path, "utf8");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const at = insertionPoint(lines);
  if (at === undefined) throw new OrlyError(`${spec} has no "## Discovery" section; add the template's Discovery section first`);
  const line = `- > Owner (${owner}, ${stamp(request.now)}): "${quote}"${request.context ? ` — context: ${request.context.trim()}` : ""}`;
  lines.splice(at, 0, line);
  await Bun.write(path, lines.join(newline));
  return { spec, line };
}

// The owner is named by a persona pack the repository selects, never guessed.
function ownerOf(model: RulesModel, root: string): string {
  const packs = readConfigSync(root)?.packs ?? [];
  for (const pack of packs) {
    const entry = model.packs[pack];
    if (isObject(entry) && isString(entry.owner)) return entry.owner;
  }
  throw new OrlyError(`no selected pack names an owner; add a persona pack that names one to packs in ${CONFIG_PATH}`);
}

function activeSpec(root: string): string {
  const specs = [...new Bun.Glob(ACTIVE_SPECS).scanSync({ cwd: root, onlyFiles: true })].sort();
  if (specs.length === 1 && specs[0]) return specs[0];
  if (specs.length === 0) throw new OrlyError("no spec is active under docs/v*/active/; name one with --spec <PATH>");
  throw new OrlyError(`${specs.length} specs are active (${specs.join(", ")}); name one with --spec <PATH>`);
}

// After the last non-blank line of Discovery, which ends at the next heading
// of its level or above; a heading inside a code fence ends nothing.
function insertionPoint(lines: string[]): number | undefined {
  let fence = "";
  let start: number | undefined;
  let last: number | undefined;
  for (const [index, line] of lines.entries()) {
    const marker = FENCE.exec(line)?.[1] ?? "";
    if (fence) {
      if (marker.startsWith(fence)) fence = "";
    } else if (marker) fence = marker;
    else if (start === undefined) {
      if (DISCOVERY.test(line)) start = last = index;
      continue;
    } else if ((HEADING.exec(line)?.[1]?.length ?? 7) <= 2) break;
    if (start !== undefined && line.trim()) last = index;
  }
  return last === undefined ? undefined : last + 1;
}

function stamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${MONTHS[now.getMonth()]} ${pad(now.getDate())}, ${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
