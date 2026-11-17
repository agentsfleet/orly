import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH, readConfigSync, contentDigest } from "./config";
import { git, modelFor, newRepository, pushFixture } from "./gates_test_support";
import { verificationState } from "./verification_store";

export const VERIFICATION_LANE = "verify.unit";
export const VERIFICATION_POLICY = { hermetic: true as const, max_age_ms: 3600000, toolchain: [[process.execPath, "--version"]], inputs: [] as string[] };
const FIXTURE_SCRIPT = `
const count = Bun.file(".git/verification-count");
await Bun.write(count, String((await count.exists() ? Number(await count.text()) : 0) + 1));
console.log("fixture report: 7 checks passed");
if (await Bun.file(".git/fail-verification").exists()) process.exit(1);
if (await Bun.file(".git/pause-verification").exists()) {
  await Bun.write(".git/verification-child", String(process.pid));
  await Bun.sleep(30000);
}
if (await Bun.file(".git/poison-completion").exists()) {
  const {mkdirSync, readdirSync, unlinkSync} = await import("node:fs");
  const state = ".git/orly-verification";
  const lane = readdirSync(state).find(name => /^[a-f0-9]{64}$/.test(name));
  const path = state + "/" + lane;
  const latest = readdirSync(path).sort().at(-1);
  mkdirSync(path + "/" + latest + "/completion.tmp");
  unlinkSync(".git/poison-completion");
}
if (await Bun.file(".git/change-verification-input").exists()) await Bun.write("tracked-input.txt", "changed during execution");
if (await Bun.file(".git/commit-verification-edit").exists()) {
  await Bun.write("README.md", "Documented during verification.\\n");
  for (const args of [["add", "README.md"], ["commit", "-qm", "test: concurrent documentation"], ["push", "-q"]]) {
    const result = Bun.spawnSync(["git", ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, timeout: 10000 });
    if (result.exitCode !== 0) throw new Error("fixture Git operation failed");
  }
}
`;

export async function verificationFixture(trackedInputs?: string[]) {
  const root = newRepository();
  const model = await modelFor(root, undefined, { [VERIFICATION_LANE]: [[process.execPath, "verify-fixture.ts"]] });
  writeFileSync(join(root, "verify-fixture.ts"), FIXTURE_SCRIPT);
  writeFileSync(join(root, "tracked-input.txt"), "original input");
  writeFileSync(join(root, ".gitignore"), "extra-input/\n");
  const config = readConfigSync(root)!;
  config.reuse = { [VERIFICATION_LANE]: structuredClone(VERIFICATION_POLICY) };
  if (trackedInputs) config.reuse[VERIFICATION_LANE] = { ...VERIFICATION_POLICY, tracked_inputs: trackedInputs };
  writeFileSync(join(root, CONFIG_PATH), JSON.stringify(config));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: configure verification fixture");
  pushFixture(root);
  return { root, model, config, policy: config.reuse[VERIFICATION_LANE]! };
}

export function verificationCount(root: string): number {
  return Number(readFileSync(join(root, ".git/verification-count"), "utf8"));
}

export function attemptPaths(root: string): string[] {
  const parent = join(verificationState(root), contentDigest(VERIFICATION_LANE).slice("sha256:".length));
  return readdirSync(parent).sort().map((name) => join(parent, name));
}
