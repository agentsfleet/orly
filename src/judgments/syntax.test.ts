import { expect, test } from "bun:test";

import { selectSyntax } from "./syntax";
import { SOURCE, SOURCE_FILE, TEST_FILE, TEST_NAME, TEST_SOURCE, TestProject } from "./test_support";

test("selects a whole function with nested blocks and template literals", async () => {
  const text = `const unrelated = 1;\nexport function target(value: string) {\n if (value) { return \`x\${value}\`; }\n return "";\n}\nconst after = 2;`;
  const span = await selectSyntax(SOURCE_FILE, text, { kind: "function", name: "target" });
  expect(text.slice(span.start, span.end)).toBe('export function target(value: string) {\n if (value) { return `x${value}`; }\n return "";\n}');
});

test("selects complete named test calls", async () => {
  const span = await selectSyntax(TEST_FILE, TEST_SOURCE, { kind: "test", name: TEST_NAME });
  const selected = TEST_SOURCE.slice(span.start, span.end);
  expect(selected.startsWith(`test("${TEST_NAME}"`)).toBe(true);
  expect(selected.endsWith("})")).toBe(true);
  expect(selected).toContain("toBeTruthy()");
});

test("refuses duplicate symbols and skipped ancestor tests", async () => {
  const duplicate = await selectSyntax(SOURCE_FILE, `${SOURCE}\n${SOURCE}`, { kind: "function", name: "label" }).catch((error: unknown) => error);
  expect(duplicate).toBeInstanceOf(Error);
  expect(String(duplicate)).toContain("Evidence selector must match one complete, executable unit.");
  const skipped = `describe.skip("group", () => { ${TEST_SOURCE.slice(TEST_SOURCE.indexOf("test("))} });`;
  const blocked = await selectSyntax(TEST_FILE, skipped, { kind: "test", name: TEST_NAME }).catch((error: unknown) => error);
  expect(String(blocked)).toContain("Evidence selector must match one complete, executable unit.");
});

test.each(['test["skip"]', 'test["todo"]'])("refuses a statically computed skipped test: %s", async (callee) => {
  const text = TEST_SOURCE.replace("test(", `${callee}(`);
  await expect(selectSyntax(TEST_FILE, text, { kind: "test", name: TEST_NAME })).rejects.toThrow("Evidence selector must match one complete, executable unit.");
});

test.each(['describe["skip"]', 'describe["todo"]'])("refuses a statically computed skipped ancestor: %s", async (callee) => {
  const text = `${callee}("group", () => { ${TEST_SOURCE.slice(TEST_SOURCE.indexOf("test("))} });`;
  await expect(selectSyntax(TEST_FILE, text, { kind: "test", name: TEST_NAME })).rejects.toThrow("Evidence selector must match one complete, executable unit.");
});

test("refuses syntax errors, absent symbols and unsupported file types", async () => {
  const malformed = await selectSyntax(SOURCE_FILE, "function broken( {", { kind: "function", name: "broken" }).catch((error: unknown) => error);
  expect(String(malformed)).toContain("Selected TypeScript has syntax errors.");
  const absent = await selectSyntax(SOURCE_FILE, SOURCE, { kind: "function", name: "absent" }).catch((error: unknown) => error);
  expect(String(absent)).toContain("Evidence selector must match one complete, executable unit.");
  await expect(selectSyntax("source.rs", SOURCE, { kind: "function", name: "label" })).rejects.toThrow("Function and test selectors require TypeScript or JavaScript.");
});

test("selects a section including its child headings and ignores fenced headings", async () => {
  const text = "# Root\n## Selected\nProof\n### Child\nMore proof\n```md\n## Fake\n```\n## Next\nOther\n";
  const span = await selectSyntax("spec.md", text, { kind: "section", heading: "Selected" });
  expect(text.slice(span.start, span.end)).toBe("## Selected\nProof\n### Child\nMore proof\n```md\n## Fake\n```\n");
});

