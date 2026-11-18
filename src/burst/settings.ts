import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import type { BurstConfig } from "../config_validation";

import { OrlyError } from "../model";
import { MINUTE_MS } from "./types";

export type Environment = Record<string, string | undefined>;
export type BurstSettings = Readonly<{
  env: Environment;
  deadlineMs: number;
  pollMs: number;
  outRoot: string;
  snapshotKeep: number;
  aws: Readonly<{
    region: string; types: readonly string[]; image: string | undefined; subnet: string | undefined; user: string;
    market: AwsMarket; access: AwsAccess; instanceProfile: string | undefined;
  }>;
  e2e: Readonly<{ apiKey: string | undefined; authToken: string | undefined; projectId: string | undefined; location: string; plan: string; image: string | undefined; user: string }>;
}>;

// What a lane's machine is rented as. Spot is about a tenth of the price and
// AWS may take it back; spot-then-on-demand runs a lane AWS took back once
// more on a machine it cannot.
const AWS_MARKETS = ["spot", "on-demand", "spot-then-on-demand"] as const;
type AwsMarket = (typeof AWS_MARKETS)[number];
// How the caller reaches the machine: SSH on port 22 from the caller's address
// alone, or SSH carried by Systems Manager over HTTPS, which needs no inbound
// rule and survives a caller whose address changes.
const AWS_ACCESS = ["ssh", "ssm"] as const;
type AwsAccess = (typeof AWS_ACCESS)[number];

const SECOND_MS = 1_000;
// x86 only: Spot capacity differs by type, so the launcher walks this list and
// takes the first type that has any.
const DEFAULT_INSTANCE_TYPES = ["c7i.4xlarge", "c7a.4xlarge", "c6i.4xlarge", "m7i.4xlarge"];
// Placement is `burst.e2e` and `burst.aws` in .orly/orly.json. A variable that
// used to carry it is refused, naming its key, so it is never silently ignored.
const MOVED: Readonly<Record<string, string>> = {
  ORLY_BURST_REGION: "burst.aws.region", ORLY_BURST_INSTANCE_TYPES: "burst.aws.instance_types",
  ORLY_BURST_AWS_IMAGE: "burst.aws.image", ORLY_BURST_AWS_USER: "burst.aws.user",
  ORLY_BURST_E2E_LOCATION: "burst.e2e.location", ORLY_BURST_E2E_PLAN: "burst.e2e.plan",
  ORLY_BURST_E2E_IMAGE: "burst.e2e.image", ORLY_BURST_E2E_USER: "burst.e2e.user",
};
const bounded = (max: number) => z.coerce.number().positive().max(max);
const environmentSchema = z.object({
  ORLY_BURST_DEADLINE_MINUTES: bounded(1440).default(120),
  ORLY_BURST_POLL_SECONDS: bounded(600).default(30),
  ORLY_BURST_OUT: z.string().min(1).default(join(tmpdir(), "orly-burst")),
  ORLY_BURST_SNAPSHOT_KEEP: z.coerce.number().int().min(1).max(20).default(2),
  ORLY_BURST_SUBNET: z.string().regex(/^subnet-[0-9a-f]{8,17}$/).optional(),
  ORLY_BURST_MARKET: z.enum(AWS_MARKETS).default("spot"),
  ORLY_BURST_AWS_ACCESS: z.enum(AWS_ACCESS).default("ssh"),
  // The instance profile whose role carries AmazonSSMManagedInstanceCore.
  ORLY_BURST_AWS_INSTANCE_PROFILE: z.string().regex(/^[\w+=,.@-]{1,128}$/).optional(),
  E2E_API_KEY: z.string().min(1).optional(),
  E2E_AUTH_TOKEN: z.string().min(1).optional(),
  E2E_PROJECT_ID: z.string().regex(/^\d+$/).optional(),
});

// Every variable `orly burst` reads, read once. A blank value means unset, so
// `VAR= orly burst` behaves like the variable was never exported. Issues name
// the variable and the rule it broke, never the value: some of these are keys.
// `burst` is the run's committed configuration; `--provider here` and `--prune`
// read only the variables.
export function burstSettings(env: Environment, burst: BurstConfig = {}): BurstSettings {
  const moved = Object.keys(MOVED).filter((name) => env[name]);
  if (moved.length > 0) throw new OrlyError(`orly burst no longer reads ${moved.map((name) => `${name}; set ${MOVED[name] ?? ""} in .orly/orly.json`).join(", ")}`);
  const known = Object.fromEntries(Object.keys(environmentSchema.shape).map((name) => [name, env[name] === "" ? undefined : env[name]]));
  const parsed = environmentSchema.safeParse(known);
  if (!parsed.success) throw new OrlyError(`orly burst environment invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const value = parsed.data;
  return Object.freeze({
    env,
    deadlineMs: Math.round(value.ORLY_BURST_DEADLINE_MINUTES * MINUTE_MS),
    pollMs: Math.round(value.ORLY_BURST_POLL_SECONDS * SECOND_MS),
    outRoot: value.ORLY_BURST_OUT,
    snapshotKeep: value.ORLY_BURST_SNAPSHOT_KEEP,
    aws: Object.freeze({
      region: burst.aws?.region ?? "us-east-1", types: Object.freeze(burst.aws?.instance_types ?? DEFAULT_INSTANCE_TYPES), image: burst.aws?.image,
      // The Debian AMI's login user; E2E's Linux images log in as root.
      subnet: value.ORLY_BURST_SUBNET, user: burst.aws?.user ?? "admin",
      market: value.ORLY_BURST_MARKET, access: value.ORLY_BURST_AWS_ACCESS, instanceProfile: value.ORLY_BURST_AWS_INSTANCE_PROFILE,
    }),
    e2e: Object.freeze({
      apiKey: value.E2E_API_KEY, authToken: value.E2E_AUTH_TOKEN, projectId: value.E2E_PROJECT_ID,
      location: burst.e2e?.location ?? "Delhi", plan: burst.e2e?.plan ?? "C3.32GB", image: burst.e2e?.image,
      user: burst.e2e?.user ?? "root",
    }),
  });
}

// A provider asks for its required variables at the moment it needs them, so
// `orly burst --provider here` never demands cloud credentials.
export function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new OrlyError(`set ${name} for this provider (see https://github.com/agentsfleet/orly/blob/main/docs/BURST.md)`);
  return value;
}
