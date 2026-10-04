import type { Answer } from "./wire";

import { z } from "zod";

import { MAX_EVIDENCE, MAX_ITEMS, MAX_NAME_LENGTH, MAX_REQUIREMENT_LENGTH, QUESTIONS, ROLES, STAGES } from "./constants";

const name = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const selector = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("file") }),
  z.strictObject({ kind: z.literal("function"), name }),
  z.strictObject({ kind: z.literal("test"), name }),
  z.strictObject({ kind: z.literal("section"), heading: name }),
]);
export const referenceSchema = z.strictObject({
  role: z.enum(ROLES),
  path: z.string().min(1).max(512).refine((value) => !/[\x00-\x1f\x7f]/.test(value)),
  selector,
});
export const itemSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,47}$/),
  question: z.enum(QUESTIONS),
  requirement: z.string().trim().min(1).max(MAX_REQUIREMENT_LENGTH),
  evidence: z.array(referenceSchema).min(1).max(MAX_EVIDENCE),
});
export const manifestSchema = z.strictObject({ stage: z.enum(STAGES), items: z.array(itemSchema).min(1).max(MAX_ITEMS) });

export type Stage = z.infer<typeof manifestSchema>["stage"];
export type Manifest = z.infer<typeof manifestSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Selector = Reference["selector"];
export type Role = Reference["role"];
export type QuestionId = Item["question"];
export type ProviderQuestion =
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };
export type Definition = {
  stage: Stage;
  requiredRoles: readonly Role[];
  oneOfRoles: readonly Role[];
  question: ProviderQuestion;
  yesAction: string;
  noAction: string;
  yesIsConcern: boolean;
};
export type Evidence = { role: Role; path: string; selector: Selector; startLine: number; endLine: number; text: string };
export type SourceReference = Omit<Evidence, "text"> & { digest: string };
export type Prepared = {
  item: Item;
  definition: Definition;
  identity: string;
  request: string;
  references: SourceReference[];
};
export type Assessment = { decision: string; concern: boolean; uncertain: boolean; strength: number; action: string };
export type CompletedItem = {
  status: "complete"; id: string; question: QuestionId; mode: "live" | "replay";
  model: string; identity: string; sources: SourceReference[]; assessment: Assessment;
  answer: Answer; requests: number; elapsedMs: number; usage: { input_tokens: number; output_tokens: number };
};
export type IncompleteItem = {
  status: "incomplete"; id: string; question: QuestionId; reason: string;
  requests: number; elapsedMs: number; usage: { input_tokens: number; output_tokens: number } | null;
};
export type ItemResult = CompletedItem | IncompleteItem;
export type Report = { stage: Stage; advisory: true; requests: number; results: ItemResult[] };
