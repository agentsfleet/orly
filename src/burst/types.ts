import type { RepoConfig } from "../config";
import type { BurstSettings } from "./settings";

// Shared by the command line and the cloud lifecycle.
export const LANE_PREFIX = "burst.";
export const MINUTE_MS = 60_000;
export const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// The fetch a provider calls its cloud with, so tests can answer for it.
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
// Every `--provider` can name; providers.ts maps each name to its class.
export const PROVIDER_NAMES = ["aws-spot", "e2e"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];
// A lane's exit code, or why it has none. Only a number is evidence about the
// lane; `not_run` means the machine or burst.setup failed before it started.
export type Status = number | "unlaunched" | "interrupted" | "deadline" | "cancelled" | "not_run";
export type LaneResult = { lane: string; provider: ProviderName; machine: string; minutes: number; cost: string; status: Status; evidence: string };
export type Io = { write: (line: string) => void; signal: AbortSignal };

// What a cloud run fixes before any machine starts: the repository, the ref
// and its commit, the bundle of that ref, the run's own SSH key pair and
// known_hosts, and the one caller address its SSH rule admits.
export type BurstRun = Io & {
  root: string;
  config: RepoConfig;
  settings: BurstSettings;
  fetch: Fetch;
  ref: string;
  commit: string;
  repo: string;
  runId: string;
  runDirectory: string;
  bundle: string;
  key: string;
  publicKey: string;
  knownHosts: string;
  caller: string;
};

// What listing and pruning a repository's snapshots needs, which is less than a run.
export type SnapshotScope = Pick<BurstRun, "repo" | "settings" | "write" | "signal">;

// One machine's work: a lane, or the warm-up a snapshot captures.
export type Job = { kind: "lane" | "warm"; name: string; image: Image; evidence: string; deadline: number; started: number };
export type Image = { id: string; name: string; snapshot: boolean };
// `ready` is false only for a capture whose image was still saving when the
// run's deadline came; the cloud finishes it, and lanes use it once it is.
export type Snapshot = { id: string; name: string; sizeGb: number | undefined; parts: string[]; ready: boolean };
// `hourly` is the Spot price a lane was rented at, when the cloud said.
export type Machine = { id: string; label: string; address: string | undefined; hourly?: number; market?: "spot" | "on-demand" };

// The seam a cloud provider fills: how its machines start, become reachable,
// stop and turn into images. The shared code in cloud.ts owns the order,
// the parallel lanes, the deadline and the cleanup, and ssh.ts owns the
// one transport every provider's machines are driven through.
export interface CloudProvider {
  readonly name: ProviderName;
  // The login user the provider's base image accepts the run's key for.
  readonly user: string;
  // An hourly rate, and an image's monthly storage, as this cloud bills them.
  cost(machine: Machine): string;
  storage(snapshot: Snapshot): string;
  // What a snapshot warms from and a lane with no matching snapshot boots.
  baseImage(): Image;
  snapshots(scope: SnapshotScope): Promise<Snapshot[]>;
  // Registers what the run's machines share: its public key, and an SSH rule
  // admitting run.caller alone.
  prepare(run: BurstRun): Promise<void>;
  create(run: BurstRun, job: Job): Promise<Machine>;
  // Waits until the machine runs, and returns it with its public address.
  ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine>;
  capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot>;
  remove(machine: Machine): Promise<void>;
  deleteSnapshot(snapshot: Snapshot, signal: AbortSignal): Promise<void>;
  // Removes what prepare registered, and any machine the run may have
  // started without learning its identifier, once every lane has ended.
  finish(run: BurstRun): Promise<void>;
}
