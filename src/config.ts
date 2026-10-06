import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { assertWritableInside, hashContent, isObject, isString, JsonObject, objectValue, OrlyError, readJsonObject, RulesModel, stringArray } from "./model";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { selectPacks, sniffCommands } from "./config_discovery";
import { readExecution, type ExecutionConfig } from "./execution/config";
import { validateCommands, validateSurfaces } from "./validation";
import { validateConfiguration } from "./config_validation";
import { commandLimitsSchema, type LaneLimits } from "./command_limits";

const ORACLE_DIRECTORY = ".orly";
export const CONFIG_PATH = `${ORACLE_DIRECTORY}/orly.json`;

const CONFIG_SCHEMA_VERSION = 1;
const JSON_INDENT = 2;
const NEWLINE = "\n";
const PACKS_FIELD = "packs";
const VERSION_FIELD = "orly_version";
const MANAGED_FIELD = "managed";
const DIGESTS_FIELD = "digests";
const DIGEST_ALGORITHM = "sha256";
const COMMANDS_FIELD = "commands";
const TEXT_ENCODING = "utf8";
// One file per repository. Two regions, one owner each: `packs`, `commands` and
// `surfaces` are the repository's answer and orly only ever reads them;
// `orly_version` and `managed` are orly's record of what it installed and what
// it wrote, rewritten on every install. A round-trip preserves the repository's
// values exactly — they are data, not formatting.
export type RepoConfig = {
  schema_version: number;
  orly_version: string;
  packs: string[];
  commands: Record<string, string[][]>;
  surfaces: JsonObject | undefined;
  managed: string[];
  digests: Record<string, string>;
  execution?: ExecutionConfig | undefined;
  limits?: LaneLimits;
};

export function configPath(targetRoot: string): string {
  return join(targetRoot, CONFIG_PATH);
}

// The repository's own answer to "what are my commands, what extra packs do I
// take". Hand-owned after `orly init` seeds it: orly never rewrites it, so an
// edit here survives every later `orly update`.
export async function readConfig(targetRoot: string): Promise<RepoConfig | undefined> {
  const path = configPath(targetRoot);
  if (!existsSync(path)) return undefined;
  const value = await readJsonObject(path);
  if (value.schema_version !== CONFIG_SCHEMA_VERSION) throw new OrlyError(`${CONFIG_PATH} schema_version must equal ${CONFIG_SCHEMA_VERSION}`);
  return parseConfig(value);
}

// Gate criteria evaluate synchronously — they read exit codes and files, never
// await — so the config they resolve against is read the same way.
export function readConfigSync(targetRoot: string): RepoConfig | undefined {
  const path = configPath(targetRoot);
  if (!existsSync(path)) return undefined;
  const value: unknown = JSON.parse(readFileSync(path, TEXT_ENCODING));
  if (!isObject(value)) throw new OrlyError(`${CONFIG_PATH} must be a JSON object`);
  return parseConfig(value);
}

// One shape check for both readers: the declared commands and surfaces are what
// `orly gate` runs and diffs against, so a malformed one fails here by name
// rather than as a confusing red criterion later.
export function parseConfig(value: JsonObject): RepoConfig {
  if (value.schema_version !== CONFIG_SCHEMA_VERSION) throw new OrlyError(`${CONFIG_PATH} schema_version must equal ${CONFIG_SCHEMA_VERSION}`);
  validateConfiguration(value);
  const errors: string[] = [];
  if (value[COMMANDS_FIELD] !== undefined) validateCommands(CONFIG_PATH, value[COMMANDS_FIELD], errors);
  validateSurfaces(CONFIG_PATH, value.surfaces, errors);
  if (errors.length > 0) throw new OrlyError(errors.join("\n"));
  const version = value[VERSION_FIELD];
  return {
    schema_version: CONFIG_SCHEMA_VERSION,
    orly_version: isString(version) ? version : "",
    packs: stringArray(value[PACKS_FIELD] ?? [], `${CONFIG_PATH} ${PACKS_FIELD}`),
    commands: readCommands(value[COMMANDS_FIELD]),
    surfaces: isObject(value.surfaces) ? value.surfaces : undefined,
    managed: stringArray(value[MANAGED_FIELD] ?? [], `${CONFIG_PATH} ${MANAGED_FIELD}`),
    digests: readDigests(value[DIGESTS_FIELD]),
    execution: readExecution(value.execution),
    ...(isObject(value.limits) ? { limits: Object.fromEntries(Object.entries(value.limits).map(([lane, limits]) => [lane, commandLimitsSchema.parse(limits)])) } : {}),
  };
}

