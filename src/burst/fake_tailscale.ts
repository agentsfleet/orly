// Tailscale, for the burst tests, in two halves. In the test process,
// FakeTailscale answers the API orly mints and deletes keys through, and
// joins a machine to the tailnet when the fake cloud boots it with a key. Run
// as a program, this file is the caller's `tailscale` CLI, which prints
// `status --json` from the files the first half writes under
// FAKE_SSH_STATE/tailnet: the caller in self.json and one file per node.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isObject } from "../model";

type Call = { method: string; path: string; body: string; authorization: string | null };
type FakeKey = { id: string; secret: string; request: Record<string, unknown>; used: boolean };
type Peer = { HostName: string; Online: boolean; TailscaleIPs: string[]; Tags?: string[] };

export const CLIENT_ID = "fake-client-id";
export const CLIENT_SECRET = "tskey-fake-client-secret";
export const TAILSCALE_CREDENTIALS = { TS_OAUTH_CLIENT_ID: CLIENT_ID, TS_OAUTH_CLIENT_SECRET: CLIENT_SECRET };
const TOKEN = "fake-access-token";
const JSON_HEADERS = { "Content-Type": "application/json" };

export class FakeTailscale {
  readonly calls: Call[] = [];
  // What happened to each key and node, in order: `mint k1`, `join k1 <host>`, `delete k1`.
  readonly events: string[] = [];
  readonly keys = new Map<string, FakeKey>();
  // The status a mint or a key delete answers with, to fail them.
  mintStatus = 200;
  deleteStatus = 200;
  // A node that joins but never reads as online, as one still coming up when
  // the run stops waiting.
  joinOffline = false;
  // Another device that claims each joining node's name, with these tags.
  impostorTags: string[] | undefined;
  readonly #directory: string;
  #nextKey = 1;
  #nextAddress = 1;

