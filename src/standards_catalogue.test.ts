import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { cleanupTemporaryDirectories, ROOT, temporaryDirectory } from "./gates_test_support";
import { catalogueFindings, RULE_INVENTORY, SPEC_STANDARD, SPEC_TEMPLATE } from "./standards";

type Planted = Record<string, string | undefined>;

const COMMAND = join(ROOT, "bin/orly");
const PAGE = "standards/demo.md";
const RULE = [
  "### DEMO-ONE — A demo rule states one thing.",
  "- **Applies to:** demos",
  "- **Checked by:** review",
  "- **Bad:** two things at once",
  "- **Good:** one thing",
  "- **Why:** one thing can be checked.",
];
const INVENTORY = JSON.stringify({ identifiers: ["DEMO-ONE"], removed: {} });
const PAGE_FRAME_LINES = 3;
const OVERSIZED_LINES = 401;

afterEach(cleanupTemporaryDirectories);

function page(lines: string[]): string {
  return ["# Demo", "", ...lines, ""].join("\n");
}

// A scratch engine checkout holding one valid standard and its inventory; a
// planted entry replaces a file, or deletes it with `undefined`, so each case
// carries exactly one defect.
function catalogue(planted: Planted): string {
  const root = temporaryDirectory();
  for (const [path, text] of Object.entries({ [PAGE]: page(RULE), [RULE_INVENTORY]: INVENTORY, ...planted })) {
    if (text === undefined) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const FAILURES: Array<[string, Planted, string]> = [
  ["an empty catalogue", { [PAGE]: undefined }, "standards/: no standard pages"],
  ["a missing field", { [PAGE]: page(RULE.slice(0, -1)) }, "standards/demo.md:3 DEMO-ONE lacks Why"],
  ["a duplicated identifier", { "standards/twin.md": page(RULE) }, "DEMO-ONE has 2 homes: standards/demo.md, standards/twin.md"],
  ["a homeless identifier", { [RULE_INVENTORY]: JSON.stringify({ identifiers: ["DEMO-ONE", "DEMO-GONE"], removed: {} }) },
    "fixtures/standards-rule-ids.json: DEMO-GONE has no home and no removal reason"],
  ["a removed identifier with a home", { [RULE_INVENTORY]: JSON.stringify({ identifiers: [], removed: { "DEMO-ONE": "retired" } }) },
    "fixtures/standards-rule-ids.json: DEMO-ONE is recorded as removed but still has a home"],
  ["a missing inventory", { [RULE_INVENTORY]: undefined }, "fixtures/standards-rule-ids.json: missing"],
  ["an inventory that is not JSON", { [RULE_INVENTORY]: "{" }, "fixtures/standards-rule-ids.json: not valid JSON"],
  ["a misshapen inventory", { [RULE_INVENTORY]: JSON.stringify({ identifiers: "DEMO-ONE" }) },
    "fixtures/standards-rule-ids.json: needs an identifiers list and a removed map"],
  ["a broken link", { [PAGE]: page([...RULE, "", "See [the guide](guide.md)."]) }, "standards/demo.md: link to guide.md does not resolve"],
  ["an oversized page", { [PAGE]: page([...RULE, ...Array.from({ length: OVERSIZED_LINES - RULE.length - PAGE_FRAME_LINES }, () => "")]) },
    "standards/demo.md: 401 lines, at most 400"],
  ["a retired stack", { [PAGE]: page([...RULE, "", "Zig builds stay out."]) }, "standards/demo.md:10 names a retired stack"],
  ["a dead spec citation", { [SPEC_STANDARD]: page([]), [SPEC_TEMPLATE]: "# Template\n\n<!-- tpl: SPEC-GONE -->\n" },
    "standards/spec-template.md cites SPEC-GONE, which standards/spec.md does not define"],
];

describe("standards catalogue", () => {
  test("verify accepts the shared valid catalogue", () => {
    expect(catalogueFindings(ROOT)).toEqual([]);
    expect(catalogueFindings(catalogue({}))).toEqual([]);
    const result = Bun.spawnSync([COMMAND, "verify"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe("🟢 standards.catalogue\n🟢 generated.root.current\n🟢 packs.sources.current\n");
  });

  test.each(FAILURES)("verify names catalogue failures: %s", (_, planted, finding) => {
    expect(catalogueFindings(catalogue(planted))).toContain(finding);
  });
});
