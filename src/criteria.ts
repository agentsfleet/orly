import type { Criterion, CriterionContext } from "./criteria_support";
import { criterion } from "./criteria_support";
import { gitOutput } from "./git_env";
import { scanChangedDocuments } from "./doc_changes";
import { JsonObject, messageOf } from "./model";
import { NOT_INSTALLED, readConfigSync, RepoConfig } from "./config";
import { classifyBranch, couplingGaps, DEFAULT_BRANCHES, defaultMergeBase, SurfaceReport } from "./surfaces";
import { commandSetupErrors } from "./validation";
import { limitsFor } from "./command_limits";
import { runVerification } from "./verification";
import { hasProof } from "./verification_store";
import { newTests } from "./proof";


type CommandTier = typeof CONFORM_TIER | typeof FAST_TIER | typeof ALL_TIER;

const REV_PARSE = "rev-parse";
const HEAD = "HEAD";
const UPSTREAM = "@{upstream}";
const DETAIL_SEPARATOR = "; ";
const ABBREV_REF = "--abbrev-ref";
const BRANCH_REF_PREFIX = "refs/heads/";

const GIT_BRANCH = "git.branch";
const GIT_TREE = "git.tree";
const GIT_PUSHED = "git.pushed";
const REPO_CONFIG = "repo.config";
const DOCS_UPDATED = "docs.updated";
const DOCS_LANGUAGE = "docs.language";
const PATHS_COUPLED = "paths.coupled";
const TESTS_PROVEN = "tests.proven";
// How many findings a report names before it stops listing them. A criterion
// line is a summary, not a linter dump.
const NAMED_FINDINGS = 3;
const CONFORM_TIER = "conform";
const FAST_TIER = "fast";
const ALL_TIER = "all";
const VERIFY_PREFIX = "verify.";
const UNIT_LANE = "verify.unit";
const CONDITIONAL_LANES = ["verify.integration", "verify.memory"];

// CONFORM is its own lifecycle stage — EXECUTE → CONFORM → VERIFY — and it is
// its own tier here for the same reason. Lumped into verify, the deterministic
// rule audit could only run beside the lint and unit suites, so a repository
// paid minutes to learn something its seconds-long conform command already
// knew, and `orly gate` ran it twice on the way to `pr`.
// Commit checks run the repository's conform command over the working tree.
// Push checks permit in-flight Sections and omit the boundary test suites. The
// final gate runs all declared verification itself, including checks a custom
// repository hook may not have invoked. A spec is reviewed while it is written
// (an EGM review); the gate reads one thing in it, a leftover template slot.
export function criteriaFor(gate: string, context: CriterionContext): Criterion[] {
  if (gate === "work") return [repositoryConfig(), ...commandCriteria(context, CONFORM_TIER)];
  if (gate === "verify") return [repositoryConfig(), docsLanguage(), ...commandCriteria(context, FAST_TIER)];
  if (gate === "pr") {
    return [
      gitBranch(), gitTree(), gitPushed(),
      criterion("git.base", (inner) => { report(inner, resolvedConfig(inner)?.surfaces); return { ok: true, detail: "branch diff is available" }; }),
      repositoryConfig(), docsLanguage(), docsUpdated(), pathsCoupled(), testsProven(), ...commandCriteria(context, ALL_TIER),
    ];
  }
  return [];
}

function gitBranch(): Criterion {
  return criterion(GIT_BRANCH, (context) => {
    // A non-zero exit means a detached HEAD, which names no branch (CODE-BRANCH).
    const ref = gitOutput(context.root, ["symbolic-ref", "--quiet", "HEAD"]);
    const branch = ref.startsWith(BRANCH_REF_PREFIX) ? ref.slice(BRANCH_REF_PREFIX.length) : "";
    if (!branch) return { ok: false, detail: "HEAD is detached; work on a branch" };
    const remoteDefault = gitOutput(context.root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
    const ok = !DEFAULT_BRANCHES.includes(branch) && remoteDefault !== `refs/remotes/origin/${branch}`;
    return { ok, detail: ok ? `on ${branch}` : `refusing to work on the default branch: ${branch}` };
  });
}

function gitTree(): Criterion {
  return criterion(GIT_TREE, (context) => {
    // NUL-separated with one entry per path, so an unusual name is read as it is (CODE-GITZ).
    const dirty = gitOutput(context.root, ["status", "--porcelain=v1", "-z", "--no-renames", "-uall"], true)
      .split("\0")
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
      if (!config) return { ok: false, detail: NOT_INSTALLED };
      const errors = commandSetupErrors(config.commands);
      return { ok: errors.length === 0, detail: errors.length > 0 ? errors.join(DETAIL_SEPARATOR) : `${Object.keys(config.commands).length} command(s) declared` };
    } catch (error) {
      return { ok: false, detail: messageOf(error) };
    }
  });
}

