import { join } from "node:path";

import { git, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

export const SCANNER_TIMEOUT_MS = 30_000;
export const STAGED = "--staged";
const ADD = "add";
const PIPE = "pipe";

// One audit script from this checkout against a fixture repository. A private
// TMPDIR keeps its snapshot and receipt directories apart from parallel runs.
export function scan(project: string, script: string, args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(["bash", join(ROOT, script), ...args], {
    cwd: project, env: { ...UNSCOPED_ENVIRONMENT, TMPDIR: temporaryDirectory(), ...env },
    stdout: PIPE, stderr: PIPE, timeout: SCANNER_TIMEOUT_MS,
  });
  return { code: result.exitCode, text: result.stdout.toString() + result.stderr.toString() };
}

export async function staged(project: string, path: string, content: string) {
  await Bun.write(join(project, path), content);
  git(project, ADD, path);
}
