import { expect, test } from "bun:test";

import { DEFAULT_MIN_SCORE, scoreSpec, SPEC_RUBRIC, SPEC_STATUS } from "./spec_rubric";

const PASS = 0.97;
const AT_THRESHOLD = 0.9;
const JUST_BELOW = 0.89999999;
const STRONG_NO = 0.03;
const answers = (probabilityYes: number = PASS) => SPEC_RUBRIC.map(({ id }) => ({ id, probabilityYes }));

test("all six yes answers satisfy readiness and the weakest answer owns the score", () => {
  const values = answers();
  values[0] = { id: SPEC_RUBRIC[0].id, probabilityYes: AT_THRESHOLD };
  expect(scoreSpec(values, DEFAULT_MIN_SCORE)).toEqual({ status: SPEC_STATUS.ready, score: 90, blocked: [] });
});

test("a confident no cannot become a high readiness score or be averaged away", () => {
  const values = answers();
  values[2] = { id: SPEC_RUBRIC[2].id, probabilityYes: STRONG_NO };
  expect(scoreSpec(values, DEFAULT_MIN_SCORE)).toEqual({ status: SPEC_STATUS.review, score: 3, blocked: [SPEC_RUBRIC[2].id] });
});

test("raw probabilities below the threshold block even when display rounds up", () => {
  expect(scoreSpec(answers(JUST_BELOW), DEFAULT_MIN_SCORE).status).toBe(SPEC_STATUS.review);
  expect(scoreSpec(answers(AT_THRESHOLD), DEFAULT_MIN_SCORE).status).toBe(SPEC_STATUS.ready);
});

test("every fixed question must have exactly one answer", () => {
  expect(() => scoreSpec(answers().slice(1), DEFAULT_MIN_SCORE)).toThrow();
  expect(() => scoreSpec([...answers().slice(1), answers()[1]], DEFAULT_MIN_SCORE)).toThrow();
});

test.each([NaN, Infinity, -0.1, 1.1])("invalid yes probability %s cannot pass", (value) => {
  expect(() => scoreSpec(answers(value), DEFAULT_MIN_SCORE)).toThrow();
});

test.each([0, -1, 101, NaN, Infinity])("invalid threshold %s cannot pass", (minimum) => {
  expect(() => scoreSpec(answers(), minimum)).toThrow();
});
