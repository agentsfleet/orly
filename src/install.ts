import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { CONFIG_PATH, contentDigest, readConfig, seedConfig, selectPacks, writeConfig } from "./config";
import { applyMode, assertWritableInside, hashContent, isBelow, isString, JsonObject, modeLabel, objectArray, objectValue, OrlyError, RulesModel, stringArray } from "./model";
import { AGENTS_FILENAME, GENERATED_BANNER, installLoaders, Layout, loaderTargets, ORLY_AGENTS_FILENAME } from "./loaders";
import { referenceClosureErrors, renderProfileText } from "./references";
import { Renderer } from "./render";
import { HOOK_INVOCATION_ENV, HOOK_INVOCATION_VALUE } from "./telemetry";

const HOOKS_DIRECTORY = ".githooks";
const REGISTRY_PACKS_LABEL = "registry packs";
const STAGE_PREFIX = "orly-install-";
const MARKDOWN_EXTENSION = ".md";
const SKILLS_SEGMENT = "/skills/";
const MODE_EXECUTABLE = "0755";
const MODE_REGULAR = "0644";
const GIT_COMMAND = "git";
const GIT_REPO_FLAG = "-C";
const PIPE_OUTPUT = "pipe";
const HOOK_GATES = [["pre-commit", "work"], ["pre-push", "verify"]] as const;
const GIT_CONFIG_SUBCOMMAND = "config";
const HOOKS_PATH_KEY = "core.hooksPath";
const MANAGED_FILE_KIND = "managed file";
const HOOK_KIND = "hook";

export type InstallError = { path: string; message: string; suggestion: string };

export type InstallResult = {
  ok: boolean;
  packs: string[];
  written: string[];
  skipped: string[];
  errors: InstallError[];
};

export type InstallOptions = {
  targetRoot: string;
  force: boolean;
  installHooks: boolean;
  orlyVersion: string;
};

type PlannedFile = { target: string; content: Uint8Array; mode: string };

// Validate the planned files before writing them. Later filesystem failures
// can still leave a partial installation; inspect the diff before retrying.
export async function install(model: RulesModel, options: InstallOptions): Promise<InstallResult> {
  const targetRoot = resolve(options.targetRoot);
  requireWorkTree(targetRoot);
  const existing = await readConfig(targetRoot);
  const config = existing ?? await seedConfig(targetRoot);
  const packs = selectPacks(model, targetRoot, config.packs, new Set(config.managed));

  const layout = resolveLayout(model, targetRoot);
  const planned = await planFiles(model, packs, config.commands, targetRoot, layout.orlyFile);
  const managed = new Set(config.managed);
  const refusals: InstallError[] = [];
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of planned) {
    const escape = escapesTarget(targetRoot, file.target, MANAGED_FILE_KIND);
    if (escape) { refusals.push(escape); continue; }
    const path = join(targetRoot, file.target);
    if (!existsSync(path)) { written.push(file.target); continue; }
    // Already exactly what this run would write — leave it and say so.
    if (hashContent(await Bun.file(path).bytes()) === hashContent(file.content) && modeLabel(path) === file.mode) { skipped.push(file.target); continue; }
    // The lock is the record of authorship: a file orly wrote is orly's to
    // replace, and git shows the replacement before it is committed. A file
    // orly never wrote belongs to the repository and is never touched silently.
    if (options.force || managed.has(file.target)) { written.push(file.target); continue; }
    // The generated banner is authorship evidence in its own right, and the
    // only evidence available for a repository installed before managed[]
    // tracked anything — this checkout among them. Without it, orly's own
    // render reads as a stranger's file and every update refuses.
    if (file.target === layout.orlyFile && (await Bun.file(path).text()).startsWith(GENERATED_BANNER)) { written.push(file.target); continue; }
    refusals.push(refusal(file.target));
  }
  if (options.installHooks) {
    const claim = hooksClaimedByAnother(targetRoot);
    if (claim && !options.force) refusals.push(claim);
    for (const [name, gate] of HOOK_GATES) {
      const target = `${HOOKS_DIRECTORY}/${name}`;
      const escape = escapesTarget(targetRoot, target, HOOK_KIND);
      if (escape) { refusals.push(escape); continue; }
      const authorship = await hookAuthorship(targetRoot, target, gate, managed, options.force);
      if (authorship) refusals.push(authorship);
    }
  }
  const configEscape = escapesTarget(targetRoot, CONFIG_PATH, "config");
  if (configEscape) refusals.push(configEscape);
  // The loaders are writes like any other, and the only ones orly aims at files
  // it does not own — so they need the guard most, not least. A committed
  // AGENTS.md symlink pointing outside the repository otherwise carried the
  // pointer block wherever the link led, and reported it as an ordinary success.
  for (const [target, kind] of loaderTargets(layout)) {
    const escape = escapesTarget(targetRoot, target, kind);
    if (escape) refusals.push(escape);
  }
  if (refusals.length > 0) return { ok: false, packs, written: [], skipped, errors: refusals };

  const closure = await stageAndCommit(model, targetRoot, planned, written);
  if (closure.length > 0) return { ok: false, packs, written: [], skipped, errors: closure };

  // After the managed files land, so a repository whose install refused for any
  // other reason never carries a loader pointing at rules that were not written.
  const loaders = await installLoaders(targetRoot, layout);
  written.push(...loaders.written);
  skipped.push(...loaders.skipped);
  const hooks = options.installHooks ? await installHooks(targetRoot) : { written: [], all: [] };
  written.push(...hooks.written);
  skipped.push(...hooks.all.filter((path) => !hooks.written.includes(path)));
  // One file carries both halves: the repository's own fields pass through
  // untouched, orly's two record what this run installed and wrote.
  // Digests cover `planned` only. Hooks are managed — orly restores a missing
  // one — but it does not always AUTHOR them: it refuses to overwrite a hook it
  // did not write. Recording a digest for a file whose content belongs to the
  // repository would report the repository's own edits as drift.
  await writeConfig(targetRoot, {
    ...config,
    orly_version: options.orlyVersion,
    managed: [...planned.map((file) => file.target), ...hooks.all],
    digests: Object.fromEntries(planned.map((file) => [file.target, contentDigest(file.content)])),
  });
  if (!existing) written.push(CONFIG_PATH);
  return { ok: true, packs, written: written.sort(), skipped: skipped.sort(), errors: [] };
}

