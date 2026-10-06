import { z } from "zod";
import { OrlyError } from "../model";

export const DISABLED_MODE = "disabled";
const MAX_ARGUMENTS = 32;
const MAX_ARGUMENT_LENGTH = 1024;
const argument = z.string().min(1).max(MAX_ARGUMENT_LENGTH).refine((value) => !value.includes("\0"));
const executionSchema = z.object({
  remote: z.object({
    mode: z.literal(DISABLED_MODE),
    launcher: z.array(argument).min(1).max(MAX_ARGUMENTS).optional(),
  }).strict(),
}).strict();

export type ExecutionConfig = z.infer<typeof executionSchema>;

export function readExecution(value: unknown): ExecutionConfig | undefined {
  if (value === undefined) return undefined;
  const parsed = executionSchema.safeParse(value);
  if (!parsed.success) throw new OrlyError("execution.remote requires mode=disabled and an optional nonempty launcher argument array; remote activation is unsupported");
  return parsed.data;
}
