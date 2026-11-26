import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runGate } from "./gates";
import { cleanupTemporaryDirectories, git, modelFor, newRepository, orly, ROOT } from "./gates_test_support";
import { newTests } from "./proof";
import { verificationState } from "./verification_store";

const SOURCE = "src/age.ts";
const TESTS = "src/age.test.ts";
const SORTS = "sorts the oldest first";
const REFUSES = "refuses a failed age";
const CORRECT = "export const oldestFirst = (ages: number[]) => [...ages].sort((a, b) => b - a);\nexport const valid = (age: number) => age >= 0;\n";
const RUN_TESTS = ["--", process.execPath, "test", TESTS];

afterEach(cleanupTemporaryDirectories);

// A branch adding a module and two tests of it; `ages` are distinct, so only
// the comparator decides the order the first test claims.
async function proofRepository() {
  const root = newRepository();
  const model = await modelFor(root);
  git(root, "checkout", "-q", "-b", "feat/ages");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, SOURCE), CORRECT);
  writeFileSync(join(root, TESTS), [
    `import { expect, test } from "bun:test";`,
    `import { oldestFirst, valid } from "./age";`,
    `test("${SORTS}", () => { expect(oldestFirst([3, 9, 5])).toEqual([9, 5, 3]); });`,
    `test("${REFUSES}", () => { expect(valid(-1)).toBe(false); });`,
    "",
  ].join("\n"));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "feat: order ages");
  return { root, model };
}

function proofRecords(root: string) {
  const directory = join(verificationState(root), "proofs");
  return existsSync(directory) ? readdirSync(directory).map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")).payload) : [];
}

function proven(root: string, model: Awaited<ReturnType<typeof modelFor>>) {
  return runGate(model, root, "pr").results.find((result) => result.name === "tests.proven");
}

test("a test that fails with its change reverted is recorded, and the pr gate counts it", async () => {
  const { root, model } = await proofRepository();
  writeFileSync(join(root, SOURCE), CORRECT.replace("b - a", "a - b"));
  const result = orly(root, ROOT, "proof", TESTS, "--test", SORTS, ...RUN_TESTS);
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain(`fail-before proof recorded for ${TESTS} › ${SORTS}`);
  expect(result.output).toContain(`(fail) ${SORTS}`);
  const [record] = proofRecords(root);
  expect(record).toMatchObject({ format: 1, file: TESTS, test: SORTS, command: [process.execPath, "test", TESTS] });
  expect(record.mutation).toContain("+export const oldestFirst = (ages: number[]) => [...ages].sort((a, b) => a - b);");
  expect(record.failing_line).toStartWith(`(fail) ${SORTS}`);
  writeFileSync(join(root, SOURCE), CORRECT);
  expect(proven(root, model)?.detail).toBe(`reported, not enforced: 1 of 2 new test(s) have no fail-before proof; record one with orly proof: ${TESTS} › ${REFUSES}`);
});

test("a test that passes with its change reverted is refused and records nothing", async () => {
  const { root } = await proofRepository();
  const result = orly(root, ROOT, "proof", TESTS, "--test", SORTS, ...RUN_TESTS);
  expect(result.code).toBe(1);
  expect(result.output).toContain("orly: the command passed, so the test did not fail");
  expect(proofRecords(root)).toEqual([]);
});

// A verbose runner, as cargo is, prints a line for the passing test too. Its
// name holds the word "failed", so that line must not pass for the failing one.
test("a failure of another test is refused, even when the name says failed", async () => {
  const { root } = await proofRepository();
  const verbose = `console.log("test ${REFUSES} ... ok"); console.log("test ${SORTS} ... FAILED"); process.exit(1);`;
  const result = orly(root, ROOT, "proof", TESTS, "--test", REFUSES, "--", process.execPath, "-e", verbose);
  expect(result.code).toBe(1);
  expect(result.output).toContain(`no output line reports "${REFUSES}" failing; a build error or another test failed instead`);
  expect(proofRecords(root)).toEqual([]);
});

test("a build error is refused, because no line reports the test failing", async () => {
  const { root } = await proofRepository();
  writeFileSync(join(root, SOURCE), "export const oldestFirst = (;\n");
  const result = orly(root, ROOT, "proof", TESTS, "--test", SORTS, ...RUN_TESTS);
  expect(result.code).toBe(1);
  expect(result.output).toContain(`no output line reports "${SORTS}" failing`);
});

