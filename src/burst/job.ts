import { join } from "node:path";

// One machine's job as data; remoteScript renders it as shell.
type RemoteJob = {
  kind: "lane" | "warm";
  name: string;
  ref: string;
  commit: string;
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
// The machine's paths, defined here alone: the job script receives them, and
// ssh.ts stages the bundle and a lane's copied directories at them.
export const INPUTS = "/tmp/orly-burst-inputs";
export const WORK = "/opt/orly-burst/work";
export const BUNDLE = "/tmp/orly-burst.bundle";
// The exit of a job whose machine preparation, checkout or burst.setup
// failed, so the caller reports the lane as not run instead of failed.
export const SETUP_FAILED = 254;
// The detached job's files. /run is memory and empties at boot, so the job
// script holding a lane's secrets never reaches a disk, and a snapshot never
// carries a finished job's log or exit code into the next lane.
const JOB_DIR = "/run/orly-burst";
export const JOB_EXIT = `${JOB_DIR}/exit`;
// The follower's exit when the machine holds no launched job, as after a reboot.
export const NO_JOB = 3;
// The launcher's exit when fewer bytes arrived than were sent, as when the
// session was lost mid-upload: nothing is started, and the launch is retried.
export const UPLOAD_CUT = 4;

// The launcher: the job script, `bytes` long, arrives on standard input and
// is kept only until the detached shell opens it. A script that arrived short
// is discarded, since `cat` ends as gladly at a lost session's end as at the
// script's. `launched` is made only after the whole script arrived, so a
// launch retried after a lost session never starts a second job. The job
// outlives the session: its output goes to the log, and its exit code to
// JOB_EXIT.
export function launchScript(bytes: number): string {
  return [
    "set -eu", "umask 077", `mkdir -p ${JOB_DIR}`, `cat > ${JOB_DIR}/job.part`,
    `if [ "$(wc -c < ${JOB_DIR}/job.part)" -ne ${bytes} ]; then rm -f ${JOB_DIR}/job.part; exit ${UPLOAD_CUT}; fi`,
    `if ! mkdir ${JOB_DIR}/launched 2>/dev/null; then rm -f ${JOB_DIR}/job.part; exit 0; fi`,
    `mv ${JOB_DIR}/job.part ${JOB_DIR}/job.sh`, `: > ${JOB_DIR}/run.log`,
    `setsid nohup bash -c ${shellQuote([
      `echo $$ > ${JOB_DIR}/pid.part && mv ${JOB_DIR}/pid.part ${JOB_DIR}/pid`,
      `exec 3<${JOB_DIR}/job.sh`, `rm -f ${JOB_DIR}/job.sh`,
      `bash -s <&3 3<&- >>${JOB_DIR}/run.log 2>&1`,
      `echo $? > ${JOB_DIR}/exit.part`, `mv ${JOB_DIR}/exit.part ${JOB_EXIT}`,
    ].join("; "))} </dev/null >/dev/null 2>&1 &`,
    "",
  ].join("\n");
}

// Logs the machine out of the tailnet, which removes its ephemeral node at
// once. It runs detached, since it ends the session it arrives over.
export const LEAVE = "setsid nohup tailscale logout >/dev/null 2>&1 </dev/null &";
// A warm-up about to be imaged also forgets its node and its user data, so
// no snapshot boots as this node or holds this machine's spent key: the
// Tailscale state file goes, and so does cloud-init's copy of the boot script.
export const FORGET = `setsid nohup sh -c ${shellQuote("cloud-init clean --logs; tailscale logout; systemctl stop tailscaled; rm -f /var/lib/tailscale/tailscaled.state")} >/dev/null 2>&1 </dev/null &`;

// The follower: the log from byte `offset` on, until the job's shell exits.
// GNU tail reads the file once more after it sees the process gone, so the
// stream ends with the log's last byte.
export function followScript(offset: number): string {
  return [
    `cd ${JOB_DIR} 2>/dev/null && [ -d launched ] || exit ${NO_JOB}`,
    "while [ ! -s pid ]; do sleep 1; done",
    `tail -c +${offset + 1} --pid="$(cat pid)" -f run.log`,
    "",
  ].join("\n");
}

// The boot script a machine runs as root before anything else: install
// Tailscale where the image lacks it, and join the caller's tailnet as `host`
// with a key minted for this machine alone. A machine already joined, such
// as one E2E boots again, is left as it is.
export function bootScript(host: string, key: string): string {
  return [
    "#!/bin/bash",
    "# orly burst: join the caller's tailnet, so the caller reaches this machine with no public port.",
    "set -u",
    "if tailscale status >/dev/null 2>&1; then exit 0; fi",
    "for attempt in 1 2 3 4 5 6; do",
    "  command -v tailscale >/dev/null && break",
    "  if command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl ca-certificates; }; then",
    "    curl -fsSL https://tailscale.com/install.sh | sh && break",
    "  fi",
    "  sleep 10",
    "done",
    "systemctl enable --now tailscaled",
    // The key reaches tailscale through a file in memory, never its arguments.
    "key=/run/orly-burst.key",
    "trap 'rm -f \"$key\"' EXIT",
    `(umask 077 && printf '%s' ${shellQuote(key)} > "$key")`,
    "for attempt in 1 2 3 4 5 6; do",
    `  tailscale up --reset --auth-key="file:$key" --hostname=${shellQuote(host)} && exit 0`,
    "  sleep 5",
    "done",
    "exit 1",
    "",
  ].join("\n");
}

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
    `readonly WORK=${shellQuote(WORK)} BUNDLE=${shellQuote(BUNDLE)}`,
    `BURST_MODE=${shellQuote(job.kind)}`,
    `BURST_LANE=${shellQuote(job.name)}`,
    `BURST_REF=${shellQuote(job.ref)}`,
    `BURST_COMMIT=${shellQuote(job.commit)}`,
    "main() {",
    // -E carries the ERR trap into functions: until the lane's own steps
    // start, any failure is the machine's or the setup's.
    "  set -eE",
    `  trap 'exit ${SETUP_FAILED}' ERR`,
    // The backstop for a caller that died.
    `  shutdown -h +${job.deadlineMinutes} >/dev/null 2>&1 || true`,
    "  prepare",
    "  checkout",
    ...steps(job.setup),
    "  trap - ERR",
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
    `cd ${WORK} 2>/dev/null || exit 3`,
    "set --",
    `for path in ${paths.map(shellQuote).join(" ")}; do`,
    "  if [ -e \"$path\" ]; then set -- \"$@\" \"$path\"; fi",
    "done",
    "[ \"$#\" -gt 0 ] || exit 3",
    "tar -czf - \"$@\"",
    "",
  ].join("\n");
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
