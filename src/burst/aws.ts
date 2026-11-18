import type { Captured } from "./process";
import { done, failed, ongoing } from "./progress";
import type { BurstSettings } from "./settings";
import type { BurstRun, CloudProvider, Image, Job, Machine, Snapshot, SnapshotScope } from "./types";

import { z } from "zod";

import { messageOf, OrlyError } from "../model";
import { captureProcess, machineDeadline, pause, until } from "./process";
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
// The root device of Debian's AMIs, and so of every snapshot orly takes of one.
const DEBIAN_ROOT_DEVICE = "/dev/xvda";
// A type with no Spot capacity, or none at this price, falls through to the
// next type in burst.aws.instance_types; any other refusal stops the lane.
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
// An AMI's EBS snapshots bill per GB-month of stored data; the volume size is
// the ceiling of that, which is what the summary prints.
const SNAPSHOT_DOLLARS_PER_GB_MONTH = 0.05;
const imagesSchema = z.array(z.object({
  id: z.string(), name: z.string(),
  devices: z.array(z.object({ Ebs: z.object({ SnapshotId: z.string().optional(), VolumeSize: z.number().optional() }).optional() })).default([]),
}));

// EC2 through the `aws` command-line tool. Each run imports its public key
// and makes a security group open to SSH from the caller's address alone;
// both go when the run's instances have. A lane is a one-time Spot instance
// that terminates when it shuts down, unless ORLY_BURST_MARKET says
// on-demand; a snapshot warm-up is on demand, so it can stop to be imaged.
export class AwsSpot implements CloudProvider {
  readonly name = "aws-spot";
  readonly user: string;
  readonly #settings: BurstSettings;
  #keyImported = false;
  #group: string | undefined;

  constructor(settings: BurstSettings) {
    this.#settings = settings;
    this.user = settings.aws.user;
  }

  cost(machine: Machine): string {
    if (machine.market !== "spot") return "on-demand rate";
    return machine.hourly === undefined ? "spot rate unavailable" : `$${machine.hourly}/h (spot)`;
  }

  storage(snapshot: Snapshot): string {
    return snapshot.sizeGb === undefined ? "unknown" : `$${(snapshot.sizeGb * SNAPSHOT_DOLLARS_PER_GB_MONTH).toFixed(2)}/month at most`;
  }

  // What a snapshot warms from and a lane with no snapshot boots.
  baseImage(): Image {
    const image = this.#settings.aws.image;
    return image ? { id: image, name: image, snapshot: false } : BASE_IMAGE;
  }

  async snapshots(scope: SnapshotScope): Promise<Snapshot[]> {
    return this.#describeImages(["--owners", "self", "--filters", `Name=tag:orly-burst,Values=${scope.repo}`, "Name=state,Values=available"], scope.signal);
  }

