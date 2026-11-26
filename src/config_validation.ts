import type { JsonObject } from "./model";

import { isAbsolute } from "node:path";
import { z } from "zod";

import { commandLimitsSchema } from "./command_limits";
import { OrlyError } from "./model";

export type ReusePolicies = z.infer<typeof reusePoliciesSchema>;
export type ReusePolicy = ReusePolicies[string];

const SCHEMA_VERSION = 1;
const VERSION_PATTERN = /^$|^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
const nonempty = z.string().min(1).refine((value) => !value.includes("\0"));
const input = nonempty.refine((value) => !isAbsolute(value) && !value.split(/[\\/]/).some((part) => part === ".." || part === ".git"), "input must stay beneath the worktree and outside Git metadata");
const trackedInput = input.refine((value) => !/[\\*?\[\]{}]/.test(value) && !/^[A-Za-z]:/.test(value) && value.replace(/\/$/, "").split("/").every((part) => part !== "" && part !== "."), "tracked input must be a relative file or directory without globs or dot segments");
// A burst lane name becomes part of a machine name, a cloud tag and a
// directory, so it is held to the narrowest set all three accept.
const BURST_LANE = /^burst\.[a-z0-9][a-z0-9-]{0,23}$/;
// A secret's name is written unquoted into an `export` line on the machine.
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// 1Password names a vault and an item with spaces allowed, never a control
// character; `op read` resolves the reference on the caller.
const OP_REFERENCE = /^op:\/\/[^/\u0000-\u001f]+\/[^/\u0000-\u001f]+\/[^\u0000-\u001f]+$/;
// The token `op` itself reads, which no declared secret may overwrite.
// orly's own credentials, which a lane's secret must never name: a value
// already in the caller's environment is sent to the machine as it is.
const OWN_CREDENTIALS = /^(?:OP_SERVICE_ACCOUNT_TOKEN$|TS_OAUTH_|E2E_|AWS_)/;
const invocations = z.array(z.array(nonempty).min(1));
const LOGIN_USER = /^[a-z_][a-z0-9_-]*$/;
export const E2E_LOCATIONS = ["Delhi", "Chennai"] as const;
// Where each provider's machines run and what they boot. It belongs to the
// repository, committed beside the lanes and snapshots it shapes, so no shell
// variable can move a lane to another region or OS unseen.
const e2ePlacement = z.object({
  location: z.enum(E2E_LOCATIONS).optional(),
  plan: z.string().regex(/^[A-Za-z0-9.-]+$/).optional(),
  // An OS image as `<name> <version>`, such as `Debian 13`.
  image: z.string().regex(/^[A-Za-z0-9._-]+(?: [A-Za-z0-9._-]+)?$/).optional(),
  user: z.string().regex(LOGIN_USER).optional(),
}).strict();
const awsPlacement = z.object({
  region: z.string().regex(/^[a-z]{2}(?:-[a-z]+)+-\d$/).optional(),
  // x86 types, tried in order until one has capacity.
  instance_types: z.array(z.string().regex(/^[a-z0-9-]+\.[a-z0-9]+$/)).min(1).optional(),
  image: z.string().regex(/^(?:ami-[0-9a-f]{8,17}|resolve:ssm:\/[\w./-]+)$/).optional(),
  user: z.string().regex(LOGIN_USER).optional(),
}).strict();
export const burstSchema = z.object({
  setup: invocations.optional(),
  warm: invocations.optional(),
  secrets: z.record(z.string().regex(ENVIRONMENT_NAME).refine((name) => !OWN_CREDENTIALS.test(name), "must not name OP_SERVICE_ACCOUNT_TOKEN or a TS_OAUTH_, E2E_ or AWS_ variable"), z.string().regex(OP_REFERENCE, "must be an op:// reference")).optional(),
  artifacts: z.array(input).optional(),
  // Variables that name a directory on the caller, copied to the machine for
  // the lane, such as a signed toolbox fetched just before the run.
  directories: z.array(z.string().regex(ENVIRONMENT_NAME)).refine((names) => new Set(names).size === names.length, "must not repeat a name").optional(),
  e2e: e2ePlacement.optional(),
  aws: awsPlacement.optional(),
}).strict();
export type BurstConfig = z.infer<typeof burstSchema>;
// A change under any `when` prefix needs a change under a `then` prefix on the
// same branch, such as a wire format and the protocol version that names it.
export const couplingsSchema = z.array(z.object({ when: z.array(input).min(1), then: z.array(input).min(1) }).strict()).min(1);
export type Coupling = z.infer<typeof couplingsSchema>[number];
export const reusePoliciesSchema = z.record(nonempty, z.object({
  hermetic: z.literal(true), max_age_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  toolchain: z.array(z.array(nonempty).min(1)).min(1), inputs: z.array(input).default([]),
  tracked_inputs: z.array(trackedInput).min(1).optional(),
}).strict());

const configurationSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  orly_version: z.string().regex(VERSION_PATTERN).optional(),
  packs: z.array(nonempty).optional(),
  commands: z.unknown().optional(),
  surfaces: z.unknown().optional(),
  coupled: couplingsSchema.optional(),
  managed: z.array(nonempty).optional(),
  limits: z.record(nonempty, commandLimitsSchema).optional(),
  reuse: reusePoliciesSchema.optional(),
  burst: burstSchema.optional(),
}).strict().superRefine((config, context) => {
  const commands = config.commands && typeof config.commands === "object" ? Object.keys(config.commands) : [];
  for (const lane of commands.filter((name) => name.startsWith("burst.") && !BURST_LANE.test(name))) {
    context.addIssue({ code: "custom", path: ["commands", lane], message: "a burst lane is burst.<name>, with 1 to 24 lowercase letters, digits or hyphens" });
  }
  for (const lane of Object.keys(config.reuse ?? {})) {
    if (!lane.startsWith("verify.") || !config.commands || typeof config.commands !== "object" || !Object.hasOwn(config.commands, lane)) {
      context.addIssue({ code: "custom", path: ["reuse", lane], message: "must name a declared verify command" });
    }
    if (["verify.integration", "verify.memory"].includes(lane)) context.addIssue({ code: "custom", path: ["reuse", lane], message: "live lanes must run fresh" });
  }
});

export function validateConfiguration(value: JsonObject): void {
  const parsed = configurationSchema.safeParse(value);
  if (!parsed.success) throw new OrlyError(`.orly/orly.json invalid repository configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ")}`, { cause: parsed.error });
}
