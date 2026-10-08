import { mkdirSync, realpathSync, renameSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { OrlyError } from "../../../src/model";
import { MAX_SOURCE_BYTES, NEWLINE, PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE } from "../../../src/judgments/constants";
import { digest, readBounded } from "../../../src/judgments/files";
import { loadCases } from "./corpus";
import { consumerJevExamples } from "./jev-consumer";
import { corpusJevExamples, evaluateJev, type JevAttempt } from "./jev";
import { JEV_MODE, MAX_JEV_REPORT_BYTES, jevReport, renderJevReport, replayJev } from "./jev-report";
import { verifyCaseLabel } from "./hidden/label-oracle";
import { validateLabels } from "./labels";
import { evaluatorSources } from "./report";
import { validateCases, validateCatalog } from "./validate";

const ROOT = resolve(import.meta.dir, "../../..");
const CATALOG_FILE = "evals/judgments/comparison/catalog.json";
const LABELS_FILE = "evals/judgments/comparison/labels.json";
const REPORT_FILE = "report.json";
const TEMP_REPORT = "report.pending.json";
const MARKDOWN_FILE = "report.md";
const ARGUMENT_ERROR = "Use --live <consumer-worktree> <consumer-receipt> <new-output-directory>, or --replay with a saved report as the final argument.";
const PENDING = "Scheduled Jev attempt has not executed.";
const OUTPUT_ERROR = "Jev output must be a new directory outside the authoring and consumer worktrees.";

async function run(args: string[]): Promise<void> {
  const [mode, consumerArgument, receiptArgument, outputArgument, saved] = args;
  if ((mode !== JEV_MODE.live && mode !== JEV_MODE.replay) || !consumerArgument || !receiptArgument || !outputArgument ||
    args.length !== (mode === JEV_MODE.live ? 4 : 5) || (mode === JEV_MODE.replay && !saved)) throw new OrlyError(ARGUMENT_ERROR);
  const consumer = realpathSync(resolve(consumerArgument));
  const catalog = validateCatalog(JSON.parse(await readBounded(join(ROOT, CATALOG_FILE), MAX_SOURCE_BYTES)));
  const cases = await validateCases(ROOT, catalog, await loadCases(ROOT));
  const labels = await validateLabels(ROOT, catalog, cases, JSON.parse(await readBounded(join(ROOT, LABELS_FILE), MAX_SOURCE_BYTES)),
    (entry, label) => verifyCaseLabel(ROOT, entry, label));
  const examples = [...corpusJevExamples(catalog, cases, labels), ...await consumerJevExamples(consumer, resolve(receiptArgument), catalog)];
  const sources = await evaluatorSources(ROOT);
  const output = createOutput(outputArgument, consumer);
  const attempts: JevAttempt[] = examples.map((entry) => ({ id: entry.id, question: entry.question, identity: entry.identity,
    request_digest: digest(entry.input.request), requests: 0, elapsed_ms: 0, reply: null, failure: PENDING }));
  const write = async (completed: boolean) => {
    const report = jevReport(examples, attempts, cases, labels, sources, mode, completed);
    await Bun.write(join(output, TEMP_REPORT), JSON.stringify(report, null, 2) + NEWLINE, { mode: PRIVATE_FILE_MODE });
    renameSync(join(output, TEMP_REPORT), join(output, REPORT_FILE));
    await Bun.write(join(output, MARKDOWN_FILE), renderJevReport(report), { mode: PRIVATE_FILE_MODE });
  };
  await write(false);
  if (mode === JEV_MODE.replay && saved) attempts.splice(0, attempts.length, ...replayJev(examples, JSON.parse(await readBounded(resolve(saved), MAX_JEV_REPORT_BYTES)), sources));
  else await evaluateJev(examples, Bun.env.TYPESAFE_API_KEY, undefined, async (attempt) => {
    const index = examples.findIndex((entry) => entry.id === attempt.id);
    attempts[index] = attempt;
    await write(false);
  });
  await write(true);
  process.stdout.write(JSON.stringify({ report: join(output, REPORT_FILE), readable: join(output, MARKDOWN_FILE), attempts: attempts.length,
    requests: mode === JEV_MODE.live ? attempts.reduce((sum, entry) => sum + entry.requests, 0) : 0 }) + NEWLINE);
}

function createOutput(argument: string, consumer: string): string {
  const output = join(realpathSync(dirname(resolve(argument))), basename(resolve(argument)));
  for (const root of [ROOT, consumer]) {
    const path = relative(root, output);
    if (path === "" || (path !== ".." && !path.startsWith("../"))) throw new OrlyError(OUTPUT_ERROR);
  }
  mkdirSync(output, { mode: PRIVATE_DIRECTORY_MODE });
  return output;
}

if (import.meta.main) await run(Bun.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ error: error instanceof OrlyError ? error.message : "Jev evaluation failed before completion; any durable attempts remain in the output directory." }) + NEWLINE);
  process.exitCode = 2;
});