  async prepare(run: BurstRun): Promise<void> {
    const name = runName(run);
    const signal = run.signal;
    const tags = (type: string) => `ResourceType=${type},Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.runId}}]`;
    await this.#aws(["ec2", "import-key-pair", "--key-name", name, "--public-key-material", `fileb://${run.key}.pub`, "--tag-specifications", tags("key-pair")], { signal });
    this.#keyImported = true;
    const group = await this.#aws(["ec2", "create-security-group", "--group-name", name, "--description", `orly burst ${run.runId}: SSH from the caller only`,
      "--tag-specifications", tags("security-group"), "--query", "GroupId", "--output", "text"], { signal });
    this.#group = group.stdout.trim();
    await this.#aws(["ec2", "authorize-security-group-ingress", "--group-id", this.#group, "--protocol", "tcp", "--port", "22", "--cidr", `${run.caller}/32`], { signal });
    run.write(done(`${name} admits SSH from ${run.caller} only`));
  }

  async create(run: BurstRun, job: Job): Promise<Machine> {
    const spot = job.kind === "lane" && this.#settings.aws.market !== "on-demand";
    const root = await this.#rootDevice(job.image, run.signal);
    let refusal = "";
    for (const type of this.#settings.aws.types) {
      const launch = await this.#aws(this.#runInstances(run, job, type, spot, root), { allowFailure: true, signal: run.signal });
      if (launch.code === 0) {
        const id = launch.stdout.trim();
        run.write(done(`lane=${job.name} ${id} (${type}${spot ? " spot" : " on-demand"}) started from ${job.image.name}`));
        const hourly = spot ? await this.#spotPrice(type, run.signal) : undefined;
        return { id, label: type, address: undefined, market: spot ? "spot" : "on-demand", ...(hourly === undefined ? {} : { hourly }) };
      }
      if (SPOT_ROLE_MISSING.test(launch.stderr)) throw new OrlyError(`this account has never launched a Spot instance: an administrator runs \`${SPOT_ROLE_COMMAND}\` once (https://github.com/agentsfleet/orly/blob/main/docs/BURST.md)`);
      if (!CAPACITY_ERRORS.test(launch.stderr)) throw new OrlyError(`run-instances refused: ${launch.stderr.trim()}`);
      // AWS's own words say which limit it was: capacity, a Spot quota or an
      // unsupported type are fixed in different places.
      refusal = launch.stderr.trim().replaceAll(/\s+/g, " ");
      run.write(ongoing(`lane=${job.name} no capacity for ${type} (${refusal.match(AWS_ERROR_CODE)?.[1] ?? "unknown"}); trying the next type`));
    }
    throw new OrlyError(`no capacity for any of: ${this.#settings.aws.types.join(" ")}; AWS last said: ${refusal}`);
  }

  // A Spot instance reclaimed while it boots is gone before it answers.
  async ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine> {
    run.write(ongoing(`waiting for ${machine.id} to boot`));
    const address = await until("a running instance with a public address", async () => {
      const described = await this.#poll(["ec2", "describe-instances", "--instance-ids", machine.id, "--query", "Reservations[0].Instances[0].[State.Name,PublicIpAddress]", "--output", "text"], run.signal);
      const [state = "", ip = ""] = described?.stdout.trim().split(/\s+/) ?? [];
      if (GONE_STATES.has(state)) throw new OrlyError(`${machine.id} is ${state} before it was reachable (Spot interruption?)`);
      return state === "running" && IPV4.test(ip) ? ip : undefined;
    }, { deadline: machineDeadline(job), signal: run.signal, pollMs: this.#settings.pollMs });
    return { ...machine, address };
  }

  // Saving an 80 GB image outlasts any single `aws ec2 wait`, so every check
  // is one short describe call, repeated within the run's own deadline. An
  // image still pending at the deadline is left to finish, and said to be; a
  // cancellation fails the capture.
  async capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot> {
    const timing = { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs };
    await this.#aws(["ec2", "stop-instances", "--instance-ids", machine.id], { signal: run.signal });
    await until(`${machine.id} to stop`, async () => (await this.#states([machine.id], run.signal))[0] === "stopped" || undefined, timing);
    const tags = `Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.repo}}]`;
    const created = await this.#aws(["ec2", "create-image", "--instance-id", machine.id, "--name", name, "--description", `orly burst warm image of ${run.repo}`,
      "--tag-specifications", `ResourceType=image,${tags}`, `ResourceType=snapshot,${tags}`, "--query", "ImageId", "--output", "text"], { signal: run.signal });
    const id = created.stdout.trim();
    run.write(ongoing(`capturing ${name} as ${id}`));
    for (;;) {
      const described = await this.#poll(["ec2", "describe-images", "--image-ids", id, "--query", "Images[0].[State,StateReason.Message]", "--output", "text"], run.signal);
      const [state = "", ...reason] = described?.stdout.trim().split("\t") ?? [];
      if (state === "available") {
        const [snapshot] = await this.#describeImages(["--image-ids", id], run.signal);
        if (!snapshot) throw new OrlyError(`image ${id} is not visible after it became available`);
        run.write(done(`saved image ${id}`));
        return snapshot;
      }
      if (FAILED_IMAGE_STATES.has(state)) throw new OrlyError(`image ${id} is ${state}: ${reason.join(" ").trim() || "AWS gave no reason"}`);
      if (Date.now() >= job.deadline) return { id, name, sizeGb: undefined, parts: [], ready: false };
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
    const tagged = await this.#aws(["ec2", "describe-instances", "--filters", `Name=tag:orly-burst,Values=${run.runId}`, `Name=instance-state-name,Values=${LIVE_STATES}`,
      "--query", "Reservations[].Instances[].InstanceId", "--output", "text"], { allowFailure: true });
    const strays = tagged.code === 0 ? tagged.stdout.split(/\s+/).filter((id) => id.startsWith("i-")) : [];
    if (strays.length > 0) {
      await this.#aws(["ec2", "terminate-instances", "--instance-ids", ...strays], { allowFailure: true });
      await this.#awaitTerminated(strays).catch((error: unknown) => run.write(failed(messageOf(error))));
    }
    const cleanups = [...(this.#group ? [["ec2", "delete-security-group", "--group-id", this.#group]] : []), ["ec2", "delete-key-pair", "--key-name", name]];
    for (const cleanup of cleanups) {
      const done = await this.#aws(cleanup, { allowFailure: true });
      if (done.code !== 0) run.write(failed(`could not ${cleanup[1]} for ${name}: ${done.stderr.trim()}; delete it by hand`));
    }
  }

  #runInstances(run: BurstRun, job: Job, type: string, spot: boolean, root: string): string[] {
    return ["ec2", "run-instances", "--image-id", job.image.id, "--instance-type", type, "--key-name", runName(run), "--security-group-ids", this.#group ?? "",
      ...(spot ? ["--instance-market-options", "MarketType=spot,SpotOptions={SpotInstanceType=one-time,InstanceInterruptionBehavior=terminate}"] : []),
      // A lane's machine is gone when it shuts down, on either market; only a
      // warm-up stops, so it can be imaged.
      "--instance-initiated-shutdown-behavior", job.kind === "lane" ? "terminate" : "stop",
      "--metadata-options", "HttpTokens=required",
      "--block-device-mappings", `DeviceName=${root},Ebs={VolumeSize=80,VolumeType=gp3,DeleteOnTermination=true}`,
      "--tag-specifications", `ResourceType=instance,Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.runId}},{Key=Name,Value=orly-burst-${job.name}}]`,
      "--query", "Instances[0].InstanceId", "--output", "text"];
  }


  // The 80 GB disk must be the root one: an AMI names its own root device,
  // which an Ubuntu image puts at /dev/sda1. Debian's parameter, and every
  // snapshot of it, boots from /dev/xvda.
  async #rootDevice(image: Image, signal: AbortSignal): Promise<string> {
    if (!image.id.startsWith("ami-")) return DEBIAN_ROOT_DEVICE;
    const described = await this.#aws(["ec2", "describe-images", "--image-ids", image.id, "--query", "Images[0].RootDeviceName", "--output", "text"], { signal });
    const device = described.stdout.trim();
    if (!device.startsWith("/dev/")) throw new OrlyError(`image ${image.id} names no root device`);
    return device;
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
      return { id: image.id, name: image.name, sizeGb: sizes.length ? sizes.reduce((sum, size) => sum + size, 0) : undefined, parts: volumes.flatMap((volume) => volume.SnapshotId ? [volume.SnapshotId] : []), ready: true };
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
