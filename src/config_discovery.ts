import { existsSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { isObject, objectValue, OrlyError, readJsonObject, stringArray, type RulesModel } from "./model";
import { CONFIG_PATH } from "./config";

const NEWLINE = "\n";
const REGISTRY_PACKS_LABEL = "registry packs";
const EXTENSIONS_FIELD = "extensions";
const CONFORM_COMMAND = "conform";
const MAKE_COMMAND = "make";
const BUN_COMMAND = "bun";
const RUN_SUBCOMMAND = "run";
const MAKEFILE = "Makefile";
const PACKAGE_MANIFEST = "package.json";
const SCRIPTS_FIELD = "scripts";
const LINT_ALL_TARGET = "lint-all";
const LINT_TARGET = "lint";
const BUILD_TARGET = "build";
const TARGET_PATTERN = /^([A-Za-z0-9][A-Za-z0-9_.-]*):/;
const INCLUDE_PATTERN = /^-?include\s+(\S+)/;

// Packs a repository only receives when it asks: Kishore's own address handles
// and agentsfleet's product surface mean nothing in a stranger's checkout, so
// they are never inferred — `.orly/orly.json` names them or they stay out.
const OPT_IN_PACKS = ["persona.indy", "product.agentsfleet", "workflow.governance"];

// Directories that are never the repository's own source: scanning them makes
// a Rust crate look like it writes TypeScript because one dependency does.
const SKIPPED_DIRECTORIES = new Set([".git", ".oracle", ".orly", "node_modules", "vendor", "third_party", "target", "dist", "build", ".zig-cache", "zig-out", ".venv", "__pycache__", ".next", ".turbo", ".cache", "coverage", "out"]);
const SCAN_DEPTH = 4;

// A Makefile target or package script orly knows how to map onto a gate
// command. The first match wins, so the more specific name is listed first.
const CONFORM_TARGETS = ["harness-verify", "conform", "audit", LINT_ALL_TARGET, LINT_TARGET];
const VERIFY_TARGETS: Array<[string, string[]]> = [
  ["verify.lint", [LINT_ALL_TARGET, LINT_TARGET]],
  ["verify.unit", ["test-unit-all", "test-unit", "test"]],
  ["verify.integration", ["test-integration"]],
  ["verify.memory", ["memleak"]],
  ["verify.version", ["check-version"]],
  ["verify.build", [BUILD_TARGET]],
];

// Which packs this repository takes: every always-on pack, the language packs
// whose extensions actually appear in its tree, plus whatever it opted into.
// No profile name, no central registry — the repository decides by its own
// contents, so a fresh clone installs correctly with nothing to look up.
export function selectPacks(model: RulesModel, targetRoot: string, requested: string[], managed: Set<string> = new Set()): string[] {
  const packs = objectValue(model.registry.packs, REGISTRY_PACKS_LABEL);
  const present = scanExtensions(targetRoot, managed);
  const selected = new Set<string>();
  for (const [name, value] of Object.entries(packs)) {
    if (OPT_IN_PACKS.includes(name)) continue;
    const extensions = isObject(value) ? stringArray(value[EXTENSIONS_FIELD] ?? [], `pack ${name} ${EXTENSIONS_FIELD}`) : [];
    if (extensions.length === 0 || extensions.some((extension) => present.has(extension))) selected.add(name);
  }
  for (const name of requested) {
    if (!(name in packs)) throw new OrlyError(`${CONFIG_PATH} names an unknown pack: ${name} (available: ${Object.keys(packs).sort().join(", ")})`);
    selected.add(name);
  }
  return [...selected].sort();
}

// Every file extension the repository's OWN source uses. Bounded in depth and
// blind to dependency directories, so the walk stays cheap on a large tree.
// Files orly itself materialised are excluded: the gate scripts it writes are
// shell, so counting them would select the shell pack on the second install,
// which writes more shell, which selects more — a set that never settles.
function scanExtensions(targetRoot: string, managed: Set<string>, depth = SCAN_DEPTH): Set<string> {
  const found = new Set<string>();
  const walk = (directory: string, remaining: number): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (remaining > 0 && !SKIPPED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name), remaining - 1);
        continue;
      }
      const relativePath = relative(targetRoot, join(directory, entry.name)).replaceAll("\\", "/");
      if (managed.has(relativePath)) continue;
      const extension = extname(entry.name);
      if (extension.length > 0) found.add(extension);
    }
  };
  walk(targetRoot, depth);
  return found;
}

export async function sniffCommands(targetRoot: string): Promise<Record<string, string[][]>> {
  const make = await makeTargets(targetRoot);
  const scripts = await packageScripts(targetRoot);
  const commands: Record<string, string[][]> = {};
  const conform = pick(CONFORM_TARGETS, make, scripts);
  if (conform) commands[CONFORM_COMMAND] = [conform];
  for (const [key, candidates] of VERIFY_TARGETS) {
    const found = pick(candidates, make, scripts);
    // A repository with only `lint` matches both conform and verify.lint. The
    // gate would then run one command twice, in two tiers, for one signal.
    if (found && !(conform && sameInvocation(found, conform))) commands[key] = [found];
  }
  return commands;
}

function sameInvocation(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((argument, index) => argument === right[index]);
}

function pick(candidates: string[], make: Set<string>, scripts: Set<string>): string[] | undefined {
  for (const candidate of candidates) {
    if (make.has(candidate)) return [MAKE_COMMAND, candidate];
    if (scripts.has(candidate)) return [BUN_COMMAND, RUN_SUBCOMMAND, candidate];
  }
  return undefined;
}

// Target names as the Makefile declares them: a line starting at column zero,
// up to the first colon. `include` is followed one level deep — a modular
// Makefile keeps every real target in make/*.mk, so a root-only read finds
// nothing but `help`. Enough to know a target exists, which is all the seed
// needs; the agent completing the config reads the file properly.
async function makeTargets(targetRoot: string): Promise<Set<string>> {
  const targets = new Set<string>();
  const root = join(targetRoot, MAKEFILE);
  if (!existsSync(root)) return targets;
  const files = [root, ...(await includedMakefiles(targetRoot, root))];
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of (await Bun.file(file).text()).split(NEWLINE)) {
      const match = TARGET_PATTERN.exec(line);
      if (match?.[1]) targets.add(match[1]);
    }
  }
  return targets;
}

async function includedMakefiles(targetRoot: string, root: string): Promise<string[]> {
  const included: string[] = [];
  for (const line of (await Bun.file(root).text()).split(NEWLINE)) {
    const match = INCLUDE_PATTERN.exec(line);
    if (match?.[1]) included.push(join(targetRoot, match[1].trim()));
  }
  return included;
}

async function packageScripts(targetRoot: string): Promise<Set<string>> {
  const path = join(targetRoot, PACKAGE_MANIFEST);
  if (!existsSync(path)) return new Set();
  try {
    const manifest = await readJsonObject(path);
    const scripts = manifest[SCRIPTS_FIELD];
    return isObject(scripts) ? new Set(Object.keys(scripts)) : new Set();
  } catch {
    return new Set();
  }
}
