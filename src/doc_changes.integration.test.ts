import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { rmSync, symlinkSync } from "node:fs";

import { criteriaFor } from "./criteria";
import { cleanupTemporaryDirectories, git, modelFor, newRepository, temporaryDirectory } from "./gates_test_support";

const VERIFY = "verify";
const LANGUAGE = "docs.language";
const PAGE = "guide.mdx";
const CLEAN = "---\ntitle: Install\n---\n\n## Install\n\nRun `bun install`.\n";
const SLOP = "---\ntitle: Install\n---\n\n## Install\n\nWe leverage a robust solution.\n";
const README = "README.md";

afterEach(cleanupTemporaryDirectories);

async function fixture(readme = "# Read me\n\nRead this page.\n") {
  const root = newRepository();
  git(root, "branch", "-M", "main");
  const model = await modelFor(root);
  await Bun.write(join(root, README), readme);
  git(root, "add", ".");
  git(root, "commit", "-qm", "fixture baseline");
  git(root, "switch", "-qc", "docs-change");
  const context = { root, model, acceptDirty: true };
  return { root, evaluate: () => {
    const check = criteriaFor(VERIFY, context).find((entry) => entry.name === LANGUAGE);
    if (!check) throw new Error("documentation criterion is missing");
    return check.evaluate(context);
  } };
}