// The declared commands a tier runs: conform alone, the fast verify.* lanes
// without the boundary suites, or every verify.* lane.
function selectedCommands(commands: RepoConfig["commands"], tier: CommandTier): string[] {
  return Object.keys(commands).filter((key) => {
    if (tier === CONFORM_TIER) return key === CONFORM_TIER;
    if (!key.startsWith(VERIFY_PREFIX)) return false;
    return tier === ALL_TIER || (key !== UNIT_LANE && !CONDITIONAL_LANES.includes(key));
  }).sort();
}

// Commands and source paths are repository-owned. Only integration and memory
// checks are conditional on code; every other declared lane always runs.
function commandCriteria(context: CriterionContext, tier: CommandTier): Criterion[] {
  const config = resolvedConfig(context);
  if (!config) return unavailablePlan();
  const commands = config.commands;
  const selected = selectedCommands(commands, tier);
  if (selected.length === 0 && tier === ALL_TIER) return unavailablePlan();
  return selected.map((key) => criterion(`cmd.${key}`, (inner) => {
    if (CONDITIONAL_LANES.includes(key) && report(inner, config.surfaces).code.length === 0) {
      return { ok: true, status: "skipped", detail: "skipped — no code files on this branch" };
    }
    return runVerification(inner, config, key, limitsFor(config.limits, key));
  }, "command"));
}

function unavailablePlan(): Criterion[] {
  return [criterion("cmd.plan", () => ({ ok: false, status: "blocked", detail: "required command plan is unavailable; repair repository configuration" }), "command")];
}

function docsUpdated(): Criterion {
  return criterion(DOCS_UPDATED, (context) => {
    const config = resolvedConfig(context);
    if (!config?.surfaces) return { ok: true, detail: "no user surface declared in .orly/orly.json" };
    const surfaces = report(context, config.surfaces);
    if (surfaces.userSurface.length === 0) return { ok: true, detail: "no user-surface files on this branch" };
    if (surfaces.docs.length > 0) return { ok: true, detail: `${surfaces.userSurface.length} user-surface file(s), ${surfaces.docs.length} docs file(s) updated` };
    return {
      ok: false,
      detail: `${surfaces.userSurface.length} user-surface file(s) changed (first: ${surfaces.userSurface[0] ?? ""}) with no docs change — update the docs page, or record: orly override ${DOCS_UPDATED} --reason <REASON>`,
    };
  });
}

// A boundary check like docs.updated: a Section in progress may push one side
// before the other, so only the pr gate asks for both.
function pathsCoupled(): Criterion {
  return criterion(PATHS_COUPLED, (context) => {
    const config = resolvedConfig(context);
    if (!config?.coupled) return { ok: true, detail: "no coupled paths declared in .orly/orly.json" };
    const gaps = couplingGaps(config.coupled, report(context, config.surfaces).changed);
    if (gaps.length === 0) return { ok: true, detail: `${config.coupled.length} coupled path group(s) changed together or not at all` };
    return { ok: false, detail: `${gaps.join(DETAIL_SEPARATOR)}; change both sides, or record: orly override ${PATHS_COUPLED} --reason <REASON>` };
  });
}

// Reported, never enforced: a proof lives beneath one worktree's Git metadata,
// so another clone or CI holds none, and private local history may change how
// much work a gate repeats but never its verdict.
function testsProven(): Criterion {
  return criterion(TESTS_PROVEN, (context) => {
    const changed = report(context, resolvedConfig(context)?.surfaces).changed;
    const tests = newTests(context.root, defaultMergeBase(context.root), changed);
    if (tests.length === 0) return { ok: true, detail: "no new test declarations on this branch" };
    const unproven = tests.filter(({ file, test }) => !hasProof(context.root, file, test));
    if (unproven.length === 0) return { ok: true, detail: `${tests.length} new test(s), each with a fail-before proof` };
    const named = unproven.slice(0, NAMED_FINDINGS).map(({ file, test }) => `${file} › ${test}`).join(DETAIL_SEPARATOR);
    return { ok: true, detail: `reported, not enforced: ${unproven.length} of ${tests.length} new test(s) have no fail-before proof; record one with orly proof: ${named}` };
  });
}

function docsLanguage(): Criterion {
  return criterion(DOCS_LANGUAGE, (context) => {
    try {
      const findings = scanChangedDocuments(context.root);
      if (findings.length === 0) return { ok: true, detail: "changed documentation prose is clean" };
      const named = findings.slice(0, NAMED_FINDINGS).map((finding) =>
        `${finding.file}:${finding.line} ${finding.code}: ${finding.message}`);
      return { ok: false, detail: `${findings.length} finding(s): ${named.join(DETAIL_SEPARATOR)}` };
    } catch (error) {
      return { ok: false, detail: messageOf(error) };
    }
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
