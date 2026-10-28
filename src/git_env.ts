import { resolve } from "node:path";

// git exports these to every hook it runs. Inherited by a spawned git, they
// pin it to the HOOK's repository instead of the directory we asked about: in
// the main checkout a relative GIT_DIR resolves locally by luck, but a linked
// worktree's .git is a FILE, so `.git/index` reads as "Not a directory" and
// every criterion silently evaluates against the wrong tree. Gates must judge
// the path they were handed, so every spawn in orly passes this scrubbed copy.
// Bun does not propagate a delete from process.env to a child, so the copy is
// explicit rather than a mutation.
const GIT_SCOPE_VARIABLES = [
  "GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_COMMON_DIR",
  "GIT_PREFIX", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
];
const COMMIT_INDEX_VARIABLE = "ORLY_INDEX_FILE";

function unscopedEnvironment(): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = { ...process.env };
  // `git commit -a` and `git commit <path>` name the commit's temporary index
  // only in GIT_INDEX_FILE. A hook of the repository's own that runs `orly gate
  // work` never exports the handoff, so it is made here, before the scrub. Only
  // this repository reads it; a nested sandbox ignores it.
  if (environment.GIT_INDEX_FILE && !environment[COMMIT_INDEX_VARIABLE]) {
    environment[COMMIT_INDEX_VARIABLE] = resolve(process.cwd(), environment.GIT_INDEX_FILE);
  }
  for (const name of GIT_SCOPE_VARIABLES) delete environment[name];
  return environment;
}

export const UNSCOPED_ENVIRONMENT = unscopedEnvironment();
