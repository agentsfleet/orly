import { expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadCases } from "../evals/judgments/comparison/corpus";
import { corpusJevExamples, evaluateJev, JEV_PREFLIGHT_ERROR, MAX_JEV_REQUESTS, type JevAttempt, type JevExample } from "../evals/judgments/comparison/jev";
import { CANDIDATE, labelsSchema } from "../evals/judgments/comparison/types";
import { validateCatalog } from "../evals/judgments/comparison/validate";
import { ANSWER_KIND, MAX_REQUEST_BYTES, MAX_STATE_BYTES, MODEL, REPLY_KEY } from "./judgments/constants";
import type { Reply } from "./judgments/wire";
import { OrlyError } from "./model";

const ROOT = resolve(import.meta.dir, "..");
const CREDENTIAL = "test-credential";
const PRIVATE_DETAIL = "private-provider-detail";
const FAILURE = "retention write failed";
const SCAN = "scan:";
const REQUEST = "request:";

async function examples(): Promise<JevExample[]> {
  const catalog = validateCatalog(await Bun.file(resolve(ROOT, "evals/judgments/comparison/catalog.json")).json());
  const cases = await loadCases(ROOT);
  const labels = labelsSchema.parse(await Bun.file(resolve(ROOT, "evals/judgments/comparison/labels.json")).json());
  const all = corpusJevExamples(catalog, cases, labels);
  return [all.find((entry) => entry.question === "document.claim"), all.find((entry) => entry.question === "verify.assertion"),
    all.find((entry) => entry.question === CANDIDATE.wiring)].filter((entry) => entry !== undefined);
}

function response(entry: JevExample): Reply {
  const question = entry.input.definition.question;
  const answer = question.type === ANSWER_KIND.noul ? { type: question.type, noul: 1 } : {
    type: question.type, choice: entry.expected, confidence: 1,
    probabilities: Object.fromEntries(Object.keys(question.criteria).map((key) => [key, key === entry.expected ? 1 : 0])),
  };
  return { model: MODEL, answers: { [REPLY_KEY]: answer }, usage: { input_tokens: 100, output_tokens: 20 } };
}

test("jev_requests_preserve_actual_native_answers_and_failures", async () => {
  const selected = await examples();
  const order: string[] = [];
  const retained: JevAttempt[] = [];
  let ordinal = 0;
  using server = Bun.serve({ port: 0, async fetch(request) {
    const entry = selected[ordinal++];
    if (!entry) throw new Error("Unexpected request.");
    order.push(REQUEST + entry.id);
    expect(await request.text()).toBe(entry.input.request);
    expect(request.headers.get("authorization")).toBe(`Bearer ${CREDENTIAL}`);
    expect(retained.at(-1)).toMatchObject({ id: entry.id, requests: 1, reply: null });
    return ordinal === 2 ? new Response(PRIVATE_DETAIL, { status: 429 }) : Response.json(response(entry));
  } });
  const actual = await evaluateJev(selected, CREDENTIAL, {
    scan: async (input) => { order.push(SCAN + selected.find((entry) => entry.input.request === input)?.id); },
    fetch: (request) => fetch(new Request(server.url, request)),
  }, async (attempt) => { retained.push(attempt); });
  expect(ordinal).toBe(3);
  expect(order.slice(0, 3)).toEqual(selected.map((entry) => SCAN + entry.id));
  expect(actual.map((entry) => entry.requests)).toEqual([1, 1, 1]);
  expect(actual.map((entry) => entry.reply !== null)).toEqual([true, false, true]);
  expect(actual[1]?.failure).toContain("HTTP 429; no automatic retry");
  expect(JSON.stringify(actual)).not.toContain(PRIVATE_DETAIL);
  expect(JSON.stringify(actual)).not.toContain(CREDENTIAL);
  expect(retained).toHaveLength(6);
  const first = selected[0];
  if (!first) throw new Error("Missing input.");
  expect(actual[0]?.reply).toEqual(response(first));
});