// Absent in a config written before digests existed, and absent per-file for
// anything orly did not author (a hook it declined to overwrite). Both cases
// read as "no claim", which is what keeps an older checkout green until its
// next update rather than failing it for a record it never had.
function readDigests(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isObject(value)) throw new OrlyError(`${CONFIG_PATH} digests must be an object`);
  const digests: Record<string, string> = {};
  for (const [path, digest] of Object.entries(value)) if (isString(digest)) digests[path] = digest;
  return digests;
}

/// The digest orly records for content it wrote, and recomputes to check it.
///
/// Algorithm-prefixed, and not for elegance: a bare 64-character hex string is
/// indistinguishable from a credential to an entropy-based secret scanner, and
/// gitleaks refused the very first commit that carried these — in EVERY
/// consuming repository at once, since `orly update` writes one per managed
/// file. The prefix is what makes the value self-describing enough to pass,
/// and the alternative was a scanner suppression, which is how a real
/// credential eventually rides through.
export function contentDigest(bytes: Uint8Array): string {
  return `${DIGEST_ALGORITHM}:${hashContent(bytes)}`;
}

// Tolerates the unprefixed spelling 0.10.2 wrote for its one release, so a
// checkout installed on that version is not reported as wholly drifted before
// its next update — a format change is not an edit, and saying so would be the
// false alarm that teaches people to ignore the real ones.
export function sameDigest(recorded: string, actual: string): boolean {
  const bare = (digest: string) => digest.startsWith(`${DIGEST_ALGORITHM}:`) ? digest.slice(DIGEST_ALGORITHM.length + 1) : digest;
  return bare(recorded) === bare(actual);
}

// What orly installed here, and whether the engine has moved since.
export function staleVersion(config: RepoConfig, installedVersion: string): string | undefined {
  if (config.orly_version === installedVersion) return undefined;
  return `ruleset was installed by orly ${config.orly_version || "an unrecorded version"}, installed engine is ${installedVersion} — run \`orly update\``;
}

const PIPE_OUTPUT = "pipe";

