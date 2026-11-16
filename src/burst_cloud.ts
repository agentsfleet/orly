import type { Environment } from "./burst_settings";
import type { BurstRun, CloudProvider, Image, Job, LaneResult, Machine, Snapshot, Status } from "./burst_types";

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { remoteScript } from "./burst_job";
import { resolveSecrets } from "./burst_secrets";
import { forgetKeyPair, reachable, runOverSsh } from "./burst_ssh";

const MINUTE_MS = 60_000;
const SNAPSHOT_JOB = "snapshot";
const LANE_PREFIX = "burst.";

// Every lane gets its own machine, all at once. Secrets are resolved here,
// on the caller, before anything is rented. A lane's machine is deleted when
// the lane ends, whatever ended it, unless --keep asked otherwise; what the
// machines shared goes when the last one has.
export async function cloudLanes(provider: CloudProvider, run: BurstRun, lanes: string[], useSnapshot: boolean): Promise<LaneResult[]> {
  try {
    const secrets = await resolveSecrets(run.config.burst?.secrets ?? {}, run.settings.env);
    const image = await chooseImage(provider, run, useSnapshot);
    run.write(`orly burst: ${provider.name} starts ${lanes.join(", ")} from ${image.snapshot ? "snapshot" : "base image"} ${image.name}`);
    await provider.prepare(run);
    return await Promise.all(lanes.map((lane) => cloudLane(provider, run, newJob(run, "lane", lane, image), secrets)));
  } finally {
    await settle(provider, run);
  }
}

// One machine from the base image runs setup and warm with no secrets, stops,
// and becomes the repository's newest snapshot. The machine is deleted after.
export async function cloudSnapshot(provider: CloudProvider, run: BurstRun): Promise<Snapshot | undefined> {
  const job = newJob(run, "warm", SNAPSHOT_JOB, provider.baseImage());
  let machine: Machine | undefined;
  try {
    await provider.prepare(run);
    machine = await provider.create(run, job);
    machine = await provider.ready(run, job, machine);
    await reachable(run, job, machine, provider.user);
    const status = await runOverSsh(run, job, machine, provider.user, await script(run, job, {}));
    if (status !== 0) {
      run.write(`orly burst: the warm-up ended with exit=${status}; no snapshot was taken`);
      return undefined;
    }
    return await provider.capture(run, job, machine, snapshotName(run.repo, new Date()));
  } finally {
    if (machine) await release(provider, run, machine);
    await settle(provider, run);
  }
}

// Keeps the newest snapshots, by the timestamp their names carry, and
// deletes the rest.
export async function cloudPrune(provider: CloudProvider, run: BurstRun): Promise<Snapshot[]> {
  const snapshots = await repositorySnapshots(provider, run);
  const doomed = snapshots.slice(run.settings.snapshotKeep);
  for (const snapshot of doomed) {
    await provider.deleteSnapshot(run, snapshot);
    run.write(`orly burst: deleted snapshot ${snapshot.name} (${snapshot.id})`);
  }
  run.write(`orly burst: ${provider.name} keeps ${snapshots.length - doomed.length} snapshot(s) of ${run.repo}`);
  return doomed;
}

async function repositorySnapshots(provider: CloudProvider, run: BurstRun): Promise<Snapshot[]> {
  const prefix = `orly-burst-${run.repo}-`;
  return (await provider.snapshots(run)).filter((snapshot) => snapshot.name.startsWith(prefix)).sort((left, right) => right.name.localeCompare(left.name));
}

// An explicit image wins, then the newest snapshot unless --no-snapshot, and
// the base image when the repository has none yet.
async function chooseImage(provider: CloudProvider, run: BurstRun, useSnapshot: boolean): Promise<Image> {
  const override = await provider.override(run);
  if (override) return override;
  const newest = useSnapshot ? (await repositorySnapshots(provider, run))[0] : undefined;
  return newest ? { id: newest.launchId, name: newest.name, snapshot: true } : provider.baseImage();
}

async function cloudLane(provider: CloudProvider, run: BurstRun, job: Job, secrets: Environment): Promise<LaneResult> {
  let machine: Machine | undefined;
  let status: Status = "unlaunched";
  try {
    machine = await provider.create(run, job);
    machine = await provider.ready(run, job, machine);
    await reachable(run, job, machine, provider.user);
    status = await runOverSsh(run, job, machine, provider.user, await script(run, job, secrets));
  } catch (error) {
    run.write(`orly burst: lane=${job.name} ${error instanceof Error ? error.message : String(error)}`);
    if (machine) status = run.signal.aborted ? "cancelled" : Date.now() >= job.deadline ? "deadline" : "interrupted";
  } finally {
    if (machine) await release(provider, run, machine);
  }
  const minutes = machine ? Math.ceil((Date.now() - job.started) / MINUTE_MS) : 0;
  return { lane: job.name, provider: provider.name, machine: machine?.label ?? "none", minutes, cost: provider.cost(machine), status, evidence: job.evidence };
}

function script(run: BurstRun, job: Job, secrets: Environment): Promise<string> {
  const burst = run.config.burst ?? {};
  return remoteScript({
    kind: job.kind, name: job.name, ref: run.ref, keep: run.keep, deadlineMinutes: Math.ceil(run.settings.deadlineMs / MINUTE_MS),
    setup: burst.setup ?? [], steps: job.kind === "warm" ? burst.warm ?? [] : run.config.commands[`${LANE_PREFIX}${job.name}`] ?? [],
    secrets: job.kind === "lane" ? secrets : {},
  });
}

// A machine that outlives its run bills until someone deletes it, so a failed
// delete is said loudly, with the identifier to delete by hand.
async function release(provider: CloudProvider, run: BurstRun, machine: Machine): Promise<void> {
  if (run.keep) {
    run.write(`orly burst: --keep left ${provider.name} machine ${machine.id} at ${machine.address ?? "no address"}; it bills until you delete it`);
    return;
  }
  try {
    await provider.remove(run, machine);
  } catch (error) {
    run.write(`orly burst: could not delete ${provider.name} machine ${machine.id}: ${error instanceof Error ? error.message : String(error)}; delete it by hand, it bills until then`);
  }
}

async function settle(provider: CloudProvider, run: BurstRun): Promise<void> {
  try {
    await provider.finish(run);
  } finally {
    if (run.keep) run.write(`orly burst: --keep kept the run's SSH key at ${run.key}; log in as ${provider.user}`);
    else forgetKeyPair(run);
  }
}

function newJob(run: BurstRun, kind: Job["kind"], name: string, image: Image): Job {
  const evidence = join(run.runDirectory, name);
  mkdirSync(evidence, { recursive: true });
  const started = Date.now();
  return { kind, name, image, evidence, started, deadline: started + run.settings.deadlineMs };
}

function snapshotName(repo: string, now: Date): string {
  return `orly-burst-${repo}-${now.toISOString().replaceAll(/[-:T]/g, "").slice(0, 12)}`;
}
