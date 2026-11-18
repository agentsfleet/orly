import type { BurstSettings } from "./settings";
import type { Fetch } from "./types";
import type { KyInstance } from "ky";

import ky, { isHTTPError } from "ky";
import { z } from "zod";

import { required } from "./settings";
import { OrlyError } from "../model";
import { IPV4 } from "./types";

export type Plan = { sku: string; priceId: number };
export type OsImage = { name: string; version: string; versionId: number };
type VmState = { status: string; address: string | undefined };
export type VmSnapshot = { id: string; name: string; status: string; sizeGb: number | undefined; versionId: number | undefined };
type Body = Record<string, unknown>;

// E2E Networks TIR: https://docs.e2enetworks.com/api/tir/ — a VM is an
// Instance created with `kind: "vm"`, a whole Linux machine reached as root.
const BASE_URL = "https://api.e2enetworks.com/myaccount/api/v1/gpu/";
const REQUEST_TIMEOUT_MS = 60_000;
// The image and plan catalogues are the largest answers; past this is not one.
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
// TIR answers 429, a 5xx or nothing while it is busy. ky retries those for
// every request but a create, backing off up to one poll interval: about
// two minutes at the default 30 seconds before a request fails.
const RETRIES = 10;
const identifier = z.union([z.number(), z.string()]).transform(String);
const skusSchema = z.object({ data: z.object({ CPU: z.array(z.object({
  name: z.string(), plans: z.array(z.object({ sku_item_price_id: z.number(), committed_days: z.number().nullish(), is_active: z.boolean().optional() })),
})).default([]) }) });
const imagesSchema = z.object({ data: z.array(z.object({ name: z.string(), versions: z.array(z.object({ image_version_id: z.number(), version: z.coerce.string() })).default([]) })) });
const keysSchema = z.object({ data: z.array(z.object({ pk: identifier, label: z.string() })) });
const vmsSchema = z.object({ data: z.array(z.object({ id: identifier, name: z.string() })), total_page_number: z.number().nullish() });
const groupSchema = z.object({ data: z.object({ id: identifier }) });
const groupsSchema = z.object({ data: z.array(z.object({ id: identifier, name: z.string() })) });
// One VM answers `data.id`; a quantity of them answers `data.created`.
const createdSchema = z.object({ data: z.union([z.object({ id: identifier }), z.object({ created: z.array(z.object({ id: identifier })).min(1) })]) });
const vmSchema = z.object({ data: z.object({ status: z.string(), public_ip: z.string().nullish() }) });
const snapshotSchema = z.object({ id: identifier, name: z.string(), status: z.string(), size_gb: z.coerce.number().nullish(), image_details: z.object({ version_id: z.number().nullish() }).nullish() });

export class E2eRequestFailed extends OrlyError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// One method per TIR operation orly uses. The API key rides in the query
// string and the token in the Authorization header, so no URL is ever printed:
// a failure names the method, the path and TIR's own message.
export class E2eApi {
  readonly #http: KyInstance;
  readonly #credentials: { apiKey: string; project: string; location: string };

