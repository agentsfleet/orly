import { afterEach, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const SCRIPT = "evals/llms/run.sh";
const AGENT_NAMES = ["claude", "codex", "amp", "opencode"];
const CALLS = "calls.txt";
const AGENTS = "AGENTS.md";
const FACADE = "dispatch/write_fixture.md";
const PIPE_OUTPUT = "pipe";
const TEXT_ENCODING = "utf8";
const CASE_TIMEOUT_MS = 30_000;

afterEach(cleanupTemporaryDirectories);

function fixture(missingHost = false) {
  const root = newRepository();
  for (const file of [SCRIPT, "evals/llms/agents.sh", "evals/llms/fixtures.sh", "evals/llms/cache.ts", "skills/orly-write-unit-test/SKILL.md", "skills/orly-write-integration-test/SKILL.md"]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    copyFileSync(join(ROOT, file), join(root, file));
  }
  mkdirSync(join(root, "dispatch"));
  writeFileSync(join(root, AGENTS), "# Deterministic rules\n");
  writeFileSync(join(root, FACADE), "Require the declared check.\n");
  writeFileSync(join(root, "evals/llms/fixtures.jsonl"), JSON.stringify({ id: "one", mode: "control", expect: "YES", q: "Does the rule require its check?", why: "Local adapter control.", ctx: [FACADE] }) + "\n");
  const tools = join(root, "tools");
  mkdirSync(tools);
  for (const name of ["bash", "sh", "bun", "python3", "timeout", "dirname", "cat", "mktemp", "rm", "ln", "chmod", "cut", "grep", "tr", "sed", "awk", "mkdir", "basename", "git"]) {
    const target = Bun.which(name);
    if (target) symlinkSync(target, join(tools, name));
  }
  for (const host of AGENT_NAMES.filter((name) => !missingHost || name !== "opencode")) {
    writeFileSync(join(tools, host), `#!/bin/sh
printf '%s\n' '${host}' >> "$ORLY_STUB_CALLS"
answer=YES
if [ '${host}' = opencode ] && [ "\${ORLY_STUB_FAIL:-0}" = 1 ]; then answer=NO; fi
if [ '${host}' = codex ]; then
  cat >/dev/null
  while [ "$#" -gt 0 ]; do
    if [ "$1" = --output-last-message ]; then shift; printf 'VERDICT: %s\n' "$answer" > "$1"; break; fi
    shift
  done
else
  if [ '${host}' != opencode ]; then cat >/dev/null; fi
  printf 'VERDICT: %s\n' "$answer"
fi
`, { mode: 0o755 });
  }
  const env = { ...UNSCOPED_ENVIRONMENT, PATH: tools, ORLY_STUB_CALLS: join(root, CALLS) };
  return { root, env };
}

function run(f: ReturnType<typeof fixture>, args: string[] = [], fail = true) {
  const result = Bun.spawnSync([Bun.which("bash")!, join(f.root, SCRIPT), ...args], {
    cwd: f.root, env: { ...f.env, ORLY_STUB_FAIL: fail ? "1" : "0" }, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, timeout: 30_000,
  });
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
}

function calls(f: ReturnType<typeof fixture>): number { return readFileSync(join(f.root, CALLS), TEXT_ENCODING).trim().split("\n").length; }

test("changed prompt bytes invalidate saved results without a new commit", () => {
  const f = fixture();
  const first = run(f);
  expect(first.code, first.output).toBe(1);
  expect(calls(f)).toBe(4);
  expect(run(f).output).toContain("resumed from journal");
  expect(calls(f)).toBe(4);
  writeFileSync(join(f.root, AGENTS), "# Changed deterministic rule\n");
  const changed = run(f);
  expect(changed.code).toBe(1);
  expect(changed.output).not.toContain("resumed from journal");
  expect(calls(f)).toBe(8);
  writeFileSync(join(f.root, FACADE), "A changed check remains required.\n");
  expect(run(f).output).not.toContain("resumed from journal");
  expect(calls(f)).toBe(12);
}, CASE_TIMEOUT_MS);

test("host selection and adapter settings cannot reuse incompatible saved proof", () => {
  const f = fixture();
  run(f);
  const partial = run(f, ["--agent", "claude"]);
  expect(partial.code).toBe(0);
  expect(partial.output).toContain("partial comprehension coverage");
  expect(partial.output).not.toContain("live comprehension passed");
  expect(calls(f)).toBe(5);
  mkdirSync(join(f.root, ".claude"));
  writeFileSync(join(f.root, ".claude/settings.json"), JSON.stringify({ model: "changed-local-control" }));
  expect(run(f).output).not.toContain("resumed from journal");
  expect(calls(f)).toBe(9);
}, CASE_TIMEOUT_MS);

test("malformed journal counts are discarded instead of becoming a pass", () => {
  const f = fixture();
  run(f);
  const journalRoot = join(f.root, ".llmevals-journal");
  const runDirectory = join(journalRoot, readdirSync(journalRoot)[0]!);
  const path = join(runDirectory, "claude");
  const saved = JSON.parse(readFileSync(path, TEXT_ENCODING));
  writeFileSync(path, JSON.stringify({ ...saved, status: "PASS", correct: 0, total: 0 }));
  expect(run(f).code).toBe(1);
  expect(calls(f)).toBe(5);
}, CASE_TIMEOUT_MS);

test("a missing required host keeps full coverage incomplete", () => {
  const f = fixture(true);
  const result = run(f, [], false);
  expect(result.code).toBe(1);
  expect(result.output).toContain("requested agent absent: opencode");
  expect(result.output).not.toContain("live comprehension passed");
  expect(calls(f)).toBe(3);
}, CASE_TIMEOUT_MS);

test("full completion requires every selected fixture on all required local stub hosts", () => {
  const f = fixture();
  const result = run(f, [], false);
  expect(result.code).toBe(0);
  expect(result.output).toContain("graded=4/4");
  expect(calls(f)).toBe(4);
}, CASE_TIMEOUT_MS);
