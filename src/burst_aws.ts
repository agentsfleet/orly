import type { Fetch } from "./burst_e2e_api";
import type { Captured } from "./burst_process";
import type { BurstSettings } from "./burst_settings";
import type { BurstRun, CloudProvider, Image, Job, Machine, Snapshot } from "./burst_types";

import { z } from "zod";

import { captureProcess, pause, until } from "./burst_process";
import { OrlyError } from "./model";

type Call = { allowFailure?: boolean; signal?: AbortSignal };

// Bounds one `aws` call. Nothing orly runs waits inside the call: every wait
// is a loop of short describe calls, so this bound never cuts a wait short.
const AWS_TIMEOUT_MS = 10 * 60_000;
const CLEANUP_WAIT_MS = 15 * 60_000;
// Image states that will never become available; `pending` and `transient`
// are progress.
const FAILED_IMAGE_STATES = new Set(["failed", "error", "invalid", "deregistered", "disabled"]);
const BASE_IMAGE = Object.freeze({ id: "resolve:ssm:/aws/service/debian/release/13/latest/amd64", name: "Debian 13 amd64", snapshot: false });
// The caller's public address as AWS sees it, over HTTPS; it answers on a
// GitHub-hosted runner as it does on a workstation.
const CALLER_ADDRESS_URL = "https://checkip.amazonaws.com";
const CALLER_TIMEOUT_MS = 15_000;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
// A type with no Spot capacity, or none at this price, falls through to the
// next type in ORLY_BURST_INSTANCE_TYPES; any other refusal stops the lane.
const CAPACITY_ERRORS = /InsufficientInstanceCapacity|SpotMaxPriceTooLow|MaxSpotInstanceCountExceeded|Unsupported/;
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
// An AMI's EBS snapshots bill per GB-month of stored data; the volume size is
// the ceiling of that, which is what the summary prints.
const SNAPSHOT_DOLLARS_PER_GB_MONTH = 0.05;
const imagesSchema = z.array(z.object({
  id: z.string(), name: z.string(),
  devices: z.array(z.object({ Ebs: z.object({ SnapshotId: z.string().optional(), VolumeSize: z.number().optional() }).optional() })).default([]),
}));

