import type { BurstSettings } from "./settings";
import type { BurstRun, CloudProvider, Image, Job, Machine, Snapshot, SnapshotScope } from "./types";

import {
  AuthorizeSecurityGroupIngressCommand, CreateImageCommand, CreateSecurityGroupCommand, DeleteKeyPairCommand, DeleteSecurityGroupCommand,
  DeleteSnapshotCommand, DeregisterImageCommand, DescribeImagesCommand, DescribeInstancesCommand, DescribeSpotPriceHistoryCommand, EC2Client,
  ImportKeyPairCommand, RunInstancesCommand, StopInstancesCommand, TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import type { DescribeImagesCommandInput, ResourceType } from "@aws-sdk/client-ec2";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";

import { messageOf, OrlyError } from "../model";
import { done, failed, ongoing } from "./progress";
import { machineDeadline, pause, until } from "./process";
import { IPV4 } from "./types";

// The SDK retries throttling, 5xx answers and dropped connections with
// backoff; a call that still fails after this many attempts fails.
const MAX_ATTEMPTS = 10;
const REQUEST_TIMEOUT_MS = 60_000;
const CLEANUP_WAIT_MS = 15 * 60_000;
const DISK_GB = 80;
const BASE_IMAGE = Object.freeze({ id: "resolve:ssm:/aws/service/debian/release/13/latest/amd64", name: "Debian 13 amd64", snapshot: false });
// The root device of Debian's AMIs, and so of every snapshot orly takes of one.
const DEBIAN_ROOT_DEVICE = "/dev/xvda";
// A type with no Spot capacity, or none at this price, falls through to the
// next type in burst.aws.instance_types; any other refusal stops the lane.
const CAPACITY_ERRORS = new Set(["InsufficientInstanceCapacity", "SpotMaxPriceTooLow", "MaxSpotInstanceCountExceeded", "Unsupported"]);
// An account's first Spot launch needs the Spot service-linked role, which
// the launcher may not create: that is an administrator's one-time step.
const SPOT_ROLE_MISSING = /ServiceLinkedRoleCreationNotPermitted/;
const SPOT_ROLE_COMMAND = "aws iam create-service-linked-role --aws-service-name spot.amazonaws.com";
const LIVE_STATES = ["pending", "running", "shutting-down", "stopping", "stopped"];
const GONE_STATES = new Set(["shutting-down", "terminated", "stopping", "stopped"]);
// EC2 is eventually consistent: for a few seconds after a launch or a
// capture, the new identifier reads as not found. A wait reads that as not yet.
const NOT_YET_VISIBLE = new Set(["InvalidInstanceID.NotFound", "InvalidAMIID.NotFound"]);
// Image states that will never become available; `pending` is progress.
const FAILED_IMAGE_STATES = new Set(["failed", "error", "invalid", "deregistered", "disabled"]);
// An AMI's EBS snapshots bill per GB-month of stored data; the volume size is
// the ceiling of that, which the summary prints.
const SNAPSHOT_DOLLARS_PER_GB_MONTH = 0.05;

// EC2 through the AWS SDK. Each run imports its public key and makes a
// security group open to SSH from the caller's address alone; both go when
// the run's instances have. A lane is a one-time Spot instance that
// terminates when it shuts down, unless ORLY_BURST_MARKET says on-demand; a
// snapshot warm-up is on demand, so it can stop to be imaged. The SDK retries
// throttling and transient failures inside each call, so an error that
// reaches a wait is real and ends it. The SDK's own waiters are not used:
// they retry every error, expired credentials too, until they time out.
export class AwsSpot implements CloudProvider {
  readonly name = "aws-spot";
  readonly user: string;
  readonly #settings: BurstSettings;
  readonly #ec2: EC2Client;
  #keyImported = false;
  #group: string | undefined;

  constructor(settings: BurstSettings) {
    this.#settings = settings;
    this.user = settings.aws.user;
    // Requests go through Bun's own fetch, not node:http.
    this.#ec2 = new EC2Client({ region: settings.aws.region, maxAttempts: MAX_ATTEMPTS, requestHandler: new FetchHttpHandler({ requestTimeout: REQUEST_TIMEOUT_MS }) });
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
    return this.#images({ Owners: ["self"], Filters: [{ Name: "tag:orly-burst", Values: [scope.repo] }, { Name: "state", Values: ["available"] }] }, scope.signal);
  }

  async prepare(run: BurstRun): Promise<void> {
    const name = runName(run);
    await this.#ec2.send(new ImportKeyPairCommand({ KeyName: name, PublicKeyMaterial: new TextEncoder().encode(run.publicKey), TagSpecifications: tagged("key-pair", run.runId) }), { abortSignal: run.signal });
    this.#keyImported = true;
    const group = await this.#ec2.send(new CreateSecurityGroupCommand({ GroupName: name, Description: `orly burst ${run.runId}: SSH from the caller only`, TagSpecifications: tagged("security-group", run.runId) }), { abortSignal: run.signal });
    this.#group = group.GroupId;
    await this.#ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: this.#group, IpPermissions: [{ IpProtocol: "tcp", FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: `${run.caller}/32` }] }],
    }), { abortSignal: run.signal });
    run.write(done(`${name} admits SSH from ${run.caller} only`));
  }

  async create(run: BurstRun, job: Job): Promise<Machine> {
    const spot = job.kind === "lane" && this.#settings.aws.market !== "on-demand";
    const root = await this.#rootDevice(job.image, run.signal);
    let refusal = "";
    for (const type of this.#settings.aws.types) {
      try {
        const launched = await this.#ec2.send(this.#runInstances(run, job, type, spot, root), { abortSignal: run.signal });
        const instance = launched.Instances?.[0];
        const id = instance?.InstanceId;
        if (!id) throw new OrlyError("run-instances answered no instance");
        run.write(done(`lane=${job.name} ${id} (${type}${spot ? " spot" : " on-demand"}) started from ${job.image.name}`));
        const hourly = spot ? await this.#spotPrice(type, instance.Placement?.AvailabilityZone, run.signal) : undefined;
        return { id, label: type, address: undefined, market: spot ? "spot" : "on-demand", ...(hourly === undefined ? {} : { hourly }) };
      } catch (error) {
        const code = error instanceof Error ? error.name : "";
        if (SPOT_ROLE_MISSING.test(code)) throw new OrlyError(`this account has never launched a Spot instance: an administrator runs \`${SPOT_ROLE_COMMAND}\` once (https://github.com/agentsfleet/orly/blob/main/docs/BURST.md)`);
        if (!CAPACITY_ERRORS.has(code)) throw new OrlyError(`run-instances refused: ${code ? `${code}: ` : ""}${messageOf(error)}`);
        refusal = `${code}: ${messageOf(error)}`;
        run.write(ongoing(`lane=${job.name} no capacity for ${type} (${code}); trying the next type`));
      }
    }
    throw new OrlyError(`no capacity for any of: ${this.#settings.aws.types.join(" ")}; AWS last said: ${refusal}`);
  }

  // A Spot instance reclaimed while it boots is gone before it answers.
  async ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine> {
    run.write(ongoing(`waiting for ${machine.id} to boot`));
    const address = await until("a running instance with a public address", async () => {
      const instance = await this.#instance(machine.id, run.signal).catch(notYet);
      if (!instance) return undefined;
      const state = instance.State?.Name ?? "";
      if (GONE_STATES.has(state)) throw new OrlyError(`${machine.id} is ${state} before it was reachable (Spot interruption?)`);
      return state === "running" && IPV4.test(instance.PublicIpAddress ?? "") ? instance.PublicIpAddress : undefined;
    }, { deadline: machineDeadline(job), signal: run.signal, pollMs: this.#settings.pollMs });
    return { ...machine, address };
  }

  // An image still saving at the deadline is left to finish, and said to be;
  // a cancellation fails the capture.
  async capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot> {
    const timing = { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs };
    await this.#ec2.send(new StopInstancesCommand({ InstanceIds: [machine.id] }), { abortSignal: run.signal });
    await until(`${machine.id} to stop`, async () => (await this.#instance(machine.id, run.signal)).State?.Name === "stopped" || undefined, timing);
    const created = await this.#ec2.send(new CreateImageCommand({
      InstanceId: machine.id, Name: name, Description: `orly burst warm image of ${run.repo}`,
      TagSpecifications: [...tagged("image", run.repo), ...tagged("snapshot", run.repo)],
    }), { abortSignal: run.signal });
    const id = created.ImageId ?? "";
    run.write(ongoing(`capturing ${name} as ${id}`));
    for (;;) {
      const image = (await this.#ec2.send(new DescribeImagesCommand({ ImageIds: [id] }), { abortSignal: run.signal }).catch(notYet))?.Images?.[0];
      if (image?.State === "available") {
        const [snapshot] = await this.#images({ ImageIds: [id] }, run.signal);
        if (!snapshot) throw new OrlyError(`image ${id} is not visible after it became available`);
        run.write(done(`saved image ${id}`));
        return snapshot;
      }
      if (FAILED_IMAGE_STATES.has(image?.State ?? "")) throw new OrlyError(`image ${id} is ${image?.State}: ${image?.StateReason?.Message ?? "AWS gave no reason"}`);
      if (Date.now() >= job.deadline) return { id, name, sizeGb: undefined, parts: [], ready: false };
      await pause(this.#settings.pollMs, run.signal);
      if (run.signal.aborted) throw new OrlyError(`cancelled while saving image ${id}; AWS may still finish it`);
    }
  }

  // Cleanup takes no cancellation signal: it is what a cancellation runs.
  async remove(machine: Machine): Promise<void> {
    await this.#ec2.send(new TerminateInstancesCommand({ InstanceIds: [machine.id] }));
  }

  async deleteSnapshot(snapshot: Snapshot, signal: AbortSignal): Promise<void> {
    await this.#ec2.send(new DeregisterImageCommand({ ImageId: snapshot.id }), { abortSignal: signal });
    for (const part of snapshot.parts) await this.#ec2.send(new DeleteSnapshotCommand({ SnapshotId: part }), { abortSignal: signal });
  }

  // Every instance tagged with the run is terminated here, including one
  // whose launch reply was lost before its identifier came back. A security
  // group cannot be deleted while an instance uses it, so this waits for them.
  async finish(run: BurstRun): Promise<void> {
    if (!this.#keyImported) return;
    const name = runName(run);
    try {
      const tagged = await this.#ec2.send(new DescribeInstancesCommand({ Filters: [{ Name: "tag:orly-burst", Values: [run.runId] }, { Name: "instance-state-name", Values: LIVE_STATES }] }));
      const strays = (tagged.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []).flatMap((instance) => instance.InstanceId ? [instance.InstanceId] : []);
      if (strays.length > 0) {
        const never = new AbortController().signal;
        await this.#ec2.send(new TerminateInstancesCommand({ InstanceIds: strays }));
        await until(`${strays.join(" ")} to terminate`, async () => {
          const described = await this.#ec2.send(new DescribeInstancesCommand({ InstanceIds: strays }));
          const states = (described.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []).map((instance) => instance.State?.Name);
          return states.length === strays.length && states.every((state) => state === "terminated") || undefined;
        }, { deadline: Date.now() + CLEANUP_WAIT_MS, signal: never, pollMs: this.#settings.pollMs });
      }
    } catch (error) {
      run.write(failed(`could not terminate the run's instances: ${messageOf(error)}; delete them by hand`));
    }
    if (this.#group) {
      await this.#ec2.send(new DeleteSecurityGroupCommand({ GroupId: this.#group }))
        .catch((error: unknown) => run.write(failed(`could not delete security group ${this.#group}: ${messageOf(error)}; delete it by hand`)));
    }
    await this.#ec2.send(new DeleteKeyPairCommand({ KeyName: name }))
      .catch((error: unknown) => run.write(failed(`could not delete key pair ${name}: ${messageOf(error)}; delete it by hand`)));
  }

  #runInstances(run: BurstRun, job: Job, type: string, spot: boolean, root: string): RunInstancesCommand {
    return new RunInstancesCommand({
      ImageId: job.image.id, InstanceType: type as never, MinCount: 1, MaxCount: 1, KeyName: runName(run), SecurityGroupIds: this.#group ? [this.#group] : [],
      ...(spot ? { InstanceMarketOptions: { MarketType: "spot", SpotOptions: { SpotInstanceType: "one-time", InstanceInterruptionBehavior: "terminate" } } } : {}),
      // A lane's machine is gone when it shuts down, on either market; only a
      // warm-up stops, so it can be imaged.
      InstanceInitiatedShutdownBehavior: job.kind === "lane" ? "terminate" : "stop",
      MetadataOptions: { HttpTokens: "required" },
      BlockDeviceMappings: [{ DeviceName: root, Ebs: { VolumeSize: DISK_GB, VolumeType: "gp3", DeleteOnTermination: true } }],
      TagSpecifications: [{ ResourceType: "instance", Tags: [{ Key: "owner", Value: "agent" }, { Key: "orly-burst", Value: run.runId }, { Key: "Name", Value: `orly-burst-${job.name}` }] }],
      // The SDK retries a launch whose reply was lost; the token makes the
      // retry return the first launch instead of starting a second machine.
      ClientToken: new Bun.CryptoHasher("sha256").update(`${run.runId}/${job.name}/${type}`).digest("hex"),
    });
  }

  // The 80 GB disk must be the root one: an AMI names its own root device,
  // which an Ubuntu image puts at /dev/sda1. Debian's parameter, and every
  // snapshot of it, boots from /dev/xvda.
  async #rootDevice(image: Image, signal: AbortSignal): Promise<string> {
    if (!image.id.startsWith("ami-")) return DEBIAN_ROOT_DEVICE;
    const device = (await this.#ec2.send(new DescribeImagesCommand({ ImageIds: [image.id] }), { abortSignal: signal })).Images?.[0]?.RootDeviceName;
    if (!device) throw new OrlyError(`image ${image.id} names no root device`);
    return device;
  }

  // The current Spot price in the zone the instance landed in, when AWS says.
  async #spotPrice(type: string, zone: string | undefined, signal: AbortSignal): Promise<number | undefined> {
    const history = await this.#ec2.send(new DescribeSpotPriceHistoryCommand({
      InstanceTypes: [type as never], ProductDescriptions: ["Linux/UNIX"], StartTime: new Date(), ...(zone ? { AvailabilityZone: zone } : {}),
    }), { abortSignal: signal }).catch(() => undefined);
    const value = Number(history?.SpotPriceHistory?.[0]?.SpotPrice);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  async #instance(id: string, signal: AbortSignal) {
    const described = await this.#ec2.send(new DescribeInstancesCommand({ InstanceIds: [id] }), { abortSignal: signal });
    return described.Reservations?.[0]?.Instances?.[0] ?? {};
  }

  async #images(input: DescribeImagesCommandInput, signal: AbortSignal): Promise<Snapshot[]> {
    const listed = await this.#ec2.send(new DescribeImagesCommand(input), { abortSignal: signal });
    return (listed.Images ?? []).map((image) => {
      const volumes = (image.BlockDeviceMappings ?? []).flatMap((device) => device.Ebs ? [device.Ebs] : []);
      const sizes = volumes.flatMap((volume) => volume.VolumeSize === undefined ? [] : [volume.VolumeSize]);
      return { id: image.ImageId ?? "", name: image.Name ?? "", sizeGb: sizes.length ? sizes.reduce((sum, size) => sum + size, 0) : undefined, parts: volumes.flatMap((volume) => volume.SnapshotId ? [volume.SnapshotId] : []), ready: true };
    });
  }
}

function notYet(error: unknown): undefined {
  if (error instanceof Error && NOT_YET_VISIBLE.has(error.name)) return undefined;
  throw error;
}

function runName(run: BurstRun): string {
  return `orly-burst-${run.runId}`;
}

function tagged(type: ResourceType, value: string) {
  return [{ ResourceType: type, Tags: [{ Key: "owner", Value: "agent" }, { Key: "orly-burst", Value: value }] }];
}
