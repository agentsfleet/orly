import type { BurstConfig } from "../config_validation";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { OrlyError } from "../model";
import { MINUTE_MS } from "./types";

export type Environment = Record<string, string | undefined>;
export type BurstSettings = Readonly<{
  env: Environment;
  deadlineMs: number;
  pollMs: number;
  outRoot: string;
  aws: Readonly<{ region: string; types: readonly string[]; image: string | undefined; user: string; market: AwsMarket }>;
  e2e: Readonly<{ apiKey: string | undefined; authToken: string | undefined; projectId: string | undefined; location: string; plan: string; image: string | undefined; user: string }>;
  tailscale: Readonly<{ clientId: string | undefined; clientSecret: string | undefined }>;
}>;

// What a lane's machine is rented as. Spot is about a tenth of the price, and
// AWS may take it back.
const AWS_MARKETS = ["spot", "on-demand"] as const;
type AwsMarket = (typeof AWS_MARKETS)[number];

const SECOND_MS = 1_000;
// x86 only: Spot capacity differs by type, so the launcher walks this list and
// takes the first type that has any.
const DEFAULT_INSTANCE_TYPES = ["c7i.4xlarge", "c7a.4xlarge", "c6i.4xlarge", "m7i.4xlarge"];
// Placement is `burst.e2e` and `burst.aws` in .orly/orly.json. A variable that
// used to carry it, or one orly no longer has, is refused by name, so it is
// never silently ignored.
const MOVED: Readonly<Record<string, string>> = {
  ORLY_BURST_REGION: "set burst.aws.region in .orly/orly.json", ORLY_BURST_INSTANCE_TYPES: "set burst.aws.instance_types in .orly/orly.json",
  ORLY_BURST_AWS_IMAGE: "set burst.aws.image in .orly/orly.json", ORLY_BURST_AWS_USER: "set burst.aws.user in .orly/orly.json",
  ORLY_BURST_E2E_LOCATION: "set burst.e2e.location in .orly/orly.json", ORLY_BURST_E2E_PLAN: "set burst.e2e.plan in .orly/orly.json",
  ORLY_BURST_E2E_IMAGE: "set burst.e2e.image in .orly/orly.json", ORLY_BURST_E2E_USER: "set burst.e2e.user in .orly/orly.json",
  ORLY_BURST_SUBNET: "unset it; lanes use the default network", ORLY_BURST_SNAPSHOT_KEEP: "unset it; --prune keeps the newest snapshot",
  ORLY_BURST_AWS_ACCESS: "unset it; lanes are reached over SSH", ORLY_BURST_AWS_INSTANCE_PROFILE: "unset it; lanes are reached over SSH",
};
const bounded = (max: number) => z.coerce.number().positive().max(max);
const environmentSchema = z.object({
  ORLY_BURST_DEADLINE_MINUTES: bounded(1440).default(120),
  ORLY_BURST_POLL_SECONDS: bounded(600).default(30),
  ORLY_BURST_OUT: z.string().min(1).default(join(tmpdir(), "orly-burst")),
  ORLY_BURST_MARKET: z.enum(AWS_MARKETS).default("spot"),
  E2E_API_KEY: z.string().min(1).optional(),
  E2E_AUTH_TOKEN: z.string().min(1).optional(),
  E2E_PROJECT_ID: z.string().regex(/^\d+$/).optional(),
  TS_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  TS_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
});

// Every variable `orly burst` reads, read once. A blank value means unset, so
// `VAR= orly burst` behaves like the variable was never exported. Issues name
// the variable and the rule it broke, never the value: some of these are keys.
// `burst` is the ref's committed configuration.
export function burstSettings(env: Environment, burst: BurstConfig = {}): BurstSettings {
  const moved = Object.keys(MOVED).filter((name) => env[name]);
  if (moved.length > 0) throw new OrlyError(`orly burst no longer reads ${moved.map((name) => `${name}: ${MOVED[name] ?? ""}`).join("; ")}`);
  const known = Object.fromEntries(Object.keys(environmentSchema.shape).map((name) => [name, env[name] === "" ? undefined : env[name]]));
  const parsed = environmentSchema.safeParse(known);
  if (!parsed.success) throw new OrlyError(`orly burst environment invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const value = parsed.data;
  return Object.freeze({
    env,
    deadlineMs: Math.round(value.ORLY_BURST_DEADLINE_MINUTES * MINUTE_MS),
    pollMs: Math.round(value.ORLY_BURST_POLL_SECONDS * SECOND_MS),
    outRoot: value.ORLY_BURST_OUT,
    aws: Object.freeze({
      region: burst.aws?.region ?? "us-east-1", types: Object.freeze(burst.aws?.instance_types ?? DEFAULT_INSTANCE_TYPES), image: burst.aws?.image,
      // The Debian AMI's login user; E2E's Linux images log in as root.
      user: burst.aws?.user ?? "admin", market: value.ORLY_BURST_MARKET,
    }),
    e2e: Object.freeze({
      apiKey: value.E2E_API_KEY, authToken: value.E2E_AUTH_TOKEN, projectId: value.E2E_PROJECT_ID,
      location: burst.e2e?.location ?? "Delhi", plan: burst.e2e?.plan ?? "C3.32GB", image: burst.e2e?.image,
      user: burst.e2e?.user ?? "root",
    }),
    tailscale: Object.freeze({ clientId: value.TS_OAUTH_CLIENT_ID, clientSecret: value.TS_OAUTH_CLIENT_SECRET }),
  });
}

// A provider asks for its required variables when it is built, so a run on
// one cloud never demands the other's credentials.
export function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new OrlyError(`set ${name} for this provider (see https://github.com/agentsfleet/orly/blob/main/docs/BURST.md)`);
  return value;
}
