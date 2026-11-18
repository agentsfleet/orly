import type { Environment } from "./settings";
import type { StagedDirectory } from "./ssh";
import type { BurstRun, CloudProvider, Image, Job, LaneResult, Machine, Snapshot, SnapshotScope, Status } from "./types";

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { remoteScript } from "./job";
import { done, failed, ongoing } from "./progress";
import { resolveSecrets } from "./process";
import { archiveDirectories, forgetRunFiles, reachable, runOverSsh } from "./ssh";
import { LANE_PREFIX, MINUTE_MS } from "./types";
import { messageOf, OrlyError } from "../model";

// What only a lane receives: its secrets and its copied directories.
type LaneInputs = { secrets: Environment; directories: readonly StagedDirectory[] };
type NamedSnapshot = { snapshot: Snapshot; stamp: string; digest: string };

const NO_INPUTS: LaneInputs = Object.freeze({ secrets: {}, directories: [] });
const SNAPSHOT_JOB = "snapshot";
// Pruning keeps the newest snapshot of the configured image and deletes the rest.
const KEEP = 1;
// A snapshot name ends in 8 hexadecimal characters: 4 of its image's digest,
// then 4 random ones, so two captures in one millisecond still differ.
const SUFFIX_CHARS = 8;
const IMAGE_DIGEST_CHARS = 4;

// Every lane gets its own machine, all at once. Secrets are resolved here,
// on the caller, before anything is rented. A lane's machine is deleted when
// the lane ends, whatever ended it; what the machines shared goes when the
// last one has.
export async function cloudLanes(provider: CloudProvider, run: BurstRun, lanes: string[], useSnapshot: boolean): Promise<LaneResult[]> {
  try {
    requireActive(run);
    const inputs: LaneInputs = {
      secrets: await resolveSecrets(run.config.burst?.secrets ?? {}, run.settings.env),
      directories: await archiveDirectories(run, run.config.burst?.directories ?? []),
    };
    const image = await chooseImage(provider, run, useSnapshot);
    run.write(ongoing(`${provider.name} starts ${lanes.join(", ")} from ${image.snapshot ? "snapshot" : "base image"} ${image.name}`));
    requireActive(run);
    await provider.prepare(run);
    return await Promise.all(lanes.map((lane) => cloudLane(provider, run, newJob(run, "lane", lane, image), inputs)));
  } finally {
    await settle(provider, run);
  }
}

// One machine from the base image runs setup and warm with no secrets, stops,
// and becomes the repository's newest snapshot of that image. The machine is
// deleted after.
export async function cloudSnapshot(provider: CloudProvider, run: BurstRun): Promise<Snapshot | undefined> {
  const image = provider.baseImage();
  const job = newJob(run, "warm", SNAPSHOT_JOB, image);
  let machine: Machine | undefined;
  try {
    requireActive(run);
    await provider.prepare(run);
    requireActive(run);
    machine = await provider.create(run, job);
    machine = await provider.ready(run, job, machine);
    await reachable(run, job, machine, provider.user);
    const status = await runOverSsh(run, job, machine, provider.user, await script(run, job, NO_INPUTS), []);
    if (status !== 0) {
      run.write(failed(`the warm-up ended with exit=${status}; no snapshot was taken`));
      return undefined;
    }
    return await provider.capture(run, job, machine, snapshotName(run.repo, image, new Date()));
  } finally {
    if (machine) await release(provider, run, machine);
    await settle(provider, run);
  }
}

// Keeps the newest snapshot of the image the repository names, and deletes
// every other snapshot of the repository, including those of another image.
export async function cloudPrune(provider: CloudProvider, scope: SnapshotScope): Promise<Snapshot[]> {
  const snapshots = await repositorySnapshots(provider, scope);
  const digest = imageDigest(provider.baseImage());
  const kept = snapshots.filter((entry) => entry.digest === digest).slice(0, KEEP);
  const doomed = snapshots.filter((entry) => !kept.includes(entry)).map((entry) => entry.snapshot);
  for (const snapshot of doomed) {
    await provider.deleteSnapshot(snapshot, scope.signal);
    scope.write(`orly burst: deleted snapshot ${snapshot.name} (${snapshot.id})`);
  }
  scope.write(`orly burst: ${provider.name} keeps ${kept.length} snapshot(s) of ${scope.repo}`);
  return doomed;
}

