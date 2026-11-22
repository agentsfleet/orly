import type { Environment } from "./settings";
import type { BurstRun, Job, Machine, Status } from "./types";

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { OrlyError } from "../model";
import { BUNDLE, followScript, INPUTS, JOB_EXIT, LAUNCH, LEAVE, NO_JOB, resultsScript, SETUP_FAILED, shellQuote, WORK } from "./job";
import { captureProcess, Lines, machineDeadline, pause, streamProcess, until } from "./process";
import { done, failed, ongoing } from "./progress";
import { bundleFor } from "./repository";

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
const COMMIT = /^[0-9a-f]{40}$/;
const SHORT = 7;
const EXIT_CODE = /^\d{1,3}$/;

// The run's own key pair, made in the run's private directory. ssh-keygen
// writes the private half with mode 0600; only the public half leaves this
// machine, registered with the cloud when the machine is created.
export async function newKeyPair(directory: string, comment: string, env: Environment): Promise<{ key: string; publicKey: string }> {
  const key = join(directory, KEY_FILE);
  const made = await captureProcess(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", comment, "-f", key], { env, timeoutMs: KEYGEN_TIMEOUT_MS });
  if (made.code !== 0) throw new OrlyError(`ssh-keygen failed: ${made.stderr.trim()}`);
  return { key, publicKey: (await Bun.file(`${key}.pub`).text()).trim() };
}

// A finished run keeps its evidence; the key, the bundle and the directory
// archives are tens of megabytes each run and serve nothing after it.
export function forgetRunFiles(run: BurstRun): void {
  const staged = readdirSync(run.runDirectory).filter((name) => name.endsWith(".tgz") || name.endsWith(".bundle")).map((name) => join(run.runDirectory, name));
  for (const path of [run.key, `${run.key}.pub`, ...staged]) rmSync(path, { force: true });
}

// A booting machine refuses connections for a while, so the first connect is
// retried. A booted machine answers within minutes, so the wait is bounded
// well inside the job's deadline. A failure carries ssh's own last error.
export async function reachable(run: BurstRun, job: Job, machine: Machine, user: string): Promise<void> {
  const target = machine.address ?? machine.id;
  run.write(ongoing(`waiting for SSH on ${target}`));
  let refusal = "";
  const probe = async () => {
    const tried = await captureProcess(sshArgs(run, machine, user, "true"), { env: run.settings.env, timeoutMs: PROBE_TIMEOUT_MS, signal: run.signal });
    if (tried.code === 0) return true;
    refusal = tried.stderr.trim().split("\n").at(-1) ?? "";
    return undefined;
  };
  try {
    await until(`SSH to ${target}`, probe, { deadline: machineDeadline(job), signal: run.signal, pollMs: run.settings.pollMs });
  } catch (error) {
    if (!(error instanceof OrlyError) || !refusal) throw error;
    throw new OrlyError(`${error.message}: ${refusal}`);
  }
  run.write(done(`SSH on ${target} answers`));
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

// Stages the ref's bundle and any copied directories, starts the job script
// detached on the machine, follows its log with the job's name in front, and
// brings the declared results back. The job outlives any one session: a lost
// one is reconnected, and the log resumes from the last byte received. Its
// exit code is the one the machine wrote, never ssh's. The script carries a
// lane's secrets, so it exists only as this process's memory, the session's
// input and, until the job opens it, a file in the machine's memory.
export async function runOverSsh(run: BurstRun, job: Job, machine: Machine, user: string, script: string, directories: readonly StagedDirectory[]): Promise<Status> {
  const base = await warmCommit(run, machine, user);
  const bundle = bundleFor(run.root, run.ref, run.commit, base, run.bundle);
  if (bundle === undefined) run.write(done(`${machine.id} already holds ${run.commit.slice(0, SHORT)}; nothing to send`));
  else await stage(run, machine, user, `cat > ${BUNDLE}`, bundle, bundle === run.bundle ? run.ref : `${run.ref} since ${base?.slice(0, SHORT)}`);
  for (const { name, archive } of directories) {
    await stage(run, machine, user, `rm -rf ${INPUTS}/${name} && mkdir -p ${INPUTS}/${name} && tar -xzf - -C ${INPUTS}/${name}`, archive, name);
  }
  const log = Bun.file(join(job.evidence, "run.log")).writer();
  const lines = new Lines((line) => {
    log.write(`${line}\n`);
    run.write(`[${job.name}] ${line}`);
  });
  let status: Status;
  try {
    status = await new Session(run, job, machine, user).run(script, lines);
  } finally {
    lines.end();
    await log.end();
  }
  if (!run.signal.aborted) await collect(run, job, machine, user);
  return status;
}

// A machine that joined the tailnet leaves it before it is deleted or
// imaged, so its node goes at once instead of when the tailnet notices it
// offline. Logout runs detached, since it ends the session it was sent over.
export async function leaveTailnet(run: BurstRun, machine: Machine, user: string): Promise<boolean> {
  const sent = await captureProcess(sshArgs(run, machine, user, asRoot(user, LEAVE)), { env: run.settings.env, timeoutMs: PROBE_TIMEOUT_MS });
  return sent.code === 0;
}

// One detached job on one machine, followed through as many SSH sessions as
// it takes. A lost session is retried every poll interval for as long as a
// booting machine is waited for, counted from the first failure since the
// log last grew, and never past the job's deadline.
class Session {
  readonly #run: BurstRun;
  readonly #job: Job;
  readonly #machine: Machine;
  readonly #user: string;
  #lostAt: number | undefined;

  constructor(run: BurstRun, job: Job, machine: Machine, user: string) {
    this.#run = run;
    this.#job = job;
    this.#machine = machine;
    this.#user = user;
  }

  async run(script: string, lines: Lines): Promise<Status> {
    for (;;) {
      const launched = await this.#capture(`bash -c ${shellQuote(LAUNCH)}`, STAGE_TIMEOUT_MS, new Blob([script]));
      if (launched.code === 0) break;
      if (launched.code !== SSH_LOST) throw new OrlyError(`could not start the job on ${this.#machine.id}: ${launched.stderr.trim()}`);
      const stop = await this.#lost(lines.bytes);
      if (stop) return stop;
    }
    for (;;) {
      const from = lines.bytes;
      const outcome = await streamProcess(this.#ssh(`bash -c ${shellQuote(followScript(from))}`), {
        env: this.#run.settings.env, deadline: this.#job.deadline, signal: this.#run.signal,
        // ssh's complaint is said once per loss, not at every retry.
        chunks: (chunk) => lines.take(chunk), lines: (line) => this.#lostAt === undefined && this.#run.write(`[${this.#job.name}] ${line}`),
      });
      if ("stopped" in outcome && outcome.stopped === "cancelled") return "cancelled";
      if ("stopped" in outcome && outcome.stopped === "deadline") return this.#lostAt === undefined ? "deadline" : this.#giveUp(Date.now());
      if (lines.bytes > from) this.#lostAt = undefined;
      if ("code" in outcome && outcome.code === NO_JOB) {
        this.#run.write(failed(`lane=${this.#job.name} ${this.#machine.id} holds no job any more; it may have restarted`));
        return "interrupted";
      }
      if ("code" in outcome && outcome.code === 0) {
        const code = await this.#exitCode();
        if (code !== undefined) return code;
      }
      const stop = await this.#lost(lines.bytes);
      if (stop) return stop;
    }
  }

  // What the job wrote as its exit, undefined when the session to read it was
  // lost, and interrupted when the job ended without writing one.
  async #exitCode(): Promise<Status | undefined> {
    const read = await this.#capture(`cat ${JOB_EXIT}`, PROBE_TIMEOUT_MS);
    if (read.code === SSH_LOST) return undefined;
    const code = read.stdout.trim();
    if (read.code !== 0 || !EXIT_CODE.test(code)) {
      this.#run.write(failed(`lane=${this.#job.name} the job on ${this.#machine.id} ended without an exit code`));
      return "interrupted";
    }
    return Number(code) === SETUP_FAILED ? "not_run" : Number(code);
  }

  // Waits one poll interval before the next attempt, or says why there is none.
  async #lost(offset: number): Promise<Status | undefined> {
    const now = Date.now();
    if (this.#run.signal.aborted) return "cancelled";
    if (this.#lostAt === undefined) {
      this.#lostAt = now;
      this.#run.write(ongoing(`lane=${this.#job.name} lost its session to ${this.#target()}; reconnecting, the log resumes at byte ${offset}`));
    }
    if (now >= machineDeadline(this.#job, this.#lostAt)) return this.#giveUp(now);
    await pause(this.#run.settings.pollMs, this.#run.signal);
    return this.#run.signal.aborted ? "cancelled" : undefined;
  }

  #giveUp(now: number): Status {
    this.#run.write(failed(`lane=${this.#job.name} could not reconnect to ${this.#target()} within ${Math.round((now - (this.#lostAt ?? now)) / 1000)}s`));
    return "interrupted";
  }

  #target(): string {
    return this.#machine.address ?? this.#machine.id;
  }

  #capture(command: string, timeoutMs: number, stdin?: Blob) {
    return captureProcess(this.#ssh(command), { env: this.#run.settings.env, timeoutMs, signal: this.#run.signal, ...(stdin ? { stdin } : {}) });
  }

  #ssh(command: string): string[] {
    return sshArgs(this.#run, this.#machine, this.#user, asRoot(this.#user, command));
  }
}

// A fresh machine's host key is one nobody has seen, so the run trusts it on
// first use and records it in the run's own known_hosts, never the user's;
// every later connection of the run must match it.
function sshArgs(run: BurstRun, machine: Machine, user: string, command: string): string[] {
  return ["ssh", "-i", run.key, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${run.knownHosts}`,
    "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=4", "-o", "LogLevel=ERROR",
    `${user}@${machine.address ?? ""}`, command];
}

// An upload of tens of megabytes over a slow link takes minutes, so it is
// announced with its size and reported with its duration.
async function stage(run: BurstRun, machine: Machine, user: string, command: string, file: string, what: string): Promise<void> {
  const started = Date.now();
  run.write(ongoing(`sending ${what} (${megabytes(Bun.file(file).size)} MB) to ${machine.id}`));
  const sent = await captureProcess(sshArgs(run, machine, user, command), { env: run.settings.env, stdin: Bun.file(file), timeoutMs: STAGE_TIMEOUT_MS, signal: run.signal });
  if (sent.code !== 0) throw new OrlyError(`could not stage ${what} on ${machine.id}: ${sent.stderr.trim()}`);
  run.write(done(`sent ${what} to ${machine.id} in ${Math.round((Date.now() - started) / 1000)}s`));
}

function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

// A snapshot's warm-up produces no lane results, so only lanes collect.
async function collect(run: BurstRun, job: Job, machine: Machine, user: string): Promise<void> {
  const paths = run.config.burst?.artifacts ?? [];
  if (paths.length === 0 || job.kind === "warm") return;
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

// The commit a warm machine's checkout holds; a cold machine has none.
async function warmCommit(run: BurstRun, machine: Machine, user: string): Promise<string | undefined> {
  const read = await captureProcess(sshArgs(run, machine, user, asRoot(user, `git -C ${WORK} rev-parse --verify --quiet HEAD`)), { env: run.settings.env, timeoutMs: PROBE_TIMEOUT_MS, signal: run.signal });
  const commit = read.stdout.trim();
  return read.code === 0 && COMMIT.test(commit) ? commit : undefined;
}

function asRoot(user: string, command: string): string {
  return user === "root" ? command : `sudo -n ${command}`;
}
