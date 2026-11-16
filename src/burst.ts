import type { Fetch } from "./burst_e2e_api";
import type { BurstSettings, Environment } from "./burst_settings";
import type { BurstRun, CloudProvider, CloudProviderName, Io, LaneResult, ProviderName } from "./burst_types";
import type { RepoConfig } from "./config";

import { join } from "node:path";

import { AwsSpot } from "./burst_aws";
import { cloudLanes, cloudPrune, cloudSnapshot } from "./burst_cloud";
import { E2eNodes } from "./burst_e2e";
import { hereLanes, hereWarm } from "./burst_here";
import { burstSettings } from "./burst_settings";
import { newKeyPair } from "./burst_ssh";
import { bundleRef, configAt, newRunId, repositoryName, resolveRef, runDirectory } from "./burst_stage";
import { CONFIG_PATH, readConfig } from "./config";
import { OrlyError } from "./model";

export type BurstDependencies = Io & { root: string; env: Environment; fetch: Fetch };
type Request = { snapshot: boolean; prune: boolean; provider: ProviderName | undefined; ref: string | undefined; keep: boolean; useSnapshot: boolean; lanes: string[] };

export const BURST_USAGE = [
  "usage: orly burst <lane>... --provider aws-spot|e2e|here [--ref <ref>] [--keep] [--no-snapshot]",
  "       orly burst snapshot --provider aws-spot|e2e|here [--ref <ref>] [--keep]",
  "       orly burst snapshot --prune --provider aws-spot|e2e",
].join("\n");
const PROVIDERS: readonly ProviderName[] = ["aws-spot", "e2e", "here"];
const USAGE_EXIT = 2;
const LANE_PREFIX = "burst.";
const MINUTE_MS = 60_000;
// Each lane is a paid machine started at once; past this a run is refused
// rather than fanned out.
const MAX_LANES = 8;
const MAX_EXIT = 255;

export class InvalidBurstArguments extends OrlyError {}

// `orly burst`: run declared lanes on a machine rented for the run, or here,
// and capture or prune the warm snapshots those machines start from. The gate
// never calls this; it costs money and runs only when asked.
export async function burst(args: string[], dependencies: BurstDependencies): Promise<number> {
  let request: Request;
  try {
    request = parseArguments(args);
  } catch (error) {
    if (!(error instanceof InvalidBurstArguments)) throw error;
    dependencies.write(`orly burst: ${error.message}`);
    dependencies.write(BURST_USAGE);
    return USAGE_EXIT;
  }
  if (!request.provider || (!request.snapshot && request.lanes.length === 0)) return listLanes(dependencies);
  const settings = burstSettings(dependencies.env);
  if (request.provider === "here") return here(request, dependencies, settings);
  return cloud(request, request.provider, dependencies, settings);
}

function parseArguments(args: string[]): Request {
  const request: Request = { snapshot: false, prune: false, provider: undefined, ref: undefined, keep: false, useSnapshot: true, lanes: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--provider" || argument === "--ref") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) throw new InvalidBurstArguments(`${argument} needs a value`);
      index += 1;
      if (argument === "--ref") request.ref = value;
      else request.provider = PROVIDERS.find((name) => name === value) ?? refuseProvider(value);
    } else if (argument === "--keep") request.keep = true;
    else if (argument === "--no-snapshot") request.useSnapshot = false;
    else if (argument === "--prune") request.prune = true;
    else if (argument.startsWith("-")) throw new InvalidBurstArguments(`unknown flag ${argument}`);
    else if (argument === "snapshot" && index === 0) request.snapshot = true;
    else request.lanes.push(argument);
  }
  return checked(request);
}

function refuseProvider(value: string): never {
  throw new InvalidBurstArguments(`unknown provider ${value} (${PROVIDERS.join(", ")})`);
}

function checked(request: Request): Request {
  const refuse = (reason: string) => { throw new InvalidBurstArguments(reason); };
  if (request.snapshot && request.lanes.length > 0) refuse("snapshot takes no lane");
  if (request.snapshot && !request.useSnapshot) refuse("--no-snapshot applies to lanes");
  if (request.prune && (!request.snapshot || request.ref !== undefined || request.keep)) refuse("--prune belongs to `orly burst snapshot` and takes only --provider");
  if (request.provider === "here" && (request.ref !== undefined || request.keep || !request.useSnapshot || request.prune)) refuse("--provider here runs this checkout; it takes no --ref, --keep, --no-snapshot or --prune");
  if ((request.snapshot || request.lanes.length > 0) && !request.provider) refuse("name a provider with --provider");
  if (new Set(request.lanes).size !== request.lanes.length) refuse("a lane is named twice");
  if (request.lanes.length > MAX_LANES) refuse(`at most ${MAX_LANES} lanes run at once`);
  return request;
}

async function listLanes(dependencies: BurstDependencies): Promise<number> {
  const config = await readConfig(dependencies.root);
  const lanes = config ? declaredLanes(config) : [];
  dependencies.write(lanes.length > 0 ? `orly burst: declared lanes: ${lanes.join(", ")}` : `orly burst: ${CONFIG_PATH} declares no burst.* lane`);
  dependencies.write(BURST_USAGE);
  return USAGE_EXIT;
}