// The repository's snapshots, each read once into the moment it was taken
// and the digest of its base image, newest first.
async function repositorySnapshots(provider: CloudProvider, scope: SnapshotScope): Promise<NamedSnapshot[]> {
  const name = new RegExp(`^orly-burst-${scope.repo}-(\\d{17})-([0-9a-f]{${IMAGE_DIGEST_CHARS}})[0-9a-f]{${SUFFIX_CHARS - IMAGE_DIGEST_CHARS}}$`);
  return (await provider.snapshots(scope)).flatMap((snapshot) => {
    const [, stamp = "", digest = ""] = name.exec(snapshot.name) ?? [];
    return stamp ? [{ snapshot, stamp, digest }] : [];
  }).sort((left, right) => right.stamp.localeCompare(left.stamp) || right.snapshot.name.localeCompare(left.snapshot.name));
}

// The newest snapshot warmed from the configured base image, unless
// --no-snapshot; the base image itself when there is none.
async function chooseImage(provider: CloudProvider, run: BurstRun, useSnapshot: boolean): Promise<Image> {
  const base = provider.baseImage();
  const digest = imageDigest(base);
  const newest = useSnapshot ? (await repositorySnapshots(provider, run)).find((entry) => entry.digest === digest)?.snapshot : undefined;
  return newest ? { id: newest.id, name: newest.name, snapshot: true } : base;
}

async function cloudLane(provider: CloudProvider, run: BurstRun, job: Job, inputs: LaneInputs): Promise<LaneResult> {
  let machine: Machine | undefined;
  let status: Status = "unlaunched";
  try {
    requireActive(run);
    machine = await provider.create(run, job);
    machine = await provider.ready(run, job, machine);
    await reachable(run, job, machine, provider.user);
    status = await runOverSsh(run, job, machine, provider.user, await script(run, job, inputs), inputs.directories);
    if (status === "not_run") run.write(failed(`lane=${job.name} the machine or burst.setup failed before the lane started; see ${join(job.evidence, "run.log")}`));
  } catch (error) {
    run.write(failed(`lane=${job.name} ${messageOf(error)}`));
    if (machine) status = run.signal.aborted ? "cancelled" : Date.now() >= job.deadline ? "deadline" : "interrupted";
  } finally {
    if (machine) await release(provider, run, machine);
  }
  const minutes = machine ? Math.ceil((Date.now() - job.started) / MINUTE_MS) : 0;
  return { lane: job.name, provider: provider.name, machine: machine?.label ?? "none", minutes, cost: machine ? provider.cost(machine) : "none", status, evidence: job.evidence };
}

function script(run: BurstRun, job: Job, inputs: LaneInputs): Promise<string> {
  const burst = run.config.burst ?? {};
  const lane = job.kind === "lane" ? inputs : NO_INPUTS;
  return remoteScript({
    kind: job.kind, name: job.name, ref: run.ref, commit: run.commit, deadlineMinutes: Math.ceil(run.settings.deadlineMs / MINUTE_MS),
    setup: burst.setup ?? [], steps: job.kind === "warm" ? burst.warm ?? [] : run.config.commands[`${LANE_PREFIX}${job.name}`] ?? [],
    secrets: lane.secrets, directories: lane.directories.map((directory) => directory.name),
  });
}

// A machine that outlives its run bills until someone deletes it, so a failed
// delete is said loudly, with the identifier to delete by hand.
async function release(provider: CloudProvider, run: BurstRun, machine: Machine): Promise<void> {
  try {
    run.write(ongoing(`deleting ${provider.name} machine ${machine.id}`));
    await provider.remove(machine);
    run.write(done(`${provider.name} machine ${machine.id} is deleted`));
  } catch (error) {
    run.write(failed(`could not delete ${provider.name} machine ${machine.id}: ${messageOf(error)}; delete it by hand, it bills until then`));
  }
}

async function settle(provider: CloudProvider, run: BurstRun): Promise<void> {
  try {
    await provider.finish(run);
  } finally {
    forgetRunFiles(run);
  }
}

function newJob(run: BurstRun, kind: Job["kind"], name: string, image: Image): Job {
  const evidence = join(run.runDirectory, name);
  mkdirSync(evidence, { recursive: true });
  const started = Date.now();
  return { kind, name, image, evidence, started, deadline: started + run.settings.deadlineMs };
}

// A snapshot's name carries its repository, the moment it was taken, and a
// digest of the base image it warmed from, so a lane boots only a snapshot of
// the image the repository names now.
function snapshotName(repo: string, image: Image, now: Date): string {
  return `orly-burst-${repo}-${now.toISOString().replace(/\D/g, "")}-${imageDigest(image)}${crypto.randomUUID().slice(0, SUFFIX_CHARS - IMAGE_DIGEST_CHARS)}`;
}

function imageDigest(image: Image): string {
  return new Bun.CryptoHasher("sha256").update(image.id).digest("hex").slice(0, IMAGE_DIGEST_CHARS);
}

function requireActive(run: BurstRun): void {
  if (run.signal.aborted) throw new OrlyError("cancelled before cloud mutation");
}
