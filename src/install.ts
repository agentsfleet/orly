import { existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, lstatSync, readlinkSync, symlinkSync, realpathSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { CONFIG_PATH, contentDigest, sameDigest, seedConfig, serialiseConfig, type RepoConfig } from "./config";
import { selectPacks } from "./config_discovery";
import { assertWritableInside, applyMode, modeLabel, OrlyError, MODE_EXECUTABLE, MODE_REGULAR, type RulesModel } from "./model";
import { installLoaders, loaderTargets, type Layout } from "./loaders";
import { referenceClosureErrors } from "./references";
import { planFiles, resolveLayout, type PlannedFile } from "./installation/plan";
import { readInstallConfig, migrationDeletes, PREVIOUS_CONFIG } from "./installation/migration";
import { plannedHooks, checkHooks, configureHooks, hooksPath, HOOKS_DIRECTORY } from "./installation/hooks";
import { diskDigest, InstallTransaction, type FileWrite, type InstallCheckpoint } from "./installation/transaction";
import { installationLock } from "./installation/lock";

const INSTALL_DIRECTORY = ".orly";
const MANAGED_KIND = "managed file";
const PIPE_OUTPUT = "pipe";
const HOOKS_PATH_KEY = "core.hooksPath";
export type InstallError = { path: string; message: string; suggestion: string };
export type InstallResult = { ok: boolean; packs: string[]; written: string[]; skipped: string[]; errors: InstallError[] };
export type InstallOptions = { targetRoot: string; force: boolean; installHooks: boolean; orlyVersion: string; requestedPacks?: string[]; checkpoint?: InstallCheckpoint };

export async function install(model: RulesModel, options: InstallOptions): Promise<InstallResult> {
  const root = resolve(options.targetRoot);
  requireWorkTree(root);
  const directoryExisted = existsSync(join(root, INSTALL_DIRECTORY));
  let release;
  try { release = installationLock(root); }
  catch (error) { return failure([], INSTALL_DIRECTORY, error); }
  try { return await installLocked(model, options, root); }
  finally {
    release();
    if (!directoryExisted && readdirSync(join(root, INSTALL_DIRECTORY)).length === 0) rmdirSync(join(root, INSTALL_DIRECTORY));
  }
}

async function installLocked(model: RulesModel, options: InstallOptions, root: string): Promise<InstallResult> {
  const transaction = new InstallTransaction(root, options.orlyVersion, options.checkpoint);
  transaction.recover(() => configureHooks(root));
  const expected = new Map([[CONFIG_PATH, diskDigest(root, CONFIG_PATH)]]);
  if (expected.get(CONFIG_PATH) === null) expected.set(PREVIOUS_CONFIG, diskDigest(root, PREVIOUS_CONFIG));
  const config = await readInstallConfig(root) ?? await seedConfig(root);
  config.packs = [...new Set([...config.packs, ...(options.requestedPacks ?? [])])].sort();
  const packs = selectPacks(model, root, config.packs, new Set(config.managed));
  const layout = resolveLayout(model, root);
  const planned = await planFiles(model, packs, config.commands, root, layout.orlyFile);
  try {
    for (const [path, before] of expected) if (diskDigest(root, path) !== before) throw new OrlyError(`installation conflict: ${path} changed after planning`);
    if (options.installHooks) {
      checkHooks(root, config, options.force);
      planned.push(...plannedHooks(options.orlyVersion));
    }
    return await materialise(root, layout, planned, packs, config, options, transaction, expected);
  } catch (error) {
    // A persisted transaction must remain available for recovery. Return the
    // conflict without deleting its receipts or the owner's files.
    return failure(packs, String(error).includes(HOOKS_PATH_KEY) ? HOOKS_PATH_KEY : INSTALL_DIRECTORY, error);
  }
}

async function materialise(root: string, layout: Layout, planned: PlannedFile[], packs: string[], config: RepoConfig, options: InstallOptions, transaction: InstallTransaction, expected: Map<string, string | null>): Promise<InstallResult> {
  for (const [path, kind] of loaderTargets(layout)) {
    try { assertWritableInside(root, path, kind); }
    catch (error) { return failure(packs, path, error); }
    expected.set(path, existsSync(join(root, path)) && lstatSync(join(root, path)).isSymbolicLink() ? null : diskDigest(root, path));
  }
  assertWritableInside(root, CONFIG_PATH, "configuration");
  const hooks = options.installHooks ? { before: hooksPath(root), after: HOOKS_DIRECTORY } : null;
  const errors = await preflight(root, planned, config, options.force, expected);
  if (errors.length) return { ok: false, packs, written: [], skipped: [], errors };
  const preservedHooks = options.installHooks ? [] : config.managed.filter((path) => /^(?:\.githooks|\.orly\/hooks)\//.test(path));
  const destinations = new Set([...planned.map((file) => file.target), ...preservedHooks]);
  const deletes = migrationDeletes(root, config, destinations);
  for (const file of deletes) if (file.path === PREVIOUS_CONFIG) file.before = expected.get(file.path)!;
  const { files: staged, skipped: loaderSkipped } = await stagePlan(root, layout, planned, deletes.map((file) => file.path));
  const next = { ...config, orly_version: options.orlyVersion, managed: [...destinations], digests: { ...Object.fromEntries(preservedHooks.filter((path) => config.digests[path]).map((path) => [path, config.digests[path]!])), ...Object.fromEntries(planned.map((file) => [file.target, contentDigest(file.content)])) } };
  staged.push({ target: CONFIG_PATH, content: Buffer.from(serialiseConfig(next)), mode: MODE_REGULAR });
  const written: string[] = [];
  const skipped: string[] = [...loaderSkipped];
  const writes: FileWrite[] = [];
  for (const file of staged) {
    const before = expected.get(file.target) ?? null;
    const current = diskDigest(root, file.target);
    if (current !== before && current !== contentDigest(file.content)) throw new OrlyError(`installation conflict: ${file.target} changed after planning`);
    if (before === contentDigest(file.content) && modeLabel(join(root, file.target)) === file.mode) skipped.push(file.target);
    else written.push(file.target);
    writes.push({ path: file.target, before, content: Buffer.from(file.content).toString("base64"), mode: file.mode === MODE_EXECUTABLE ? MODE_EXECUTABLE : MODE_REGULAR });
  }
  if (options.installHooks) checkHooks(root, config, options.force);
  if (written.length || deletes.length) transaction.commit(writes, deletes, hooks, () => configureHooks(root));
  else if (options.installHooks) configureHooks(root);
  return { ok: true, packs, written: written.sort(), skipped: skipped.sort(), errors: [] };
}

async function preflight(root: string, planned: PlannedFile[], config: RepoConfig, force: boolean, expected: Map<string, string | null>): Promise<InstallError[]> {
  const errors: InstallError[] = [];
  for (const file of planned) {
    assertWritableInside(root, file.target, MANAGED_KIND);
    const current = diskDigest(root, file.target);
    expected.set(file.target, current);
    if (current === null || current === contentDigest(file.content)) continue;
    const recorded = config.digests[file.target];
    if (force || (config.managed.includes(file.target) && recorded && sameDigest(recorded, current))) continue;
    errors.push({ path: file.target, message: "existing content is unowned or edited after installation", suggestion: "preserve or reconcile your change; --force explicitly replaces ordinary update conflicts" });
  }
  return errors;
}

async function stagePlan(root: string, layout: Layout, planned: PlannedFile[], obsolete: string[]): Promise<{ files: PlannedFile[]; skipped: string[] }> {
  assertWritableInside(root, INSTALL_DIRECTORY, "staging directory");
  mkdirSync(join(root, INSTALL_DIRECTORY), { recursive: true });
  const stage = mkdtempSync(join(root, INSTALL_DIRECTORY, "install-stage-"));
  try {
    for (const file of planned) {
      const path = join(stage, file.target);
      mkdirSync(dirname(path), { recursive: true });
      await Bun.write(path, file.content);
      applyMode(path, file.mode);
    }
    const markdown = planned.filter((file) => extname(file.target) === ".md" && !file.target.includes("/skills/")).map((file) => join(stage, file.target));
    const missing = await referenceClosureErrors(stage, markdown, root);
    if (missing.length) throw new OrlyError(missing.join("\n"));
    for (const [target] of loaderTargets(layout)) copyLoader(root, stage, target);
    const loaders = await installLoaders(stage, layout, obsolete);
    const result = [...planned];
    for (const target of loaders.written) result.push({ target, content: await Bun.file(join(stage, target)).bytes(), mode: MODE_REGULAR });
    return { files: result, skipped: loaders.skipped };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function copyLoader(root: string, stage: string, target: string): void {
  const source = join(root, target);
  let stat;
  try { stat = lstatSync(source); } catch { return; }
  const destination = join(stage, target);
  if (stat.isSymbolicLink()) symlinkSync(readlinkSync(source), destination);
  else copyFileSync(source, destination);
}

function requireWorkTree(root: string): void {
  if (!existsSync(root)) throw new OrlyError(`target directory does not exist: ${root}`);
  const result = Bun.spawnSync(["git", "-C", root, "rev-parse", "--show-toplevel"], { stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, env: UNSCOPED_ENVIRONMENT });
  if (result.exitCode !== 0) throw new OrlyError(`not a git repository: ${root} — run git init first`);
  if (realpathSync(root) !== realpathSync(result.stdout.toString().trim())) throw new OrlyError("install at the repository root, not a subdirectory");
}

function failure(packs: string[], path: string, error: unknown): InstallResult {
  return { ok: false, packs, written: [], skipped: [], errors: [{ path, message: error instanceof Error ? error.message : String(error), suggestion: "reconcile the named conflict and repeat the same version's update" }] };
}
