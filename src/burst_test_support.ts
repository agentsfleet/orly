// Shared fixtures for the burst suites: a repository with lanes declared, a
// directory of fake executables first on PATH, a line sink, and the
// caller-address answer; burst_fake_tir.ts answers for E2E Networks TIR. No suite
// reaches a real cloud: `aws`, `ssh` and `op` on the PATH they hand orly are
// these fakes, and the only fetch they hand it is one of these.
import type { BurstDependencies } from "./burst";
import type { Environment } from "./burst_settings";

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH } from "./config";
import { git, newRepository, ROOT, temporaryDirectory } from "./gates_test_support";
import { isObject } from "./model";


export const FIXTURE_BRANCH = "feat/burst-fixture";
// The origin remote below is acme/widget; snapshots are named for both parts.
export const REPOSITORY = "acme-widget";
export const SECRET_VALUE = "op-value-test-0000";
export const CALLER_ADDRESS = "198.51.100.77";

export function burstRepository(burst: Record<string, unknown> = {}, lanes: Record<string, string[][]> = {}): string {
  const root = newRepository();
  const config = {
    schema_version: 1, packs: [],
    commands: { "verify.unit": [["true"]], "burst.acceptance": [["true"]], "burst.integration": [["true"]], ...lanes },
    burst: { setup: [["true"]], artifacts: ["report"], ...burst },
  };
  mkdirSync(join(root, ".orly"), { recursive: true });
  writeFileSync(join(root, CONFIG_PATH), JSON.stringify(config, undefined, 2));
  git(root, "checkout", "-q", "-b", FIXTURE_BRANCH);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "test: declare burst lanes");
  git(root, "remote", "add", "origin", "https://example.invalid/acme/widget.git");
  return root;
}

// `aws` and `ssh` run the TypeScript fakes beside this file; `op` prints
// SECRET_VALUE and records how it was called.
export function fakeBin(): { bin: string; state: string } {
  const bin = temporaryDirectory();
  const state = temporaryDirectory();
  const tools = {
    aws: `exec bun ${join(ROOT, "src/burst_fake_aws.ts")} "$@"`,
    ssh: `exec bun ${join(ROOT, "src/burst_fake_ssh.ts")} "$@"`,
    "session-manager-plugin": `echo 1.2.707.0`,
    op: `printf '%s\\n' "$*" >> "${join(state, "op-calls.txt")}"\n[ -n "\${FAKE_OP_FAIL:-}" ] && { echo "[ERROR] could not read secret" >&2; exit 1; }\nprintf '%s' "${SECRET_VALUE}"`,
  };
  for (const [name, body] of Object.entries(tools)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return { bin, state };
}

// A recorded request body's fields, or none when it carried no object.
export function fields(body: unknown): Record<string, unknown> {
  return isObject(body) ? body : {};
}

export function sink(): { lines: string[]; write: (line: string) => void; text: () => string } {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line), text: () => lines.join("\n") };
}

export function burstDependencies(root: string, env: Environment, fetcher: BurstDependencies["fetch"] = unreachable, signal = new AbortController().signal) {
  const output = sink();
  const dependencies: BurstDependencies = { root, env, fetch: fetcher, signal, write: output.write };
  return { dependencies, output };
}

// The environment every burst suite starts from: fast polls, a private
// output directory and the fakes first on PATH.
export function burstEnvironment(bin: string, state: string, extra: Environment = {}): Environment {
  return {
    PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    ORLY_BURST_POLL_SECONDS: "0.01", ORLY_BURST_OUT: join(state, "out"), FAKE_AWS_STATE: state, FAKE_SSH_STATE: state, ...extra,
  };
}

// What checkip.amazonaws.com answers a caller at CALLER_ADDRESS.
export async function callerAddress(input: string | URL | Request): Promise<Response> {
  if (String(input) !== "https://checkip.amazonaws.com") throw new Error(`unexpected request to ${String(input)}`);
  return new Response(`${CALLER_ADDRESS}\n`);
}

export function recordedCalls(state: string): string[][] {
  const file = join(state, "calls.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").map((line): string[] => JSON.parse(line));
}

async function unreachable(): Promise<Response> {
  throw new Error("this test makes no HTTP request");
}