// EC2 through the `aws` command-line tool. Each run imports its public key
// and opens a security group to SSH from the caller's address alone; both go
// when the run's instances have. A lane is a one-time Spot instance that
// terminates when it shuts down; a snapshot warm-up, or any run with --keep,
// is on-demand so the instance can stop instead.
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

  cost(machine: Machine | undefined): string {
    if (!machine) return "none";
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

  async snapshots(run: BurstRun): Promise<Snapshot[]> {
    return this.#describeImages(["--owners", "self", "--filters", `Name=tag:orly-burst,Values=${run.repo}`, "Name=state,Values=available"], run.signal);
  }

  async prepare(run: BurstRun): Promise<void> {
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
    const caller = await this.#callerAddress();
    await this.#aws(["ec2", "authorize-security-group-ingress", "--group-id", this.#group, "--protocol", "tcp", "--port", "22", "--cidr", `${caller}/32`], { signal });
    run.write(`orly burst: ${name} admits SSH from ${caller} only`);
  }

  async create(run: BurstRun, job: Job): Promise<Machine> {
    const spot = job.kind === "lane" && !run.keep;
    for (const type of this.#settings.aws.types) {
      const launch = await this.#aws(this.#runInstances(run, job, type, spot), { allowFailure: true, signal: run.signal });
      if (launch.code === 0) {
        const id = launch.stdout.trim();
        run.write(`orly burst: lane=${job.name} ${id} (${type}${spot ? " spot" : " on-demand"}) started from ${job.image.name}`);
        return { id, label: type, address: undefined, hourly: spot ? await this.#spotPrice(type, run.signal) : undefined };
      }
      if (SPOT_ROLE_MISSING.test(launch.stderr)) throw new OrlyError(`this account has never launched a Spot instance: an administrator runs \`${SPOT_ROLE_COMMAND}\` once (docs/BURST.md)`);
      if (!CAPACITY_ERRORS.test(launch.stderr)) throw new OrlyError(`run-instances refused: ${launch.stderr.trim()}`);
      run.write(`orly burst: lane=${job.name} no capacity for ${type}; trying the next type`);
    }
    throw new OrlyError(`no capacity for any of: ${this.#settings.aws.types.join(" ")}`);
  }

  // A Spot instance reclaimed while it boots is gone before it answers.
  async ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine> {
    const address = await until("a running instance with a public address", async () => {
      const described = await this.#poll(["ec2", "describe-instances", "--instance-ids", machine.id, "--query", "Reservations[0].Instances[0].[State.Name,PublicIpAddress]", "--output", "text"], run.signal);
      const [state = "", ip = ""] = described?.stdout.trim().split(/\s+/) ?? [];
      if (GONE_STATES.has(state)) throw new OrlyError(`${machine.id} is ${state} before it was reachable (Spot interruption?)`);
      return state === "running" && IPV4.test(ip) ? ip : undefined;
    }, { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs });
    return { ...machine, address };
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
  async remove(_run: BurstRun, machine: Machine): Promise<void> {
    await this.#aws(["ec2", "terminate-instances", "--instance-ids", machine.id]);
  }

  async deleteSnapshot(run: BurstRun, snapshot: Snapshot): Promise<void> {
    await this.#aws(["ec2", "deregister-image", "--image-id", snapshot.id], { signal: run.signal });
    for (const part of snapshot.parts) await this.#aws(["ec2", "delete-snapshot", "--snapshot-id", part], { signal: run.signal });
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
      await this.#awaitTerminated(strays).catch((error: unknown) => run.write(`orly burst: ${error instanceof Error ? error.message : String(error)}`));
    }
    const cleanups = [...(this.#group ? [["ec2", "delete-security-group", "--group-id", this.#group]] : []), ["ec2", "delete-key-pair", "--key-name", name]];
    for (const cleanup of cleanups) {
      const done = await this.#aws(cleanup, { allowFailure: true });
      if (done.code !== 0) run.write(`orly burst: could not ${cleanup[1]} for ${name}: ${done.stderr.trim()}; delete it by hand`);
    }
  }

  #runInstances(run: BurstRun, job: Job, type: string, spot: boolean): string[] {
    const subnet = this.#settings.aws.subnet;
    const network = subnet
      ? ["--network-interfaces", `DeviceIndex=0,SubnetId=${subnet},Groups=${this.#group ?? ""},AssociatePublicIpAddress=true`]
      : ["--security-group-ids", this.#group ?? ""];
    return ["ec2", "run-instances", "--image-id", job.image.id, "--instance-type", type, "--key-name", runName(run), ...network,
      ...(spot ? ["--instance-market-options", "MarketType=spot,SpotOptions={SpotInstanceType=one-time,InstanceInterruptionBehavior=terminate}"] : []),
      "--instance-initiated-shutdown-behavior", spot ? "terminate" : "stop",
      "--metadata-options", "HttpTokens=required",
      "--block-device-mappings", "DeviceName=/dev/xvda,Ebs={VolumeSize=80,VolumeType=gp3,DeleteOnTermination=true}",
      "--tag-specifications", `ResourceType=instance,Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.runId}},{Key=Name,Value=orly-burst-${job.name}}]`,
      "--query", "Instances[0].InstanceId", "--output", "text"];
  }

  async #callerAddress(): Promise<string> {
    const response = await this.#fetch(CALLER_ADDRESS_URL, { signal: AbortSignal.timeout(CALLER_TIMEOUT_MS) });
    const address = (await response.text()).trim();
    if (!response.ok || !IPV4.test(address)) throw new OrlyError(`could not learn this machine's public IPv4 address from ${CALLER_ADDRESS_URL}`);
    return address;
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