test("jev_missing_credentials_and_each_scanner_failure_prevent_every_upload", async () => {
  const selected = await examples();
  for (const failAt of [0, 1, 2, 3]) {
    let scans = 0;
    let uploads = 0;
    const attempts = await evaluateJev(selected, failAt === 0 ? undefined : CREDENTIAL, {
      scan: async () => { if (++scans === failAt) throw new OrlyError("Secret scanner failed; nothing was uploaded."); },
      fetch: async () => { uploads++; throw new Error(PRIVATE_DETAIL); },
    });
    expect(scans).toBe(failAt);
    expect(uploads).toBe(0);
    expect(attempts).toHaveLength(3);
    expect(attempts.every((entry) => entry.requests === 0 && entry.reply === null && entry.failure !== null)).toBe(true);
  }
});

test("jev_invalid_schedule_and_forged_upload_refuse_before_scanning", async () => {
  const selected = await examples();
  const entry = selected[0];
  if (!entry) throw new Error("Missing input.");
  let touched = 0;
  const dependencies = { scan: async () => { touched++; }, fetch: async () => { touched++; return Response.json({}); } };
  const badInputs = ["{", "x".repeat(MAX_REQUEST_BYTES + 1), JSON.stringify({ ...JSON.parse(entry.input.request), model: "unpinned" }),
    JSON.stringify({ ...JSON.parse(entry.input.request), state: { requirement: "bounded", evidence: [{ role: "spec", text: "x".repeat(MAX_STATE_BYTES + 1) }] } })];
  const invalid = [[], [entry, entry], Array.from({ length: MAX_JEV_REQUESTS + 1 }, (_, id) => ({ ...entry, id: String(id) })),
    ...badInputs.map((request) => [{ ...entry, input: { ...entry.input, request } }])];
  for (const schedule of invalid) await expect(evaluateJev(schedule, CREDENTIAL, dependencies)).rejects.toThrow(JEV_PREFLIGHT_ERROR);
  expect(touched).toBe(0);
});

test("jev_malformed_native_reply_and_transport_failure_remain_missing_and_continue", async () => {
  const selected = await examples();
  let ordinal = 0;
  const attempts = await evaluateJev(selected, CREDENTIAL, { scan: async () => {}, fetch: async () => {
    ordinal++;
    if (ordinal === 1) return Response.json({ model: "wrong-model", answers: {}, usage: {} });
    if (ordinal === 2) throw new Error(CREDENTIAL + PRIVATE_DETAIL);
    return new Response("{");
  } });
  expect(ordinal).toBe(3);
  expect(attempts.every((entry) => entry.reply === null && entry.requests === 1 && entry.failure !== null)).toBe(true);
  expect(attempts[0]?.failure).toContain("pinned model and answer schema");
  expect(attempts[1]?.failure).toContain("Provider transport failed");
  expect(attempts[2]?.failure).toContain("not valid JSON");
  expect(JSON.stringify(attempts)).not.toContain(CREDENTIAL);
  expect(JSON.stringify(attempts)).not.toContain(PRIVATE_DETAIL);
});

test("jev_retention_failure_at_each_ordered_write_prevents_the_next_upload", async () => {
  const selected = await examples();
  for (const failAt of [1, 2, 3, 4, 5, 6]) {
    let writes = 0;
    let uploads = 0;
    const durable: JevAttempt[] = [];
    await expect(evaluateJev(selected, CREDENTIAL, { scan: async () => {}, fetch: async () => {
      const entry = selected[uploads++];
      if (!entry) throw new Error("Unexpected upload.");
      return Response.json(response(entry));
    } }, async (attempt) => {
      if (++writes === failAt) throw new Error(FAILURE);
      durable.push(attempt);
    })).rejects.toThrow(FAILURE);
    expect(uploads).toBe(Math.floor(failAt / 2));
    expect(durable).toHaveLength(failAt - 1);
    if (failAt % 2 === 0) expect(durable.at(-1)).toMatchObject({ requests: 1, reply: null });
  }
});
