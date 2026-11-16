import type { RepoConfig } from "./config";
import type { BurstSettings } from "./burst_settings";

export type ProviderName = "aws-spot" | "e2e" | "here";
export type CloudProviderName = Exclude<ProviderName, "here">;
// A lane's exit code, or why it has none. Only a number is evidence; the
// words say the lane never finished.
export type Status = number | "unlaunched" | "interrupted" | "deadline" | "cancelled" | "not_run";
export type LaneResult = { lane: string; provider: ProviderName; machine: string; minutes: number; cost: string; status: Status; evidence: string };
export type Io = { write: (line: string) => void; signal: AbortSignal };

// What a cloud run fixes before any machine starts: the repository and ref,
// the bundle of that ref, and the run's own SSH key pair and known_hosts.
export type BurstRun = Io & {
  root: string;
  config: RepoConfig;
  settings: BurstSettings;
  ref: string;
  repo: string;
  runId: string;
  runDirectory: string;
  bundle: string;
  key: string;
  publicKey: string;
  knownHosts: string;
  keep: boolean;
};

// One machine's work: a lane, or the warm-up a snapshot captures.
export type Job = { kind: "lane" | "warm"; name: string; image: Image; evidence: string; deadline: number; started: number };
export type Image = { id: string; name: string; snapshot: boolean };
// `ready` is false only for a capture whose image was still saving when the
// run's deadline came; the cloud finishes it, and lanes use it once it is.
export type Snapshot = { id: string; name: string; sizeGb: number | undefined; launchId: string; parts: string[]; ready: boolean };
export type Machine = { id: string; label: string; address: string | undefined; hourly: number | undefined };

// The seam a cloud provider fills: how its machines start, become reachable,
// stop and turn into images. The shared code in burst_cloud.ts owns the order,
// the parallel lanes, the deadline and the cleanup, and burst_ssh.ts owns the
// one transport every provider's machines are driven through.
export interface CloudProvider {
  readonly name: CloudProviderName;
  // The login user the provider's base image accepts the run's key for.
  readonly user: string;
  // An hourly rate, and an image's monthly storage, as this cloud bills them.
  cost(machine: Machine | undefined): string;
  storage(snapshot: Snapshot): string;
  baseImage(): Image;
  override(run: BurstRun): Promise<Image | undefined>;
  snapshots(run: BurstRun): Promise<Snapshot[]>;
  // Registers whatever the run's machines share, such as the public key.
  prepare(run: BurstRun): Promise<void>;
  create(run: BurstRun, job: Job): Promise<Machine>;
  // Waits until the machine runs, and returns it with its public address.
  ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine>;
  capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot>;
  remove(run: BurstRun, machine: Machine): Promise<void>;
  deleteSnapshot(run: BurstRun, snapshot: Snapshot): Promise<void>;
  // Removes what prepare registered, once every machine is gone.
  finish(run: BurstRun): Promise<void>;
}
