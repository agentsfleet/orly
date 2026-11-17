import type { Captured } from "./process";
import type { BurstSettings } from "./settings";
import type { BurstRun, CloudProvider, Fetch, Image, Job, Machine, Snapshot, SnapshotScope } from "./types";

import { z } from "zod";

import { messageOf, OrlyError } from "../model";
import { captureProcess, pause, until } from "./process";
import { required } from "./settings";
import { callerAddress } from "./ssh";
import { IPV4 } from "./types";

type Call = { allowFailure?: boolean; signal?: AbortSignal };

// Bounds one `aws` call. Nothing orly runs waits inside the call: every wait
// is a loop of short describe calls, so this bound never cuts a wait short.
const AWS_TIMEOUT_MS = 10 * 60_000;
const CLEANUP_WAIT_MS = 15 * 60_000;
// Image states that will never become available; `pending` and `transient`
// are progress.
const FAILED_IMAGE_STATES = new Set(["failed", "error", "invalid", "deregistered", "disabled"]);
const BASE_IMAGE = Object.freeze({ id: "resolve:ssm:/aws/service/debian/release/13/latest/amd64", name: "Debian 13 amd64", snapshot: false });
// A type with no Spot capacity, or none at this price, falls through to the
// next type in ORLY_BURST_INSTANCE_TYPES; any other refusal stops the lane.
const CAPACITY_ERRORS = /InsufficientInstanceCapacity|SpotMaxPriceTooLow|MaxSpotInstanceCountExceeded|Unsupported/;
// "An error occurred (InsufficientInstanceCapacity) when calling …"
const AWS_ERROR_CODE = /\(([A-Za-z.]+)\)/;
// An account's first Spot launch needs the Spot service-linked role, which
// the launcher may not create: that is an administrator's one-time step.
const SPOT_ROLE_MISSING = /ServiceLinkedRoleCreationNotPermitted/;
const SPOT_ROLE_COMMAND = "aws iam create-service-linked-role --aws-service-name spot.amazonaws.com";
// Failures a poll waits out: throttling, a service hiccup, and an instance or
// image not yet visible right after it was created. Anything else, such as
// expired credentials, stops the wait at once.
const TRANSIENT_ERRORS = /RequestLimitExceeded|Throttling|ServiceUnavailable|InternalError|InvalidInstanceID\.NotFound|InvalidAMIID\.NotFound|Could not connect to the endpoint URL|Read timeout/;
const GONE_STATES = new Set(["shutting-down", "terminated", "stopping", "stopped"]);
const LIVE_STATES = "pending,running,shutting-down,stopping,stopped";
// What describe-instances reports for an instance AWS took back for Spot capacity.
const SPOT_RECLAIMED = "Server.SpotInstanceTermination";
const PLUGIN_TIMEOUT_MS = 30_000;
const SSM_PLUGIN = "session-manager-plugin";
// An AMI's EBS snapshots bill per GB-month of stored data; the volume size is
// the ceiling of that, which is what the summary prints.
const SNAPSHOT_DOLLARS_PER_GB_MONTH = 0.05;
const imagesSchema = z.array(z.object({
  id: z.string(), name: z.string(),
  devices: z.array(z.object({ Ebs: z.object({ SnapshotId: z.string().optional(), VolumeSize: z.number().optional() }).optional() })).default([]),
}));

// EC2 through the `aws` command-line tool. Each run imports its public key
// and makes a security group: open to SSH from the caller's address alone, or
// with no inbound rule when Systems Manager carries the SSH session. Both go
// when the run's instances have. A lane is a one-time Spot instance that
// terminates when it shuts down unless ORLY_BURST_MARKET says on-demand; a
// snapshot warm-up, or any run with --keep, is on-demand so it can stop.
export class AwsSpot implements CloudProvider {
  readonly name = "aws-spot";
  readonly user: string;
  readonly #settings: BurstSettings;
  readonly #fetch: Fetch;
  #keyImported = false;
  #group: string | undefined;

  constructor(settings: BurstSettings, fetcher: Fetch) {
    this.#settings = settings;
    this.#fetch = fetcher;
    this.user = settings.aws.user;
  }

