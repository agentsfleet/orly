// Shared fixtures for the burst suites: a repository with lanes declared, a
// directory of fake executables first on PATH, a line sink, and in-memory
// HTTP answers for E2E Networks and the caller-address lookup. No suite
// reaches a real cloud: `aws`, `ssh` and `op` on the PATH they hand orly are
// these fakes, and the only fetch they hand it is one of these.
import type { BurstDependencies } from "./burst";
import type { Environment } from "./burst_settings";

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH } from "./config";
import { git, newRepository, ROOT, temporaryDirectory } from "./gates_test_support";
import { isObject } from "./model";

type Call = { method: string; path: string; query: Record<string, string>; body: unknown; authorization: string | null };
type FakeNode = { id: string; name: string; status: string; polls: number; address: string; body: Record<string, unknown> };
type FakeImage = { image_id: string; template_id: number; name: string; image_state: string; image_size: string };

export const FIXTURE_BRANCH = "feat/burst-fixture";
export const REPOSITORY = "widget";
export const SECRET_VALUE = "op-value-test-0000";
export const CALLER_ADDRESS = "198.51.100.77";
const JSON_HEADERS = { "Content-Type": "application/json" };

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
  git(root, "remote", "add", "origin", `https://example.invalid/acme/${REPOSITORY}.git`);
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
    op: `printf '%s\\n' "$*" >> "${join(state, "op-calls.txt")}"\n[ -n "\${FAKE_OP_FAIL:-}" ] && { echo "[ERROR] could not read secret" >&2; exit 1; }\nprintf '%s' "${SECRET_VALUE}"`,
  };
  for (const [name, body] of Object.entries(tools)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return { bin, state };
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

// The MyAccount API as orly uses it. A node runs after one status poll and
// stops after one more once powered off; a saved image is Ready on the list
// after the one that first shows it.
export class FakeE2e {
  readonly calls: Call[] = [];
  readonly nodes = new Map<string, FakeNode>();
  images: FakeImage[] = [];
  createStatus = 200;
  #nextNode = 4001;

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace("/myaccount/api/v1", "");
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, path, query: Object.fromEntries(url.searchParams), body, authorization: new Headers(init?.headers).get("Authorization") });
    return this.answer(method, path, body);
  };

  answer(method: string, path: string, body: unknown): Response {
    if (method === "GET" && path === "/images/") return reply([plan("C3.32GB", "C3-16vCPU-32RAM-200DISK-C3-Onetemplate-Ubuntu24.04-Delhi"), plan("C3.16GB", "C3-8vCPU-16RAM-100DISK-C3-Onetemplate-Ubuntu24.04-Delhi")]);
    if (method === "POST" && path === "/nodes/") return this.create(body);
    if (method === "GET" && path === "/images/saved-images/") return this.listImages();
    const nodeId = path.match(/^\/nodes\/(\d+)\/$/)?.[1];
    if (nodeId && method === "GET") return this.poll(nodeId);
    if (nodeId && method === "DELETE") return reply({ vm_id: Number(nodeId) }, this.nodes.delete(nodeId) ? 200 : 404);
    const actionId = path.match(/^\/nodes\/(\d+)\/actions\/$/)?.[1];
    if (actionId && method === "PUT") return this.act(actionId, body);
    const imageId = path.match(/^\/images\/(\d+)\/$/)?.[1];
    if (imageId && method === "DELETE") {
      this.images = this.images.filter((image) => image.image_id !== imageId);
      return reply({ status: true });
    }
    return reply({}, 404);
  }

  callsTo(method: string, pattern: RegExp): Call[] {
    return this.calls.filter((call) => call.method === method && pattern.test(call.path));
  }

  savedImage(name: string, templateId: number, state = "Ready"): void {
    this.images.push({ image_id: String(templateId + 1000), template_id: templateId, name, image_state: state, image_size: "40.0 GB" });
  }

  private create(body: unknown): Response {
    if (this.createStatus !== 200) return reply({}, this.createStatus);
    const fields = isObject(body) ? body : {};
    const id = String(this.#nextNode);
    const address = `203.0.113.${this.#nextNode - 4000}`;
    this.#nextNode += 1;
    this.nodes.set(id, { id, name: String(fields.name), status: "Creating", polls: 0, address, body: fields });
    return reply({ id: Number(id), status: "Creating" });
  }

  private poll(id: string): Response {
    const node = this.nodes.get(id);
    if (!node) return reply({}, 404);
    node.polls += 1;
    if (node.status === "Creating" && node.polls > 1) node.status = "Running";
    else if (node.status === "Stopping") node.status = "Stopped";
    return reply({ id: Number(id), status: node.status, public_ip_address: node.status === "Creating" ? "" : node.address });
  }

  private act(id: string, body: unknown): Response {
    const node = this.nodes.get(id);
    const action = isObject(body) ? body : {};
    if (!node) return reply({}, 404);
    if (action.type === "power_off") node.status = "Stopping";
    if (action.type === "save_images") this.savedImage(String(action.name), 9000 + this.images.length, "Creating");
    return reply({ status: "done", action_type: action.type, image_id: "" });
  }

  private listImages(): Response {
    const listed = this.images.map((image) => ({ ...image }));
    for (const image of this.images) image.image_state = "Ready";
    return reply(listed);
  }
}

function plan(sku: string, id: string) {
  return { name: sku, plan: id, image: "Ubuntu-24.04-Distro", location: "Delhi", specs: { sku_name: sku, price_per_hour: 18.6 } };
}

function reply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: status, data, message: status === 200 ? "Success" : "Failed" }), { status, headers: JSON_HEADERS });
}

async function unreachable(): Promise<Response> {
  throw new Error("this test makes no HTTP request");
}
