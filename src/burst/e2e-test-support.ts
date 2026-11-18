// Shared by the e2e test files: credentials, a TIR-backed run, and readers
// for what the fake machine and TIR recorded.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FakeTir } from "./fake_tir";
import { burstDependencies, burstEnvironment, burstRepository, fakeBin, fields, REPOSITORY } from "./test_support";

export const API_KEY = "e2e_test_key_00000000";
export const AUTH_TOKEN = "e2e_test_token_00000000";
export const CREDENTIALS = { E2E_API_KEY: API_KEY, E2E_AUTH_TOKEN: AUTH_TOKEN, E2E_PROJECT_ID: "12345" };
export const SECRETS = { secrets: { API_TOKEN: "op://Burst Vault/api/credential" } };
export const LANES = ["acceptance", "integration", "--provider", "e2e"];
export const ONE_LANE = ["acceptance", "--provider", "e2e"];
export const SNAPSHOT_NAME = new RegExp(`^orly-burst-${REPOSITORY}-\\d{17}-[0-9a-f]{8}$`);
export const CREATE = /^\/notebooks\/$/;
export const VM = /^\/notebooks\/\d+\/$/;

export function e2eRun(extra: Record<string, string> = {}, burstConfig: Record<string, unknown> = {}) {
  const root = burstRepository(burstConfig);
  const { bin, state } = fakeBin();
  const api = new FakeTir();
  const env = burstEnvironment(bin, state, { ...CREDENTIALS, ...extra });
  return { root, state, api, env, ...burstDependencies(root, env, api.fetch) };
}

export function machineScript(state: string): string {
  const machine = [...new Bun.Glob("203.0.113.*").scanSync({ cwd: state, onlyFiles: false })][0] ?? "";
  return readFileSync(join(state, machine, "job.sh"), "utf8");
}

export function created(api: FakeTir): Array<Record<string, unknown>> {
  return api.callsTo("POST", CREATE).map((call) => fields(call.body));
}
