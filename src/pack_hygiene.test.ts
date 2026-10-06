import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PRODUCT_ONLY_TARGETS, productLeakErrors, shippedFiles } from "./pack_hygiene";

const registryFor = (pack: string, source: string) => ({
  packs: { [pack]: { documents: [{ source, target: source }] } },
});
const GUIDE_PATH = "docs/GUIDE.md";
const PRODUCT_COMMAND = "Run `make test-integration` before you ship.";

describe("productLeakErrors", () => {
  test("checks string core documents and retains source lines after product blocks", async () => {
    const output = mkdtempSync(join(tmpdir(), "orly-core-hygiene-"));
    try {
      mkdirSync(join(output, "docs"));
      await Bun.write(join(output, GUIDE_PATH), [
        "<!-- oracle-packs:start product.agentsfleet -->",
        PRODUCT_COMMAND,
        "<!-- oracle-packs:end -->",
        PRODUCT_COMMAND,
      ].join("\n"));
      const errors = await productLeakErrors(output, {
        core_documents: [GUIDE_PATH],
        packs: { "product.agentsfleet": {} },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`${GUIDE_PATH}:4`);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  test("allows a product-only command when the installer excludes its block", async () => {
    const output = mkdtempSync(join(tmpdir(), "orly-profile-hygiene-"));
    try {
      mkdirSync(join(output, "docs"));
      await Bun.write(join(output, GUIDE_PATH), [
        "<!-- oracle-packs:start product.agentsfleet -->",
        PRODUCT_COMMAND,
        "<!-- oracle-packs:end -->",
        "Use the repository's declared integration command.",
      ].join("\n"));
      const registry = registryFor("domain.http", GUIDE_PATH);
      Object.assign(registry.packs, { "product.agentsfleet": {} });
      expect(await productLeakErrors(output, registry)).toEqual([]);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
  test("flags a product-only target named by a generic pack", async () => {
    const output = mkdtempSync(join(tmpdir(), "orly-hygiene-"));
    try {
      mkdirSync(join(output, "docs"));
      await Bun.write(join(output, "docs/GUIDE.md"), "Run `make test-integration` before you ship.\n");

      const errors = await productLeakErrors(output, registryFor("domain.http", "docs/GUIDE.md"));

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("docs/GUIDE.md:1");
      expect(errors[0]).toContain("domain.http");
      expect(errors[0]).toContain("make test-integration");
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  test("allows the same target inside a product-scoped pack", async () => {
    const output = mkdtempSync(join(tmpdir(), "orly-hygiene-"));
    try {
      mkdirSync(join(output, "docs"));
      await Bun.write(join(output, "docs/GUIDE.md"), "Run `make test-integration` before you ship.\n");

      const errors = await productLeakErrors(output, registryFor("product.agentsfleet", "docs/GUIDE.md"));

      expect(errors).toBeEmpty();
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  test("does not fire on English that begins with 'make'", async () => {
    const output = mkdtempSync(join(tmpdir(), "orly-hygiene-"));
    try {
      mkdirSync(join(output, "docs"));
      await Bun.write(
        join(output, "docs/GUIDE.md"),
        "Make it obvious. This will make the reader stop.\nDo not make an exception here.\n",
      );

      const errors = await productLeakErrors(output, registryFor("universal.authoring", "docs/GUIDE.md"));

      expect(errors).toBeEmpty();
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  test("reports the most specific target, not its prefix", async () => {
    const output = mkdtempSync(join(tmpdir(), "orly-hygiene-"));
    try {
      mkdirSync(join(output, "docs"));
      await Bun.write(join(output, "docs/GUIDE.md"), "Run `make test-integration-db` for the DB half.\n");

      const errors = await productLeakErrors(output, registryFor("domain.sql", "docs/GUIDE.md"));

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("make test-integration-db");
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});

describe("shippedFiles", () => {
  test("tags each source with the pack that ships it", () => {
    const files = shippedFiles({
      packs: {
        "domain.http": { documents: [{ source: "docs/A.md" }] },
        "product.agentsfleet": { documents: [{ source: "docs/B.md" }] },
      },
      core_documents: [{ source: "docs/C.md" }, "docs/D.md"],
    });

    expect(files).toContainEqual({ source: "docs/A.md", pack: "domain.http" });
    expect(files).toContainEqual({ source: "docs/B.md", pack: "product.agentsfleet" });
    expect(files).toContainEqual({ source: "docs/C.md", pack: "core" });
    expect(files).toContainEqual({ source: "docs/D.md", pack: "core" });
  });
});

describe("the real corpus", () => {
  test("no generic pack names a product-only make target", async () => {
    const registry = await Bun.file("registry.json").json();
    const errors = await productLeakErrors(".", registry);

    expect(errors).toEqual([]);
  });

  test("every denied target is spelled once", () => {
    expect(new Set(PRODUCT_ONLY_TARGETS).size).toBe(PRODUCT_ONLY_TARGETS.length);
  });
});
