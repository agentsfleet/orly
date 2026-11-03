import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contentDigest, type RepoConfig } from "../config";
import { UNSCOPED_ENVIRONMENT } from "../git_env";
import { assertWritableInside, OrlyError } from "../model";
import type { FileDelete } from "./transaction";

const PIPE_OUTPUT = "pipe";
// `git status --porcelain=v1` prints "XY path"; the path starts at column 3.
const STATUS_PREFIX_LENGTH = 3;

// Git holds every committed version, so only an uncommitted change can be lost.
export function uncommittedPaths(root: string, paths: string[]): Set<string> {
  if (paths.length === 0) return new Set();
  const result = Bun.spawnSync(["git", "-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames", "--", ...paths], { env: UNSCOPED_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT });
  if (result.exitCode !== 0) throw new OrlyError(`cannot read git status: ${result.stderr.toString().trim()}`);
  return new Set(result.stdout.toString().split("\0").filter(Boolean).map((entry) => entry.slice(STATUS_PREFIX_LENGTH)));
}

// Managed paths this version no longer ships; clean ones are deleted.
export function migrationDeletes(root: string, config: RepoConfig, destinations: Set<string>): FileDelete[] {
  const obsolete = config.managed.filter((path) => !destinations.has(path) && path !== "AGENTS.md");
  for (const path of obsolete) assertWritableInside(root, path, "migration source");
  const present = obsolete.filter((path) => existsSync(join(root, path)));
  const dirty = uncommittedPaths(root, present);
  const conflicts = present.filter((path) => dirty.has(path));
  if (conflicts.length) throw new OrlyError(`migration conflict: ${conflicts.join(", ")} has uncommitted changes; commit or stash them before updating`);
  return present.map((path) => ({ path, before: contentDigest(readFileSync(join(root, path))) }));
}
