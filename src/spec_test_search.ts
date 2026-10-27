import { UNSCOPED_ENVIRONMENT } from "./git_env";

// Where a named test can live: test files by the common naming conventions, and
// Rust and Zig sources, which keep unit tests beside the code they cover.
const TEST_SOURCES = [
  ":(glob)**/*.test.*", ":(glob)**/*.spec.*", ":(glob)**/*_test.*", ":(glob)**/test_*.py",
  ":(glob)**/tests/**", ":(glob)**/test/**", ":(glob)**/__tests__/**", ":(glob)**/*.rs", ":(glob)**/*.zig",
];
// Prose, data, receipts and logs can name a test that no longer exists.
const NOT_TEST_SOURCES = ["md", "mdx", "json", "jsonl", "txt", "log", "snap", "yaml", "yml"]
  .map((extension) => `:(exclude,glob)**/*.${extension}`);
const GREP_MATCHED = 0;
const GREP_NO_MATCH = 1;
const PIPE_OUTPUT = "pipe";
const DISCARDED_OUTPUT = "ignore";
const NEWLINE = "\n";
// git grep -w treats letters, digits and underscore as word characters.
const WORD = "A-Za-z0-9_";
const ERE_SPECIAL = /[.[\]()*+?{}|^$\\]/g;
const JS_SPECIAL = /[.*+?^${}()|[\]\\]/g;

export type TestSearch = { found: Set<string>; closest: Map<string, string> };

function grep(root: string, options: string[], patterns: string[]): { ok: boolean; lines: string[] } {
  const result = Bun.spawnSync(["git", "grep", "-I", "-h", ...options, "-f", "-", "--", ...TEST_SOURCES, ...NOT_TEST_SOURCES], {
    cwd: root, env: UNSCOPED_ENVIRONMENT, stdin: Buffer.from(`${patterns.join(NEWLINE)}${NEWLINE}`),
    stdout: PIPE_OUTPUT, stderr: DISCARDED_OUTPUT,
  });
  const ok = result.exitCode === GREP_MATCHED || result.exitCode === GREP_NO_MATCH;
  return { ok, lines: ok ? result.stdout.toString().split(NEWLINE).filter(Boolean) : [] };
}

// One git search for every name, then whole-word matching per name on the lines
// it returned; undefined when git cannot answer. A missing name gets the nearest
// identifier that contains it, so a shortened Test cell is a mechanical rename.
export function searchTestSources(root: string, names: string[]): TestSearch | undefined {
  const matched = grep(root, ["-F", "-w"], names);
  if (!matched.ok) return undefined;
  const found = new Set(names.filter((name) => {
    const word = new RegExp(`(?:^|[^${WORD}])${name.replace(JS_SPECIAL, "\\$&")}(?=$|[^${WORD}])`);
    return matched.lines.some((line) => word.test(line));
  }));
  const missing = names.filter((name) => !found.has(name));
  const closest = new Map<string, string>();
  if (!missing.length) return { found, closest };
  const near = grep(root, ["-o", "-E"], missing.map((name) => `[${WORD}]*${name.replace(ERE_SPECIAL, "\\$&")}[${WORD}]*`));
  for (const name of missing) {
    const candidate = near.lines.find((line) => line !== name && line.includes(name));
    if (candidate) closest.set(name, candidate);
  }
  return { found, closest };
}
