import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { OrlyError } from "../model";
import { HELP_FLAGS, INCOMPLETE_EXIT, INPUT_FLAG, JSON_FLAG, JSON_INDENT, MAX_MANIFEST_BYTES, PROJECT_FLAG, QUESTIONS, REFRESH_FLAG, RESULT_STATUS, ROLE, SELECTOR_KIND } from "./constants";
import { readBounded } from "./files";
import { validateManifest } from "./questions";
import { judge } from "./runner";
import { manifestSchema, type Report, type Stage } from "./types";

type Options = { stage: Stage; input: string; project: string; refresh: boolean; json: boolean };
const EXAMPLE_MANIFEST = { stage: "verify", items: [{ id: "locale", question: "verify.assertion", requirement: "Describe the exact required result", evidence: [
  { role: ROLE.implementation, path: "src/label.ts", selector: { kind: SELECTOR_KIND.function, name: "label" } },
  { role: ROLE.test, path: "src/label.test.ts", selector: { kind: SELECTOR_KIND.test, name: "label respects locale" } },
] }] };
const HELP = `orly judge <plan|verify|review|document> --input <manifest> [--project <root>] [--refresh] [--json]

Default: exact offline replay. Missing or changed input returns exit 2.
--refresh: explicitly permit scanned source upload and one live request per item.
Advice never approves work, runs a suggested command, or changes a gate result.
Manifest: ${JSON.stringify(EXAMPLE_MANIFEST, null, JSON_INDENT)}
Selectors: bounded file, complete function, named executable test, plain Markdown section.
Questions: ${QUESTIONS.join(", ")}
Runtime: Bun. Live refresh requires gitleaks and TYPESAFE_API_KEY.
Reference: docs/JUDGMENTS.md`;

export async function judgmentCommand(args: string[]): Promise<number> {
  if (args.some((argument) => HELP_FLAGS.some((flag) => flag === argument))) {
    // logging: command help is the program interface.
    console.log(HELP);
    return 0;
  }
  try {
    const options = parseOptions(args);
    const raw = await readBounded(resolve(options.input), MAX_MANIFEST_BYTES);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new OrlyError("Judgment manifest is not valid JSON."); }
    const parsed = manifestSchema.safeParse(value);
    if (!parsed.success) throw new OrlyError("Judgment manifest is invalid; see orly judge --help.");
    validateManifest(parsed.data, options.stage);
    const report = await judge(options.project, parsed.data, options.refresh);
    printReport(report, options.json);
    return report.results.some((item) => item.status === RESULT_STATUS.incomplete) ? INCOMPLETE_EXIT : 0;
  } catch (error) {
    const reason = error instanceof OrlyError ? error.message : "Judgment input is unavailable; see orly judge --help.";
    // logging: a single structured command result is the program interface; raw exceptions are excluded.
    console.log(args.includes(JSON_FLAG) ? JSON.stringify({ status: RESULT_STATUS.incomplete, advisory: true, reason }) : `incomplete: ${reason}`);
    return INCOMPLETE_EXIT;
  }
}

function parseOptions(args: string[]): Options {
  const stage = manifestSchema.shape.stage.safeParse(args[0]);
  if (!stage.success) throw new OrlyError("Choose one judgment stage: plan, verify, review or document.");
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 1; index < args.length; index++) {
    const argument = args[index];
    if (argument === REFRESH_FLAG || argument === JSON_FLAG) {
      if (flags.has(argument)) throw new OrlyError("Judgment options must not be repeated.");
      flags.add(argument);
    } else if (argument === INPUT_FLAG || argument === PROJECT_FLAG) {
      const value = args[++index];
      if (!value || value.startsWith("-") || values.has(argument)) throw new OrlyError("Judgment path options need one value and must not be repeated.");
      values.set(argument, value);
    } else throw new OrlyError("Unknown judgment option; see orly judge --help.");
  }
  const input = values.get(INPUT_FLAG);
  if (!input) throw new OrlyError("Judgment command requires --input <manifest>.");
  return { stage: stage.data, input, project: realpathSync(resolve(values.get(PROJECT_FLAG) ?? process.cwd())), refresh: flags.has(REFRESH_FLAG), json: flags.has(JSON_FLAG) };
}

function printReport(report: Report, json: boolean): void {
  if (json) {
    // logging: structured advice is the program interface.
    console.log(JSON.stringify(report, null, JSON_INDENT));
    return;
  }
  const lines = ["Jev advice — deterministic checks and owner decisions still apply."];
  for (const item of report.results) {
    if (item.status === RESULT_STATUS.incomplete) { lines.push(`${item.id}: incomplete — ${item.reason}`); continue; }
    const assessment = item.assessment;
    lines.push(`${item.id}: ${assessment.uncertain ? "uncertain" : assessment.concern ? "concern" : "quiet"} (${assessment.decision}; strength ${assessment.strength.toFixed(3)}; ${item.mode})`);
    lines.push(`  ${assessment.action}`);
    for (const source of item.sources) lines.push(`  ${source.path}:${source.startLine}–${source.endLine}`);
    lines.push(`  ${item.elapsedMs.toFixed(0)}ms; input tokens ${item.usage.input_tokens}; output tokens ${item.usage.output_tokens}`);
  }
  // logging: bounded source references and fixed advice are the program interface.
  console.log(lines.join("\n"));
}
