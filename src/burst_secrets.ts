import type { Environment } from "./burst_settings";

import { captureProcess } from "./burst_process";
import { OrlyError } from "./model";

const OP_TIMEOUT_MS = 60_000;

// Each `burst.secrets` variable, on the machine that runs `orly burst`. A value
// already in the environment is used as it is, which is how a CI job's secret
// loader hands them over; anything else is read with `op read`, signed in or
// through OP_SERVICE_ACCOUNT_TOKEN. The values live in the returned map and
// nowhere else: never printed, never an argument, never a file. A failure
// names the variable and op's complaint, which carries the reference only.
export async function resolveSecrets(references: Record<string, string>, env: Environment): Promise<Environment> {
  const values: Environment = {};
  for (const [name, reference] of Object.entries(references)) {
    const preset = env[name];
    if (preset) {
      values[name] = preset;
      continue;
    }
    const read = await captureProcess(["op", "read", "--no-newline", reference], { env, timeoutMs: OP_TIMEOUT_MS });
    if (read.code !== 0) throw new OrlyError(`could not read the secret for ${name}: ${read.stderr.trim().split("\n")[0] ?? ""}`);
    values[name] = read.stdout;
  }
  return values;
}