// A committed symlink inside the target repository — planted by that
// repository's own author, not the person running init — otherwise lets a
// managed-file or hook write follow it and land anywhere the invoking user
// can write. Checked up front, before anything is staged, so it reports as
// a normal refusal rather than a mid-write failure; assertWritableInside
// runs again at the actual write as a last-line guard against a target
// that changed underneath the run.
function escapesTarget(targetRoot: string, target: string, kind: string): InstallError | undefined {
  try {
    assertWritableInside(targetRoot, target, kind);
    return undefined;
  } catch (error) {
    return { path: target, message: error instanceof Error ? error.message : String(error), suggestion: "remove or fix the symlink in the target repository before installing" };
  }
}

// A hook is a managed file that happens to be generated rather than copied, and
// it earns the same authorship rule: one orly wrote is orly's to replace, one
// the repository wrote is the repository's. Without this, installHooks wrote
// unconditionally — a repository whose own pre-commit ran its test suite lost
// it to `orly init` silently, counted as an ordinary write in the success line.
async function hookAuthorship(targetRoot: string, target: string, gate: string, managed: Set<string>, force: boolean): Promise<InstallError | undefined> {
  if (force || managed.has(target)) return undefined;
  const path = join(targetRoot, target);
  if (!existsSync(path)) return undefined;
  // Byte-identical to what this run would write: an install that predates hook
  // tracking, not someone else's hook. Replacing it changes nothing.
  if ((await Bun.file(path).text()) === hookScript(gate)) return undefined;
  return { path: target, message: "a hook already exists here and orly did not write it", suggestion: "move it aside, re-run with --force to replace it, or use --no-hooks" };
}

function refusal(target: string): InstallError {
  return { path: target, message: "a file already exists here and orly did not write it", suggestion: "move it aside, or re-run with --force to replace it" };
}

