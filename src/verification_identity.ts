import type { CommandLimits } from "./command_limits";
import type { RepoConfig } from "./config";
import type { ReusePolicy } from "./config_validation";

import { createHmac } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readdirSync, readSync, readlinkSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { release } from "node:os";

import { runCommand } from "./command_runner";
import { contentDigest } from "./config";
import { git, UNSCOPED_ENVIRONMENT } from "./git_env";
import { defaultMergeBase } from "./surfaces";
import { objectValue, stringArray } from "./model";

type InputEntry = { path: string; directory: true } | { path: string; mode: number; bytes: string } | { path: string; mode: number; link: string };

type VerificationIdentity = { source: string; binding: string } | { source: string; reason: string };
export type IdentityRequest = {
  root: string; engineRoot: string; config: RepoConfig; lane: string; policy: ReusePolicy;
  invocations: string[][]; limits: CommandLimits; key: Uint8Array;
};

const PROBE_LIMITS = { timeout_ms: 10_000, output_bytes: 64 * 1024 };
const HASH_CHUNK_BYTES = 64 * 1024;
const MANIFEST_BYTES = 1024 * 1024;

export function verificationIdentity(request: IdentityRequest): VerificationIdentity {
  const root = realpathSync(request.root);
  const revision = gitInput(root, ["rev-parse", "HEAD"]).trim();
  const base = defaultMergeBase(root);
  const dirty = gitInput(root, ["status", "--porcelain=v1", "-uall"]);
  const files = inputIdentity(root, trackedPaths(root), true);
  const source = contentDigest(JSON.stringify({ revision, base, dirty, files }));
  try {
    if (files.some((entry) => "link" in entry)) return { source, reason: "symlink inputs require fresh execution" };
    const upstream = gitInput(root, ["rev-parse", "@{upstream}"]).trim();
    if (!revision || revision !== upstream || dirty) return { source, reason: "reuse requires a clean, pushed worktree" };
    if (!base) return { source, reason: "reuse requires an exact merge base" };
    const toolchain = toolchainIdentity(request);
    if (!toolchain) return { source, reason: "toolchain identity is unavailable" };
    const environment = Object.entries(UNSCOPED_ENVIRONMENT).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b));
    const identity = {
      root, source,
      lane: request.lane, invocations: request.invocations, limits: request.limits, config: request.config,
      environment: createHmac("sha256", request.key).update(JSON.stringify(environment)).digest("hex"),
      engine: { root: realpathSync(request.engineRoot), inputs: inputIdentity(realpathSync(request.engineRoot), enginePaths(request.engineRoot)) },
      runtime: { versions: process.versions, platform: process.platform, arch: process.arch, release: release() },
      inputs: inputIdentity(root, request.policy.inputs), toolchain,
    };
    return { source, binding: contentDigest(JSON.stringify(identity)) };
  } catch {
    return { source, reason: "verification inputs are missing, unsupported or unreadable" };
  }
}

function toolchainIdentity(request: IdentityRequest) {
  const probes: Array<{ argv: string[]; output: string }> = [];
  for (const argv of request.policy.toolchain) {
    const result = runCommand(request.root, argv, PROBE_LIMITS);
    if (!result.ok) return undefined;
    probes.push({ argv, output: contentDigest(result.detail) });
  }
  const commands = new Set([...request.policy.toolchain, ...request.invocations].map((argv) => argv[0]!));
  return { probes, executables: [...commands].map((command) => executableIdentity(request.root, command)) };
}

function executableIdentity(root: string, command: string): { path: string; bytes: string } {
  const executable = Bun.which(command, { cwd: root, PATH: UNSCOPED_ENVIRONMENT.PATH ?? "" });
  if (!executable) throw new Error("executable is unavailable");
  const path = realpathSync(executable);
  return { path, bytes: fileDigest(path) };
}

function inputIdentity(root: string, paths: string[], allowLinks = false): InputEntry[] {
  const entries: InputEntry[] = [];
  for (const path of [...paths].sort()) collectInput(root, resolve(root, path), entries, allowLinks);
  return entries;
}

function trackedPaths(root: string): string[] {
  return gitInput(root, ["ls-files", "--cached", "-z"]).split("\0").filter(Boolean);
}

function gitInput(root: string, args: string[]): string {
  const result = git(root, args, PROBE_LIMITS.timeout_ms);
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

function collectInput(root: string, path: string, entries: InputEntry[], allowLinks: boolean): void {
  const relativePath = relative(root, path);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.split(sep).includes(".git")) throw new Error("input escapes the worktree");
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() && allowLinks) { entries.push({ path: relativePath, mode: stat.mode, link: readlinkSync(path) }); return; }
  if (realpathSync(path) !== path) throw new Error("symlink inputs are unsupported");
  if (stat.isDirectory()) {
    entries.push({ path: relativePath, directory: true });
    for (const entry of readdirSync(path).sort()) collectInput(root, join(path, entry), entries, allowLinks);
  } else if (stat.isFile()) entries.push({ path: relativePath, mode: stat.mode, bytes: fileDigest(path) });
  else throw new Error("special inputs are unsupported");
}
