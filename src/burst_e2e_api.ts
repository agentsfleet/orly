import type { BurstSettings } from "./burst_settings";

import { z } from "zod";

import { required } from "./burst_settings";
import { OrlyError } from "./model";

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type Plan = { plan: string; image: string; sku: string };
export type NodeState = { status: string; address: string | undefined };
export type SavedImage = { imageId: string; templateId: string; name: string; state: string; sizeGb: number | undefined };
export type NodeBody = Record<string, unknown>;

// The MyAccount API: https://docs.e2enetworks.com/api/myaccount/
const BASE_URL = "https://api.e2enetworks.com/myaccount/api/v1";
const REQUEST_TIMEOUT_MS = 60_000;
// The plan catalogue for a location is the largest answer; anything past this
// is not a catalogue.
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const SIZE_UNITS = new Map([["MB", 1 / 1024], ["GB", 1], ["TB", 1024]]);
const identifier = z.union([z.number(), z.string()]).transform(String);
const plansSchema = z.object({ data: z.array(z.object({
  plan: z.string(), image: z.string(),
  specs: z.object({ sku_name: z.string() }),
})) });
const createdSchema = z.object({ data: z.object({ id: identifier }) });
const nodeSchema = z.object({ data: z.object({ status: z.string(), public_ip_address: z.string().nullish() }) });
const actionSchema = z.object({ data: z.object({ image_id: identifier.optional() }).optional() });
const savedSchema = z.object({ data: z.array(z.object({
  image_id: identifier, template_id: identifier, name: z.string(), image_state: z.string(), image_size: z.string().nullish(),
})) });

export class E2eRequestFailed extends OrlyError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// One method per MyAccount operation orly uses. The API key rides in the
// query string and the token in the Authorization header, so no URL is ever
// printed: a failure names the method, the path and E2E's own message.
export class E2eApi {
  readonly #fetch: Fetch;
  readonly #credentials: { apiKey: string; token: string; project: string; location: string };

  constructor(settings: BurstSettings["e2e"], fetcher: Fetch) {
    this.#fetch = fetcher;
    this.#credentials = {
      apiKey: required(settings.apiKey, "E2E_API_KEY"), token: required(settings.authToken, "E2E_AUTH_TOKEN"),
      project: required(settings.projectId, "E2E_PROJECT_ID"), location: settings.location,
    };
  }

  // GET /images/: every plan and OS image offered at the location.
  async plans(): Promise<Plan[]> {
    const listed = plansSchema.parse(await this.#request("GET", "/images/"));
    return listed.data.map((entry) => ({ plan: entry.plan, image: entry.image, sku: entry.specs.sku_name }));
  }

  // POST /nodes/: https://docs.e2enetworks.com/api/myaccount/compute/nodes/create-node/
  async createNode(body: NodeBody): Promise<string> {
    return createdSchema.parse(await this.#request("POST", "/nodes/", body)).data.id;
  }

  async node(id: string): Promise<NodeState> {
    const { data } = nodeSchema.parse(await this.#request("GET", `/nodes/${id}/`));
    const address = data.public_ip_address?.trim() ?? "";
    return { status: data.status, address: IPV4.test(address) ? address : undefined };
  }

  async deleteNode(id: string): Promise<void> {
    await this.#request("DELETE", `/nodes/${id}/`);
  }

  // PUT /nodes/{id}/actions/: power_off, or save_images with the image name.
  async action(id: string, type: "power_off" | "save_images", name?: string): Promise<string | undefined> {
    return actionSchema.parse(await this.#request("PUT", `/nodes/${id}/actions/`, { type, ...(name ? { name } : {}) })).data?.image_id || undefined;
  }

  async savedImages(): Promise<SavedImage[]> {
    return savedSchema.parse(await this.#request("GET", "/images/saved-images/")).data.map((image) => ({
      imageId: image.image_id, templateId: image.template_id, name: image.name, state: image.image_state,
      sizeGb: sizeInGb(image.image_size ?? ""),
    }));
  }

  async deleteImage(id: string): Promise<void> {
    await this.#request("DELETE", `/images/${id}/`);
  }

  async #request(method: string, path: string, body?: NodeBody): Promise<unknown> {
    const url = new URL(`${BASE_URL}${path}`);
    url.search = new URLSearchParams({ project_id: this.#credentials.project, apikey: this.#credentials.apiKey, location: this.#credentials.location }).toString();
    const response = await this.#fetch(url, {
      method, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${this.#credentials.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await boundedText(response);
    const parsed = parseJson(text);
    if (!response.ok) throw new E2eRequestFailed(`E2E ${method} ${path} answered ${response.status}: ${errorMessage(parsed)}`, response.status);
    return parsed;
  }
}

function errorMessage(body: unknown): string {
  const parsed = z.object({ message: z.string().optional(), errors: z.unknown().optional() }).safeParse(body);
  if (!parsed.success) return "no message";
  return [parsed.data.message, parsed.data.errors ? JSON.stringify(parsed.data.errors) : ""].filter(Boolean).join(" ") || "no message";
}

// "95.368 GB" is how the saved-images list states a size.
function sizeInGb(text: string): number | undefined {
  const match = /^([\d.]+)\s*([A-Z]+)$/i.exec(text.trim());
  const scale = SIZE_UNITS.get(match?.[2]?.toUpperCase() ?? "");
  return match?.[1] && scale !== undefined ? Number(match[1]) * scale : undefined;
}

// A gateway error page is HTML; it still fails by status, with no message.
function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function boundedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES) throw new E2eRequestFailed(`E2E answered more than ${MAX_RESPONSE_BYTES} bytes`, response.status);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
