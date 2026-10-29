import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { isObject, type JsonObject, OrlyError } from "./model";

// orly's skills hand work to gstack and the Elephant-Goldfish Model (EGM), so
// `orly doctor` refuses an agent runtime that lacks either. Which version runs
// is the owner's, because both helpers upgrade themselves.
// Only runtimes present on the machine are checked: a CI runner has none.
const UTF8 = "utf8";
const VERSION_FILE = "VERSION";
const GSTACK = "gstack";
const SKILLS = "skills";
const EGM_PLUGIN = "egm@egm";
const CLAUDE_DIRECTORY = ".claude";
const CODEX_DIRECTORY = ".codex";
const CODEX_HOME = "CODEX_HOME";
const CLAUDE_PLUGIN_RECORD = ["plugins", "installed_plugins.json"];
const CODEX_EGM_CACHE = ["plugins", "cache", "egm", "egm"];
const GITHUB_REPOSITORY = /github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/;

export type HelperSources = { gstack: string; egm: string };
export type HelperHomes = { home: string; codexHome: string };

export function defaultHomes(): HelperHomes {
  const home = homedir();
  return { home, codexHome: Bun.env[CODEX_HOME] || join(home, CODEX_DIRECTORY) };
}

export function helperSources(registry: JsonObject): HelperSources {
  const helpers = registry.helpers;
  const gstack = isObject(helpers) && isObject(helpers.gstack) ? text(helpers.gstack.source) : "";
  const egm = isObject(helpers) && isObject(helpers.egm) ? text(helpers.egm.source) : "";
  if (!gstack || !egm) throw new OrlyError("registry helpers must name the gstack and egm sources");
  return { gstack, egm };
}

export const CLAUDE_CODE = "Claude Code";
export const CODEX = "Codex";

export function agentRuntimes(homes: HelperHomes): string[] {
  return [
    ...(existsSync(join(homes.home, CLAUDE_DIRECTORY)) ? [CLAUDE_CODE] : []),
    ...(existsSync(homes.codexHome) ? [CODEX] : []),
  ];
}

export function missingHelpers(sources: HelperSources, homes: HelperHomes): string[] {
  const runtimes = agentRuntimes(homes);
  return [
    ...(runtimes.includes(CLAUDE_CODE) ? claudeGaps(sources, homes.home) : []),
    ...(runtimes.includes(CODEX) ? codexGaps(sources, homes.codexHome) : []),
  ];
}

function claudeGaps(sources: HelperSources, home: string): string[] {
  const gstack = join(home, CLAUDE_DIRECTORY, SKILLS, GSTACK);
  const install = `git clone ${sources.gstack} ${gstack} && (cd ${gstack} && ./setup)`;
  const plugin = `claude plugin marketplace add ${repository(sources.egm)} && claude plugin install ${EGM_PLUGIN}`;
  return [
    ...(existsSync(join(gstack, VERSION_FILE)) ? [] : [gap(GSTACK, CLAUDE_CODE, install)]),
    ...(claudeHasEgm(join(home, CLAUDE_DIRECTORY, ...CLAUDE_PLUGIN_RECORD)) ? [] : [gap("EGM", CLAUDE_CODE, plugin)]),
  ];
}

function codexGaps(sources: HelperSources, codexHome: string): string[] {
  const install = `git clone ${sources.gstack} ~/gstack && (cd ~/gstack && ./setup --host codex --no-browser)`;
  const plugin = `codex plugin marketplace add ${repository(sources.egm)} && codex plugin add ${EGM_PLUGIN}`;
  const cache = join(codexHome, ...CODEX_EGM_CACHE);
  return [
    ...(existsSync(join(codexHome, SKILLS, GSTACK, VERSION_FILE)) ? [] : [gap(GSTACK, CODEX, install)]),
    ...(existsSync(cache) && readdirSync(cache).length > 0 ? [] : [gap("EGM", CODEX, plugin)]),
  ];
}

function gap(helper: string, runtime: string, install: string): string {
  return `${helper} is not installed for ${runtime}: ${install}`;
}

function repository(source: string): string {
  return source.match(GITHUB_REPOSITORY)?.[1] ?? source;
}

// Claude Code records each installed plugin; a record that does not parse
// cannot show EGM, so it reads as missing.
function claudeHasEgm(record: string): boolean {
  if (!existsSync(record)) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(record, UTF8));
  } catch {
    return false;
  }
  const plugins = isObject(parsed) && isObject(parsed.plugins) ? parsed.plugins : {};
  const installs = plugins[EGM_PLUGIN];
  return Array.isArray(installs) && installs.length > 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
