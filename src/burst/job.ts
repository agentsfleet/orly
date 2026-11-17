import { join } from "node:path";

// One machine's job as data; remoteScript renders it as shell.
type RemoteJob = {
  kind: "lane" | "warm";
  name: string;
  ref: string;
  keep: boolean;
  deadlineMinutes: number;
  setup: readonly string[][];
  // Warm-up steps for a snapshot, or the lane's own steps.
  steps: readonly string[][];
  secrets: Readonly<Record<string, string | undefined>>;
  // burst.directories names, each staged under INPUTS for a lane.
  directories: readonly string[];
};

// The prelude every machine runs, shipped beside this module in src/.
const PRELUDE = join(import.meta.dir, "job.sh");
// Where a lane's copied directories land; ssh.ts stages them there.
export const INPUTS = "/tmp/orly-burst-inputs";

// The whole job, prelude first. Every value is single-quoted, so a ref, an
// argument or a secret can never become shell syntax on the machine. Setup
// runs before the secrets are exported, and a warm-up never gets any.
export async function remoteScript(job: RemoteJob): Promise<string> {
  const steps = (invocations: readonly string[][]) => invocations.map((argv) => `  step ${argv.map(shellQuote).join(" ")}`);
  const exports = job.kind === "lane" ? [
    // A lane is a CI run, which is what makes test runners write reports.
    `  export CI="\${CI:-1}"`,
    ...Object.entries(job.secrets).map(([name, value]) => `  export ${name}=${shellQuote(value ?? "")}`),
    ...job.directories.map((name) => `  export ${name}=${shellQuote(`${INPUTS}/${name}`)}`),
  ] : [];
  const main = [
    `BURST_MODE=${shellQuote(job.kind)}`,
    `BURST_LANE=${shellQuote(job.name)}`,
    `BURST_REF=${shellQuote(job.ref)}`,
    "main() {",
    "  set -e",
    // The backstop for a caller that died. --keep asked for the machine to stay.
    ...(job.keep ? [] : [`  shutdown -h +${job.deadlineMinutes} >/dev/null 2>&1 || true`]),
    "  prepare",
    "  checkout",
    ...steps(job.setup),
    ...exports,
    ...steps(job.steps),
    ...(job.kind === "warm" ? ["  warmed"] : []),
    "}",
    "main </dev/null",
  ];
  return `${await Bun.file(PRELUDE).text()}\n${main.join("\n")}\n`;
}

// The remote half of collecting results: archive each declared path that
// exists, skip the rest, and exit 3 when there is nothing to send.
export function resultsScript(paths: readonly string[]): string {
  return [
    "cd /opt/orly-burst/work 2>/dev/null || exit 3",
    "set --",
    `for path in ${paths.map(shellQuote).join(" ")}; do`,
    "  if [ -e \"$path\" ]; then set -- \"$@\" \"$path\"; fi",
    "done",
    "[ \"$#\" -gt 0 ] || exit 3",
    "tar -czf - \"$@\"",
    "",
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
