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
}).strict().superRefine((config, context) => {
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
