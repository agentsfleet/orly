import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { criteriaFor, CriterionContext, CriterionResult } from "./criteria";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { OrlyError, RulesModel } from "./model";
import { defaultMergeBase } from "./surfaces";

export const GATE_ORDER = ["work", "verify", "pr"] as const;
export type GateName = (typeof GATE_ORDER)[number];

const PIPE_OUTPUT = "pipe";
const GIT = "git";
const DOCS_DIRECTORY = "docs";
const ACTIVE_DIRECTORY = "active";
const DONE_DIRECTORY = "done";
const BRANCH_HEADER = "Branch";
const FOLDED_INTO_HEADER = "Folded-into";
const DEFAULT_BRANCHES = ["main", "master"];
const UTF8 = "utf8";
// Accept every real layout: docs/v1/, docs/v2/, docs/v0.9.2/ — cache-kit
// versions its spec tree by release, not by prototype integer.
const PROTOTYPE_PATTERN = /^v\d+(\.\d+)*$/;
const MARKDOWN_EXTENSION = ".md";
const NEWLINE = "\n";
const MARKDOWN_HEADER_TOKEN_PATTERN = /^\s*\*\*([^*]+):\*\*\s*`([^`]+)`/;
const SPEC_IDENTIFIER_PATTERN = /^(M\d+_\d+)(?:_|\.md$)/;
// Strict trailer shape: "Orly-Override: <criterion> (<reason>)". A trailer
// that does not parse is not an override — the gate stays red rather than
// guessing what a malformed waiver meant.
const OVERRIDE_TRAILER = /^Orly-Override:\s*([a-z.]+[a-z])\s*\((.+)\)\s*$/;
const OVERRIDE_PREFIX = "Orly-Override:";
const OVERRIDDEN_DETAIL = "overridden";

export type GateReport = {
  gate: GateName;
  results: CriterionResult[];
  ok: boolean;
};

export type Override = { criterion: string; reason: string };
type SpecMetadata = {
  path: string;
  identifier: string | undefined;
  branch: string | undefined;
  foldedInto: string | undefined;
};

// Run one gate: evaluate its criteria fresh from git + the working tree.
// A red criterion with a matching Orly-Override trailer on the branch is
// reported as overridden — satisfied, but never plain green.
export function runGate(model: RulesModel, root: string, gate: GateName, acceptDirty = false): GateReport {
  const context = gateContext(model, root, acceptDirty);
  const overrides = branchOverrides(root);
  const results = criteriaFor(gate, context).map((criterion) => {
    const result = criterion.evaluate(context);
    if (result.ok) return result;
    const override = overrides.find((entry) => entry.criterion === result.name);
    if (!override) return result;
    return { name: result.name, ok: true, detail: `${OVERRIDDEN_DETAIL} (${override.reason}) — ${result.detail}` };
  });
  return { gate, results, ok: results.every((result) => result.ok) };
}

// Run gates in order, stopping at the first red group: later gates are noise
// until the earlier boundary holds, and slow suites should not run on a
// branch that is not even clean.
export function runGates(model: RulesModel, root: string, acceptDirty = false): GateReport[] {
  const reports: GateReport[] = [];
  for (const gate of GATE_ORDER) {
    const report = runGate(model, root, gate, acceptDirty);
    reports.push(report);
    if (!report.ok) break;
  }
  return reports;
}

export function isGateName(value: string): value is GateName {
  return (GATE_ORDER as readonly string[]).includes(value);
}

// The override is an empty commit carrying a strict trailer: immutable once
// pushed, visible in the Pull Request, dead with the branch.
export function recordOverride(root: string, criterion: string, reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new OrlyError("an override without a reason is not a record");
  const message = `override: ${criterion}\n\n${OVERRIDE_PREFIX} ${criterion} (${trimmed.replaceAll(")", "]")})`;
  const result = Bun.spawnSync([GIT, "commit", "--allow-empty", "-m", message], { cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT });
  if (result.exitCode !== 0) throw new OrlyError(`could not record the override commit: ${result.stderr.toString().trim()}`);
  return message;
}

// Overrides live in merge-base..HEAD commit bodies, so they are scoped to the
// branch and cannot leak past the merge.
export function branchOverrides(root: string): Override[] {
  const base = defaultMergeBase(root);
  if (!base) return [];
  const overrides: Override[] = [];
  for (const body of gitOutput(root, ["log", "--format=%B%x00", `${base}..HEAD`]).split("\0")) {
    for (const line of body.split(/\r?\n/)) {
      const match = line.trim().match(OVERRIDE_TRAILER);
      if (match?.[1] && match[2]) overrides.push({ criterion: match[1], reason: match[2].trim() });
    }
  }
  return overrides;
}

// One stream per worktree, and a fold is not a second stream. Extra specs in
// active/ are allowed only when each names the one non-folded owner through
// Folded-into — the same relation closedSpecPath enforces in done/. Without
// this, folding a workstream into an open stream was impossible during the
// work and legal only after the close, which is the wrong way round: the fold
// is decided when the scope is, not when the spec moves.
export function activeSpecPath(root: string): string | undefined {
  const specs = specPathsUnder(root, ACTIVE_DIRECTORY).map(specMetadata)
    .filter((spec): spec is SpecMetadata => spec !== undefined);
  if (specs.length === 0) return undefined;
  return owningSpec(specs, "active spec", "active specs").path;
}

// The fold relation, shared by both discovery paths: exactly one non-folded
// owner, every other spec naming it, and no spec naming itself.
function owningSpec(specs: SpecMetadata[], one: string, many: string): SpecMetadata {
  const owners = specs.filter((spec) => spec.foldedInto === undefined);
  if (owners.length === 0) throw new OrlyError(`every ${one} is folded — one owning stream is required:${NEWLINE}${specs.map((spec) => spec.path).join(NEWLINE)}`);
  if (owners.length > 1) throw new OrlyError(`more than one ${one} — one stream per worktree:${NEWLINE}${owners.map((spec) => spec.path).join(NEWLINE)}`);
  const owner = owners[0];
  if (!owner) throw new OrlyError(`${one} ownership could not be resolved`);
  const folded = specs.filter((spec) => spec.foldedInto !== undefined);
  if (folded.length > 0 && !owner.identifier) throw new OrlyError(`the owning ${one} has no milestone and workstream identifier: ${owner.path}`);
  const selfFolds = folded.filter((spec) => spec.identifier === spec.foldedInto);
  if (selfFolds.length > 0) throw new OrlyError(`folded ${many} cannot fold into themselves:${NEWLINE}${selfFolds.map((spec) => spec.path).join(NEWLINE)}`);
  const invalidFolds = folded.filter((spec) => spec.foldedInto !== owner.identifier);
  if (invalidFolds.length > 0) throw new OrlyError(`folded ${many} must name their owner ${owner.identifier}:${NEWLINE}${invalidFolds.map((spec) => spec.path).join(NEWLINE)}`);
  return owner;
}

// Closed-spec follow-through: CHORE(close) moves the spec to done/, and the
// gate must keep proving it — a close that made the criteria skip-pass would
// be end-state theater. Discovery matches done/ specs whose Branch: header
// names the current branch; default branches never match a stream's spec.
export function closedSpecPath(root: string): string | undefined {
  const branch = gitOutput(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || DEFAULT_BRANCHES.includes(branch)) return undefined;
  const specs = specPathsUnder(root, DONE_DIRECTORY)
    .map(specMetadata)
    .filter((spec): spec is SpecMetadata => spec !== undefined && spec.branch === branch);
  if (specs.length === 0) return undefined;
  return owningSpec(specs, `done/ spec naming branch ${branch}`, `done/ specs naming branch ${branch}`).path;
}

// An in-flight (active/) spec wins; otherwise the branch's closed spec gates.
export function specPathFor(root: string): { path: string; closed: boolean } | undefined {
  const active = activeSpecPath(root);
  if (active) return { path: active, closed: false };
  const closed = closedSpecPath(root);
  return closed ? { path: closed, closed: true } : undefined;
}

function specMetadata(path: string): SpecMetadata | undefined {
  try {
    const metadata: SpecMetadata = {
      path,
      identifier: basename(path).match(SPEC_IDENTIFIER_PATTERN)?.[1],
      branch: undefined,
      foldedInto: undefined,
    };
    for (const line of readFileSync(path, UTF8).split(/\r?\n/)) {
      if (line.startsWith("## ")) break;
      const match = line.match(MARKDOWN_HEADER_TOKEN_PATTERN);
      if (match?.[1] === BRANCH_HEADER) metadata.branch = match[2];
      if (match?.[1] === FOLDED_INTO_HEADER) metadata.foldedInto = match[2];
    }
    return metadata;
  } catch {
    return undefined;
  }
}

function gateContext(model: RulesModel, root: string, acceptDirty: boolean): CriterionContext {
  const spec = specPathFor(root);
  const context: CriterionContext = { root, model, acceptDirty };
  if (spec) {
    context.specPath = relative(root, spec.path);
    context.specText = specTextSync(spec.path);
    context.specClosed = spec.closed;
  }
  return context;
}

function specTextSync(path: string): string {
  try {
    return readFileSync(path, UTF8);
  } catch {
    throw new OrlyError(`cannot read the active spec: ${path}`);
  }
}

function specPathsUnder(root: string, stage: string): string[] {
  const docs = join(root, DOCS_DIRECTORY);
  if (!existsSync(docs)) return [];
  const found: string[] = [];
  for (const prototype of readdirSync(docs).filter((name) => PROTOTYPE_PATTERN.test(name)).sort()) {
    const directory = join(docs, prototype, stage);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory).filter((name) => name.endsWith(MARKDOWN_EXTENSION)).sort()) found.push(join(directory, file));
  }
  return found;
}

function gitOutput(root: string, command: string[]): string {
  const result = Bun.spawnSync([GIT, ...command], { cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT });
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}
