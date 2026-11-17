import { realpathSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { isString, MODE_REGULAR, modeLabel, objectArray, objectValue, OrlyError, type RulesModel } from "../model";
import { AGENTS_FILENAME, ORLY_AGENTS_FILENAME, type Layout } from "../loaders";
import { renderProfileText } from "../references";
import { Renderer } from "../render";

const MARKDOWN_EXTENSION = ".md";
const SKILLS_SEGMENT = "/skills/";
const CLAUDE_AGENTS = ".claude/agents/";
export type PlannedFile = { target: string; content: Uint8Array; mode: string };

function installedPath(target: string): string {
  if (target.startsWith(".orly/")) return target;
  if (target.startsWith(CLAUDE_AGENTS) || target.includes(SKILLS_SEGMENT)) return target;
  return `.orly/${target}`;
}

function installedReferences(text: string, paths: Set<string>): string {
  return text.replaceAll("`../.orly/AGENTS.md`", "`../AGENTS.md`").replaceAll("](../.orly/AGENTS.md)", "](../AGENTS.md)")
    .replaceAll("](.orly/AGENTS.md)", "](AGENTS.md)")
    .replace(/(?<![\w./-])standards\//g, ".orly/standards/")
    .replace(/(?<![\w./-])docs\/[A-Z][A-Z_0-9.]+\.md/g, (path) => paths.has(path) ? `.orly/${path}` : path);
}

// One entry per target, so two packs naming the same file collapse instead of
// racing. Two packs naming DIFFERENT sources for one target is a registry bug
// and stops the install rather than letting pack order decide the winner.
export async function planFiles(model: RulesModel, packs: string[], commands: Record<string, string[][]>, targetRoot: string, orlyFile: string): Promise<PlannedFile[]> {
  const registryPacks = model.packs;
  const known = new Set(Object.keys(registryPacks));
  const paths = new Set(Object.values(registryPacks).flatMap((pack) => objectArray(objectValue(pack, "pack").managed_files, "managed files").map((entry) => String(entry.target))));
  const planned = new Map<string, PlannedFile>();
  const sources = new Map<string, string>();
  for (const name of packs) {
    const pack = objectValue(registryPacks[name], `pack ${name}`);
    for (const entry of objectArray(pack.managed_files, `pack ${name} managed_files`)) {
      if (!isString(entry.source) || !isString(entry.target)) throw new OrlyError(`pack ${name} managed file must carry string source and target`);
      const target = installedPath(entry.target);
      const claimed = sources.get(target);
      if (claimed && claimed !== entry.source) throw new OrlyError(`packs disagree on ${target}: ${claimed} and ${entry.source}`);
      sources.set(target, entry.source);
      const path = join(model.root, entry.source);
      // Never overwrite the engine's pack sources with filtered consumer copies.
      if (resolved(model.root) === resolved(targetRoot)) continue;
      planned.set(target, { target, content: await managedContent(path, target, entry.source, packs, known, orlyFile, paths), mode: modeLabel(path) });
    }
  }
  const rendered = await new Renderer(model).renderText(packs, commands);
  planned.set(orlyFile, { target: orlyFile, content: new TextEncoder().encode(orlyFile === AGENTS_FILENAME ? rendered : installedReferences(rendered, paths)), mode: MODE_REGULAR });
  return [...planned.values()].sort((left, right) => left.target.localeCompare(right.target));
}

export function resolveLayout(model: RulesModel, targetRoot: string): Layout {
  // The engine owns its render; consumers retain their own AGENTS.md.
  if (resolved(model.root) === resolved(targetRoot)) return { orlyFile: AGENTS_FILENAME };
  return { orlyFile: ORLY_AGENTS_FILENAME, pointerHost: AGENTS_FILENAME };
}

function resolved(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

// Installation and verification use the same filtered bytes for each pack.
export async function managedContent(path: string, target: string, source: string, packs: string[], known: Set<string>, orlyFile: string, paths: Set<string> = new Set()): Promise<Uint8Array> {
  const bytes = await Bun.file(path).bytes();
  if (extname(target) !== MARKDOWN_EXTENSION) return bytes;
  const filtered = renderProfileText(new TextDecoder().decode(bytes), new Set(packs), known, source);
  const retargeted = target.startsWith(".orly/") ? retargetRulesCitations(filtered, orlyFile) : filtered;
  return new TextEncoder().encode(`${orlyFile === AGENTS_FILENAME ? retargeted : installedReferences(retargeted, paths)}\n`);
}

// Managed rule citations must point to Orly's file, not the consumer's own rules.
function retargetRulesCitations(text: string, orlyFile: string): string {
  if (orlyFile === AGENTS_FILENAME) return text;
  return text
    .replaceAll(`](${AGENTS_FILENAME})`, `](${orlyFile})`)
    .replaceAll(`](../${AGENTS_FILENAME})`, `](../${orlyFile})`)
    // The relative spelling first: `../AGENTS.md` contains `AGENTS.md`, so the
    // bare rule below would rewrite its tail and leave the `../` stranded.
    // Missing it is what rendered `[`../AGENTS.md`](../AGENTS.orly.md)` into
    // four managed pages — a label naming one file over a link to another.
    .replaceAll(`\`../${AGENTS_FILENAME}\``, `\`../${orlyFile}\``)
    .replaceAll(`\`${AGENTS_FILENAME}\``, `\`${orlyFile}\``);
}
