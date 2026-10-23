import type { ProviderInput } from "./types";

import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import { validateSpec } from "../../audits/spec-template";
import { CONFIG_PATH, parseConfig } from "../config";
import { isObject, OrlyError } from "../model";
import { specDimensionsOf } from "../spec_obligations";
import { MAX_MANIFEST_BYTES, MAX_REQUEST_BYTES, MAX_SOURCE_BYTES, MAX_STATE_BYTES, MODEL, REPLY_KEY } from "./constants";
import { byteLength, digest, readBounded } from "./files";
import { SPEC_COMMAND, SPEC_RUBRIC, SPEC_RUBRIC_VERSION, specQuestion, type SpecCheckId } from "./spec_rubric";

export type SpecPreparedCheck = ProviderInput & { id: SpecCheckId; identity: string };
export type PreparedSpec = {
  root: string; path: string; inputPath: string; digest: string; configDigest: string; rubricDigest: string;
  dimensions: string[]; findings: string[]; checks: SpecPreparedCheck[];
};

export async function prepareSpec(root: string, path: string): Promise<PreparedSpec> {
  const project = realpathSync(root);
  const inputPath = resolve(project, path);
  const actual = realpathSync(inputPath);
  const source = await readBounded(actual, MAX_SOURCE_BYTES);
  const config = await readBounded(join(project, CONFIG_PATH), MAX_MANIFEST_BYTES);
  let value: unknown;
  try { value = JSON.parse(config); } catch { throw new OrlyError("Project configuration is not valid JSON."); }
  if (!isObject(value)) throw new OrlyError("Project configuration must be a JSON object.");
  const commands = parseConfig(value).commands;
  if (!Object.keys(commands).length) throw new OrlyError("Declare project commands in .orly/orly.json before judging a spec.");
  const findings = validateSpec(source, commands, (reference) => existsSync(join(project, reference)));
  if (/\[\?\]/.test(source)) findings.push("Resolve every [?] decision before judging readiness.");
  const dimensions = specDimensionsOf(source).map((dimension) => dimension.id);
  const state = JSON.stringify({ spec: source, commands, requiredDimensions: dimensions });
  if (byteLength(state) > MAX_STATE_BYTES) throw new OrlyError(`Complete spec state exceeds ${MAX_STATE_BYTES} bytes; nothing was truncated or uploaded.`);
  const configDigest = digest(config);
  const rubricDigest = digest(JSON.stringify({ version: SPEC_RUBRIC_VERSION, questions: SPEC_RUBRIC.map(specQuestion) }));
  const checks = SPEC_RUBRIC.map((check): SpecPreparedCheck => {
    const question = specQuestion(check);
    const request = JSON.stringify({ model: MODEL, state: JSON.parse(state), questions: { [REPLY_KEY]: question } });
    if (byteLength(request) > MAX_REQUEST_BYTES) throw new OrlyError(`Spec request exceeds ${MAX_REQUEST_BYTES} bytes; nothing was uploaded.`);
    const identity = digest(JSON.stringify({ command: SPEC_COMMAND, project, path: actual, configDigest, rubricDigest, id: check.id, request }));
    return { id: check.id, identity, request, definition: { question } };
  });
  return { root: project, path: actual, inputPath, digest: digest(source), configDigest, rubricDigest, dimensions, findings, checks };
}

export async function assertSpecUnchanged(prepared: PreparedSpec): Promise<void> {
  const current = await prepareSpec(prepared.root, prepared.inputPath);
  if (JSON.stringify(current) !== JSON.stringify(prepared)) throw new OrlyError("Spec or project facts changed during judgment; rerun for the current inputs.");
}
