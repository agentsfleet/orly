import type { Fetch } from "./burst_e2e_api";

import { OrlyError } from "./model";

// The caller's public address as AWS sees it, over HTTPS; it answers on a
// GitHub-hosted runner as it does on a workstation. Every provider's SSH
// rule admits this one address.
const CALLER_ADDRESS_URL = "https://checkip.amazonaws.com";
const CALLER_TIMEOUT_MS = 15_000;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export async function callerAddress(fetcher: Fetch): Promise<string> {
  const response = await fetcher(CALLER_ADDRESS_URL, { signal: AbortSignal.timeout(CALLER_TIMEOUT_MS) });
  const address = (await response.text()).trim();
  if (!response.ok || !IPV4.test(address)) throw new OrlyError(`could not learn this machine's public IPv4 address from ${CALLER_ADDRESS_URL}`);
  return address;
}
