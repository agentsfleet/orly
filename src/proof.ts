import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runCommand } from "./command_runner";
import { gitOutput } from "./git_env";
import { OrlyError } from "./model";
import { saveProof, type Proof } from "./verification_store";

type Language = { name: string; file: RegExp; declarations: (lines: string[]) => string[] };
type DeclaredTest = { file: string; test: string };

const UTF8 = "utf8";
const NEWLINE = /\r?\n/;
const TEST_PATH = /(^|\/)tests?\/|\.test\.|_test\.|\.spec\./;
// `test("name")`, `it.each([…])("name")` and their modifiers, on one line,
// or the `])("name"` line that closes a table spread over several lines.
const SCRIPT_TEST = /^\s*(?:(?:test|it)(?:\.\w+(?:\([^()]*\))?)*|\]\))\(\s*(["'`])((?:\\.|(?!\1).)*)\1/;
const RUST_TEST_ATTRIBUTE = /^\s*#\[(?:[\w:]+::)?test\b/;
const RUST_FUNCTION = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/;
const GO_TEST = /^func\s+(Test\w*)\s*\(/;
const PYTHON_TEST = /^\s*(?:async\s+)?def\s+(test\w*)\s*\(/;
// The verdict word a runner prints beside a failing test's name: bun's
// `(fail)`, cargo's `FAILED`, go's `--- FAIL:`, pytest's `FAILED`, or a cross.
// Runners print the verdict after the assertion detail, so the last line wins.
const FAIL_MARK = /\bfail(?:ed|ure|s)?\b|✗|✕|×/i;
// A parameterised name prints with its placeholders filled, so only the text
// before the first placeholder is looked for.
const PLACEHOLDER = /%|\$/;
// The languages whose test declarations orly reads, each from its test files.
const LANGUAGES: Language[] = [
  { name: "TypeScript and JavaScript", file: /\.(?:ts|tsx|js|jsx|mjs|cjs)$/, declarations: (lines) => matches(lines, SCRIPT_TEST, 2) },
  { name: "Rust", file: /\.rs$/, declarations: rustTests },
  { name: "Go", file: /_test\.go$/, declarations: (lines) => matches(lines, GO_TEST, 1) },
  { name: "Python", file: /\.py$/, declarations: (lines) => matches(lines, PYTHON_TEST, 1) },
];

// Run the command with the covered change reverted or mutated, and record what
// orly saw only when it failed and a failing output line names the test.
export function recordProof(root: string, file: string, test: string, command: string[]): Proof {
  const declared = declaredIn(root, file);
  if (!declared.includes(test)) throw new OrlyError(`${file} declares no test named "${test}"; name it exactly as its declaration does`);
  const prefix = test.split(PLACEHOLDER)[0]?.trim() ?? "";
  if (!prefix) throw new OrlyError(`"${test}" starts with a placeholder, so no output line can be matched to it`);
  const result = runCommand(root, command);
  if (result.status === "passed") throw new OrlyError("the command passed, so the test did not fail; revert or mutate the code it covers, then rerun orly proof");
  if (result.status !== "failed") throw new OrlyError(`the command reached no verdict (${result.status}): ${result.detail.split(NEWLINE)[0] ?? ""}`);
  const failing = result.detail.split(NEWLINE).filter((line) => line.includes(prefix) && FAIL_MARK.test(line.replace(prefix, ""))).at(-1);
  if (failing === undefined) throw new OrlyError(`the command failed, but no output line reports "${prefix}" failing; a build error or another test failed instead`);
  const proof = { file, test, command, failing_line: failing.trim(), mutation: mutation(root), revision: gitOutput(root, ["rev-parse", "HEAD"]), recorded_at: Date.now() };
  saveProof(root, proof);
  return proof;
}

// The tests a branch declares anew or renames, read from the lines it adds.
// A changed body under an unchanged declaration is not seen.
export function newTests(root: string, base: string, changed: string[]): DeclaredTest[] {
  return changed.filter((file) => languageOf(file) !== undefined).flatMap((file) => {
    const patch = gitOutput(root, ["diff", "--no-ext-diff", "--no-color", "--unified=0", `${base}..HEAD`, "--", file], true);
    const added = patch.split(NEWLINE).filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1));
    return [...new Set(languageOf(file)?.declarations(added))].map((test) => ({ file, test }));
  });
}

function supportedLanguages(): string {
  return LANGUAGES.map((language) => language.name).join(", ");
}

function declaredIn(root: string, file: string): string[] {
  const language = languageOf(file);
  if (!language) throw new OrlyError(`${file} is not a test file orly reads; it reads tests in ${supportedLanguages()}`);
  const path = join(root, file);
  if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) throw new OrlyError(`${file} is not a file in this repository`);
  return language.declarations(readFileSync(path, UTF8).split(NEWLINE));
}

function languageOf(file: string): Language | undefined {
  const language = LANGUAGES.find((candidate) => candidate.file.test(file));
  // Rust keeps unit tests beside the code, so any Rust file may declare one.
  if (!language || (language.name !== "Rust" && !TEST_PATH.test(file) && !/(^|\/)test_[^/]*\.py$/.test(file))) return undefined;
  return language;
}

function matches(lines: string[], pattern: RegExp, group: number): string[] {
  return lines.flatMap((line) => {
    const name = pattern.exec(line)?.[group];
    return name ? [name] : [];
  });
}

// A Rust test is the function after a `#[test]`-style attribute; other
// attributes, such as `#[ignore]`, may sit between them.
function rustTests(lines: string[]): string[] {
  const names: string[] = [];
  let pending = false;
  for (const line of lines) {
    if (RUST_TEST_ATTRIBUTE.test(line)) pending = true;
    const name = RUST_FUNCTION.exec(line)?.[1];
    if (name === undefined) continue;
    if (pending) names.push(name);
    pending = false;
  }
  return names;
}

// The code the run saw, as a diff from HEAD of every changed path that is not
// a test: the reverted hunk or the mutation, or nothing when HEAD's code ran.
function mutation(root: string): string {
  const paths = gitOutput(root, ["diff", "--name-only", "-z", "HEAD"], true).split("\0").filter((path) => path && !TEST_PATH.test(path));
  return paths.length === 0 ? "" : gitOutput(root, ["diff", "--no-ext-diff", "--no-color", "HEAD", "--", ...paths], true);
}