  constructor(state: string) {
    this.#directory = join(state, "tailnet");
    mkdirSync(join(this.#directory, "peers"), { recursive: true });
    this.caller("Running", true);
  }

  // What the caller's own Tailscale reports; `undefined` is no daemon at all.
  caller(backend: string | undefined, online = false): void {
    const self = join(this.#directory, "self.json");
    if (backend === undefined) rmSync(self, { force: true });
    else writeFileSync(self, JSON.stringify({ BackendState: backend, Self: { HostName: "caller-laptop", Online: online } }));
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const body = await request.text();
    const authorization = request.headers.get("Authorization");
    this.calls.push({ method: request.method, path: url.pathname, body, authorization });
    if (request.method === "POST" && url.pathname === "/api/v2/oauth/token") return this.#token(new URLSearchParams(body));
    if (authorization !== `Bearer ${TOKEN}`) return reply({ message: "unauthorized" }, 401);
    if (request.method === "POST" && url.pathname === "/api/v2/tailnet/-/keys") return this.#mint(JSON.parse(body));
    const deleted = url.pathname.match(/^\/api\/v2\/tailnet\/-\/keys\/([^/]+)$/)?.[1];
    if (request.method === "DELETE" && deleted) return this.#delete(deleted);
    return reply({ message: "not found" }, 404);
  };

  // The calls that carried a request body, parsed.
  bodies(path: string): Array<Record<string, unknown>> {
    return this.calls.filter((call) => call.method === "POST" && call.path === path).map((call) => {
      const parsed: unknown = JSON.parse(call.body);
      return isObject(parsed) ? parsed : {};
    });
  }

  // A machine runs its boot script: it joins with the key in it, which must
  // be live, unused and for one ephemeral, preauthorized, tagged device.
  join(boot: string): void {
    const secret = boot.match(/printf '%s' '([^']+)' > "\$key"/)?.[1] ?? "";
    const host = boot.match(/--hostname='([^']+)'/)?.[1] ?? "";
    const key = [...this.keys.values()].find((candidate) => candidate.secret === secret);
    if (!key || key.used || !host || !singleUse(key.request)) return;
    key.used = true;
    const address = `100.64.0.${this.#nextAddress}`;
    this.#nextAddress += 1;
    this.events.push(`join ${key.id} ${host}`);
    const peer: Peer = { HostName: host, Online: !this.joinOffline, TailscaleIPs: [address, `fd7a:115c:a1e0::${this.#nextAddress}`], Tags: ["tag:orly-burst"] };
    writeFileSync(join(this.#directory, "peers", `${host}.json`), JSON.stringify(peer));
    if (this.impostorTags) {
      const impostor: Peer = { HostName: host, Online: true, TailscaleIPs: ["100.64.9.9"], Tags: this.impostorTags };
      writeFileSync(join(this.#directory, "peers", `${host}-impostor.json`), JSON.stringify(impostor));
    }
  }

  nodes(): string[] {
    return readdirSync(join(this.#directory, "peers")).map((name) => name.replace(/\.json$/, ""));
  }

  #token(form: URLSearchParams): Response {
    if (form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) return reply({ message: "invalid client credentials" }, 401);
    return reply({ access_token: TOKEN, token_type: "Bearer", expires_in: 3600 });
  }

  #mint(request: Record<string, unknown>): Response {
    if (this.mintStatus !== 200) return reply({ message: "minting refused" }, this.mintStatus);
    // The trust credential's only tag is tag:orly-burst, and it mints nothing else.
    const tags = field(field(field(request, "capabilities"), "devices"), "create").tags;
    if (JSON.stringify(tags) !== JSON.stringify(["tag:orly-burst"])) return reply({ message: "requested tags are invalid or not permitted" }, 400);
    const id = `k${this.#nextKey}`;
    this.#nextKey += 1;
    const key = { id, secret: `tskey-fake-auth-${id}`, request, used: false };
    this.keys.set(id, key);
    this.events.push(`mint ${id}`);
    return reply({ id, key: key.secret, capabilities: request.capabilities, expirySeconds: request.expirySeconds });
  }

  #delete(id: string): Response {
    if (this.deleteStatus !== 200) return reply({ message: "delete refused" }, this.deleteStatus);
    if (!this.keys.delete(id)) return reply({ message: "not found" }, 404);
    this.events.push(`delete ${id}`);
    return new Response(null, { status: 200 });
  }
}

// A node logs out: it leaves the caller's view of the tailnet at once.
export function leaveTailnet(state: string, address: string): void {
  const peers = join(state, "tailnet", "peers");
  for (const name of readdirSync(peers)) {
    const peer: Peer = JSON.parse(readFileSync(join(peers, name), "utf8"));
    if (peer.TailscaleIPs.includes(address)) rmSync(join(peers, name), { force: true });
  }
}

// What Tailscale enforces, so a key minted otherwise never joins.
function singleUse(request: Record<string, unknown>): boolean {
  const create = field(field(field(request, "capabilities"), "devices"), "create");
  const tags = create.tags;
  // A trust credential mints only keys carrying exactly its own tag set.
  return create.reusable === false && create.ephemeral === true && create.preauthorized === true && JSON.stringify(tags) === JSON.stringify(["tag:orly-burst"]);
}

function field(value: Record<string, unknown>, name: string): Record<string, unknown> {
  const inner = value[name];
  return isObject(inner) ? inner : {};
}

function reply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

// `tailscale status --json`, as the caller's daemon answers it.
function cli(state: string, args: string[]): number {
  if (args.join(" ") !== "status --json") {
    process.stderr.write(`fake tailscale: unsupported ${args.join(" ")}\n`);
    return 2;
  }
  const self = join(state, "tailnet", "self.json");
  if (!existsSync(self)) {
    process.stderr.write("failed to connect to local Tailscale daemon; is Tailscale running?\n");
    return 1;
  }
  const peers = join(state, "tailnet", "peers");
  const listed = readdirSync(peers).map((name): Peer => JSON.parse(readFileSync(join(peers, name), "utf8")));
  const status = { ...JSON.parse(readFileSync(self, "utf8")), Peer: Object.fromEntries(listed.map((peer, index) => [`nodekey:${index}`, peer])) };
  process.stdout.write(`${JSON.stringify(status, undefined, 2)}\n`);
  return 0;
}

if (import.meta.main) process.exit(cli(process.env.FAKE_SSH_STATE ?? "", Bun.argv.slice(2)));
