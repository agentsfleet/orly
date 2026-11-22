// Shared fixtures for the burst suites: a repository with lanes declared, a
// directory of fake executables first on PATH and a line sink;
// fake_tailscale.ts answers for Tailscale, fake_tir.ts for E2E Networks TIR
// and aws-test-support.ts for EC2. No suite reaches a real cloud or tailnet:
// `ssh`, `tailscale` and `op` on the PATH they hand orly are fakes, and so is
// every fetch.
import type { BurstDependencies } from "./index";
import type { Environment } from "./settings";

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH } from "../config";
import { TAILSCALE_CREDENTIALS } from "./fake_tailscale";
import { git, newRepository, ROOT, temporaryDirectory } from "../gates_test_support";
import { isObject } from "../model";


export const FIXTURE_BRANCH = "feat/burst-fixture";
// Independently derived SHA-256 prefix of example.invalid/acme/widget.
export const REPOSITORY = "de3cf852395d210d0d756297";
export const SECRET_VALUE = "op-value-test-0000";

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

// `ssh` and `tailscale` run the TypeScript fakes beside this file; `op`
// prints SECRET_VALUE and records how it was called.
export function fakeBin(): { bin: string; state: string } {
  const bin = temporaryDirectory();
  const state = temporaryDirectory();
  const tools = {
    ssh: `exec bun ${join(ROOT, "src/burst/fake_ssh.ts")} "$@"`,
    tailscale: `exec bun ${join(ROOT, "src/burst/fake_tailscale.ts")} "$@"`,
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
// output directory, the fakes first on PATH and the fake OAuth client.
export function burstEnvironment(bin: string, state: string, extra: Environment = {}): Environment {
  return {
    PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    ORLY_BURST_POLL_SECONDS: "0.01", ORLY_BURST_OUT: join(state, "out"), FAKE_SSH_STATE: state, ...TAILSCALE_CREDENTIALS, ...extra,
  };
}

export function recordedCalls(state: string): string[][] {
  const file = join(state, "calls.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").map((line): string[] => JSON.parse(line));
}

async function unreachable(): Promise<Response> {
  throw new Error("this test makes no HTTP request");
}

// The first four hexadecimal characters of each base image's SHA-256, worked
// out once by hand: `printf %s 'Debian 13' | shasum -a 256`.
const IMAGE_DIGESTS: Readonly<Record<string, string>> = {
  "Debian 13": "c0e7", "Ubuntu 22.04": "7630",
  "resolve:ssm:/aws/service/debian/release/13/latest/amd64": "dd74", "ami-0123456789abcdef0": "b1fa",
};

// A snapshot name orly would give an image of `image` taken at `stamp`.
export function snapshotOf(image: string, stamp: string): string {
  const digest = IMAGE_DIGESTS[image];
  if (!digest) throw new Error(`no digest recorded for ${image}`);
  return `orly-burst-${REPOSITORY}-${stamp}-${digest}abcd`;
}
