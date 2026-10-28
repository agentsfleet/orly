import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { isObject, type JsonObject, OrlyError } from "./model";

// orly pins the gstack and Elephant-Goldfish Model (EGM) it was released with.
// A session on the owner's Mac and one in a Codex cloud task must run the same
// skills, so `orly doctor` refuses a machine whose agent runtimes run anything
// else. Only runtimes present on the machine are checked: a CI runner has none.
const PIPE_OUTPUT = "pipe";
const UTF8 = "utf8";
const VERSION_FILE = "VERSION";
const GSTACK = "gstack";
const SKILLS = "skills";
const EGM_PLUGIN = "egm@egm";
const CLAUDE_DIRECTORY = ".claude";
const CODEX_DIRECTORY = ".codex";
const AGENTS_DIRECTORY = ".agents";
const CODEX_HOME = "CODEX_HOME";
const CLAUDE_PLUGIN_RECORD = ["plugins", "installed_plugins.json"];
const CLAUDE_EGM_MARKETPLACE = ["plugins", "marketplaces", "egm"];
const CODEX_EGM_CACHE = ["plugins", "cache", "egm", "egm"];
const GITHUB_REPOSITORY = /github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/;

export type HelperPins = {
  gstack: { source: string; version: string; commit: string };
  egm: { source: string; commit: string };
};
export type HelperHomes = { home: string; codexHome: string };

export function defaultHomes(): HelperHomes {
  const home = homedir();
  return { home, codexHome: Bun.env[CODEX_HOME] || join(home, CODEX_DIRECTORY) };
}

export function helperPins(registry: JsonObject): HelperPins {
  const helpers = registry.helpers;
  const gstack = isObject(helpers) ? helpers.gstack : undefined;
  const egm = isObject(helpers) ? helpers.egm : undefined;
  if (!isObject(gstack) || !isObject(egm)) throw new OrlyError("registry helpers must pin gstack and egm");
  const pins = {
    gstack: { source: text(gstack.source), version: text(gstack.version), commit: text(gstack.commit) },
    egm: { source: text(egm.source), commit: text(egm.commit) },
  };
  const blank = [pins.gstack.source, pins.gstack.version, pins.gstack.commit, pins.egm.source, pins.egm.commit].some((value) => !value);
  if (blank) throw new OrlyError("registry helpers need a source and a commit, and gstack a version");
  return pins;
}

export const CLAUDE_CODE = "Claude Code";
export const CODEX = "Codex";

export function agentRuntimes(homes: HelperHomes): string[] {
  return [
    ...(existsSync(join(homes.home, CLAUDE_DIRECTORY)) ? [CLAUDE_CODE] : []),
    ...(existsSync(homes.codexHome) ? [CODEX] : []),
  ];
}

export function helperDrift(pins: HelperPins, homes: HelperHomes): string[] {
  const runtimes = agentRuntimes(homes);
  return [
    ...(runtimes.includes(CLAUDE_CODE) ? claudeDrift(pins, homes.home) : []),
    ...(runtimes.includes(CODEX) ? codexDrift(pins, homes) : []),
  ];
}

function claudeDrift(pins: HelperPins, home: string): string[] {
  const gstack = join(home, CLAUDE_DIRECTORY, SKILLS, GSTACK);
  const update = `git -C ${gstack} fetch && git -C ${gstack} checkout ${pins.gstack.commit} && (cd ${gstack} && ./setup)`;
  const marketplace = join(home, CLAUDE_DIRECTORY, ...CLAUDE_EGM_MARKETPLACE);
  const reinstall = `git -C ${marketplace} fetch && git -C ${marketplace} checkout ${pins.egm.commit}, then reinstall ${EGM_PLUGIN} in Claude Code`;
  const commits = claudePluginCommits(join(home, CLAUDE_DIRECTORY, ...CLAUDE_PLUGIN_RECORD));
  return [
    ...versionDrift(CLAUDE_CODE, gstack, pins, update),
    ...commitDrift(CLAUDE_CODE, commits, pins, reinstall),
  ];
}

function codexDrift(pins: HelperPins, homes: HelperHomes): string[] {
  const install = `git clone ${pins.gstack.source} ~/gstack && git -C ~/gstack checkout ${pins.gstack.commit} && (cd ~/gstack && ./setup --host codex --no-browser)`;
  const repository = pins.egm.source.match(GITHUB_REPOSITORY)?.[1] ?? pins.egm.source;
  const plugin = `codex plugin marketplace remove egm; codex plugin marketplace add ${repository} --ref ${pins.egm.commit} && codex plugin add ${EGM_PLUGIN}`;
  const shared = join(homes.home, AGENTS_DIRECTORY, SKILLS, GSTACK);
  return [
    ...versionDrift(CODEX, join(homes.codexHome, SKILLS, GSTACK), pins, install),
    ...(existsSync(shared) ? versionDrift(`${CODEX} (${shared})`, shared, pins, install) : []),
    ...commitDrift(CODEX, codexPluginCommits(join(homes.codexHome, ...CODEX_EGM_CACHE)), pins, plugin),
  ];
}

function versionDrift(runtime: string, directory: string, pins: HelperPins, fix: string): string[] {
  const file = join(directory, VERSION_FILE);
  const pinned = `orly pins ${pins.gstack.version} (${pins.gstack.commit.slice(0, 8)})`;
  if (!existsSync(file)) return [`gstack is not installed for ${runtime}; ${pinned}: ${fix}`];
  const found = readFileSync(file, UTF8).trim();
  return found === pins.gstack.version ? [] : [`gstack for ${runtime} is ${found}; ${pinned}: ${fix}`];
}

function commitDrift(runtime: string, commits: string[], pins: HelperPins, fix: string): string[] {
  const pinned = `orly pins ${pins.egm.commit.slice(0, 8)}`;
  if (commits.length === 0) return [`EGM is not installed for ${runtime}; ${pinned}: ${fix}`];
  const other = commits.find((commit) => commit !== pins.egm.commit);
  return other === undefined ? [] : [`EGM for ${runtime} is ${other.slice(0, 8)}; ${pinned}: ${fix}`];
}

// Claude Code records each installed plugin's commit; its cached copy is not a
// Git checkout.
function claudePluginCommits(record: string): string[] {
  if (!existsSync(record)) return [];
  const parsed: unknown = JSON.parse(readFileSync(record, UTF8));
  const plugins = isObject(parsed) && isObject(parsed.plugins) ? parsed.plugins : {};
  const installs = plugins[EGM_PLUGIN];
  if (!Array.isArray(installs)) return [];
  return installs.map((install) => (isObject(install) ? text(install.gitCommitSha) : ""));
}

// Codex keeps each installed plugin version as a Git checkout.
function codexPluginCommits(cache: string): string[] {
  if (!existsSync(cache)) return [];
  return readdirSync(cache).map((version) => gitHead(join(cache, version)));
}

function gitHead(directory: string): string {
  const result = Bun.spawnSync(["git", "-C", directory, "rev-parse", "HEAD"], {
    env: UNSCOPED_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT,
  });
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
