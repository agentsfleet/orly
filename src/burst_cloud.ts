import type { Environment } from "./burst_settings";
import type { StagedDirectory } from "./burst_ssh";
import type { BurstRun, CloudProvider, Image, Job, LaneResult, Machine, Snapshot, Status } from "./burst_types";

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { remoteScript } from "./burst_job";
import { resolveSecrets } from "./burst_secrets";
import { archiveDirectories, forgetKeyPair, reachable, runOverSsh } from "./burst_ssh";

// What only a lane receives: its secrets and its copied directories.
type LaneInputs = { secrets: Environment; directories: readonly StagedDirectory[] };

const NO_INPUTS: LaneInputs = Object.freeze({ secrets: {}, directories: [] });
const MINUTE_MS = 60_000;
const SNAPSHOT_JOB = "snapshot";
const LANE_PREFIX = "burst.";

// Every lane gets its own machine, all at once. Secrets are resolved here,
// on the caller, before anything is rented. A lane's machine is deleted when
// the lane ends, whatever ended it, unless --keep asked otherwise; what the
// machines shared goes when the last one has.
export async function cloudLanes(provider: CloudProvider, run: BurstRun, lanes: string[], useSnapshot: boolean): Promise<LaneResult[]> {
  try {
    const inputs: LaneInputs = {
      secrets: await resolveSecrets(run.config.burst?.secrets ?? {}, run.settings.env),
      directories: await archiveDirectories(run, run.config.burst?.directories ?? []),
    };
    const image = await chooseImage(provider, run, useSnapshot);
    run.write(`orly burst: ${provider.name} starts ${lanes.join(", ")} from ${image.snapshot ? "snapshot" : "base image"} ${image.name}`);
    await provider.prepare(run);
    return await Promise.all(lanes.map((lane) => cloudLane(provider, run, newJob(run, "lane", lane, image), inputs)));
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
    const status = await runOverSsh(run, job, machine, provider.user, await script(run, job, NO_INPUTS), []);
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
  // The whole name, so repository `web` never claims `orly-burst-web-app-…`;
  // the repository slug holds only lowercase letters, digits and hyphens.
  const name = new RegExp(`^orly-burst-${run.repo}-\\d{12}$`);
  return (await provider.snapshots(run)).filter((snapshot) => name.test(snapshot.name)).sort((left, right) => right.name.localeCompare(left.name));
}

// An explicit image wins, then the newest snapshot unless --no-snapshot, and
// the base image when the repository has none yet.
async function chooseImage(provider: CloudProvider, run: BurstRun, useSnapshot: boolean): Promise<Image> {
  const override = await provider.override(run);
  if (override) return override;
  const newest = useSnapshot ? (await repositorySnapshots(provider, run))[0] : undefined;
  return newest ? { id: newest.launchId, name: newest.name, snapshot: true } : provider.baseImage();
}

// A lane whose machine the cloud took back runs once more, on demand, when the
// provider says the run asked for that; the second attempt keeps its own
// evidence beside the first and its own deadline.
async function cloudLane(provider: CloudProvider, run: BurstRun, job: Job, inputs: LaneInputs): Promise<LaneResult> {
  const first = await laneAttempt(provider, run, job, inputs);
  if (!first.relaunch) return first.result;
  run.write(`orly burst: lane=${job.name} ${provider.name} took its machine back; running it once more on demand`);
  const again = await laneAttempt(provider, run, newJob(run, "lane", job.name, job.image, { onDemand: true, evidence: `${job.name}-on-demand` }), inputs);
  return { ...again.result, minutes: first.result.minutes + again.result.minutes, cost: `${first.result.cost}, then ${again.result.cost}` };
}

async function laneAttempt(provider: CloudProvider, run: BurstRun, job: Job, inputs: LaneInputs): Promise<{ result: LaneResult; relaunch: boolean }> {
  let machine: Machine | undefined;
  let status: Status = "unlaunched";
  let relaunch = false;
  try {
    machine = await provider.create(run, job);
    machine = await provider.ready(run, job, machine);
    await reachable(run, job, machine, provider.user);
    status = await runOverSsh(run, job, machine, provider.user, await script(run, job, inputs), inputs.directories);
  } catch (error) {
    run.write(`orly burst: lane=${job.name} ${error instanceof Error ? error.message : String(error)}`);
    if (machine) status = run.signal.aborted ? "cancelled" : Date.now() >= job.deadline ? "deadline" : "interrupted";
  } finally {
    if (machine && status === "interrupted" && !job.onDemand && provider.relaunchOnDemand) relaunch = await provider.relaunchOnDemand(run, machine).catch(() => false);
    if (machine) await release(provider, run, machine);
  }
  const minutes = machine ? Math.ceil((Date.now() - job.started) / MINUTE_MS) : 0;
  return { relaunch, result: { lane: job.name, provider: provider.name, machine: machine?.label ?? "none", minutes, cost: provider.cost(machine), status, evidence: job.evidence } };
}

function script(run: BurstRun, job: Job, inputs: LaneInputs): Promise<string> {
  const burst = run.config.burst ?? {};
  const lane = job.kind === "lane" ? inputs : NO_INPUTS;
  return remoteScript({
    kind: job.kind, name: job.name, ref: run.ref, keep: run.keep, deadlineMinutes: Math.ceil(run.settings.deadlineMs / MINUTE_MS),
    setup: burst.setup ?? [], steps: job.kind === "warm" ? burst.warm ?? [] : run.config.commands[`${LANE_PREFIX}${job.name}`] ?? [],
    secrets: lane.secrets, directories: lane.directories.map((directory) => directory.name),
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

function newJob(run: BurstRun, kind: Job["kind"], name: string, image: Image, retry?: { onDemand: true; evidence: string }): Job {
  const evidence = join(run.runDirectory, retry?.evidence ?? name);
  mkdirSync(evidence, { recursive: true });
  const started = Date.now();
  return { kind, name, image, evidence, started, deadline: started + run.settings.deadlineMs, ...(retry ? { onDemand: true } : {}) };
}

function snapshotName(repo: string, now: Date): string {
  return `orly-burst-${repo}-${now.toISOString().replaceAll(/[-:T]/g, "").slice(0, 12)}`;
}
