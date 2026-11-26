import type { CommandLimits } from "./command_limits";
import type { RepoConfig } from "./config";
import type { ReusePolicy } from "./config_validation";

import { closeSync, existsSync, lstatSync, openSync, readFileSync, readdirSync, readSync, readlinkSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { release } from "node:os";

import { runCommand } from "./command_runner";
import { contentDigest } from "./config";
import { git, gitOutput, UNSCOPED_ENVIRONMENT } from "./git_env";
import { defaultMergeBase } from "./surfaces";
import { hasErrorCode, objectValue, stringArray } from "./model";

type InputEntry = { path: string; directory: true } | { path: string; mode: number; bytes: string } | { path: string; mode: number; link: string };

// `current` marks an observation that may accept earlier evidence: a clean
// tree at the pushed revision. Any tree without untracked files may record it.
export type VerificationProof = { binding: string; revision: string; scope: string | null; uncommitted: boolean; current: boolean };
type VerificationIdentity = { source: string } & (VerificationProof | { reason: string });
export type IdentityRequest = {
  root: string; engineRoot: string; config: RepoConfig; lane: string; policy: ReusePolicy;
  invocations: string[][]; limits: CommandLimits; key: Uint8Array;
};

const PROBE_LIMITS = { timeout_ms: 10_000, output_bytes: 64 * 1024 };
const HASH_CHUNK_BYTES = 64 * 1024;
const MANIFEST_BYTES = 1024 * 1024;
const UNTRACKED = "?? ";

export function verificationIdentity(request: IdentityRequest, observation: "before-probes" | "after-probes" = "before-probes"): VerificationIdentity {
  // Bracket all executed probes with the two source snapshots, without hashing
  // the full tree a second time within either identity collection.
  const finalToolchain = observation === "after-probes" ? probeToolchain(request) : undefined;
  const root = realpathSync(request.root);
  const revision = gitInput(root, ["rev-parse", "HEAD"]).trim();
  const base = defaultMergeBase(root);
  const dirty = gitInput(root, ["status", "--porcelain=v1", "-z", "--no-renames", "-uall"]);
  const files = inputIdentity(root, trackedPaths(root), true);
  const source = contentDigest(JSON.stringify({ revision, base, dirty, files }));
  try {
    if (files.some((entry) => "link" in entry)) return { source, reason: "symlink inputs require fresh execution" };
    // A command may read an untracked file that the committed tree will lack.
    if (dirty.split("\0").some((entry) => entry.startsWith(UNTRACKED))) return { source, reason: "untracked files are outside the tree; add or remove them" };
    if (!revision || !base) return { source, reason: "reuse requires an exact merge base" };
    const toolchain = observation === "after-probes" ? finalToolchain : probeToolchain(request);
    if (!toolchain) return { source, reason: "toolchain identity is unavailable" };
    // The tree is the tracked content the command reads, never the commit that
    // holds it, so a run on uncommitted edits matches the commit that records them.
    const scope = request.policy.tracked_inputs ? scopedDigest(files, request.policy.tracked_inputs) : null;
    const tree = scope ?? contentDigest(JSON.stringify(files));
    const environment = Object.entries(UNSCOPED_ENVIRONMENT).filter(([, value]) => value !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const identity = {
      root, source: { base, tree },
      lane: request.lane, invocations: request.invocations, limits: request.limits, config: request.config,
      environment: new Bun.CryptoHasher("sha256", request.key).update(JSON.stringify(environment)).digest("hex"),
      engine: { root: realpathSync(request.engineRoot), inputs: inputIdentity(realpathSync(request.engineRoot), enginePaths(request.engineRoot)) },
      runtime: { versions: process.versions, platform: process.platform, arch: process.arch, release: release() },
      inputs: inputIdentity(root, request.policy.inputs), toolchain,
    };
    const current = !dirty && revision === gitOutput(root, ["rev-parse", "@{upstream}"]);
    return { source, binding: contentDigest(JSON.stringify(identity)), revision, scope, uncommitted: dirty !== "", current };
  } catch {
    return { source, reason: "verification inputs are missing, unsupported or unreadable" };
  }
}

function probeToolchain(request: IdentityRequest) {
  try { return toolchainIdentity(request); }
  catch { return undefined; }
}

function scopedDigest(files: InputEntry[], selectors: string[]): string {
  const selected = new Set<InputEntry>();
  for (const selector of selectors) {
    const path = selector.replace(/\/$/, "");
    const matches = files.filter((entry) => entry.path === path || entry.path.startsWith(`${path}${sep}`));
    if (!matches.length) throw new Error("tracked input matches no tracked files");
    for (const entry of matches) selected.add(entry);
  }
  return contentDigest(JSON.stringify(files.filter((entry) => selected.has(entry))));
}

function toolchainIdentity(request: IdentityRequest) {
  const probes: Array<{ argv: string[]; output: string }> = [];
  for (const argv of request.policy.toolchain) {
    const result = runCommand(request.root, argv, PROBE_LIMITS);
    if (!result.ok) return undefined;
    probes.push({ argv, output: contentDigest(result.detail) });
  }
  const commands = new Set([...request.policy.toolchain, ...request.invocations].flatMap((argv) => argv.slice(0, 1)));
  return { probes, executables: [...commands].map((command) => executableIdentity(request.root, command)) };
}

function executableIdentity(root: string, command: string): { path: string; bytes: string } {
  const executable = Bun.which(command, { cwd: root, PATH: UNSCOPED_ENVIRONMENT.PATH ?? "" });
  if (!executable) throw new Error("executable is unavailable");
  const path = realpathSync(executable);
  return { path, bytes: fileDigest(path) };
}

function inputIdentity(root: string, paths: string[], allowLinks = false): InputEntry[] {
  const entries = new Map<string, InputEntry>();
  for (const path of [...paths].sort()) collectInput(root, resolve(root, path), entries, allowLinks);
  return [...entries.values()];
}

// A tracked path deleted from the working tree is absent from the tree a commit
// of that working tree records, so it is left out rather than refused.
function trackedPaths(root: string): string[] {
  return gitInput(root, ["ls-files", "--cached", "-z"]).split("\0").filter((path) => path && present(join(root, path)));
}

function present(path: string): boolean {
  try { return lstatSync(path, { throwIfNoEntry: false }) !== undefined; }
  catch (error) { if (hasErrorCode(error, "ENOTDIR")) return false; throw error; }
}

function gitInput(root: string, args: string[]): string {
  const result = git(root, args, { timeoutMs: PROBE_LIMITS.timeout_ms });
  if (result.exitCode !== 0 || result.signalCode) throw new Error("Git input identity is unavailable");
  return result.stdout.toString();
}

function enginePaths(root: string): string[] {
  const path = join(root, "package.json");
  if (!lstatSync(path).isFile() || lstatSync(path).size > MANIFEST_BYTES) throw new Error("engine manifest is unavailable");
  const manifest = objectValue(JSON.parse(readFileSync(path, "utf8")), "engine manifest");
  return ["package.json", "README.md", ...stringArray(manifest.files, "engine files")].flatMap((pattern) => {
    const paths = existsSync(join(root, pattern)) ? [pattern] : [...new Bun.Glob(pattern).scanSync({ cwd: root, dot: true, onlyFiles: false })];
    if (!paths.length) throw new Error("declared engine files are unavailable");
    return paths;
  });
}

function fileDigest(path: string): string {
  if (!lstatSync(path).isFile()) throw new Error("input must be a regular file");
  const file = openSync(path, "r");
  const hasher = new Bun.CryptoHasher("sha256");
  const chunk = Buffer.alloc(HASH_CHUNK_BYTES);
  try {
    for (let size = readSync(file, chunk); size > 0; size = readSync(file, chunk)) hasher.update(chunk.subarray(0, size));
    return `sha256:${hasher.digest("hex")}`;
  } finally { closeSync(file); }
}

function collectInput(root: string, path: string, entries: Map<string, InputEntry>, allowLinks: boolean): void {
  const relativePath = relative(root, path);
  if (entries.has(relativePath)) return;
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.split(sep).includes(".git")) throw new Error("input escapes the worktree");
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() && allowLinks) { entries.set(relativePath, { path: relativePath, mode: stat.mode, link: readlinkSync(path) }); return; }
  if (realpathSync(path) !== path) throw new Error("symlink inputs are unsupported");
  if (stat.isDirectory()) {
    entries.set(relativePath, { path: relativePath, directory: true });
    for (const entry of readdirSync(path).sort()) collectInput(root, join(path, entry), entries, allowLinks);
  } else if (stat.isFile()) entries.set(relativePath, { path: relativePath, mode: stat.mode, bytes: fileDigest(path) });
  else throw new Error("special inputs are unsupported");
}
