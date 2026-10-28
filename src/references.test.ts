import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { referenceClosureErrors, renderProfileText } from "./references";

describe("renderProfileText", () => {
  test("keeps selected pack lines and removes their marker", () => {
    const content = "before\nselected <!-- oracle-packs:language.rust -->\nremoved <!-- oracle-packs:language.go -->\nafter";

    const rendered = renderProfileText(
      content,
      new Set(["language.rust"]),
      new Set(["language.rust", "language.go"]),
      "fixture.md",
    );

    expect(rendered).toBe("before\nselected\nafter");
  });

  test("rejects unknown pack markers", () => {
    expect(() => renderProfileText(
      "before\n<!-- oracle-packs:language.unknown -->\nafter",
      new Set(["language.rust"]),
      new Set(["language.rust"]),
      "fixture.md",
    )).toThrow("unknown orly pack marker");
  });
});

describe("referenceClosureErrors", () => {
  test("flags missing standard references in every rendered Markdown file", async () => {
    const output = mkdtempSync(join(tmpdir(), "orly-references-test-"));
    try {
      mkdirSync(join(output, "standards"));
      const documentPath = join(output, "standards/code.md");
      await Bun.write(documentPath, "| `*.rs` | `standards/languages/rust.md` |\n");

      const errors = await referenceClosureErrors(output, [documentPath]);

      expect(errors).toContain("missing standard reference: standards/code.md:1 -> standards/languages/rust.md");
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});
