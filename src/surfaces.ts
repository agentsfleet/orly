import type { JsonObject } from "./model";

import { isObject, OrlyError, stringArray } from "./model";
import { gitOutput } from "./git_env";

export const DEFAULT_BRANCHES = ["main", "master"];
const ORIGIN_PREFIX = "origin/";
const SURFACES_FIELD = "surfaces";
const USER_FIELD = "user";
const DOCS_FIELD = "docs";
const SPEC_TREE = /^docs\/v\d+(?:\.\d+)*\//;
const TEST_PATH = /(^|\/)tests?\/|\.test\.|_test\.|\.spec\./;
const MARKDOWN = /\.(md|mdx)$/;
// One fixed source-extension set across every repo: handlers (.zig), CLI and
// UI TypeScript, OpenAPI YAML, scripts. A fixed set keeps the check identical
// everywhere instead of drifting per repository.
const SOURCE_EXTENSIONS = /\.(zig|ts|tsx|js|jsx|mjs|py|rs|go|sh|sql|yaml|yml|json|toml)$/;
const BUILD_INPUT = /(^|\/)(?:Makefile|GNUmakefile|Dockerfile|Containerfile)(?:\.[^/]+)?$|(^|\/)bin\/[^/.]+$|\.(?:lock|mk)$/;

export type SurfaceReport = {
  changed: string[];
  code: string[];
  userSurface: string[];
  docs: string[];
};

// Classify the branch diff once per inspection; every criterion reads this
// report instead of running its own git commands.
export function classifyBranch(root: string, surfaces: JsonObject | undefined): SurfaceReport {
  const changed = branchDiff(root);
  const user = surfacePrefixes(surfaces, USER_FIELD);
  const docs = surfacePrefixes(surfaces, DOCS_FIELD);
  return {
    changed,
    code: changed.filter(isCode),
    userSurface: changed.filter((path) => isUserSurface(path, user)),
    docs: changed.filter((path) => isDocs(path, docs)),
  };
}

export function isCode(path: string): boolean {
  return !MARKDOWN.test(path) && (SOURCE_EXTENSIONS.test(path) || TEST_PATH.test(path) || BUILD_INPUT.test(path));
}

// User surface: a repository-declared prefix, a real source file, and not a test —
// a test-only change under a user prefix must not demand a docs edit, or the
// gate trains everyone to distrust it.
export function isUserSurface(path: string, prefixes: string[]): boolean {
  if (!prefixes.some((prefix) => path.startsWith(prefix))) return false;
  return isCode(path) && !TEST_PATH.test(path);
}

// Docs: a repository-declared prefix, but never the spec tree — every milestone
// edits its own spec, so counting docs/v*/ would make the check auto-pass.
export function isDocs(path: string, prefixes: string[]): boolean {
  if (SPEC_TREE.test(path)) return false;
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function branchDiff(root: string): string[] {
  const base = defaultMergeBase(root);
  if (!base) throw new OrlyError("comparison base is unavailable; fetch the target branch and its history before verification");
  return gitOutput(root, ["diff", "--no-ext-diff", "--name-only", "-z", `${base}..HEAD`], true).split("\0").filter(Boolean);
}

export function defaultMergeBase(root: string): string {
  for (const branch of defaultBranchCandidates(root)) {
    const base = gitOutput(root, ["merge-base", branch, "HEAD"]);
    if (base) return base;
  }
  return "";
}

function defaultBranchCandidates(root: string): string[] {
  const candidates: string[] = [];
  const head = gitOutput(root, ["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  if (head.startsWith(ORIGIN_PREFIX)) candidates.push(head);
  for (const name of DEFAULT_BRANCHES) candidates.push(`${ORIGIN_PREFIX}${name}`, name);
  return candidates;
}

function surfacePrefixes(surfaces: JsonObject | undefined, field: string): string[] {
  if (!isObject(surfaces) || !(field in surfaces)) return [];
  return stringArray(surfaces[field], `${SURFACES_FIELD}.${field}`);
}


