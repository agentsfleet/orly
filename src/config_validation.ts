import { z } from "zod";

import { commandLimitsSchema } from "./command_limits";
import { OrlyError, type JsonObject } from "./model";

const SCHEMA_VERSION = 1;
const DIGEST_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/;
const VERSION_PATTERN = /^$|^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
const nonempty = z.string().min(1).refine((value) => !value.includes("\0"));
const configurationSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  orly_version: z.string().regex(VERSION_PATTERN).optional(),
  packs: z.array(nonempty).optional(),
  commands: z.unknown().optional(),
  surfaces: z.unknown().optional(),
  managed: z.array(nonempty).optional(),
  digests: z.record(nonempty, z.string().regex(DIGEST_PATTERN)).optional(),
  execution: z.unknown().optional(),
  limits: z.record(nonempty, commandLimitsSchema).optional(),
}).strict();

export function validateConfiguration(value: JsonObject): void {
  const parsed = configurationSchema.safeParse(value);
  if (!parsed.success) throw new OrlyError(`.orly/orly.json invalid repository configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ")}`);
}
