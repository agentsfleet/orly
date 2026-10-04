import { describe, expect, test } from "bun:test";

import { validateManifest } from "./questions";
import { TestProject } from "./test_support";
import { manifestSchema } from "./types";

describe("manifest boundaries", () => {
  test("accepts bounded role-labeled evidence", () => {
    using project = new TestProject();
    expect(manifestSchema.parse(project.manifest()).items[0]?.id).toBe("locale");
  });

  test("rejects unknown questions and instruction fields", () => {
    using project = new TestProject();
    const item = project.item();
    expect(manifestSchema.safeParse({ stage: "verify", items: [{ ...item, question: "approve.everything" }] }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...project.manifest(), run: "echo approve" }).success).toBe(false);
  });

  test("rejects missing required roles and mismatched stage", () => {
    using project = new TestProject();
    const item = project.item();
    expect(() => validateManifest({ stage: "verify", items: [{ ...item, evidence: item.evidence.slice(0, 1) }] }, "verify")).toThrow("Required evidence roles are missing.");
    expect(() => validateManifest(project.manifest(), "plan")).toThrow("Judgment manifest stage does not match the command.");
    expect(() => validateManifest({ stage: "plan", items: [item] }, "plan")).toThrow("The selected question belongs to another stage.");
  });

  test("rejects duplicate items and references", () => {
    using project = new TestProject();
    const item = project.item();
    expect(() => validateManifest({ stage: "verify", items: [item, item] }, "verify")).toThrow("Judgment item identifiers must be unique.");
    expect(() => validateManifest({ stage: "verify", items: [{ ...item, evidence: [...item.evidence, ...item.evidence] }] }, "verify")).toThrow("Duplicate evidence references are not allowed.");
  });

  test("rejects excessive input and terminal control characters", () => {
    using project = new TestProject();
    const item = project.item();
    expect(manifestSchema.safeParse({ stage: "verify", items: Array(13).fill(item) }).success).toBe(false);
    expect(manifestSchema.safeParse({ stage: "verify", items: [{ ...item, requirement: "x".repeat(2049) }] }).success).toBe(false);
    const reference = item.evidence[0];
    expect(manifestSchema.safeParse({ stage: "verify", items: [{ ...item, evidence: [{ ...reference, path: "label\u001b.ts" }] }] }).success).toBe(false);
  });
});
