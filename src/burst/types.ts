import type { RepoConfig } from "../config";
import type { BurstSettings } from "./settings";

// Shared by the command line, the cloud lifecycle and `--provider here`.
export const LANE_PREFIX = "burst.";
export const MINUTE_MS = 60_000;
export const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// The fetch a provider calls its cloud with, so tests can answer for it.
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
// Every cloud `--provider` can name; providers.ts maps each name to its class.
export const CLOUD_PROVIDER_NAMES = ["aws-spot", "e2e"] as const;
export type CloudProviderName = (typeof CLOUD_PROVIDER_NAMES)[number];
export type ProviderName = CloudProviderName | "here";
export const PROVIDER_NAMES: readonly ProviderName[] = [...CLOUD_PROVIDER_NAMES, "here"];
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

// What listing and pruning a repository's snapshots needs, which is less than a run.
export type SnapshotScope = Pick<BurstRun, "repo" | "settings" | "write" | "signal">;

// One machine's work: a lane, or the warm-up a snapshot captures. `onDemand`
// marks a lane run again after the cloud took its first machine back.
export type Job = { kind: "lane" | "warm"; name: string; image: Image; evidence: string; deadline: number; started: number; onDemand?: true };
export type Image = { id: string; name: string; snapshot: boolean };
// `ready` is false only for a capture whose image was still saving when the
// run's deadline came; the cloud finishes it, and lanes use it once it is.
export type Snapshot = { id: string; name: string; sizeGb: number | undefined; launchId: string; parts: string[]; ready: boolean };
// `via` is an ssh ProxyCommand: when set, ssh reaches the machine by its
// identifier through that command instead of at its address.
export type Machine = { id: string; label: string; address: string | undefined; hourly: number | undefined; market?: "spot" | "on-demand"; via?: string };

// The seam a cloud provider fills: how its machines start, become reachable,
// stop and turn into images. The shared code in cloud.ts owns the order,
// the parallel lanes, the deadline and the cleanup, and ssh.ts owns the
// one transport every provider's machines are driven through.
export interface CloudProvider {
  readonly name: CloudProviderName;
  // The login user the provider's base image accepts the run's key for.
  readonly user: string;
  // An hourly rate, and an image's monthly storage, as this cloud bills them.
  cost(machine: Machine): string;
  storage(snapshot: Snapshot): string;
  baseImage(): Image;
  override(signal?: AbortSignal): Promise<Image | undefined>;
  snapshots(scope: SnapshotScope): Promise<Snapshot[]>;
  // Registers whatever the run's machines share, such as the public key.
  prepare(run: BurstRun): Promise<void>;
  create(run: BurstRun, job: Job): Promise<Machine>;
  // Waits until the machine runs, and returns it with its public address.
  ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine>;
  capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot>;
  remove(machine: Machine): Promise<void>;
  // True when the cloud took this machine back and the run asked for a lane
  // it took back to run once more on a machine it cannot. Asked before the
  // machine is removed.
  relaunchOnDemand?(run: BurstRun, machine: Machine): Promise<boolean>;
  deleteSnapshot(snapshot: Snapshot, signal: AbortSignal): Promise<void>;
  // Removes what prepare registered, once every machine is gone.
  finish(run: BurstRun): Promise<void>;
}
