import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import {
  Criterion, CriterionContext, CriterionResult, criterion, gitOutput, runCommand, Verdict,
} from "./criteria_support";
import {
  openQuestions, productClarity, specBaseline, specDeferrals, specDimensions,
  specGate, specMoved, specOrdering,
} from "./criteria_spec";
import { documentationSurfaces, scanSurfaces } from "./doc_rules";
import { isObject, JsonObject, objectValue, OrlyError, RulesModel } from "./model";
import { readConfigSync, RepoConfig } from "./config";
import { classifyBranch, SurfaceReport } from "./surfaces";
import { commandSetupErrors } from "./validation";

export type { Criterion, CriterionContext, CriterionResult, Verdict };
export { runCommand };

const DEFAULT_BRANCHES = ["master", "main"];
const CONFORM_COMMAND = "conform";
const VERIFY_PREFIX = "verify.";
const REPOSITORIES_LABEL = "repositories";
const UNINSTALLED = "no .oracle/orly.json here — run `orly init` first";
const REV_PARSE = "rev-parse";
const HEAD = "HEAD";
const UPSTREAM = "@{upstream}";
const NEWLINE = "\n";
const ABBREV_REF = "--abbrev-ref";
const WORKTREE_LIST = ["worktree", "list", "--porcelain"];
const WORKTREE_PREFIX = "worktree ";

const GIT_BRANCH = "git.branch";
const GIT_TREE = "git.tree";
const GIT_PUSHED = "git.pushed";
const REPO_CONFIG = "repo.config";
const DOCS_UPDATED = "docs.updated";
const DOCS_LANGUAGE = "docs.language";
// How many findings a report names before it stops listing them. A criterion
// line is a summary, not a linter dump.
const NAMED_FINDINGS = 3;

// CONFORM is its own lifecycle stage — EXECUTE → CONFORM → VERIFY — and it is
// its own tier here for the same reason. Lumped into verify, the deterministic
// rule audit could only run beside the lint and unit suites, so a repository
// paid minutes to learn something its seconds-long conform command already
// knew, and `orly gate` ran it twice on the way to `pr`.
const CONFORM_TIER = "conform";
const FAST_TIER = "fast";
const SLOW_TIER = "slow";
// The slow tier is a fixed name set, not a prefix rule: lint and version
// checks are verify.* too, and demoting them to skip-on-prose would be wrong.
const SLOW_COMMANDS = ["verify.integration", "verify.memory"];
const UNIT_COMMAND = "verify.unit";
const ALL_TIER = "all";

// Commit checks read the index. Push checks permit in-flight Sections and omit
// the boundary test suites. The final gate runs all declared verification
// itself, including checks a custom repository hook may not have invoked.
export function criteriaFor(gate: string, context: CriterionContext): Criterion[] {
  if (gate === "work") return [repositoryConfig(), ...commandCriteria(context, CONFORM_TIER)];
  if (gate === "verify") return [repositoryConfig(), docsLanguage(), ...commandCriteria(context, FAST_TIER)];
  if (gate === "pr") {
    return [
      gitBranch(), gitTree(), gitPushed(), specGate(), openQuestions(), productClarity(), specDimensions(),
      specMoved(), specBaseline(), specOrdering(), specDeferrals(),
      repositoryConfig(), docsLanguage(), docsUpdated(), ...commandCriteria(context, ALL_TIER),
    ];
  }
  return [];
}

function gitBranch(): Criterion {
  return criterion(GIT_BRANCH, (context) => {
    const branch = gitOutput(context.root, [REV_PARSE, ABBREV_REF, "HEAD"]);
    const ok = branch.length > 0 && !DEFAULT_BRANCHES.includes(branch);
    return { ok, detail: ok ? `on ${branch}` : `refusing to work on the default branch: ${branch || "unknown"}` };
  });
}

function gitTree(): Criterion {
  return criterion(GIT_TREE, (context) => {
    const dirty = gitOutput(context.root, ["status", "--porcelain=v1", "-uall"])
      .split(/\r?\n/)
      .filter(Boolean);
    if (dirty.length === 0) return { ok: true, detail: "clean" };
    if (context.acceptDirty) return { ok: true, detail: `${dirty.length} dirty path(s) accepted` };
    return { ok: false, detail: `${dirty.length} uncommitted path(s), first: ${dirty[0] ?? ""}` };
  });
}

function gitPushed(): Criterion {
  return criterion(GIT_PUSHED, (context) => {
    const upstream = gitOutput(context.root, [REV_PARSE, ABBREV_REF, "--symbolic-full-name", UPSTREAM]);
    if (upstream.length === 0) return { ok: false, detail: "branch has no upstream; push it first" };
    const head = gitOutput(context.root, [REV_PARSE, HEAD]);
    const remote = gitOutput(context.root, [REV_PARSE, UPSTREAM]);
    const ok = head.length > 0 && head === remote;
    return { ok, detail: ok ? `in sync with ${upstream}` : `HEAD differs from ${upstream}; push the reviewed revision` };
  });
}

