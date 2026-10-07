import { join, resolve } from "node:path";

import { OrlyError } from "../../../src/model";
import { INCOMPLETE_EXIT, MAX_SOURCE_BYTES, MODEL, NEWLINE } from "../../../src/judgments/constants";
import { readBounded } from "../../../src/judgments/files";
import { loadCases } from "./corpus";
import { verifyCaseLabel } from "./hidden/label-oracle";
import { validateLabels } from "./labels";
import { adoptionDecision, missingObservations, scoreQuestion, validateObservations } from "./score";
import { loadTasks } from "./tasks";
import { CANDIDATE } from "./types";
import { collectTasks, deterministicOutcomes, evaluatorSources, passedControl } from "./report";
import { validateCases, validateCatalog } from "./validate";

export const EVALUATION_MODE = { check: "--check", offline: "--offline" } as const;
export const ARGUMENT_ERROR = "Use exactly --check or --offline; live calls and unknown arguments are unsupported.";
const ROOT = resolve(import.meta.dir, "../../..");
const CATALOG_PATH = "evals/judgments/comparison/catalog.json";
const LABELS_PATH = "evals/judgments/comparison/labels.json";
const CHECK_FAILURE = "A deterministic task control did not discriminate the seeded failure.";

export async function comparisonCommand(args: string[], root: string = ROOT) {
  const mode = args[0];
  if (args.length !== 1 || (mode !== EVALUATION_MODE.check && mode !== EVALUATION_MODE.offline)) throw new OrlyError(ARGUMENT_ERROR);
  const catalog = validateCatalog(JSON.parse(await readBounded(join(root, CATALOG_PATH), MAX_SOURCE_BYTES)));
  const cases = await validateCases(root, catalog, await loadCases(root));
  const labels = await validateLabels(root, catalog, cases, JSON.parse(await readBounded(join(root, LABELS_PATH), MAX_SOURCE_BYTES)),
    (entry, label) => verifyCaseLabel(root, entry, label));
  const tasks = await loadTasks(root);
  const sources = await evaluatorSources(root);
  const observations = validateObservations(cases, missingObservations(cases));
  const metrics = [...catalog.baseline, ...catalog.candidates].map((entry) => scoreQuestion(entry.question, cases, labels, observations));
  const adoption = Object.values(CANDIDATE).map((question) => adoptionDecision(question, cases, labels, observations, null));
  const controls = mode === EVALUATION_MODE.offline ? await collectTasks(root, tasks) : [];
  const passed = controls.every(passedControl);
  return { exit: passed ? 0 : 1, report: { mode, model: MODEL, baseline_questions: catalog.baseline.length, candidates: catalog.candidates.length,
    cases: cases.length, resolved_labels: labels.length, sources, metrics, adoption, controls, observations,
    reproducible: { sources, outcomes: deterministicOutcomes(controls), metrics, adoption },
    uncertainty: "No model observations: accuracy and sample uncertainty are unavailable. Fixture counts are not independent model samples.",
    live_requests: 0, autonomous_completion: null, passed, ...(passed ? {} : { failure: CHECK_FAILURE }) } };
}

if (import.meta.main) {
  try {
    const result = await comparisonCommand(Bun.argv.slice(2));
    process.stdout.write(JSON.stringify(result.report) + NEWLINE); // logging: JSON stdout is the contributor command interface.
    process.exitCode = result.exit;
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error), live_requests: 0 }) + NEWLINE); // logging: JSON stderr is the contributor command refusal.
    process.exitCode = INCOMPLETE_EXIT;
  }
}
