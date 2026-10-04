import { expect, test } from "bun:test";

import { MAX_RESPONSE_BYTES } from "./constants";
import { choiceReply, TestProject } from "./test_support";
import { requestAdvice } from "./transport";

test("provider request crosses real HTTP with the selected request and no redirect", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  const received: string[] = [];
  using server = Bun.serve({ port: 0, async fetch(request) {
    received.push(await request.text());
    expect(request.headers.get("authorization")).toBe("Bearer test-credential");
    return Response.json(choiceReply());
  } });
  const reply = await requestAdvice(prepared, "test-credential", (request) => fetch(new Request(server.url, request)));
  expect(reply).toEqual(choiceReply());
  expect(received).toEqual([prepared.request]);
});

test("HTTP refusal never retries or echoes the response body", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  let attempts = 0;
  using server = Bun.serve({ port: 0, fetch() { attempts++; return new Response("private-provider-detail", { status: 429 }); } });
  const result = await requestAdvice(prepared, "test-credential", (request) => fetch(new Request(server.url, request))).catch((error: unknown) => error);
  expect(String(result)).toContain("HTTP 429; no automatic retry");
  expect(String(result)).not.toContain("private-provider-detail");
  expect(attempts).toBe(1);
});

test("provider responses reject oversized and malformed JSON", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  const oversized = await requestAdvice(prepared, "unused", async () => new Response("x".repeat(MAX_RESPONSE_BYTES + 1))).catch((error: unknown) => error);
  expect(String(oversized)).toContain("byte budget");
  const malformed = await requestAdvice(prepared, "unused", async () => new Response("{")).catch((error: unknown) => error);
  expect(String(malformed)).toContain("not valid JSON");
});

test("the deadline covers a stalled response body and cancels its reader", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { canceled = true; } });
  const result = await requestAdvice(prepared, "unused", async () => new Response(stream), 1).catch((error: unknown) => error);
  expect(String(result)).toContain("timed out and was canceled");
  expect(canceled).toBe(true);
  expect(stream.locked).toBe(false);
});

test("transport failure hides credentials and cancels the request", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  let observed: AbortSignal | undefined;
  const result = await requestAdvice(prepared, "private-test-value", async (request) => {
    observed = request.signal;
    throw new Error("private-test-value");
  }).catch((error: unknown) => error);
  expect(String(result)).toContain("Provider transport failed");
  expect(String(result)).not.toContain("private-test-value");
  expect(observed?.aborted).toBe(true);
});