  cost(machine: Machine): string {
    return machine.hourly === undefined ? "on-demand rate" : `$${machine.hourly}/h (spot)`;
  }

  storage(snapshot: Snapshot): string {
    return snapshot.sizeGb === undefined ? "unknown" : `$${(snapshot.sizeGb * SNAPSHOT_DOLLARS_PER_GB_MONTH).toFixed(2)}/month at most`;
  }

  baseImage(): Image {
    return BASE_IMAGE;
  }

  async override(): Promise<Image | undefined> {
    const image = this.#settings.aws.image;
    return image ? { id: image, name: image, snapshot: image.startsWith("ami-") } : undefined;
  }

  async snapshots(scope: SnapshotScope): Promise<Snapshot[]> {
    return this.#describeImages(["--owners", "self", "--filters", `Name=tag:orly-burst,Values=${scope.repo}`, "Name=state,Values=available"], scope.signal);
  }

  async prepare(run: BurstRun): Promise<void> {
    if (this.#settings.aws.access === "ssm") await this.#requireSsm(run);
    const name = runName(run);
    const signal = run.signal;
    const tags = (type: string) => `ResourceType=${type},Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.runId}}]`;
    await this.#aws(["ec2", "import-key-pair", "--key-name", name, "--public-key-material", `fileb://${run.key}.pub`, "--tag-specifications", tags("key-pair")], { signal });
    this.#keyImported = true;
    const subnet = this.#settings.aws.subnet;
    const vpc = subnet ? (await this.#aws(["ec2", "describe-subnets", "--subnet-ids", subnet, "--query", "Subnets[0].VpcId", "--output", "text"], { signal })).stdout.trim() : undefined;
    const group = await this.#aws(["ec2", "create-security-group", "--group-name", name, "--description", `orly burst ${run.runId}: SSH from the caller only`,
      ...(vpc ? ["--vpc-id", vpc] : []), "--tag-specifications", tags("security-group"), "--query", "GroupId", "--output", "text"], { signal });
    this.#group = group.stdout.trim();
    if (this.#settings.aws.access === "ssm") {
      run.write(`orly burst: ${name} admits no inbound connection; SSH goes through Systems Manager`);
      return;
    }
    const caller = await callerAddress(this.#fetch);
    await this.#aws(["ec2", "authorize-security-group-ingress", "--group-id", this.#group, "--protocol", "tcp", "--port", "22", "--cidr", `${caller}/32`], { signal });
    run.write(`orly burst: ${name} admits SSH from ${caller} only`);
  }

  async create(run: BurstRun, job: Job): Promise<Machine> {
    const spot = job.kind === "lane" && !run.keep && !job.onDemand && this.#settings.aws.market !== "on-demand";
    let refusal = "";
    for (const type of this.#settings.aws.types) {
      const launch = await this.#aws(this.#runInstances(run, job, type, spot), { allowFailure: true, signal: run.signal });
      if (launch.code === 0) {
        const id = launch.stdout.trim();
        run.write(`orly burst: lane=${job.name} ${id} (${type}${spot ? " spot" : " on-demand"}) started from ${job.image.name}`);
        return { id, label: type, address: undefined, hourly: spot ? await this.#spotPrice(type, run.signal) : undefined };
      }
      if (SPOT_ROLE_MISSING.test(launch.stderr)) throw new OrlyError(`this account has never launched a Spot instance: an administrator runs \`${SPOT_ROLE_COMMAND}\` once (docs/BURST.md)`);
      if (!CAPACITY_ERRORS.test(launch.stderr)) throw new OrlyError(`run-instances refused: ${launch.stderr.trim()}`);
      // AWS's own words say which limit it was: capacity, a Spot quota or an
      // unsupported type are fixed in different places.
      refusal = launch.stderr.trim().replaceAll(/\s+/g, " ");
      run.write(`orly burst: lane=${job.name} no capacity for ${type} (${refusal.match(AWS_ERROR_CODE)?.[1] ?? "unknown"}); trying the next type`);
    }
    throw new OrlyError(`no capacity for any of: ${this.#settings.aws.types.join(" ")}; AWS last said: ${refusal}`);
  }

  // A Spot instance reclaimed while it boots is gone before it answers.
  async ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine> {
    const address = await until("a running instance with a public address", async () => {
      const described = await this.#poll(["ec2", "describe-instances", "--instance-ids", machine.id, "--query", "Reservations[0].Instances[0].[State.Name,PublicIpAddress]", "--output", "text"], run.signal);
      const [state = "", ip = ""] = described?.stdout.trim().split(/\s+/) ?? [];
      if (GONE_STATES.has(state)) throw new OrlyError(`${machine.id} is ${state} before it was reachable (Spot interruption?)`);
      return state === "running" && IPV4.test(ip) ? ip : undefined;
    }, { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs });
    return { ...machine, address, ...(this.#settings.aws.access === "ssm" ? { via: this.#ssmProxy() } : {}) };
  }

  // Only a Spot machine's state reason can say AWS took it back; anything
  // else that ended a lane, such as a dropped session, is not run again.
  async relaunchOnDemand(run: BurstRun, machine: Machine): Promise<boolean> {
    if (this.#settings.aws.market !== "spot-then-on-demand" || machine.hourly === undefined) return false;
    const described = await this.#poll(["ec2", "describe-instances", "--instance-ids", machine.id, "--query", "Reservations[0].Instances[0].StateReason.Code", "--output", "text"], run.signal);
    return described?.stdout.trim() === SPOT_RECLAIMED;
  }

  // Saving an 80 GB image outlasts any single `aws ec2 wait`, so every check
  // is one short describe call, repeated within the run's own deadline. An
  // image still pending at the deadline is left to finish, and said to be.
  async capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot> {
    const timing = { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs };
    await this.#aws(["ec2", "stop-instances", "--instance-ids", machine.id], { signal: run.signal });
    await until(`${machine.id} to stop`, async () => (await this.#states([machine.id], run.signal))[0] === "stopped" || undefined, timing);
    const tags = `Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.repo}}]`;
    const created = await this.#aws(["ec2", "create-image", "--instance-id", machine.id, "--name", name, "--description", `orly burst warm image of ${run.repo}`,
      "--tag-specifications", `ResourceType=image,${tags}`, `ResourceType=snapshot,${tags}`, "--query", "ImageId", "--output", "text"], { signal: run.signal });
    const id = created.stdout.trim();
    run.write(`orly burst: capturing ${name} as ${id}`);
    for (;;) {
      const described = await this.#poll(["ec2", "describe-images", "--image-ids", id, "--query", "Images[0].[State,StateReason.Message]", "--output", "text"], run.signal);
      const [state = "", ...reason] = described?.stdout.trim().split("\t") ?? [];
      if (state === "available") {
        const [snapshot] = await this.#describeImages(["--image-ids", id], run.signal);
        if (!snapshot) throw new OrlyError(`image ${id} is not visible after it became available`);
        return snapshot;
      }
      if (FAILED_IMAGE_STATES.has(state)) throw new OrlyError(`image ${id} is ${state}: ${reason.join(" ").trim() || "AWS gave no reason"}`);
      if (run.signal.aborted || Date.now() >= job.deadline) return { id, name, sizeGb: undefined, launchId: id, parts: [], ready: false };
      await pause(this.#settings.pollMs, run.signal);
    }
  }

  // Cleanup takes no cancellation signal: it is what a cancellation runs.
  async remove(machine: Machine): Promise<void> {
    await this.#aws(["ec2", "terminate-instances", "--instance-ids", machine.id]);
  }

  async deleteSnapshot(snapshot: Snapshot, signal: AbortSignal): Promise<void> {
    await this.#aws(["ec2", "deregister-image", "--image-id", snapshot.id], { signal });
    for (const part of snapshot.parts) await this.#aws(["ec2", "delete-snapshot", "--snapshot-id", part], { signal });
  }

  // Every instance tagged with the run is terminated here, including one
  // whose launch was interrupted before its identifier came back. A security
  // group cannot be deleted while an instance uses it, so this waits for them.
  async finish(run: BurstRun): Promise<void> {
    if (!this.#keyImported) return;
    const name = runName(run);
    if (run.keep) {
      run.write(`orly burst: --keep left key pair ${name} and security group ${this.#group ?? "none"}; delete them with the instances`);
      return;
    }
    const tagged = await this.#aws(["ec2", "describe-instances", "--filters", `Name=tag:orly-burst,Values=${run.runId}`, `Name=instance-state-name,Values=${LIVE_STATES}`,
      "--query", "Reservations[].Instances[].InstanceId", "--output", "text"], { allowFailure: true });
    const strays = tagged.code === 0 ? tagged.stdout.split(/\s+/).filter((id) => id.startsWith("i-")) : [];
    if (strays.length > 0) {
      await this.#aws(["ec2", "terminate-instances", "--instance-ids", ...strays], { allowFailure: true });
      await this.#awaitTerminated(strays).catch((error: unknown) => run.write(`orly burst: ${messageOf(error)}`));
    }
    const cleanups = [...(this.#group ? [["ec2", "delete-security-group", "--group-id", this.#group]] : []), ["ec2", "delete-key-pair", "--key-name", name]];
    for (const cleanup of cleanups) {
      const done = await this.#aws(cleanup, { allowFailure: true });
      if (done.code !== 0) run.write(`orly burst: could not ${cleanup[1]} for ${name}: ${done.stderr.trim()}; delete it by hand`);
    }
  }

  #runInstances(run: BurstRun, job: Job, type: string, spot: boolean): string[] {
    const subnet = this.#settings.aws.subnet;
    const ssm = this.#settings.aws.access === "ssm"
      ? ["--iam-instance-profile", `Name=${required(this.#settings.aws.instanceProfile, "ORLY_BURST_AWS_INSTANCE_PROFILE")}`, "--user-data", ssmAgentScript(this.#settings.aws.region)]
      : [];
    const network = subnet
      ? ["--network-interfaces", `DeviceIndex=0,SubnetId=${subnet},Groups=${this.#group ?? ""},AssociatePublicIpAddress=true`]
      : ["--security-group-ids", this.#group ?? ""];
    return ["ec2", "run-instances", "--image-id", job.image.id, "--instance-type", type, "--key-name", runName(run), ...network,
      ...(spot ? ["--instance-market-options", "MarketType=spot,SpotOptions={SpotInstanceType=one-time,InstanceInterruptionBehavior=terminate}"] : []),
      // A lane's machine is gone when it shuts down, on either market; only a
      // warm-up, or a run with --keep, stops so it can be imaged or reused.
      "--instance-initiated-shutdown-behavior", job.kind === "lane" && !run.keep ? "terminate" : "stop",
      "--metadata-options", "HttpTokens=required", ...ssm,
      "--block-device-mappings", "DeviceName=/dev/xvda,Ebs={VolumeSize=80,VolumeType=gp3,DeleteOnTermination=true}",
      "--tag-specifications", `ResourceType=instance,Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.runId}},{Key=Name,Value=orly-burst-${job.name}}]`,
      "--query", "Instances[0].InstanceId", "--output", "text"];
  }


  // The caller needs the plugin that turns `aws ssm start-session` into a byte
  // stream, and the instance profile the machine's agent signs in with.
  async #requireSsm(run: BurstRun): Promise<void> {
    required(this.#settings.aws.instanceProfile, "ORLY_BURST_AWS_INSTANCE_PROFILE");
    const plugin = await captureProcess([SSM_PLUGIN, "--version"], { env: this.#settings.env, timeoutMs: PLUGIN_TIMEOUT_MS, signal: run.signal }).catch(() => undefined);
    if (plugin?.code !== 0) throw new OrlyError(`ORLY_BURST_AWS_ACCESS=ssm needs AWS's ${SSM_PLUGIN} on this machine (docs/BURST.md)`);
  }

  // ssh hands the instance identifier as %h and the port as %p; the profile
  // and credentials come from the environment ssh inherits.
  #ssmProxy(): string {
    return `aws --region ${this.#settings.aws.region} ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p`;
  }

  async #spotPrice(type: string, signal: AbortSignal): Promise<number | undefined> {
    const price = await this.#aws(["ec2", "describe-spot-price-history", "--instance-types", type, "--product-descriptions", "Linux/UNIX", "--max-items", "1",
      "--query", "SpotPriceHistory[0].SpotPrice", "--output", "text"], { allowFailure: true, signal });
    const value = Number(price.stdout.trim());
    return price.code === 0 && Number.isFinite(value) && value > 0 ? value : undefined;
  }

  // The state of each instance, in the order AWS lists them; a transient
  // failure reads as no answer yet.
  async #states(ids: string[], signal: AbortSignal): Promise<string[]> {
    const described = await this.#poll(["ec2", "describe-instances", "--instance-ids", ...ids, "--query", "Reservations[].Instances[].State.Name", "--output", "text"], signal);
    return described?.stdout.trim().split(/\s+/).filter(Boolean) ?? [];
  }

  // Cleanup's own bound, apart from the run's deadline, which may have passed.
  async #awaitTerminated(ids: string[]): Promise<void> {
    const never = new AbortController().signal;
    await until(`${ids.join(" ")} to terminate`, async () => {
      const states = await this.#states(ids, never);
      return states.length === ids.length && states.every((state) => state === "terminated") || undefined;
    }, { deadline: Date.now() + CLEANUP_WAIT_MS, signal: never, pollMs: this.#settings.pollMs });
  }

  // One attempt of a poll: the answer, nothing for a transient failure worth
  // another attempt, and an error for any other failure.
  async #poll(args: string[], signal: AbortSignal): Promise<Captured | undefined> {
    const result = await this.#aws(args, { allowFailure: true, signal });
    if (result.code === 0) return result;
    if (TRANSIENT_ERRORS.test(result.stderr) || signal.aborted) return undefined;
    throw new OrlyError(`aws ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`);
  }

  async #describeImages(selection: string[], signal: AbortSignal): Promise<Snapshot[]> {
    const listed = await this.#aws(["ec2", "describe-images", ...selection, "--query", "Images[].{id:ImageId,name:Name,devices:BlockDeviceMappings}", "--output", "json"], { signal });
    return imagesSchema.parse(JSON.parse(listed.stdout || "[]")).map((image) => {
      const volumes = image.devices.flatMap((device) => device.Ebs ? [device.Ebs] : []);
      const sizes = volumes.flatMap((volume) => volume.VolumeSize === undefined ? [] : [volume.VolumeSize]);
      return { id: image.id, name: image.name, launchId: image.id, sizeGb: sizes.length ? sizes.reduce((sum, size) => sum + size, 0) : undefined, parts: volumes.flatMap((volume) => volume.SnapshotId ? [volume.SnapshotId] : []), ready: true };
    });
  }

  async #aws(args: string[], call: Call = {}): Promise<Captured> {
    const result = await captureProcess(["aws", "--region", this.#settings.aws.region, ...args], {
      env: { ...this.#settings.env, AWS_PAGER: "" }, timeoutMs: AWS_TIMEOUT_MS, ...(call.signal ? { signal: call.signal } : {}),
    });
    if (result.code !== 0 && !call.allowFailure) throw new OrlyError(`aws ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`);
    return result;
  }
}

function runName(run: BurstRun): string {
  return `orly-burst-${run.runId}`;
}

// Systems Manager reaches a machine through its agent, which Debian's image
// does not carry: the first boot installs it from AWS's regional bucket. A
// machine from a snapshot that already runs the agent skips the download.
function ssmAgentScript(region: string): string {
  return ["#!/bin/sh", "set -eu",
    "systemctl is-active --quiet amazon-ssm-agent && exit 0",
    `curl -fsSL -o /tmp/amazon-ssm-agent.deb https://s3.${region}.amazonaws.com/amazon-ssm-${region}/latest/debian_amd64/amazon-ssm-agent.deb`,
    "dpkg -i /tmp/amazon-ssm-agent.deb",
    "systemctl enable --now amazon-ssm-agent", ""].join("\n");
}
