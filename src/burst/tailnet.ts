import type { BurstSettings, Environment } from "./settings";
import type { Fetch } from "./types";
import type { KyInstance } from "ky";

import ky, { isHTTPError } from "ky";
import { z } from "zod";

import { OrlyError } from "../model";
import { captureProcess, until } from "./process";
import { required } from "./settings";
import { IPV4 } from "./types";

// One single-use key a machine joins the tailnet with. `secret` is the key
// itself: it reaches the machine only inside its boot script, which goes to
// the cloud API, and is never printed, an argument or a file on the caller.
export type AuthKey = { id: string; secret: string };
type Wait = { deadline: number; signal: AbortSignal; pollMs: number };
type TailscaleStatus = z.infer<typeof statusSchema>;
type Peer = z.infer<typeof peerSchema>;

// Every machine joins tagged, so the tailnet's access rules decide who may
// reach it, and the OAuth client may only mint keys for this tag.
const BURST_TAG = "tag:orly-burst";
const API = "https://api.tailscale.com/api/v2/";
const DOCS = "https://github.com/agentsfleet/orly/blob/main/docs/BURST.md";
// A key outlives its mint only by the machine's boot: the cloud starts the
// machine at once, and a key nobody used is worthless in ten minutes.
const KEY_SECONDS = 600;
// Tailscale caps a key's description at 50 characters.
const DESCRIPTION_CHARS = 50;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
// GET and DELETE are retried on 429, 5xx and timeouts; a mint is not, since
// a retried mint whose first reply was lost would leave a key nobody deletes.
const RETRIES = 5;
// A token is renewed this long before Tailscale says it expires.
const TOKEN_MARGIN_MS = 60_000;
const STATUS_TIMEOUT_MS = 30_000;
const NOT_FOUND = 404;
// Tailscale gives each node an IPv4 address in 100.64.0.0/10.
const TAILNET_PREFIX = "100.";
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });
const keySchema = z.object({ id: z.string().min(1), key: z.string().min(1) });
const peerSchema = z.object({ HostName: z.string(), Online: z.boolean().optional(), TailscaleIPs: z.array(z.string()).nullish(), Tags: z.array(z.string()).nullish() });
const statusSchema = z.object({
  BackendState: z.string(),
  Self: z.object({ Online: z.boolean().optional(), HostName: z.string().optional() }).nullish(),
  Peer: z.record(z.string(), peerSchema).nullish(),
});

// The caller's tailnet, which every burst machine joins for its run: the
// caller reaches it over Tailscale, so no cloud opens SSH to the internet and
// a caller that changes network keeps its sessions. The OAuth client mints
// one key per machine; the caller's own `tailscale` reports the joined node.
export class Tailnet {
  readonly #http: KyInstance;
  readonly #client: { id: string; secret: string };
  readonly #env: Environment;
  #token: { value: string; expires: number } | undefined;

