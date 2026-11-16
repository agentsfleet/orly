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
// A burst lane name becomes part of a machine name, a cloud tag and a
// directory, so it is held to the narrowest set all three accept.
const BURST_LANE = /^burst\.[a-z0-9][a-z0-9-]{0,23}$/;
// A secret's name is written unquoted into an `export` line on the machine.
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// 1Password names a vault and an item with spaces allowed, never a control
// character; `op read` resolves the reference on the caller.
const OP_REFERENCE = /^op:\/\/[^/\u0000-\u001f]+\/[^/\u0000-\u001f]+\/[^\u0000-\u001f]+$/;
// The token `op` itself reads, which no declared secret may overwrite.
const OP_TOKEN = "OP_SERVICE_ACCOUNT_TOKEN";
const invocations = z.array(z.array(nonempty).min(1));
export const burstSchema = z.object({
  setup: invocations.optional(),
  warm: invocations.optional(),
  secrets: z.record(z.string().regex(ENVIRONMENT_NAME).refine((name) => name !== OP_TOKEN, `must not be ${OP_TOKEN}`), z.string().regex(OP_REFERENCE, "must be an op:// reference")).optional(),
  artifacts: z.array(input).optional(),
}).strict();
export type BurstConfig = z.infer<typeof burstSchema>;
export const reusePoliciesSchema = z.record(nonempty, z.object({
  hermetic: z.literal(true), max_age_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  toolchain: z.array(z.array(nonempty).min(1)).min(1), inputs: z.array(input).default([]),
}).strict());

const configurationSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  orly_version: z.string().regex(VERSION_PATTERN).optional(),
  packs: z.array(nonempty).optional(),
  commands: z.unknown().optional(),
  surfaces: z.unknown().optional(),
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