async function here(request: Request, dependencies: BurstDependencies, settings: BurstSettings): Promise<number> {
  const config = await readConfig(dependencies.root);
  if (!config) throw new OrlyError(`no ${CONFIG_PATH} here — run \`orly init\` first`);
  const context = { root: dependencies.root, config, settings, write: dependencies.write, signal: dependencies.signal };
  if (request.snapshot) {
    const status = await hereWarm(context);
    dependencies.write(`orly burst: warm-up provider=here exit=${status}`);
    return status === 0 ? 0 : 1;
  }
  requireDeclared(config, request.lanes);
  const started = Date.now();
  return report(await hereLanes(context, request.lanes), started, dependencies.write);
}

async function cloud(request: Request, name: CloudProviderName, dependencies: BurstDependencies, settings: BurstSettings): Promise<number> {
  const provider: CloudProvider = name === "aws-spot" ? new AwsSpot(settings, dependencies.fetch) : new E2eNodes(settings, dependencies.fetch);
  const run = await stage(request, dependencies, settings);
  if (request.prune) {
    await cloudPrune(provider, run);
    return 0;
  }
  if (request.snapshot) {
    const snapshot = await cloudSnapshot(provider, run);
    if (!snapshot) return 1;
    dependencies.write(`orly burst: snapshot provider=${name} id=${snapshot.id} name=${snapshot.name} state=${snapshot.ready ? "ready" : "pending"} size=${snapshot.sizeGb === undefined ? "unknown" : `${snapshot.sizeGb.toFixed(1)}GB`} storage≈${provider.storage(snapshot)}`);
    // The warm-up succeeded and the image exists; only its saving outlasted
    // the run. Lanes and --prune see it once the cloud marks it ready.
    if (!snapshot.ready) dependencies.write(`orly burst: ${name} is still saving ${snapshot.name}; lanes start from it once it is ready`);
    return 0;
  }
  const started = Date.now();
  return report(await cloudLanes(provider, run, request.lanes, request.useSnapshot), started, dependencies.write);
}

// Everything a cloud run reads before a machine exists. Pruning needs only
// the repository's name, so it stages nothing.
async function stage(request: Request, dependencies: BurstDependencies, settings: BurstSettings): Promise<BurstRun> {
  const { root } = dependencies;
  const repo = await repositoryName(root);
  const io = { write: dependencies.write, signal: dependencies.signal };
  if (request.prune) {
    const config = await readConfig(root) ?? { schema_version: 1, orly_version: "", packs: [], commands: {}, surfaces: undefined, managed: [] };
    return { ...io, root, config, settings, ref: "", repo, runId: "", runDirectory: "", bundle: "", key: "", publicKey: "", knownHosts: "", keep: false };
  }
  const ref = await resolveRef(root, request.ref);
  const config = await configAt(root, ref);
  // Checked before the key pair exists, so a typo leaves no key behind.
  requireDeclared(config, request.lanes);
  const runId = newRunId(ref, new Date());
  const directory = runDirectory(settings.outRoot, runId);
  const bundle = await bundleRef(root, ref, directory);
  const { key, publicKey } = await newKeyPair(directory, `orly-burst-${runId}`, settings.env);
  return { ...io, root, config, settings, ref, repo, runId, runDirectory: directory, bundle, key, publicKey, knownHosts: join(directory, "known_hosts"), keep: request.keep };
}

function requireDeclared(config: RepoConfig, lanes: string[]): void {
  const declared = declaredLanes(config);
  const unknown = lanes.filter((lane) => !declared.includes(lane));
  if (unknown.length > 0) throw new OrlyError(`unknown lane ${unknown.join(", ")}; ${CONFIG_PATH} declares: ${declared.join(", ") || "none"}`);
}

function declaredLanes(config: RepoConfig): string[] {
  return Object.keys(config.commands).filter((name) => name.startsWith(LANE_PREFIX)).map((name) => name.slice(LANE_PREFIX.length)).sort();
}

// One line per lane, in the same shape for every provider, then the total.
// The exit code is the first failing lane's own, so a single remote lane
// reports its real code through `--provider here`.
function report(results: LaneResult[], started: number, write: (line: string) => void): number {
  for (const result of results) {
    write(`orly burst: lane=${result.lane} provider=${result.provider} machine=${result.machine} minutes=${result.minutes} cost≈${result.cost} exit=${result.status} evidence=${result.evidence}`);
  }
  const failed = results.filter((result) => result.status !== 0);
  write(`orly burst: total provider=${results[0]?.provider ?? "none"} lanes=${results.length} passed=${results.length - failed.length} failed=${failed.length} minutes=${Math.ceil((Date.now() - started) / MINUTE_MS)}`);
  const code = failed.map((result) => result.status).find((status) => typeof status === "number");
  return failed.length === 0 ? 0 : typeof code === "number" ? Math.min(Math.max(code, 1), MAX_EXIT) : 1;
}
