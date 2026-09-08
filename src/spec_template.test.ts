import { describe, expect, test } from "bun:test";

import { validateSpec } from "../audits/spec-template";
import { specFixture } from "./gates_test_support";

const COMMANDS = { conform: [["true"]], "verify.unit": [["true"]] };
const VALID = specFixture();
const MAPPING = "| 1.1 | unit | `fixture_test` | Valid input is accepted. |";
const REFERENCE = "1. `README.md` — fixture reference.";
const RUBRIC_ROW = "| S1 | Declared checks | `true` | exit 0 | P0 | |";
const EXISTS = () => true;

describe("spec content readiness", () => {
  test("a filled spec passes without product-specific commands or paths", () => {
    expect(validateSpec(VALID, COMMANDS, EXISTS)).toEqual([]);
  });

  test.each([
    ["empty section", "Fixture content for Overview.", "", "empty required section"],
    ["missing reference", REFERENCE, "No references.", "read-first section needs"],
    ["absolute reference", REFERENCE, "1. `/etc/hosts` — outside the repository.", "repository file"],
    ["parent reference", REFERENCE, "1. `../other.md` — outside.", "repository file"],
    ["unresolved reference", REFERENCE, "1. `docs/{name}.md` — incomplete.", "repository file"],
    ["missing test", MAPPING, "", "no matching tiered test"],
    ["wrong test", MAPPING, MAPPING.replace("fixture_test", "other_test"), "no matching tiered test"],
    ["missing assertion", MAPPING, MAPPING.replace("Valid input is accepted.", ""), "no matching tiered test"],
    ["missing tier", MAPPING, MAPPING.replace("unit", ""), "no matching tiered test"],
    ["orphan test", MAPPING, MAPPING.replace("1.1", "2.1"), "unknown Dimension"],
    ["missing columns", "| Dimension | Tier | Test | Asserts |", "| Wrong | Tier | Test | Asserts |", "needs Dimension"],
    ["missing proof name", "→ Test `fixture_test`", "→ decide later", "every Dimension"],
    ["command suffix", RUBRIC_ROW, RUBRIC_ROW.replace("`true`", "`true-other`"), "misses declared command"],
    ["missing expected", RUBRIC_ROW, RUBRIC_ROW.replace("exit 0", ""), "misses declared command"],
    ["missing command column", "| # | Criterion | Verify | Expected | Priority | Graded |", "| # | Criterion | Wrong | Expected | Priority | Graded |", "needs Verify"],
  ])("rejects %s", (_name, old, replacement, finding) => {
    expect(validateSpec(VALID.replace(old, replacement), COMMANDS, EXISTS).join("\n")).toContain(finding);
  });

  test.each(["{{fill:goal}}", "{unresolved_goal}", "<!-- tpl: delete me -->", "path/to/file.ext"])("rejects authoring residue %s", (slot) => {
    expect(validateSpec(`${VALID}\n${slot}`, COMMANDS, EXISTS)).toContain("unfilled template placeholder or authoring guidance");
  });

  test("comments and fenced headings cannot supply required sections", () => {
    const removed = VALID.replace("## Overview\n\nFixture content for Overview.", "");
    const text = `${removed}\n<!--\n## Overview\nHidden.\n-->\n\n\`\`\`\n## Overview\nFenced.\n\`\`\``;
    expect(validateSpec(text, COMMANDS, EXISTS).join("\n")).toContain("empty required section: ^Overview");
  });

  test.each(["````", "~~~"])("a %s code fence cannot supply a required heading", (fence) => {
    const removed = VALID.replace("## Overview\n\nFixture content for Overview.", "");
    const text = `${removed}\n${fence}\n\`\`\`\n## Overview\nStill inside code.\n${fence}\n`;
    expect(validateSpec(text, COMMANDS, EXISTS).join("\n")).toContain("empty required section: ^Overview");
  });

  test("a quoted heading cannot supply a required section", () => {
    const removed = VALID.replace("## Overview\n\nFixture content for Overview.", "");
    expect(validateSpec(`${removed}\n> ## Overview\n> Quoted example.\n`, COMMANDS, EXISTS).join("\n")).toContain("empty required section: ^Overview");
  });

  test("dimensions inside code do not count as implementation requirements", () => {
    const dimension = "- **Dimension 1.1** — DONE — fixture behaviour → Test `fixture_test`";
    const text = VALID.replace(dimension, `\`\`\`\n${dimension}\n\`\`\``);
    expect(validateSpec(text, COMMANDS, EXISTS).join("\n")).toContain("every Dimension");
  });

  test("comments containing a command do not satisfy its rubric row", () => {
    const text = VALID.replace(RUBRIC_ROW, "<!-- true -->");
    expect(validateSpec(text, COMMANDS, EXISTS).join("\n")).toContain("misses declared command verbatim: true");
  });

  test("missing files fail while URLs and file fragments resolve", () => {
    expect(validateSpec(VALID, COMMANDS, () => false).join("\n")).toContain("pointer does not resolve");
    const text = VALID.replace(REFERENCE, "1. https://example.com/reference — upstream.\n2. `README.md#example` — local.");
    expect(validateSpec(text, COMMANDS, (path) => path === "README.md")).toEqual([]);
  });

  test("duplicate dimensions fail even when they share a test", () => {
    const dimension = "- **Dimension 1.1** — DONE — fixture behaviour → Test `fixture_test`";
    expect(validateSpec(VALID.replace(dimension, `${dimension}\n${dimension}`), COMMANDS, EXISTS)).toContain("Dimension identifiers must be unique");
  });

  test("all declared lanes are required for a source change", () => {
    const commands = { ...COMMANDS, "verify.integration": [["cargo", "test", "--test", "system"]], "verify.lint": [["check", "style"]] };
    const text = VALID.replace("Fixture content for Files Changed (blast radius).", "`lib/widget.rs` | EDIT | Implement behavior.");
    const errors = validateSpec(text, commands, EXISTS).join("\n");
    expect(errors).toContain("cargo test --test system");
    expect(errors).toContain("check style");
  });

  test("the rubric lists conditional suites without guessing their applicability from prose", () => {
    const commands = { ...COMMANDS, "verify.integration": [["unused"]], "build": [["unrelated"]] };
    expect(validateSpec(VALID, commands, EXISTS)).toEqual(["rubric misses declared command verbatim: unused"]);
    const text = VALID.replace(RUBRIC_ROW, `${RUBRIC_ROW}\n| S2 | Conditional check | \`unused\` | gate reports pass or no code | P0 | |`);
    expect(validateSpec(text, commands, EXISTS)).toEqual([]);
  });

  test("documentation verification does not require an application test lane", () => {
    expect(validateSpec(VALID, { conform: [["true"]], "verify.docs": [["true"]] }, EXISTS)).toEqual([]);
  });

  test("the Markdown parser handles escaped pipes inside command arguments", () => {
    const commands = { conform: [["check", "a|b"]] };
    const text = VALID.replace("`true`", "`check a\\|b`");
    expect(validateSpec(text, commands, EXISTS)).toEqual([]);
  });

  test("oversize specs report their measured size against the cap", () => {
    expect(validateSpec(`${VALID}\n${"line\n".repeat(320)}`, COMMANDS, EXISTS).join("\n")).toMatch(/spec has \d+ lines; cap 320/);
  });
});