test.each([
  [[TESTS, "--test", "no such test", ...RUN_TESTS], `${TESTS} declares no test named "no such test"`],
  [["README.md", "--test", SORTS, ...RUN_TESTS], "README.md is not a test file orly reads; it reads tests in TypeScript and JavaScript, Rust, Go, Python"],
  [["../elsewhere.test.ts", "--test", SORTS, ...RUN_TESTS], "../elsewhere.test.ts is outside this repository"],
  [[TESTS, "--test", SORTS], "[ORLY-PROOF-001] usage"],
  [[TESTS, ...RUN_TESTS], "[ORLY-PROOF-001] usage"],
  [[TESTS, SOURCE, "--test", SORTS, ...RUN_TESTS], "[ORLY-PROOF-001] usage"],
  [[TESTS, "--test", SORTS, "--test", REFUSES, ...RUN_TESTS], "[ORLY-PROOF-001] usage"],
  [[TESTS, "--name", SORTS, ...RUN_TESTS], "[ORLY-PROOF-001] usage"],
])("orly proof %j is refused", async (args, message) => {
  const { root } = await proofRepository();
  const result = orly(root, ROOT, "proof", ...args);
  expect(result.code).toBe(1);
  expect(result.output).toContain(message);
  expect(proofRecords(root)).toEqual([]);
});

test("an altered proof record proves nothing", async () => {
  const { root, model } = await proofRepository();
  writeFileSync(join(root, SOURCE), CORRECT.replace("b - a", "a - b"));
  expect(orly(root, ROOT, "proof", TESTS, "--test", SORTS, ...RUN_TESTS).code).toBe(0);
  writeFileSync(join(root, SOURCE), CORRECT);
  const directory = join(verificationState(root), "proofs");
  const [name] = readdirSync(directory);
  const path = join(directory, name ?? "");
  const record = JSON.parse(readFileSync(path, "utf8"));
  record.payload.test = REFUSES;
  writeFileSync(path, JSON.stringify(record));
  expect(proven(root, model)?.detail).toStartWith("reported, not enforced: 2 of 2 new test(s)");
});

test("the pr gate reports unproven tests and still passes", async () => {
  const { root, model } = await proofRepository();
  expect(proven(root, model)).toMatchObject({ ok: true, status: "passed" });
  expect(proven(root, model)?.detail).toBe(`reported, not enforced: 2 of 2 new test(s) have no fail-before proof; record one with orly proof: ${TESTS} › ${SORTS}; ${TESTS} › ${REFUSES}`);
  expect(existsSync(join(root, ".git/orly-verification"))).toBeFalse();
});

test("a branch with no new test declarations says so", async () => {
  const root = newRepository();
  const model = await modelFor(root);
  git(root, "checkout", "-q", "-b", "feat/docs");
  writeFileSync(join(root, "README.md"), "More words.\n");
  git(root, "commit", "-q", "-am", "docs: more words");
  expect(proven(root, model)?.detail).toBe("no new test declarations on this branch");
});

// Declarations are read from the lines a branch adds, per language; a changed
// body under an unchanged declaration, and a test-shaped call outside a test
// file, are not new tests.
test("new tests are read from added declarations in each supported language", async () => {
  const root = newRepository();
  const files: Record<string, string> = {
    "src/lib.rs": "pub fn helper() {}\n",
    "src/kept.test.ts": `test("kept", () => {\n  expect(1).toBe(1);\n});\n`,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: base");
  const added: Record<string, string> = {
    "src/lib.rs": "pub fn helper() {}\n#[cfg(test)]\nmod tests {\n    #[tokio::test]\n    #[ignore = \"needs a database\"]\n    async fn stores_one_row() {}\n    fn not_a_test() {}\n}\n",
    "src/kept.test.ts": `test("kept", () => {\n  expect(2).toBe(2);\n});\ntest.each([\n  [1, 2],\n])("adds %d to %d", (a, b) => { expect(a + b).toBe(3); });\ntest.each([1, 2])("doubles %d", (n) => { expect(n * 2).toBeGreaterThan(n); });\nit.skip('waits', () => {});\n`,
    "pkg/store_test.go": "package pkg\nfunc TestStoresOneRow(t *testing.T) {}\nfunc helper() {}\n",
    "tests/test_store.py": "def test_stores_one_row():\n    pass\nasync def test_reads_back():\n    pass\n",
    "src/runner.ts": `test("not in a test file", () => {});\n`,
  };
  for (const [path, text] of Object.entries(added)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "test: add declarations");
  const base = Bun.spawnSync(["git", "rev-parse", "HEAD^"], { cwd: root }).stdout.toString().trim();
  expect(newTests(root, base, Object.keys(added).sort())).toEqual([
    { file: "pkg/store_test.go", test: "TestStoresOneRow" },
    { file: "src/kept.test.ts", test: "adds %d to %d" },
    { file: "src/kept.test.ts", test: "doubles %d" },
    { file: "src/kept.test.ts", test: "waits" },
    { file: "src/lib.rs", test: "stores_one_row" },
    { file: "tests/test_store.py", test: "test_stores_one_row" },
    { file: "tests/test_store.py", test: "test_reads_back" },
  ]);
});
