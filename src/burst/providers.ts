import type { BurstSettings } from "./settings";
import type { CloudProvider, Fetch, ProviderName } from "./types";

import { AwsSpot } from "./aws";
import { E2eNodes } from "./e2e";

// Every cloud `--provider` can rent from. A new cloud is one module that
// implements CloudProvider (types.ts), its name in PROVIDER_NAMES, and one
// line here; the shared lifecycle in cloud.ts drives it unchanged.
export const CLOUD_PROVIDERS: Readonly<Record<ProviderName, new (settings: BurstSettings, fetcher: Fetch) => CloudProvider>> = {
  "aws-spot": AwsSpot,
  e2e: E2eNodes,
};
