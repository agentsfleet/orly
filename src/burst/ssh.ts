import type { Outcome } from "./process";
import type { Environment } from "./settings";
import type { BurstRun, Fetch, Job, Machine, Status } from "./types";

import { existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { OrlyError } from "../model";
import { INPUTS, resultsScript } from "./job";
import { captureProcess, streamProcess, until } from "./process";
import { IPV4 } from "./types";

export type StagedDirectory = { name: string; archive: string };

const KEY_FILE = "id_ed25519";
const KEYGEN_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 30_000;
const STAGE_TIMEOUT_MS = 30 * 60_000;
const COLLECT_TIMEOUT_MS = 10 * 60_000;
const TAR_TIMEOUT_MS = 5 * 60_000;
// ssh exits 255 when the connection, not the remote command, failed.
const SSH_LOST = 255;
const NO_RESULTS = 3;
// Each provider's SSH rule admits only the caller's public IPv4, learnt here.
const CALLER_ADDRESS_URL = "https://checkip.amazonaws.com";
const CALLER_TIMEOUT_MS = 15_000;

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
  const probe = async () => (await captureProcess(sshArgs(run, machine, user, "true"), { env: run.settings.env, timeoutMs: PROBE_TIMEOUT_MS, signal: run.signal })).code === 0 || undefined;
  await until(`SSH to ${machine.address ?? machine.id}`, probe, { deadline: job.deadline, signal: run.signal, pollMs: run.settings.pollMs });
}

// Each burst.directories variable must name a directory on this machine. It
// is archived once per run, beside the bundle, for every lane to receive.
export async function archiveDirectories(run: BurstRun, names: readonly string[]): Promise<StagedDirectory[]> {
  const staged: StagedDirectory[] = [];
  for (const name of names) {
    const directory = run.settings.env[name];
    if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) throw new OrlyError(`burst.directories names ${name}; set it to a directory on this machine`);
    const archive = join(run.runDirectory, `${name}.tgz`);
    const made = await captureProcess(["tar", "-czf", archive, "-C", directory, "."], { env: run.settings.env, timeoutMs: STAGE_TIMEOUT_MS, signal: run.signal });
    if (made.code !== 0) throw new OrlyError(`could not archive ${name}: ${made.stderr.trim()}`);
    staged.push({ name, archive });
  }
  return staged;
}

// Stages the ref's bundle and any copied directories, runs the job script as
// the session's standard input, streams its output with the job's name in
// front, and brings the declared results back. The script carries a lane's
// secrets, so it exists only as this process's memory and the remote shell's
// input.
export async function runOverSsh(run: BurstRun, job: Job, machine: Machine, user: string, script: string, directories: readonly StagedDirectory[]): Promise<Status> {
  await stage(run, machine, user, "cat > /tmp/orly-burst.bundle", run.bundle, run.ref);
  for (const { name, archive } of directories) {
    await stage(run, machine, user, `rm -rf ${INPUTS}/${name} && mkdir -p ${INPUTS}/${name} && tar -xzf - -C ${INPUTS}/${name}`, archive, name);
  }
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
// every later connection of the run must match it. A machine reached through
// a proxy is named by its identifier, which the proxy command receives as %h.
function sshArgs(run: BurstRun, machine: Machine, user: string, command: string): string[] {
  const proxy = machine.via ? ["-o", `ProxyCommand=${machine.via}`] : [];
  return ["ssh", "-i", run.key, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${run.knownHosts}`,
    "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=4", "-o", "LogLevel=ERROR", ...proxy,
    `${user}@${machine.via ? machine.id : machine.address ?? ""}`, command];
}

export async function callerAddress(fetcher: Fetch): Promise<string> {
  const response = await fetcher(CALLER_ADDRESS_URL, { signal: AbortSignal.timeout(CALLER_TIMEOUT_MS) });
  const address = (await response.text()).trim();
  if (!response.ok || !IPV4.test(address)) throw new OrlyError(`could not learn this machine's public IPv4 address from ${CALLER_ADDRESS_URL}`);
  return address;
}

// An upload of tens of megabytes over a slow link takes minutes, so it is
// announced with its size and reported with its duration.
async function stage(run: BurstRun, machine: Machine, user: string, command: string, file: string, what: string): Promise<void> {
  const started = Date.now();
  run.write(`orly burst: sending ${what} (${megabytes(Bun.file(file).size)} MB) to ${machine.id}`);
  const sent = await captureProcess(sshArgs(run, machine, user, command), { env: run.settings.env, stdin: Bun.file(file), timeoutMs: STAGE_TIMEOUT_MS, signal: run.signal });
  if (sent.code !== 0) throw new OrlyError(`could not stage ${what} on ${machine.id}: ${sent.stderr.trim()}`);
  run.write(`orly burst: sent ${what} to ${machine.id} in ${Math.round((Date.now() - started) / 1000)}s`);
}

function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
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
