import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Make targets that belong to ONE consuming repository.
 *
 * A generic pack — anything not `product.*` — must never name these. A repository
 * that renames or retires one gets a managed file citing a target it does not
 * have, and if it gates on cited targets resolving, the only way to go green is
 * to edit a managed file, which the next `orly update` reverts. That loop is the
 * bug this list exists to prevent.
 *
 * Generic prose says what the target IS — "the declared `verify.unit` command",
 * "the repository's integration lane" — and lets each repository bind the name.
 *
 * Deliberately a denylist, not "no `make` citations at all": English says "make
 * it", "make the", "make an", so a blanket pattern fires on prose and gets
 * carved out until it means nothing.
 */
export const PRODUCT_ONLY_TARGETS: readonly string[] = [
  "lint-zig",
  "lint-governance",
  "check-pg-drain",
  "memleak",
  "test-integration",
  "test-integration-db",
  "test-integration-redis",
  "test-integration-kernel",
  "test-unit-agentsfleetd",
  "test-unit-agentsfleet-runner",
  "test-unit-agentsfleet-lib",
  "test-coverage-zig",
  "test-coverage-grade",
  "_lint_zig_test_depth",
];

/**
 * Pack label for files the registry ships outside any pack — core documents and
 * rules. Not a pack id, so it never matches the `product.` prefix and is held to
 * the generic standard, which is what core documents are.
 */
const CORE_PACK = "core";

/** A file shipped by a pack, with the pack that ships it. */
export interface ShippedFile {
  readonly source: string;
  readonly pack: string;
}

/** Collects every `source` a registry node ships, tagged with its pack. */
export function shippedFiles(registry: unknown): ShippedFile[] {
  const out: ShippedFile[] = [];
  const walk = (node: unknown, pack: string): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, pack);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.source === "string") out.push({ source: record.source, pack });
    for (const value of Object.values(record)) walk(value, pack);
  };

  const root = registry as Record<string, unknown>;
  const packs = (root.packs ?? {}) as Record<string, unknown>;
  for (const [name, pack] of Object.entries(packs)) walk(pack, name);
  walk(root.core_documents, CORE_PACK);
  walk(root.rules, CORE_PACK);
  return out;
}

/**
 * Reports every product-only make target named by a file a GENERIC pack ships.
 *
 * Returns one line per offending citation, empty when clean.
 */
export async function productLeakErrors(root: string, registry: unknown): Promise<string[]> {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const { source, pack } of shippedFiles(registry)) {
    if (pack.startsWith("product.")) continue;
    if (!source.endsWith(".md")) continue;
    if (seen.has(source)) continue;
    seen.add(source);

    let text: string;
    try {
      text = await readFile(join(root, source), "utf8");
    } catch {
      continue; // absent sources are the reference gate's business, not ours
    }

    text.split("\n").forEach((line, index) => {
      for (const target of PRODUCT_ONLY_TARGETS) {
        // Word-boundary on the tail so `test-integration` does not swallow
        // `test-integration-db`'s own, more specific, report.
        const pattern = new RegExp(`make ${target}(?![a-z0-9_-])`);
        if (pattern.test(line)) {
          errors.push(
            `${source}:${index + 1}: pack '${pack}' is not product-scoped but names \`make ${target}\`, ` +
              `which only one repository defines — say what the command IS instead`,
          );
        }
      }
    });
  }
  return errors;
}
