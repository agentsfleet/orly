import { expect, test } from "bun:test";

import { scanUpload } from "./scan";

test("real secret scanning accepts ordinary evidence", async () => {
  await scanUpload(JSON.stringify({ state: "expect(actual).toBe(expected)" }));
});

test("real secret scanning refuses a generated credential without logging it", async () => {
  const fake = ["gh", "p_", Bun.randomUUIDv7().replaceAll("-", ""), "abcd"].join("");
  const result = await scanUpload(JSON.stringify({ token: fake })).catch((error: unknown) => error);
  expect(String(result)).toContain("found a credential");
  expect(String(result)).not.toContain(fake);
});

test("the secret scanner deadline terminates its owned process", async () => {
  const result = await scanUpload("ordinary evidence", 0).catch((error: unknown) => error);
  expect(String(result)).toContain("timed out");
});
