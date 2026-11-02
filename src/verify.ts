import { existsSync } from "node:fs";
import { join } from "node:path";

import { localSelection } from "./config";
import { managedContent } from "./installation/plan";
import { hashContent, isString, objectArray, objectValue, RulesModel } from "./model";
import { Renderer } from "./render";
import { catalogueFindings } from "./standards";

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

// Three proofs about the ruleset in this checkout: the standards catalogue
// keeps its rules, the committed root AGENTS.md matches its render, and every
// pack copy matches its source. No stored hashes — the render is the reference.
export async function verifyRuleset(model: RulesModel): Promise<VerificationCheck[]> {
  model.validate();
  const local = await localSelection(model, model.root);
  return [
    check("standards.catalogue", catalogueFindings(model.root)),
    check("generated.root.current", await new Renderer(model).rootErrors(local.packs, local.commands)),
    check("packs.sources.current", await packSourceErrors(model, local.packs)),
  ];
}

function check(name: string, findings: string[]): VerificationCheck {
  return { name, result: findings.length === 0 ? PASS_RESULT : FAIL_RESULT, detail: findings.join(DETAIL_SEPARATOR) };
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
