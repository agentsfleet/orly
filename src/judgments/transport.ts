import type { ProviderInput } from "./types";

import { OrlyError } from "../model";
import { ENDPOINT, MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS } from "./constants";
import { readStream } from "./files";
import { parseReply, type Reply } from "./wire";

export type Fetch = (request: Request) => Promise<Response>;

export async function requestAdvice(prepared: ProviderInput, credential: string, fetcher: Fetch = fetch, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Reply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response | undefined;
  try {
    const request = new Request(ENDPOINT, {
      method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
      body: prepared.request, signal: controller.signal, redirect: "error",
    });
    response = await fetcher(request);
    if (!response.ok) throw new OrlyError(`Provider request failed with HTTP ${response.status}; no automatic retry was made.`);
    if (!response.body) throw new OrlyError("Provider reply has no body.");
    const raw = await readStream(response.body, MAX_RESPONSE_BYTES, controller.signal);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new OrlyError("Provider reply is not valid JSON."); }
    return parseReply(value, prepared);
  } catch (error) {
    if (controller.signal.aborted) throw new OrlyError("Provider request timed out and was canceled.");
    if (error instanceof OrlyError) throw error;
    throw new OrlyError("Provider transport failed; no response body or credential was logged.");
  } finally {
    controller.abort();
    clearTimeout(timer);
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
  }
}
