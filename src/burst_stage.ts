import type { RepoConfig } from "./config";

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import { captureProcess } from "./burst_process";
import { CONFIG_PATH, parseConfig } from "./config";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { isObject, OrlyError } from "./model";

const GIT_TIMEOUT_MS = 10 * 60_000;
const BRANCH_PREFIX = "refs/heads/";
const REPOSITORY_NAME_CHARS = 40;
const REF_NAME_CHARS = 24;

// The ref a cloud run ships: the named one, or the branch checked out here.
export async function resolveRef(root: string, named: string | undefined): Promise<string> {
  if (named) return named;
  const head = await git(root, ["symbolic-ref", "--quiet", "HEAD"]);
  if (head.code !== 0) throw new OrlyError("HEAD is detached; pass --ref <branch or tag>");
  return head.stdout.trim().slice(BRANCH_PREFIX.length);
}

// The configuration the machine will read, which is the ref's committed one,
// not this working tree's.
export async function configAt(root: string, ref: string): Promise<RepoConfig> {
  const shown = await git(root, ["show", `${ref}:${CONFIG_PATH}`]);
  if (shown.code !== 0) throw new OrlyError(`${ref} has no committed ${CONFIG_PATH}: ${shown.stderr.trim()}`);
  const value: unknown = JSON.parse(shown.stdout);
  if (!isObject(value)) throw new OrlyError(`${ref}:${CONFIG_PATH} must be a JSON object`);
  return parseConfig(value);
}

// Snapshots are found by this name, so every worktree of one repository
// shares them. It is the origin remote's owner and repository, such as
// `agentsfleet-orly`, so two owners' `web` repositories in one account differ.
export async function repositoryName(root: string): Promise<string> {
  const origin = await git(root, ["remote", "get-url", "origin"]);
  const source = origin.code === 0 ? origin.stdout.trim().replace(/\/+$/, "").replace(/\.git$/, "").split(/[/:]/).slice(-2).join("-") : basename(root);
  return slug(source, REPOSITORY_NAME_CHARS) || "repository";
}

export function newRunId(ref: string, now: Date): string {
  const stamp = now.toISOString().replaceAll(/[-:T]/g, "").slice(0, 14);
  return `${slug(ref, REF_NAME_CHARS) || "ref"}-${stamp}-${randomUUID().slice(0, 4)}`;
}

// Holds the run's private key, so only this user may read it.
export function runDirectory(outRoot: string, runId: string): string {
  const directory = join(outRoot, runId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export async function bundleRef(root: string, ref: string, directory: string): Promise<string> {
  const bundle = join(directory, "repo.bundle");
  const made = await git(root, ["bundle", "create", bundle, ref]);
  if (made.code !== 0) throw new OrlyError(`git bundle of ${ref} failed (a branch or tag name is required): ${made.stderr.trim()}`);
  return bundle;
}

function slug(value: string, length: number): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "").slice(0, length).replace(/-+$/, "");
}

function git(root: string, args: string[]) {
  return captureProcess(["git", "-C", root, ...args], { env: UNSCOPED_ENVIRONMENT, timeoutMs: GIT_TIMEOUT_MS });
}