function repositoryConfig(): Criterion {
  return criterion(REPO_CONFIG, (context) => {
    try {
      const config = readConfigSync(context.root);
      if (!config) return { ok: false, detail: UNINSTALLED };
      const errors = commandSetupErrors(config.commands);
      return { ok: errors.length === 0, detail: errors.length > 0 ? errors.join("; ") : `${Object.keys(config.commands).length} command(s) declared` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  });
}

// Commands and source paths are repository-owned. Only integration and memory
// checks are conditional on code; every other declared lane always runs.
function commandCriteria(context: CriterionContext, tier: string): Criterion[] {
  const config = resolvedConfig(context);
  if (!config) return [];
  const commands = config.commands;
  const selected = Object.keys(commands).filter((key) => tier === ALL_TIER ? key.startsWith(VERIFY_PREFIX) : tierOf(key) === tier).sort();
  return selected.map((key) => criterion(`cmd.${key}`, (inner) => {
    if (SLOW_COMMANDS.includes(key) && report(inner, config.surfaces).code.length === 0) {
      return { ok: true, detail: "skipped — no code files on this branch" };
    }
    return runInvocations(inner.root, commands[key]);
  }));
}

function tierOf(key: string): string {
  if (key === CONFORM_COMMAND) return CONFORM_TIER;
  if (key === UNIT_COMMAND || SLOW_COMMANDS.includes(key)) return SLOW_TIER;
  if (key.startsWith(VERIFY_PREFIX)) return FAST_TIER;
  return "";
}

function docsUpdated(): Criterion {
  return criterion(DOCS_UPDATED, (context) => {
    const config = resolvedConfig(context);
    if (!config?.surfaces) return { ok: true, detail: "no user surface declared in .oracle/orly.json" };
    const surfaces = report(context, config.surfaces);
    if (surfaces.userSurface.length === 0) return { ok: true, detail: "no user-surface files on this branch" };
    if (surfaces.docs.length > 0) return { ok: true, detail: `${surfaces.userSurface.length} user-surface file(s), ${surfaces.docs.length} docs file(s) updated` };
    return {
      ok: false,
      detail: `${surfaces.userSurface.length} user-surface file(s) changed (first: ${surfaces.userSurface[0] ?? ""}) with no docs change — update the docs page, or record: orly override ${DOCS_UPDATED} --reason <REASON>`,
    };
  });
}

// docs/DOCUMENTATION_RULES.md, read back against the pages orly renders here.
// The scope rule is the document's own: any documentation orly writes or
// renders, README.md included.
//
// REPORTING ONLY, and deliberately so. The rule document landed against a
// corpus that predates it, and the corpus does not obey it yet: this
// repository alone carries hundreds of pre-existing findings. A red gate on
// day one would be switched off by the end of the week, and grandfathering
// them into a baseline file would be a list of chores wearing a gate's badge.
// So the check reports what it found and leaves the verdict green until a
// human has decided how the debt gets paid. Partial mechanization stated
// honestly beats a red that means nothing (the same call audits/doc-read.sh
// makes when its record is missing). Flipping this to a gate is a one-line
// change: return ok on `findings.length === 0`.
function docsLanguage(): Criterion {
  return criterion(DOCS_LANGUAGE, (context) => {
    const surfaces = documentationSurfaces(context.root);
    if (surfaces.length === 0) return { ok: true, detail: "no documentation surface here" };
    const findings = scanSurfaces(context.root, surfaces);
    if (findings.length === 0) return { ok: true, detail: `${surfaces.length} page(s) clean` };
    const named = findings.slice(0, NAMED_FINDINGS).map((finding) => `${finding.file}:${finding.line} ${finding.code}`);
    return {
      ok: true,
      detail: `${findings.length} finding(s) across ${surfaces.length} page(s), reporting only: ${named.join(", ")}`,
    };
  });
}

// The branch is classified once per inspection and cached on the context.
function report(context: CriterionContext, surfaces: JsonObject | undefined): SurfaceReport {
  context.surfaces ??= classifyBranch(context.root, surfaces);
  return context.surfaces;
}

function resolvedConfig(context: CriterionContext): RepoConfig | undefined {
  try {
    return readConfigSync(context.root);
  } catch {
    return undefined;
  }
}

function runInvocations(root: string, invocations: unknown): Verdict {
  if (!Array.isArray(invocations) || invocations.length === 0) return { ok: false, detail: "command group is empty" };
  const evidence: string[] = [];
  for (const invocation of invocations) {
    if (!Array.isArray(invocation) || invocation.length === 0) return { ok: false, detail: "command invocation is empty" };
    const argv = invocation.map((argument) => String(argument));
    const result = runCommand(root, argv);
    evidence.push(`${argv.join(" ")} -> ${result.detail}`);
    if (!result.ok) return { ok: false, detail: evidence.join(NEWLINE) };
  }
  return { ok: true, detail: `${invocations.length} invocation(s) exit 0\n${evidence.join(NEWLINE)}` };
}