// Which of these paths git refuses to track. `check-ignore` prints one ignored
// path per line and exits 1 when none match, which is not an error here.
function ignoredPaths(targetRoot: string, paths: string[]): Set<string> {
  if (paths.length === 0) return new Set();
  const result = Bun.spawnSync(["git", "check-ignore", "--", ...paths], {
    cwd: targetRoot,
    env: UNSCOPED_ENVIRONMENT,
    stdout: PIPE_OUTPUT,
    stderr: PIPE_OUTPUT,
  });
  const printed = result.stdout.toString().trim();
  if (printed.length === 0) return new Set();
  return new Set(printed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

// A managed file that is gone, or one git will not carry. Edits are not drift:
// the tree is a git repository, so `git diff` shows a hand edit and shows
// `orly update` replacing it, both before either is committed.
//
// An ignored file is drift even though it sits right there on disk. orly wrote
// it, the local checkout gates on it, and a clone never receives it — so the
// author passes and everybody else fails, which is the one failure the install
// record exists to rule out.
export function managedDrift(targetRoot: string, config: RepoConfig): string[] {
  const missing = config.managed.filter((relativePath) => !existsSync(join(targetRoot, relativePath)));
  const present = config.managed.filter((relativePath) => !missing.includes(relativePath));
  const ignored = ignoredPaths(targetRoot, present);
  return [
    ...missing.map((relativePath) => `managed file is missing: ${relativePath} — run \`orly update\` to restore it`),
    ...present
      .filter((relativePath) => ignored.has(relativePath))
      .map((relativePath) => `managed file is ignored by git: ${relativePath} — orly wrote it and a clone will not receive it; scope the .gitignore rule that excludes it`),
    ...editedManaged(targetRoot, config, present),
  ].sort();
}

// A managed file whose CONTENT no longer matches what orly wrote.
//
// The half `managedDrift` was missing, and the gap was not theoretical: a
// consuming repository added two checks straight to a materialised gate script,
// the pack never learned them, and the next update deleted them — while doctor
// reported green throughout, because it verified that the file EXISTED and
// never that it still said what orly put there. A gate whose checks can be
// removed under a passing verifier is not a gate.
//
// The remedy for a hit is deliberately not `orly update`: the local content may
// be the better version, as it was in that case. Update overwrites it; the
// message says to move the change into the source instead, which is the only
// way it reaches every other consumer.
function editedManaged(targetRoot: string, config: RepoConfig, present: string[]): string[] {
  return present.flatMap((relativePath) => {
    const recorded = config.digests[relativePath];
    if (!recorded) return [];
    const actual = contentDigest(readFileSync(join(targetRoot, relativePath)));
    if (sameDigest(recorded, actual)) return [];
    return [`managed file was edited after orly wrote it: ${relativePath} — move the change into the pack source, or explicitly use \`orly update --force\` to discard it`];
  });
}

// Key order is fixed so a rewrite produces a reviewable diff: orly's own two
// fields sit at the ends, the repository's three in the middle, untouched.
export async function writeConfig(targetRoot: string, config: RepoConfig): Promise<string> {
  assertWritableInside(targetRoot, CONFIG_PATH, "config");
  const path = configPath(targetRoot);
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, serialiseConfig(config));
  return path;
}

export function serialiseConfig(config: RepoConfig): string {
  const ordered = {
    schema_version: config.schema_version,
    orly_version: config.orly_version,
    packs: config.packs,
    commands: config.commands,
    ...(config.surfaces ? { surfaces: config.surfaces } : {}),
    ...(config.execution ? { execution: config.execution } : {}),
    ...(config.limits ? { limits: config.limits } : {}),
    managed: [...config.managed].sort(),
    digests: Object.fromEntries(Object.entries(config.digests).sort(([a], [b]) => a.localeCompare(b))),
  };
  return `${JSON.stringify(ordered, undefined, JSON_INDENT)}${NEWLINE}`;
}

// Seeded once, on the install that finds no config. The commands are a guess
// from what the repository already builds with; an empty set is honest rather
// than wrong, and says so in the gate's own failure message.
export async function seedConfig(targetRoot: string): Promise<RepoConfig> {
  return { schema_version: CONFIG_SCHEMA_VERSION, orly_version: "", packs: [], commands: await sniffCommands(targetRoot), surfaces: undefined, managed: [], digests: {} };
}

// What this repository installed and runs with, read from its own `.orly/`.
// Every caller that used to ask a central registry "which profile is this
// checkout" asks the checkout instead, so the answer travels with the clone.
export async function localSelection(model: RulesModel, targetRoot: string): Promise<{ packs: string[]; commands: Record<string, string[][]>; surfaces: JsonObject | undefined }> {
  const config = await readConfig(targetRoot);
  return { packs: selectPacks(model, targetRoot, config?.packs ?? [], new Set(config?.managed ?? [])), commands: config?.commands ?? {}, surfaces: config?.surfaces };
}

function readCommands(value: unknown): Record<string, string[][]> {
  if (value === undefined) return {};
  const commands: Record<string, string[][]> = {};
  for (const [key, invocations] of Object.entries(objectValue(value, `${CONFIG_PATH} ${COMMANDS_FIELD}`))) {
    if (!Array.isArray(invocations)) throw new OrlyError(`${CONFIG_PATH} ${COMMANDS_FIELD}.${key} must be an array of invocations`);
    commands[key] = invocations.map((invocation) => stringArray(invocation, `${CONFIG_PATH} ${COMMANDS_FIELD}.${key}`));
  }
  return commands;
}
