import { afterEach, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const READ_LOG = ".git/orly/doc-reads.jsonl";
const CITATION = 'Quoted "section", tab\tline\nnext\rline and control\u0001 with \\ slash.';
const AUDIT_SCRIPT = "audits/doc-read.sh";
const READ_HELPER = "audits/doc-reads.ts";

afterEach(cleanupTemporaryDirectories);

for (const filename of ['we"ird.md', "tab\tpage.md", "line\npage.md", "control\u0001page.md"]) {
  test(`a document read round-trips the path ${JSON.stringify(filename)} and complete citation`, () => {
    const root = newRepository();
    writeFileSync(join(root, filename), "Read this rule.\n");
    const result = Bun.spawnSync(["bash", join(ROOT, AUDIT_SCRIPT), "log", filename, CITATION], { cwd: root, env: { ...UNSCOPED_ENVIRONMENT, ORLY_ROOT: root } });
    expect(result.exitCode).toBe(0);
    const rows = readFileSync(join(root, READ_LOG), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe(filename);
    expect(rows[0].section).toBe(CITATION);
    const current = Bun.spawnSync([process.execPath, join(ROOT, READ_HELPER), "current", join(root, READ_LOG), root]);
    expect(current.exitCode).toBe(0);
    const fields = current.stdout.toString().trimEnd().split("\t");
    expect(fields).toHaveLength(3);
    expect(JSON.parse(`"${fields[0]}"`)).toBe(filename);
    expect(JSON.parse(`"${fields[2]}"`)).toBe(CITATION);
  });
}

test("malformed saved rows cannot invent a current document read", () => {
  const root = newRepository();
  mkdirSync(join(root, ".git/orly"));
  writeFileSync(join(root, READ_LOG), 'broken JSON\n{"path":"README.md","blob":"bad","ts":"not a time","section":null}\n');
  appendFileSync(join(root, READ_LOG), JSON.stringify({ path: "../../outside", blob: "abc", ts: 1, section: "invented" }) + "\n");
  const result = Bun.spawnSync([process.execPath, join(ROOT, READ_HELPER), "current", join(root, READ_LOG), root]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe("");
});