  constructor(settings: BurstSettings, fetcher: Fetch) {
    this.#client = { id: required(settings.tailscale.clientId, "TS_OAUTH_CLIENT_ID"), secret: required(settings.tailscale.clientSecret, "TS_OAUTH_CLIENT_SECRET") };
    this.#env = settings.env;
    this.#http = ky.create({
      prefix: API, fetch: fetcher, timeout: REQUEST_TIMEOUT_MS, maxResponseSize: MAX_RESPONSE_BYTES,
      retry: { limit: RETRIES, retryOnTimeout: true, backoffLimit: settings.pollMs },
    });
  }

  // Refuses a caller whose own Tailscale is not running and online, before
  // anything is rented, then proves the OAuth client with one token.
  async admit(): Promise<string> {
    const status = await this.#status().catch((error: unknown) => {
      throw new OrlyError(`orly burst reaches its machines over Tailscale, and this machine's \`tailscale status\` failed: ${error instanceof Error ? error.message : String(error)}; install Tailscale and join a tailnet (${DOCS})`);
    });
    if (status.BackendState !== "Running" || status.Self?.Online !== true) {
      throw new OrlyError(`orly burst reaches its machines over Tailscale, and this machine is not on a tailnet (Tailscale reports ${status.BackendState}${status.Self?.Online === false ? ", offline" : ""}); run \`tailscale up\` (${DOCS})`);
    }
    await this.#bearer();
    return status.Self.HostName ?? "this machine";
  }

  // One key a single machine joins with: single use, preauthorized, tagged,
  // and ephemeral, so the node leaves the tailnet once it goes offline.
  async mint(host: string): Promise<AuthKey> {
    const body = {
      capabilities: { devices: { create: { reusable: false, ephemeral: true, preauthorized: true, tags: [BURST_TAG] } } },
      expirySeconds: KEY_SECONDS, description: host.slice(0, DESCRIPTION_CHARS),
    };
    const minted = keySchema.parse(await this.#request("POST", "tailnet/-/keys", body));
    return { id: minted.id, secret: minted.key };
  }

  // Cleanup takes no cancellation: it is what a cancellation runs.
  async revoke(key: AuthKey): Promise<void> {
    await this.#request("DELETE", `tailnet/-/keys/${encodeURIComponent(key.id)}`).catch((error: unknown) => {
      if (!(error instanceof TailscaleRequestFailed && error.status === NOT_FOUND)) throw error;
    });
  }

  // The joined node's tailnet IPv4 address, as the caller's Tailscale sees it.
  async joined(host: string, wait: Wait): Promise<string> {
    return until(`${host} to join the tailnet`, async () => {
      const peer = this.#peer(await this.#status(wait.signal), host);
      return peer?.Online === true ? address(peer) : undefined;
    }, wait);
  }

  // Where the node is now, online or not, when it joined at all; for logging
  // out a machine that joined after its run stopped waiting for it.
  async find(host: string): Promise<string | undefined> {
    const peer = this.#peer(await this.#status(), host);
    return peer ? address(peer) : undefined;
  }

  // Waits until the node is gone from the caller's view of the tailnet.
  async left(host: string, wait: Wait): Promise<void> {
    await until(`${host} to leave the tailnet`, async () => this.#peer(await this.#status(wait.signal), host) === undefined || undefined, wait);
  }

  // A name any device can claim, so only a node carrying the burst tag counts,
  // and two such nodes of one name are refused rather than guessed between.
  #peer(status: TailscaleStatus, host: string): Peer | undefined {
    const named = Object.values(status.Peer ?? {}).filter((peer) => peer.HostName.toLowerCase() === host.toLowerCase() && peer.Tags?.includes(BURST_TAG));
    if (named.length > 1) throw new OrlyError(`${named.length} tailnet nodes tagged ${BURST_TAG} are named ${host}; remove the stale ones in the Tailscale admin console`);
    return named[0];
  }

  async #status(signal?: AbortSignal): Promise<TailscaleStatus> {
    const read = await captureProcess(["tailscale", "status", "--json"], { env: this.#env, timeoutMs: STATUS_TIMEOUT_MS, ...(signal ? { signal } : {}) });
    if (read.code !== 0) throw new OrlyError(read.stderr.trim().split("\n")[0] || `tailscale status exited ${read.code}`);
    return statusSchema.parse(JSON.parse(read.stdout));
  }

  // The client secret goes in a form body, never a URL, an argument or a file.
  async #bearer(): Promise<string> {
    if (this.#token && Date.now() < this.#token.expires - TOKEN_MARGIN_MS) return this.#token.value;
    const form = new URLSearchParams({ client_id: this.#client.id, client_secret: this.#client.secret, grant_type: "client_credentials" });
    const answered = await this.#call("POST", "oauth/token", { body: form });
    const token = tokenSchema.parse(answered);
    this.#token = { value: token.access_token, expires: Date.now() + token.expires_in * 1000 };
    return token.access_token;
  }

  async #request(method: string, path: string, json?: unknown): Promise<unknown> {
    const authorization = `Bearer ${await this.#bearer()}`;
    return this.#call(method, path, { headers: { Authorization: authorization }, ...(json === undefined ? {} : { json }) });
  }

  // A failure names the method, the path and Tailscale's own message, which
  // carries neither the secret nor a key.
  async #call(method: string, path: string, options: { body?: URLSearchParams; json?: unknown; headers?: Record<string, string> }): Promise<unknown> {
    try {
      const text = await (await this.#http(path, { method, ...options })).text();
      return text ? JSON.parse(text) : {};
    } catch (error) {
      if (isHTTPError(error)) throw new TailscaleRequestFailed(`Tailscale ${method} /api/v2/${path} answered ${error.response.status}: ${tailscaleMessage(error.data)}`, error.response.status);
      throw error;
    }
  }
}

class TailscaleRequestFailed extends OrlyError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function address(peer: Peer): string | undefined {
  return peer.TailscaleIPs?.find((candidate) => IPV4.test(candidate) && candidate.startsWith(TAILNET_PREFIX));
}

function tailscaleMessage(body: unknown): string {
  const parsed = z.object({ message: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.message : "no message";
}