describe("changed documentation gate with real Git", () => {
  test("rejects banned prose in an untracked MDX page", async () => {
    const { root, evaluate } = await fixture();
    await Bun.write(join(root, PAGE), SLOP);
    const result = evaluate();
    expect(result.ok).toBeFalse();
    expect(result.detail).toContain(`${PAGE}:7 DOCWORD`);
    expect(result.detail).toContain("leverage");
  });

  test("rejects staged and committed prose before the PR", async () => {
    const { root, evaluate } = await fixture();
    await Bun.write(join(root, PAGE), SLOP);
    git(root, "add", PAGE);
    expect(evaluate().ok).toBeFalse();
    git(root, "commit", "-qm", "add guide");
    expect(evaluate().ok).toBeFalse();
  });

  test("checks working-tree changes to an existing paragraph", async () => {
    const original = "# Read me\n\nYou can read the guide to find each setting and learn how to change it\nwhen you need another value.\n";
    const { root, evaluate } = await fixture(original);
    await Bun.write(join(root, README), original.replace("when you need another value.", "when you need another value and want to save each setting for every workspace that you own."));
    const result = evaluate();
    expect(result.ok).toBeFalse();
    expect(result.detail).toContain(`${README}:3 DOCSENT`);
  });

  test("checks edits against HEAD when no default-branch reference exists", async () => {
    const { root, evaluate } = await fixture();
    git(root, "branch", "-d", "main");
    await Bun.write(join(root, README), "# Read me\n\nWe leverage tools.\n");
    const result = evaluate();
    expect(result.ok).toBeFalse();
    expect(result.detail).toContain(`${README}:3 DOCWORD`);
    await Bun.write(join(root, README), "# Read me\n\nRead the updated guide.\n");
    expect(evaluate().ok).toBeTrue();
  });

  test("checks the destination of a renamed documentation page", async () => {
    const { root, evaluate } = await fixture();
    git(root, "mv", README, "renamed guide.mdx");
    expect(evaluate().ok).toBeTrue();
    await Bun.write(join(root, "renamed guide.mdx"), SLOP);
    const result = evaluate();
    expect(result.ok).toBeFalse();
    expect(result.detail).toContain("renamed guide.mdx:7 DOCWORD");
    expect(result.detail).not.toContain(`${README}:`);
  });

  test("does not reject untouched historical prose", async () => {
    const original = "# Read me\n\nWe leverage a robust solution.\n\nRead the old guide.\n";
    const { root, evaluate } = await fixture(original);
    await Bun.write(join(root, README), original.replace("Read the old guide.", "Read the install guide."));
    expect(evaluate().ok).toBeTrue();
  });

  test("checks new changelog prose while leaving old entries alone", async () => {
    const archive = "---\ntitle: Changelog\n---\n\n<Update label=\"Old\">\n\nWe leverage a robust solution.\n\n</Update>\n";
    const { root, evaluate } = await fixture();
    const path = join(root, "changelog.mdx");
    await Bun.write(path, archive);
    git(root, "add", ".");
    git(root, "commit", "-qm", "old history");
    git(root, "branch", "-f", "main", "HEAD");
    await Bun.write(path, archive.replace("<Update", "<Update label=\"New\">\n\nWe leverage new tools.\n\n</Update>\n\n<Update"));
    expect(evaluate().ok).toBeFalse();
    await Bun.write(path, archive.replace("<Update", "<Update label=\"New\">\n\nYou can retry failed runs.\n\n- **Retries** — Run `agentsfleet retry` after a failure.\n\n</Update>\n\n<Update"));
    expect(evaluate().ok).toBeTrue();
  });

  test("rejects deleting a blank line that creates an oversized paragraph", async () => {
    const original = "# Read me\n\nOne sentence. Two sentences.\n\nThree sentences. Four sentences.\n";
    const { root, evaluate } = await fixture(original);
    await Bun.write(join(root, README), original.replace("sentences.\n\nThree", "sentences.\nThree"));
    expect(evaluate().ok).toBeFalse();
    expect(evaluate().detail).toContain("DOCPARA");
  });

  test("ignores deleted pages, ignored dependencies, and installed snapshots", async () => {
    const { root, evaluate } = await fixture();
    rmSync(join(root, README));
    await Bun.write(join(root, ".gitignore"), "node_modules/\n");
    await Bun.write(join(root, "node_modules/fixture/README.md"), SLOP);
    await Bun.write(join(root, ".orly/docs/DOCUMENTATION_RULES.md"), SLOP);
    await Bun.write(join(root, "docs/v1/done/record.md"), SLOP);
    expect(evaluate().ok).toBeTrue();
  });

  test("does not follow documentation symlinks outside the repository", async () => {
    const { root, evaluate } = await fixture();
    const outside = join(temporaryDirectory(), README);
    await Bun.write(outside, SLOP);
    symlinkSync(outside, join(root, "linked.md"));
    expect(evaluate().ok).toBeTrue();
  });

  test("accepts clean MDX, including a path with spaces", async () => {
    const { root, evaluate } = await fixture();
    await Bun.write(join(root, "install guide.mdx"), CLEAN);
    expect(evaluate().ok).toBeTrue();
  });

  test("fails visibly when the Git boundary cannot be read", async () => {
    const { root, evaluate } = await fixture();
    rmSync(join(root, ".git"), { recursive: true });
    expect(evaluate().ok).toBeFalse();
    expect(evaluate().detail).toContain("git");
  });

  test("rejects prose in a regular page replacing a tracked symlink", async () => {
    const { root, evaluate } = await fixture();
    const path = join(root, PAGE);
    symlinkSync(README, path);
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline link");
    git(root, "branch", "-f", "main", "HEAD");
    rmSync(path);
    await Bun.write(path, SLOP);
    expect(evaluate().ok).toBeFalse();
    expect(evaluate().detail).toContain("DOCWORD");
  });

  test("rejects new prose before a repository has its first commit", async () => {
    const { root, evaluate } = await fixture();
    rmSync(join(root, ".git"), { recursive: true });
    git(root, "init", "-q");
    await Bun.write(join(root, PAGE), SLOP);
    const result = evaluate();
    expect(result.ok).toBeFalse();
    expect(result.detail).toContain(`${PAGE}:7 DOCWORD`);
    expect(result.detail).toContain("leverage");
    await Bun.write(join(root, PAGE), CLEAN);
    expect(evaluate().ok).toBeTrue();
  });
});
