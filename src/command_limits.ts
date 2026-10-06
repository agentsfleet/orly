import { z } from "zod";

export const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60 * 1_000;
export const DEFAULT_COMMAND_OUTPUT_BYTES = 64 * 1024 * 1024;
export const SUPERVISOR_GRACE_MS = 5000;
const MAX_COMMAND_TIMEOUT_MS = 2 ** 31 - 1 - SUPERVISOR_GRACE_MS;
export const DEFAULT_COMMAND_LIMITS = Object.freeze({ timeout_ms: DEFAULT_COMMAND_TIMEOUT_MS, output_bytes: DEFAULT_COMMAND_OUTPUT_BYTES });
export const commandLimitsSchema = z.object({
  timeout_ms: z.number().int().positive().max(MAX_COMMAND_TIMEOUT_MS).optional(),
  output_bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
export type CommandLimits = typeof DEFAULT_COMMAND_LIMITS;
export type LaneLimits = Record<string, z.infer<typeof commandLimitsSchema>>;

export function limitsFor(limits: LaneLimits | undefined, lane: string): CommandLimits {
  return {
    timeout_ms: limits?.[lane]?.timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS,
    output_bytes: limits?.[lane]?.output_bytes ?? DEFAULT_COMMAND_OUTPUT_BYTES,
  };
}