// Check references in the staged payload. Stage inside the repository because
// rename cannot move files across filesystem boundaries.
async function stageAndCommit(model: RulesModel, targetRoot: string, planned: PlannedFile[], written: string[]): Promise<InstallError[]> {
  const stagingParent = join(targetRoot, dirname(CONFIG_PATH));
  const stagingParentExisted = existsSync(stagingParent);
  mkdirSync(stagingParent, { recursive: true });
  const stage = mkdtempSync(join(stagingParent, STAGE_PREFIX));

  // On failure, remove an empty .oracle/ only if this call created it.
  const cleanupStagingParentIfEmpty = () => {
    rmSync(stage, { recursive: true, force: true });
    if (!stagingParentExisted && existsSync(stagingParent) && readdirSync(stagingParent).length === 0) rmSync(stagingParent, { recursive: true, force: true });
  };

  try {
    for (const file of planned) {
      const path = join(stage, file.target);
      mkdirSync(dirname(path), { recursive: true });
      await Bun.write(path, file.content);
      applyMode(path, file.mode);
    }
    // Skills may name optional language guides that this repository does not use.
    const markdown = planned
      .filter((file) => extname(file.target) === MARKDOWN_EXTENSION && !file.target.includes(SKILLS_SEGMENT))
      .map((file) => join(stage, file.target));
    const missing = await referenceClosureErrors(stage, markdown, targetRoot);
    if (missing.length > 0) {
      cleanupStagingParentIfEmpty();
      return missing.map((message) => ({ path: AGENTS_FILENAME, message, suggestion: "select the pack that provides the cited file, or amend the citation" }));
    }

    const targets = new Set(written);
    for (const file of planned.filter((candidate) => targets.has(candidate.target))) {
      assertWritableInside(targetRoot, file.target, MANAGED_FILE_KIND);
      const destination = join(targetRoot, file.target);
      mkdirSync(dirname(destination), { recursive: true });
      renameSync(join(stage, file.target), destination);
      applyMode(destination, file.mode);
    }
    rmSync(stage, { recursive: true, force: true });
    return [];
  } catch (error) {
    cleanupStagingParentIfEmpty();
    throw error;
  }
}

// Retargeting another tool's hooks would silently disable its checks.
function hooksClaimedByAnother(targetRoot: string): InstallError | undefined {
  const result = Bun.spawnSync([GIT_COMMAND, GIT_REPO_FLAG, targetRoot, GIT_CONFIG_SUBCOMMAND, "--get", HOOKS_PATH_KEY], { stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, env: UNSCOPED_ENVIRONMENT });
  if (result.exitCode !== 0) return undefined;
  const existing = result.stdout.toString().trim();
  if (existing === "" || existing === HOOKS_DIRECTORY) return undefined;
  return { path: HOOKS_PATH_KEY, message: `already set to '${existing}', not the directory this install manages`, suggestion: "run with --no-hooks to leave it alone, or --force to retarget it" };
}

