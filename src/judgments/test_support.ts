import type { Item, Manifest, Prepared } from "./types";
import type { Reply } from "./wire";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CHOICE, MODEL, REPLY_KEY, ROLE, SELECTOR_KIND } from "./constants";
import { prepareItem } from "./evidence";

export const SOURCE_FILE = "label.ts";
export const TEST_FILE = "label.test.ts";
export const TEST_NAME = "label respects locale";
export const REQUIREMENT = "label returns the requested locale's year, month and day from Intl.DateTimeFormat, rather than merely a nonempty string.";
export const SOURCE = `export function label(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "2-digit" }).format(new Date(value));
}`;
export const TEST_SOURCE = `import { test, expect } from "bun:test";
import { label } from "./label";
test("${TEST_NAME}", () => {
  expect(label("2026-10-04T00:00:00Z", "en-GB")).toBeTruthy();
});`;

export class TestProject {
  readonly #root = mkdtempSync(join(tmpdir(), "orly-judgments-test-"));

  constructor() {
    this.write(SOURCE_FILE, SOURCE);
    this.write(TEST_FILE, TEST_SOURCE);
  }

  get root(): string { return this.#root; }

  write(path: string, text: string): void { writeFileSync(join(this.#root, path), text); }

  item(): Item {
    return {
      id: "locale", question: "verify.assertion", requirement: REQUIREMENT,
      evidence: [
        { role: "implementation", path: SOURCE_FILE, selector: { kind: "function", name: "label" } },
        { role: ROLE.test, path: TEST_FILE, selector: { kind: SELECTOR_KIND.test, name: TEST_NAME } },
      ],
    };
  }

  manifest(): Manifest { return { stage: "verify", items: [this.item()] }; }

  prepare(): Promise<Prepared> { return prepareItem(this.#root, this.item()); }

  [Symbol.dispose](): void { rmSync(this.#root, { recursive: true, force: true }); }
}

export function choiceReply(choice: string = CHOICE.weak): Reply {
  const probabilities = Object.fromEntries(Object.values(CHOICE).map((option) => [option, option === choice ? 1 : 0]));
  return { model: MODEL, answers: { [REPLY_KEY]: { type: "choice", choice, probabilities, confidence: 1 } }, usage: { input_tokens: 100, output_tokens: 20 } };
}

export function noulReply(probability: number): Reply {
  return { model: MODEL, answers: { [REPLY_KEY]: { type: "noul", noul: probability } }, usage: { input_tokens: 100, output_tokens: 20 } };
}
