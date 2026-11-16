import type { Outcome } from "./burst_process";
import type { Environment } from "./burst_settings";
import type { BurstRun, Job, Machine, Status } from "./burst_types";

import { rmSync } from "node:fs";
import { join } from "node:path";

import { resultsScript } from "./burst_job";
import { captureProcess, streamProcess, until } from "./burst_process";
import { OrlyError } from "./model";

const KEY_FILE = "id_ed25519";
const KEYGEN_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 30_000;
const STAGE_TIMEOUT_MS = 30 * 60_000;
const COLLECT_TIMEOUT_MS = 10 * 60_000;
const TAR_TIMEOUT_MS = 5 * 60_000;
// ssh exits 255 when the connection, not the remote command, failed.
const SSH_LOST = 255;
const NO_RESULTS = 3;

// The run's own key pair, made in the run's private directory. ssh-keygen
// writes the private half with mode 0600; only the public half leaves this
// machine, registered with the cloud when the machine is created.
export async function newKeyPair(directory: string, comment: string, env: Environment): Promise<{ key: string; publicKey: string }> {
  const key = join(directory, KEY_FILE);
  const made = await captureProcess(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", comment, "-f", key], { env, timeoutMs: KEYGEN_TIMEOUT_MS });
  if (made.code !== 0) throw new OrlyError(`ssh-keygen failed: ${made.stderr.trim()}`);
  return { key, publicKey: (await Bun.file(`${key}.pub`).text()).trim() };
}

export function forgetKeyPair(run: BurstRun): void {
  for (const path of [run.key, `${run.key}.pub`]) rmSync(path, { force: true });
}

// A booting machine refuses connections for a while, so the first connect is
// retried until it answers or the job's deadline passes.
export async function reachable(run: BurstRun, job: Job, machine: Machine, user: string): Promise<void> {
  await until(`SSH to ${machine.address ?? machine.id}`, async () => (await captureProcess(sshArgs(run, machine, user, "true"), { env: run.settings.env, timeoutMs: PROBE_TIMEOUT_MS })).code === 0 || undefined, { deadline: job.deadline, signal: run.signal, pollMs: run.settings.pollMs });
}

// Stages the ref's bundle, runs the job script as the session's standard
// input, streams its output with the job's name in front, and brings the
// declared results back. The script carries a lane's secrets, so it exists
// only as this process's memory and the remote shell's input.
export async function runOverSsh(run: BurstRun, job: Job, machine: Machine, user: string, script: string): Promise<Status> {
  const staged = await captureProcess(sshArgs(run, machine, user, "cat > /tmp/orly-burst.bundle"), { env: run.settings.env, stdin: Bun.file(run.bundle), timeoutMs: STAGE_TIMEOUT_MS });
  if (staged.code !== 0) throw new OrlyError(`could not stage ${run.ref} on ${machine.id}: ${staged.stderr.trim()}`);
  const log = Bun.file(join(job.evidence, "run.log")).writer();
  let outcome: Outcome;
  try {
    outcome = await streamProcess(sshArgs(run, machine, user, asRoot(user, "bash -s")), {
      env: run.settings.env, stdin: new Blob([script]), deadline: job.deadline, signal: run.signal,
      lines: (line) => {
        log.write(`${line}\n`);
        run.write(`[${job.name}] ${line}`);
      },
    });
  } finally {
    await log.end();
  }
  if (!run.signal.aborted) await collect(run, job, machine, user);
  if ("stopped" in outcome) return outcome.stopped;
  return outcome.code === SSH_LOST ? "interrupted" : outcome.code;
}

// A fresh machine's host key is one nobody has seen, so the run trusts it on
// first use and records it in the run's own known_hosts, never the user's;
// every later connection of the run must match it.
export function sshArgs(run: BurstRun, machine: Machine, user: string, command: string): string[] {
  return ["ssh", "-i", run.key, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${run.knownHosts}`,
    "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=4", "-o", "LogLevel=ERROR",
    `${user}@${machine.address ?? ""}`, command];
}

async function collect(run: BurstRun, job: Job, machine: Machine, user: string): Promise<void> {
  const paths = run.config.burst?.artifacts ?? [];
  if (paths.length === 0) return;
  const archive = join(job.evidence, "results.tar.gz");
  const fetched = await streamProcess(sshArgs(run, machine, user, asRoot(user, "bash -s")), {
    env: run.settings.env, stdin: new Blob([resultsScript(paths)]), stdoutFile: archive,
    lines: (line) => run.write(`[${job.name}] ${line}`), deadline: Date.now() + COLLECT_TIMEOUT_MS, signal: run.signal,
  });
  const unpacked = "code" in fetched && fetched.code === 0 && Bun.file(archive).size > 0
    && (await captureProcess(["tar", "-xzf", archive, "-C", job.evidence], { env: run.settings.env, timeoutMs: TAR_TIMEOUT_MS })).code === 0;
  if (!unpacked) rmSync(archive, { force: true });
  if ("code" in fetched && fetched.code === NO_RESULTS) run.write(`orly burst: lane=${job.name} none of the declared results exist: ${paths.join(", ")}`);
}

function asRoot(user: string, command: string): string {
  return user === "root" ? command : `sudo -n ${command}`;
}
