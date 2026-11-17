import { readFileSync } from "node:fs";
import { join } from "node:path";

import { burstDependencies, burstEnvironment, burstRepository, callerAddress, fakeBin, recordedCalls, REPOSITORY } from "./test_support";

export async function awsRun(scenario: Record<string, unknown> = {}, burstConfig: Record<string, unknown> = {}) {
  const root = burstRepository(burstConfig);
  const { bin, state } = fakeBin();
  await Bun.write(join(state, "scenario.json"), JSON.stringify(scenario));
  return { root, state, ...burstDependencies(root, burstEnvironment(bin, state), callerAddress) };
}

export async function awsRunWith(extra: Record<string, string>, scenario: Record<string, unknown> = {}) {
  const root = burstRepository();
  const { bin, state } = fakeBin();
  await Bun.write(join(state, "scenario.json"), JSON.stringify(scenario));
  return { root, state, bin, ...burstDependencies(root, burstEnvironment(bin, state, extra), callerAddress) };
}

export function aws(state: string, verb?: string): string[][] {
  return recordedCalls(state).filter((call) => call[0] === "aws" && (verb === undefined || call[2] === verb));
}

export function option(call: string[] | undefined, name: string): string {
  const index = call?.indexOf(name) ?? -1;
  return index < 0 ? "" : call?.[index + 1] ?? "";
}

export function machineScript(state: string, address: string): string {
  return readFileSync(join(state, address, "job.sh"), "utf8");
}

export async function seedImages(state: string, names: string[]): Promise<void> {
  const images = names.map((name, index) => ({ id: `ami-0000000000000000${index + 1}`, name, repo: REPOSITORY, snapshots: [`snap-${index + 1}`], size: 80 }));
  await Bun.write(join(state, "images.json"), JSON.stringify(images));
}