  constructor(settings: BurstSettings, fetcher: Fetch) {
    const { e2e } = settings;
    this.#credentials = {
      apiKey: required(e2e.apiKey, "E2E_API_KEY"), project: required(e2e.projectId, "E2E_PROJECT_ID"), location: e2e.location,
    };
    this.#http = ky.create({
      prefix: BASE_URL, fetch: fetcher, timeout: REQUEST_TIMEOUT_MS, maxResponseSize: MAX_RESPONSE_BYTES,
      retry: { limit: RETRIES, retryOnTimeout: true, backoffLimit: settings.pollMs },
      headers: { Authorization: `Bearer ${required(e2e.authToken, "E2E_AUTH_TOKEN")}` },
    });
  }

  // GET /gpu_service/sku/: the hourly plan of each CPU SKU.
  async plans(signal?: AbortSignal): Promise<Plan[]> {
    const listed = skusSchema.parse(await this.#request("GET", "/gpu_service/sku/", { signal, query: { service: "notebook" } }));
    return listed.data.CPU.flatMap((sku) => sku.plans.filter((plan) => !plan.committed_days && plan.is_active !== false).slice(0, 1).map((plan) => ({ sku: sku.name, priceId: plan.sku_item_price_id })));
  }

  // GET /gpu_service/image/: the OS images and their versions.
  async images(signal?: AbortSignal): Promise<OsImage[]> {
    const listed = imagesSchema.parse(await this.#request("GET", "/gpu_service/image/", { signal, query: { category: "notebook" } }));
    return listed.data.flatMap((image) => image.versions.map((version) => ({ name: image.name, version: version.version, versionId: version.image_version_id })));
  }

  // SSH keys belong to the account, not a project: /ssh_keys/ takes no project.
  async addKey(label: string, key: string, signal?: AbortSignal): Promise<void> {
    await this.#request("POST", "/ssh_keys/", { signal, body: { label, ssh_key: key }, project: false });
  }

  async keys(): Promise<Array<{ pk: string; label: string }>> {
    return keysSchema.parse(await this.#request("GET", "/ssh_keys/", { project: false })).data;
  }

  async deleteKey(pk: string): Promise<void> {
    await this.#request("DELETE", `/ssh_keys/${pk}/`, { project: false });
  }

  // POST /security_groups/: a group whose one rule admits SSH from `address`.
  async createSshGroup(name: string, address: string, signal?: AbortSignal): Promise<string> {
    // TIR refuses a group without an outbound rule; the machine's own traffic,
    // such as package installs, leaves through this one.
    const rules = [
      { rule_type: "inbound", protocol: "TCP", protocol_type: "CustomTCP", network_type: "manual", cidr_ip: address, cidr_subnet: 32, ports: [22], description: "SSH from the orly burst caller" },
      { rule_type: "outbound", protocol: "All", protocol_type: "AllTraffic", network_type: "any", ports: [], description: "All traffic from the orly burst machine" },
    ];
    return groupSchema.parse(await this.#request("POST", "/security_groups/", { signal, body: { name, description: "SSH for one orly burst run", rules } })).data.id;
  }

  async groups(): Promise<Array<{ id: string; name: string }>> {
    return groupsSchema.parse(await this.#request("GET", "/security_groups/")).data;
  }

  // DELETE /security_groups/{id}/; the `/rules/` path answers 405.
  async deleteSecurityGroup(id: string): Promise<void> {
    await this.#request("DELETE", `/security_groups/${id}/`);
  }

  // POST /notebooks/: https://docs.e2enetworks.com/api/tir/compute/instancevm/post-notebooks/
  async createVm(body: Body, signal?: AbortSignal): Promise<string> {
    const { data } = createdSchema.parse(await this.#request("POST", "/notebooks/", { signal, body }));
    return "id" in data ? data.id : data.created[0]?.id ?? "";
  }

  // GET /notebooks/: every VM in the project, a page at a time.
  async vms(): Promise<Array<{ id: string; name: string }>> {
    const found: Array<{ id: string; name: string }> = [];
    for (let page = 1, pages = 1; page <= pages; page += 1) {
      const listed = vmsSchema.parse(await this.#request("GET", "/notebooks/", { query: { page_no: String(page), per_page: "100" } }));
      found.push(...listed.data);
      pages = listed.total_page_number ?? 1;
    }
    return found;
  }

  async vm(id: string, signal?: AbortSignal): Promise<VmState> {
    const { data } = vmSchema.parse(await this.#request("GET", `/notebooks/${id}/`, { signal }));
    const address = data.public_ip?.trim() ?? "";
    return { status: data.status, address: IPV4.test(address) ? address : undefined };
  }

  async stopVm(id: string, signal?: AbortSignal): Promise<void> {
    await this.#request("PUT", `/notebooks/${id}/actions/`, { signal, query: { action: "Stop" } });
  }

  async deleteVm(id: string): Promise<void> {
    await this.#request("DELETE", `/notebooks/${id}/`);
  }

  async createSnapshot(vmId: string, name: string, signal?: AbortSignal): Promise<VmSnapshot> {
    const { data } = z.object({ data: snapshotSchema }).parse(await this.#request("POST", `/notebooks/${vmId}/snapshots/`, { signal, body: { name } }));
    return toSnapshot(data);
  }

  // GET /notebooks/vm/snapshots/: every VM snapshot in the project.
  async snapshots(signal?: AbortSignal): Promise<VmSnapshot[]> {
    return z.object({ data: z.array(snapshotSchema) }).parse(await this.#request("GET", "/notebooks/vm/snapshots/", { signal, query: { per_page: "100" } })).data.map(toSnapshot);
  }

  async deleteSnapshot(id: string, signal?: AbortSignal): Promise<void> {
    await this.#request("DELETE", `/notebooks/vm/snapshots/${id}/`, { signal });
  }

  async #request(method: string, path: string, options: { signal?: AbortSignal | undefined; body?: Body; query?: Record<string, string>; project?: boolean } = {}): Promise<unknown> {
    options.signal?.throwIfAborted();
    const searchParams = {
      ...(options.project === false ? {} : { project_id: this.#credentials.project }),
      location: this.#credentials.location, ...options.query, apikey: this.#credentials.apiKey,
    };
    try {
      // Mutations may already have taken effect, so only a read is cancelled:
      // a mutation's reply carries the identifiers cleanup needs.
      const response = await this.#http(path.replace(/^\//, ""), {
        method, searchParams, ...(options.body ? { json: options.body } : {}), ...(method === "GET" && options.signal ? { signal: options.signal } : {}),
      });
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (error) {
      if (isHTTPError(error)) throw new E2eRequestFailed(`E2E TIR ${method} ${path} answered ${error.response.status}: ${errorMessage(error.data)}`, error.response.status);
      throw error;
    }
  }
}

function toSnapshot(data: z.infer<typeof snapshotSchema>): VmSnapshot {
  return { id: data.id, name: data.name, status: data.status, sizeGb: data.size_gb ?? undefined, versionId: data.image_details?.version_id ?? undefined };
}

function errorMessage(body: unknown): string {
  const parsed = z.object({ message: z.string().optional(), errors: z.unknown().optional() }).safeParse(body);
  if (!parsed.success) return "no message";
  return [parsed.data.message, parsed.data.errors ? JSON.stringify(parsed.data.errors) : ""].filter(Boolean).join(" ") || "no message";
}