// Consumer hooks use the installed executable, independent of this checkout.
async function installHooks(targetRoot: string): Promise<{ written: string[]; all: string[] }> {
  for (const [name] of HOOK_GATES) assertWritableInside(targetRoot, `${HOOKS_DIRECTORY}/${name}`, HOOK_KIND);
  const directory = join(targetRoot, HOOKS_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const written: string[] = [];
  const all: string[] = [];
  for (const [name, gate] of HOOK_GATES) {
    const path = join(directory, name);
    const script = hookScript(gate);
    all.push(`${HOOKS_DIRECTORY}/${name}`);
    if (existsSync(path) && (await Bun.file(path).text()) === script && modeLabel(path) === MODE_EXECUTABLE) continue;
    await Bun.write(path, script);
    applyMode(path, MODE_EXECUTABLE);
    written.push(`${HOOKS_DIRECTORY}/${name}`);
  }
  runGit(targetRoot, [GIT_CONFIG_SUBCOMMAND, HOOKS_PATH_KEY, HOOKS_DIRECTORY]);
  return { written, all };
}

function hookScript(gate: string): string {
  return [
    "#!/usr/bin/env bash",
    "# Generated by orly. Re-run `orly init` to refresh.",
    "set -euo pipefail",
    "",
    "# git exports these to every hook; inherited by a spawned git they pin it to",
    "# the hook's repository instead of the one being judged.",
    "unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_PREFIX \\",
    "      GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "",
    'if ! command -v orly >/dev/null 2>&1; then',
    "    printf '%s\\n' 'orly: not on PATH — install it with `bun add -g @agentsfleet/orly`' >&2",
    "    exit 1",
    "fi",
    "",
    `export ${HOOK_INVOCATION_ENV}=${HOOK_INVOCATION_VALUE}`,
    `exec orly gate ${gate}`,
    "",
  ].join("\n");
}
// One entry per target, so two packs naming the same file collapse instead of
// racing. Two packs naming DIFFERENT sources for one target is a registry bug
// and stops the install rather than letting pack order decide the winner.
async function planFiles(model: RulesModel, packs: string[], commands: Record<string, string[][]>, targetRoot: string, orlyFile: string): Promise<PlannedFile[]> {
  const registryPacks = objectValue(model.registry.packs, REGISTRY_PACKS_LABEL);
  const known = new Set(Object.keys(registryPacks));
  const planned = new Map<string, PlannedFile>();
  const sources = new Map<string, string>();
  for (const name of packs) {
    const pack = objectValue(registryPacks[name], `pack ${name}`);
    for (const entry of objectArray(pack.managed_files, `pack ${name} managed_files`)) {
      if (!isString(entry.source) || !isString(entry.target)) throw new OrlyError(`pack ${name} managed file must carry string source and target`);
      const claimed = sources.get(entry.target);
      if (claimed && claimed !== entry.source) throw new OrlyError(`packs disagree on ${entry.target}: ${claimed} and ${entry.source}`);
      sources.set(entry.target, entry.source);
      const path = join(model.root, entry.source);
      // Never overwrite the engine's pack sources with filtered consumer copies.
      if (resolved(model.root) === resolved(targetRoot)) continue;
      planned.set(entry.target, { target: entry.target, content: await managedContent(path, entry.target, entry.source, packs, known, orlyFile), mode: modeLabel(path) });
    }
  }
  const rendered = await new Renderer(model).renderText(packs, commands);
  planned.set(orlyFile, { target: orlyFile, content: new TextEncoder().encode(rendered), mode: MODE_REGULAR });
  return [...planned.values()].sort((left, right) => left.target.localeCompare(right.target));
}

function resolveLayout(model: RulesModel, targetRoot: string): Layout {
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
export async function managedContent(path: string, target: string, source: string, packs: string[], known: Set<string>, orlyFile: string): Promise<Uint8Array> {
  const bytes = await Bun.file(path).bytes();
  if (extname(target) !== MARKDOWN_EXTENSION) return bytes;
  const filtered = renderProfileText(new TextDecoder().decode(bytes), new Set(packs), known, source);
  return new TextEncoder().encode(`${retargetRulesCitations(filtered, orlyFile)}\n`);
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

// git canonicalises symlinks in --show-toplevel; targetRoot, as handed in by
// a caller, usually has not been (macOS puts $TMPDIR and often the caller's
// own working directory behind one). Comparing without resolving both sides
// made every install from a symlinked path — routine on macOS — refuse with
// "not the repository root" against its own root.
function requireWorkTree(targetRoot: string): void {
  if (!existsSync(targetRoot)) throw new OrlyError(`target directory does not exist: ${targetRoot}`);
  const result = Bun.spawnSync([GIT_COMMAND, GIT_REPO_FLAG, targetRoot, "rev-parse", "--show-toplevel"], { stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, env: UNSCOPED_ENVIRONMENT });
  if (result.exitCode !== 0) throw new OrlyError(`not a git repository: ${targetRoot} — run \`git init\` first`);
  const top = resolve(result.stdout.toString().trim());
  const resolvedTarget = realpathSync(targetRoot);
  if (top !== resolvedTarget) throw new OrlyError(`install at the repository root, not a subdirectory: ${relative(top, resolvedTarget)}`);
}

function runGit(targetRoot: string, args: string[]): void {
  const result = Bun.spawnSync([GIT_COMMAND, GIT_REPO_FLAG, targetRoot, ...args], { stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, env: UNSCOPED_ENVIRONMENT });
  if (result.exitCode !== 0) throw new OrlyError(`git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);
}
