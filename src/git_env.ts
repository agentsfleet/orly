import { DEFAULT_COMMAND_OUTPUT_BYTES, DEFAULT_COMMAND_TIMEOUT_MS } from "./command_limits";

// git exports these to every hook it runs. Inherited by a spawned git, they
// pin it to the HOOK's repository instead of the directory we asked about: in
// the main checkout a relative GIT_DIR resolves locally by luck, but a linked
// worktree's .git is a FILE, so `.git/index` reads as "Not a directory" and
// every criterion silently evaluates against the wrong tree. Gates must judge
// the path they were handed, so every spawn in orly passes this scrubbed copy.
// Bun does not propagate a delete from process.env to a child, so the copy is
// explicit rather than a mutation.
export const GIT_SCOPE_VARIABLES = [
  "GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_COMMON_DIR",
  "GIT_PREFIX", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
];

function unscopedEnvironment(): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = { ...process.env };
  for (const name of GIT_SCOPE_VARIABLES) delete environment[name];
  return environment;
}

export const UNSCOPED_ENVIRONMENT = unscopedEnvironment();

// Every git call orly makes: run in `root`, with the scrubbed environment and
// the bounds a declared command gets.
export function git(root: string, args: string[], timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
  return Bun.spawnSync(["git", ...args], { cwd: root, env: UNSCOPED_ENVIRONMENT, timeout: timeoutMs, maxBuffer: DEFAULT_COMMAND_OUTPUT_BYTES });
}

// Trimmed output, or "" when git fails; `required` makes a failure an error.
export function gitOutput(root: string, args: string[], required = false): string {
  const result = git(root, args);
  if (required && (result.exitCode !== 0 || result.signalCode)) throw new Error("[ORLY-GIT-001] required Git metadata could not be read");
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}
