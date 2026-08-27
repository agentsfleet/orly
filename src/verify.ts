import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { localSelection } from "./config";
import { managedContent } from "./install";
import { hashContent, isString, objectArray, objectValue, RulesModel } from "./model";
import { Renderer } from "./render";

const PASS_RESULT = "pass";
const FAIL_RESULT = "fail";
const REGISTRY_PACKS_LABEL = "registry packs";
const AGENTS_FILENAME = "AGENTS.md";
const DETAIL_SEPARATOR = "; ";

export type VerificationCheck = {
  name: string;
  result: typeof PASS_RESULT | typeof FAIL_RESULT;
  detail?: string;
};

// Two proofs: every profile renders the same bytes twice (determinism), and
// the committed root AGENTS.md matches its render (currency). No stored
// hashes — the render itself is the reference.
export async function verifyRenders(model: RulesModel): Promise<VerificationCheck[]> {
  model.validate();
  const checks: VerificationCheck[] = [];
  const renderer = new Renderer(model);
  const local = await localSelection(model, model.root);
  const everything = Object.keys(objectValue(model.registry.packs, "registry packs")).sort();
  for (const [name, packs] of [["local", local.packs], ["all", everything]] as Array<[string, string[]]>) {
    const first = await renderer.renderText(packs, local.commands);
    const second = await renderer.renderText(packs, local.commands);
    checks.push({
      name: `render.${name}.idempotent`,
      result: first === second ? PASS_RESULT : FAIL_RESULT,
    });
  }
  const errors = await renderer.rootErrors(local.packs, local.commands);
  checks.push({ name: "generated.root.current", result: errors.length === 0 ? PASS_RESULT : FAIL_RESULT, detail: errors.join(DETAIL_SEPARATOR) });
  const drift = await packSourceErrors(model, local.packs);
  checks.push({ name: "packs.sources.current", result: drift.length === 0 ? PASS_RESULT : FAIL_RESULT, detail: drift.join(DETAIL_SEPARATOR) });
  return checks;
}

// Every pack file this checkout carries, against the bytes its pack would ship.
//
// `planFiles` deliberately skips writing a managed file into the checkout that
// owns its source: writing there would either replace a source with its own
// pack-filtered rendering or plant a second copy that drifts. The consequence is
// that the copy living here is maintained BY HAND and no install ever corrects
// it — so a source can gain three sections while the target beside it keeps the
// old two, and every consumer receives rules this repository's own agents, its
// dispatch-coverage audit, and its rule ledger never see. Both halves of that
// had already happened when this check was written.
//
// A target the checkout does not carry is silence, not drift: a consumer-only
// path (a skill copied into `.claude/skills/`) is absent here by design.
export async function packSourceErrors(model: RulesModel, packs: string[]): Promise<string[]> {
  const registryPacks = objectValue(model.registry.packs, REGISTRY_PACKS_LABEL);
  const known = new Set(Object.keys(registryPacks));
  const findings = new Set<string>();
  for (const name of packs) {
    const pack = objectValue(registryPacks[name], `pack ${name}`);
    for (const entry of objectArray(pack.managed_files, `pack ${name} managed_files`)) {
      if (!isString(entry.source) || !isString(entry.target)) continue;
      // Same path on both sides is the source itself — nothing to compare it to.
      if (entry.source === entry.target) continue;
      const targetPath = join(model.root, entry.target);
      if (!existsSync(targetPath)) continue;
      // The engine checkout renders its own rules under their own name, so the
      // citation retarget managedContent applies for a guest is identity here.
      const expected = await managedContent(join(model.root, entry.source), entry.target, entry.source, packs, known, AGENTS_FILENAME);
      if (hashContent(expected) === hashContent(await Bun.file(targetPath).bytes())) continue;
      findings.add(`${entry.target} drifted from ${entry.source} (pack ${name}) — copy the source over it`);
    }
  }
  return [...findings].sort();
}

export async function writeEvidence(
  model: RulesModel,
  profile: string,
  checks: VerificationCheck[],
  languageModelResult: "pass" | "not-required",
): Promise<string> {
  const path = join(model.root, ".oracle/evidence.json");
  mkdirSync(dirname(path), { recursive: true });
  const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: model.root, stdout: "pipe", stderr: "ignore" });
  const evidence = {
    schema_version: 1,
    profile,
    source_commit: commit.exitCode === 0 ? commit.stdout.toString().trim() : "uncommitted",
    result: checks.every((check) => check.result === PASS_RESULT) ? PASS_RESULT : FAIL_RESULT,
    checks,
    llm_result: languageModelResult,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
  };
  await Bun.write(path, `${JSON.stringify(evidence, null, 2)}\n`);
  return path;
}
