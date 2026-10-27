import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, git, newRepository } from "./gates_test_support";
import { scan, SCANNER_TIMEOUT_MS, STAGED, staged } from "./scanner_test_support";

const SOURCE = "lib/a.ts";
const CLEAN = "export const MESSAGE = \"once\";\n";
// No scanned extension: the snapshot's link check must judge it on its own.
const LINK = "out-link";
const REFUSED = "unsafe indexed symbolic link: ";
const HOPS = 24;

setDefaultTimeout(SCANNER_TIMEOUT_MS);
afterEach(cleanupTemporaryDirectories);

async function stagedLink(target: string, prepare: (project: string) => void = () => {}) {
  const project = newRepository();
  await staged(project, SOURCE, CLEAN);
  prepare(project);
  symlinkSync(target, join(project, LINK));
  git(project, "add", ".");
  return scan(project, "audits/ufs.sh", [STAGED]);
}

test("a tracked link into an absent in-tree directory passes the snapshot", async () => {
  const result = await stagedLink("build/out.ts");
  expect(result.text).not.toContain(REFUSED);
  expect(result.code).toBe(0);
});

test.each(["../outside.ts", "/absent/outside.ts"])("a tracked link that leaves the tree is refused: %s", async (target) => {
  const result = await stagedLink(target);
  expect(result.code).toBe(2);
  expect(result.text).toContain(`${REFUSED}${LINK}`);
});

test("an in-tree directory link cannot hide a climb out of the snapshot", async () => {
  // Lexically the `inner/` and `../` hops cancel; physically each `inner` is the
  // tree root, so the climbs leave it.
  const target = `${"inner/".repeat(HOPS)}${"../".repeat(HOPS)}tmp/orly-absent-${process.pid}/x.ts`;
  const result = await stagedLink(target, (project) => symlinkSync(".", join(project, "inner")));
  expect(result.code).toBe(2);
  expect(result.text).toContain(`${REFUSED}${LINK}`);
});
