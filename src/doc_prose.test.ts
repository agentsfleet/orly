import { describe, expect, test } from "bun:test";
import { clean, frontMatter } from "./doc_prose";

describe("documentation prose boundaries", () => {
  test("keeps code spans with longer backtick delimiters exempt", () => {
    expect(clean("Run ``please execute `pwd` ``.")).toBe("Run Code.");
  });

  test("keeps inline HTML code contents exempt", () => {
    expect(clean("Run <code>execute robust</code>.")).toBe("Run Code.");
  });

  test("reads a title and a reasoned frontmatter exception", () => {
    expect(frontMatter("---\ntitle: Install\nlint-ignore: DOC-05 — Official terminology\n---\n")).toEqual({ hasTitle: true, ignores: ["DOC-05"] });
  });

  test("reads multiple reasoned exceptions including lowercase rule suffixes", () => {
    const text = "---\nlint-ignore:\n  - DOC-05 — Official terminology\n  - DOC-02 — Required quotation\n  - DOC-14b — Named vocabulary\n---\n";
    expect(frontMatter(text).ignores).toEqual(["DOC-05", "DOC-02", "DOC-14b"]);
  });

  test("does not grant a malformed YAML exception", () => {
    expect(frontMatter("---\nlint-ignore: [\n---\n").ignores).toEqual([]);
  });

  test("does not grant an exception without a reason", () => {
    expect(frontMatter("---\nlint-ignore: DOC-05\n---\n").ignores).toEqual([]);
  });

  test("does not grant more than three page exceptions", () => {
    const text = "---\nlint-ignore:\n  - DOC-05 — One\n  - DOC-02 — Two\n  - DOC-03 — Three\n  - DOC-25 — Four\n---\n";
    expect(frontMatter(text).ignores).toEqual([]);
  });
});
