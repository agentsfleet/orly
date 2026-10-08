import type { ProviderInput, ProviderQuestion } from "./types";

import { z } from "zod";

import { OrlyError } from "../model";
import { ANSWER_KIND, MODEL, PROBABILITY_TOLERANCE, REPLY_KEY } from "./constants";

const probability = z.number().finite().min(0).max(1);
const answerSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal(ANSWER_KIND.noul), noul: probability }),
  z.strictObject({ type: z.literal(ANSWER_KIND.choice), choice: z.string(), probabilities: z.record(z.string(), probability), confidence: probability }),
]);
export const usageSchema = z.strictObject({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() });
export const replySchema = z.object({ model: z.literal(MODEL), answers: z.record(z.string(), answerSchema), usage: usageSchema });
export type Reply = z.infer<typeof replySchema>;
export type Answer = z.infer<typeof answerSchema>;

export function parseReply(value: unknown, prepared: ProviderInput): Reply {
  const parsed = replySchema.safeParse(value);
  if (!parsed.success) throw new OrlyError("Provider reply does not match the pinned model and answer schema.");
  const reply = parsed.data;
  const keys = Object.keys(reply.answers);
  const answer = reply.answers[REPLY_KEY];
  if (keys.length !== 1 || !answer) throw new OrlyError("Provider reply must answer the requested question exactly once.");
  validateAnswer(answer, prepared.definition.question);
  return reply;
}

function validateAnswer(answer: Answer, question: ProviderQuestion): void {
  if (answer.type !== question.type) throw new OrlyError("Provider answer has the wrong question type.");
  if (answer.type !== ANSWER_KIND.choice || question.type !== ANSWER_KIND.choice) return;
  const expected = Object.keys(question.criteria).sort();
  const actual = Object.keys(answer.probabilities).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new OrlyError("Provider probabilities do not match the requested choices.");
  const probabilities = Object.values(answer.probabilities);
  const sum = probabilities.reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > PROBABILITY_TOLERANCE) throw new OrlyError("Provider probabilities do not sum to one.");
  const selected = answer.probabilities[answer.choice];
  if (selected === undefined || selected + PROBABILITY_TOLERANCE < Math.max(...probabilities)) throw new OrlyError("Provider choice is not a highest-probability option.");
}