test.each(["```", "~~~"])("a fenced example can repeat a real heading with fence %s", async (fence) => {
  const selected = `## Selected\nProof\n${fence}md\n## Selected\n${fence}\n`;
  const text = `${selected}## Next\nOther\n`;
  const span = await selectSyntax("spec.md", text, { kind: "section", heading: "Selected" });
  expect(text.slice(span.start, span.end)).toBe(selected);
});

test("shorter and unterminated fences cannot introduce section headings", async () => {
  const text = "## Selected\nProof\n````md\n## Selected\n```\n## Selected\n";
  const span = await selectSyntax("spec.md", text, { kind: "section", heading: "Selected" });
  expect(text.slice(span.start, span.end)).toBe(text);
});

test("a list-item fence can repeat a real section heading", async () => {
  const selected = "## Selected\nText\n- ```md\n  ## Selected\n  ```\n\n";
  const text = `${selected}## Next\nOther\n`;
  const span = await selectSyntax("spec.md", text, { kind: "section", heading: "Selected" });
  expect(text.slice(span.start, span.end)).toBe(selected);
});

test("literal trailing hashes remain part of a Markdown heading", async () => {
  const text = "## C#\nProof\n## Next\nOther\n";
  const span = await selectSyntax("spec.md", text, { kind: "section", heading: "C#" });
  expect(text.slice(span.start, span.end)).toBe("## C#\nProof\n");
  await expect(selectSyntax("spec.md", text, { kind: "section", heading: "C" })).rejects.toThrow("Markdown section must match one complete heading.");
});

test("whitespace-separated closing hashes do not become part of the heading", async () => {
  const text = "## C# ##\nProof\n## Next\nOther\n";
  const span = await selectSyntax("spec.md", text, { kind: "section", heading: "C#" });
  expect(text.slice(span.start, span.end)).toBe("## C# ##\nProof\n");
});

test("refuses duplicate or missing Markdown headings", async () => {
  await expect(selectSyntax("spec.md", "## Repeat\none\n## Repeat\ntwo", { kind: "section", heading: "Repeat" })).rejects.toThrow("Markdown section requires an unambiguous plain heading.");
  await expect(selectSyntax("spec.md", "## Other\ntext", { kind: "section", heading: "Missing" })).rejects.toThrow("Markdown section must match one complete heading.");
});

test("selects a typed function containing JSX without running its source", async () => {
  const text = 'export const label = (value: string) => <span>{value}</span>;\nthrow new Error("source must never run");';
  const span = await selectSyntax("label.tsx", text, { kind: "function", name: "label" });
  expect(text.slice(span.start, span.end)).toBe('label = (value: string) => <span>{value}</span>');
});

test("parser timeout ends its worker and a later parse remains usable", async () => {
  using project = new TestProject();
  const waiting = "waiting-worker.ts";
  project.write(waiting, "self.onmessage = () => {}; ");
  const error = await selectSyntax(SOURCE_FILE, SOURCE, { kind: "function", name: "label" }, {
    timeoutMs: 10, workerUrl: new URL(`file://${project.root}/${waiting}`),
  }).catch((reason: unknown) => reason);
  expect(String(error)).toContain("TypeScript evidence parsing timed out.");
  const span = await selectSyntax(SOURCE_FILE, SOURCE, { kind: "function", name: "label" });
  expect(SOURCE.slice(span.start, span.end)).toBe(SOURCE);
});

test("parser startup failure refuses evidence without exposing raw worker details", async () => {
  const error = await selectSyntax(SOURCE_FILE, SOURCE, { kind: "function", name: "label" }, {
    workerUrl: new URL("./missing-parser-worker.ts", import.meta.url),
  }).catch((reason: unknown) => reason);
  expect(String(error)).toContain("TypeScript evidence could not be parsed.");
  expect(String(error)).not.toContain("missing-parser-worker");
});
