import { expect, test } from "bun:test";

import { CHOICE, REPLY_KEY } from "./constants";
import { CATALOG } from "./questions";
import { choiceReply, noulReply, TestProject } from "./test_support";
import { parseReply } from "./wire";

test("validates the requested choice distribution and pinned model", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  expect(parseReply(choiceReply(), prepared).answers[REPLY_KEY]).toEqual(choiceReply().answers[REPLY_KEY]);
});

test("rejects invalid schema, model and answer type", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  expect(() => parseReply({ ...choiceReply(), model: "jev-latest" }, prepared)).toThrow("Provider reply does not match the pinned model and answer schema.");
  expect(() => parseReply(noulReply(1), prepared)).toThrow("Provider answer has the wrong question type.");
  expect(() => parseReply({ ...choiceReply(), usage: { input_tokens: -1, output_tokens: 0 } }, prepared)).toThrow("Provider reply does not match the pinned model and answer schema.");
});

test("rejects missing answers and extra answers", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  const reply = choiceReply();
  expect(() => parseReply({ ...reply, answers: {} }, prepared)).toThrow("Provider reply must answer the requested question exactly once.");
  expect(() => parseReply({ ...reply, answers: { ...reply.answers, extra: reply.answers[REPLY_KEY] } }, prepared)).toThrow("Provider reply must answer the requested question exactly once.");
});

test("rejects omitted options, bad sums and a non-maximum choice", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  const reply = choiceReply();
  const answer = reply.answers[REPLY_KEY];
  if (answer?.type !== "choice") throw new Error("Choice fixture is invalid");
  const replace = (probabilities: Record<string, number>, choice: string = CHOICE.weak) => ({ ...reply, answers: { [REPLY_KEY]: { ...answer, probabilities, choice } } });
  expect(() => parseReply(replace({ [CHOICE.weak]: 1 }), prepared)).toThrow("Provider probabilities do not match the requested choices.");
  expect(() => parseReply(replace({ ...answer.probabilities, [CHOICE.exact]: 0.2 }), prepared)).toThrow("Provider probabilities do not sum to one.");
  expect(() => parseReply(replace(answer.probabilities, CHOICE.exact), prepared)).toThrow("Provider choice is not a highest-probability option.");
});

test("rejects non-finite and out-of-range probabilities", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  for (const number of [NaN, Infinity, -0.1, 1.1]) {
    expect(() => parseReply(noulReply(number), { ...prepared, definition: CATALOG["plan.prerequisites"] })).toThrow("Provider reply does not match the pinned model and answer schema.");
  }
});
