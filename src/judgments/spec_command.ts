import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { UNSCOPED_ENVIRONMENT } from "../git_env";
import { OrlyError } from "../model";
import { HELP_FLAGS, INCOMPLETE_EXIT, JSON_FLAG, JSON_INDENT, NEWLINE, PROJECT_FLAG, REFRESH_FLAG, RESULT_STATUS } from "./constants";
import { judgeSpec, type SpecReport } from "./spec_runner";
import { DEFAULT_MIN_SCORE, MIN_SCORE_FLAG, minScoreSchema, PERCENT, SPEC_COMMAND, SPEC_RUBRIC, SPEC_STATUS } from "./spec_rubric";

type Options = { path: string; root: string; minScore: number; refresh: boolean; json: boolean };
const REVIEW_EXIT = 1;
const MIN_SCORE_REASON = "Minimum score must be a percentage greater than 0 and at most 100.";
const HELP = `orly judge spec <SPEC> [--project <ROOT>] [--min-score <PERCENT>] [--refresh] [--json]

Review a complete spec before implementation. This command does not run its steps.
Checks: structure, clear outcomes, scope, setup/order, failures, evidence, consistency.
Score: 100 x lowest yes probability. Default minimum: ${DEFAULT_MIN_SCORE}; valid range: >0 to 100.
READY means the review policy passed; it does not approve work or prove DONE.
Exit 0: READY. Exit 1: REVIEW. Exit 2: INCOMPLETE (never a passing score).
Default: exact offline replay; --refresh permits six scanned, bounded Jev requests.
Spec paths resolve from --project (the repository root by default) and must stay inside it.
Live refresh requires gitleaks and TYPESAFE_API_KEY. No automatic retries.
Reference: docs/JUDGMENTS.md`;

export async function specCommand(args: string[]): Promise<number> {
  if (args.some((arg) => HELP_FLAGS.some((flag) => flag === arg))) {
    // logging: command help is the program interface.
    console.log(HELP);
    return 0;
  }
  try {
    const options = parseSpecOptions(args);
    const report = await judgeSpec(options.root, options.path, options.refresh, options.minScore);
    // logging: readiness results and fixed inspection guidance are the program interface.
    console.log(options.json ? JSON.stringify(report, null, JSON_INDENT) : formatSpecReport(report));
    return report.status === SPEC_STATUS.ready ? 0 : report.status === SPEC_STATUS.review ? REVIEW_EXIT : INCOMPLETE_EXIT;
  } catch (error) {
    const reason = error instanceof OrlyError ? error.message : "Spec input is unavailable or invalid; see orly judge spec --help.";
    // logging: sanitized input failures are the program interface.
    console.log(args.includes(JSON_FLAG) ? JSON.stringify({ command: SPEC_COMMAND, advisory: true, status: SPEC_STATUS.incomplete, score: null, requests: 0, reason }) : `${SPEC_STATUS.incomplete}: ${reason}`);
    return INCOMPLETE_EXIT;
  }
}

export function parseSpecOptions(args: string[]): Options {
  const paths: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg) throw new OrlyError("Spec arguments must not be empty.");
    if (arg === REFRESH_FLAG || arg === JSON_FLAG) {
      if (flags.has(arg)) throw new OrlyError("Spec options must not be repeated.");
      flags.add(arg);
    } else if (arg === PROJECT_FLAG || arg === MIN_SCORE_FLAG) {
      const value = args[++index];
      if (!value || value.startsWith("-") || values.has(arg)) throw new OrlyError("Spec options need one value and must not be repeated.");
      values.set(arg, value);
    } else if (arg.startsWith("-")) throw new OrlyError("Unknown spec option; see orly judge spec --help.");
    else paths.push(arg);
  }
  const path = paths[0];
  if (paths.length !== 1 || !path) throw new OrlyError("Provide exactly one complete spec path.");
  const rawScore = values.get(MIN_SCORE_FLAG);
  if (rawScore !== undefined && !/^\d+(?:\.\d+)?$/.test(rawScore)) throw new OrlyError(MIN_SCORE_REASON);
  const minimum = minScoreSchema.safeParse(rawScore === undefined ? DEFAULT_MIN_SCORE : Number(rawScore));
  if (!minimum.success) throw new OrlyError(MIN_SCORE_REASON);
  return { path, root: realpathSync(resolve(values.get(PROJECT_FLAG) ?? repositoryRoot())), minScore: minimum.data, refresh: flags.has(REFRESH_FLAG), json: flags.has(JSON_FLAG) };
}

// The repository the caller stands in, so a spec path still resolves, and
// .orly/orly.json is still found, from a subdirectory. Outside a repository it
// is the current directory.
function repositoryRoot(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "ignore" });
  return result.exitCode === 0 ? result.stdout.toString().trim() : process.cwd();
}

export function formatSpecReport(report: SpecReport): string {
  const lines = [`${report.status}: ${report.score === null ? "no score" : `${report.score.toFixed(4)}%`} (minimum ${report.minScore}%)`,
    "Spec readiness review only; implementation and DONE still require their checks.",
    `Source: ${report.source.path}`, `Source digest: ${report.source.digest}`,
    `Structure: ${report.structural.passed ? "passed" : "review required"}; ${report.source.dimensions.length} Dimensions included.`];
  for (const finding of report.structural.findings) lines.push(`  ${finding}`);
  for (const check of report.checks) {
    const rubric = SPEC_RUBRIC.find((entry) => entry.id === check.id);
    if (check.status === RESULT_STATUS.incomplete) lines.push(`  ${rubric?.label ?? check.id}: incomplete — ${check.reason}`);
    else {
      lines.push(`  ${rubric?.label ?? check.id}: ${(check.probabilityYes * PERCENT).toFixed(4)}% yes${report.blocked.includes(check.id) ? " — review" : ""}`);
      if (report.blocked.includes(check.id) && rubric) lines.push(`    ${rubric.action}`);
    }
  }
  if (report.reason) lines.push(report.reason);
  lines.push(`${report.mode}; ${report.requests} requests; ${report.elapsedMs.toFixed(0)}ms. Scores use raw probabilities before display rounding.`);
  return lines.join(NEWLINE);
}
