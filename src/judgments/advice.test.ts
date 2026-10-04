import { expect, test } from "bun:test";

import { CHOICE } from "./constants";
import { assess } from "./advice";
import { CATALOG } from "./questions";
import { choiceReply, noulReply, TestProject } from "./test_support";

test("weak assertions receive a fixed exact-result action", async () => {
  using project = new TestProject();
  const result = assess(await project.prepare(), choiceReply());
  expect(result.concern).toBe(true);
  expect(result.uncertain).toBe(false);
  expect(result.action).toContain("exact expected result");
});

test("insufficient and diffuse answers suggest inspection without automatic repair", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  const insufficient = assess(prepared, choiceReply(CHOICE.insufficient));
  expect(insufficient.uncertain).toBe(true);
  expect(insufficient.concern).toBe(false);
  const diffuse = choiceReply();
  const answer = diffuse.answers.decision;
  if (answer?.type !== "choice") throw new Error("Choice fixture is invalid");
  answer.confidence = 0.2;
  expect(assess(prepared, diffuse).action).toContain("suggests no repair or approval");
});

test("Noul uncertainty cannot become an applicability waiver", async () => {
  using project = new TestProject();
  const prepared = { ...await project.prepare(), definition: CATALOG["review.rule_applicability"] };
  const uncertain = assess(prepared, noulReply(0.5));
  expect(uncertain.uncertain).toBe(true);
  expect(uncertain.concern).toBe(false);
  const applies = assess(prepared, noulReply(1));
  expect(applies.action).toContain("owner still decides");
  expect(assess(prepared, noulReply(0)).action).toContain("cannot suppress a finding");
});
