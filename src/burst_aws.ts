import type { Fetch } from "./burst_e2e_api";
import type { BurstSettings } from "./burst_settings";
import type { BurstRun, CloudProvider, Image, Job, Machine, Snapshot } from "./burst_types";

import { z } from "zod";

import { captureProcess, until } from "./burst_process";
import { OrlyError } from "./model";

const AWS_TIMEOUT_MS = 10 * 60_000;
const BASE_IMAGE = Object.freeze({ id: "resolve:ssm:/aws/service/debian/release/13/latest/amd64", name: "Debian 13 amd64", snapshot: false });
// The caller's public address as AWS sees it, over HTTPS; it answers on a
// GitHub-hosted runner as it does on a workstation.
const CALLER_ADDRESS_URL = "https://checkip.amazonaws.com";
const CALLER_TIMEOUT_MS = 15_000;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
// A type with no Spot capacity, or none at this price, falls through to the
// next type in ORLY_BURST_INSTANCE_TYPES; any other refusal stops the lane.
const CAPACITY_ERRORS = /InsufficientInstanceCapacity|SpotMaxPriceTooLow|MaxSpotInstanceCountExceeded|Unsupported/;
const GONE_STATES = new Set(["shutting-down", "terminated", "stopping", "stopped"]);
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
  readonly #launched: string[] = [];
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
    return this.#describeImages(["--owners", "self", "--filters", `Name=tag:orly-burst,Values=${run.repo}`, "Name=state,Values=available"]);
  }

  async prepare(run: BurstRun): Promise<void> {
    const name = runName(run);
    const tags = (type: string) => `ResourceType=${type},Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.runId}}]`;
    await this.#aws(["ec2", "import-key-pair", "--key-name", name, "--public-key-material", `fileb://${run.key}.pub`, "--tag-specifications", tags("key-pair")]);
    this.#keyImported = true;
    const subnet = this.#settings.aws.subnet;
    const vpc = subnet ? (await this.#aws(["ec2", "describe-subnets", "--subnet-ids", subnet, "--query", "Subnets[0].VpcId", "--output", "text"])).stdout.trim() : undefined;
    const group = await this.#aws(["ec2", "create-security-group", "--group-name", name, "--description", `orly burst ${run.runId}: SSH from the caller only`,
      ...(vpc ? ["--vpc-id", vpc] : []), "--tag-specifications", tags("security-group"), "--query", "GroupId", "--output", "text"]);
    this.#group = group.stdout.trim();
    const caller = await this.#callerAddress();
    await this.#aws(["ec2", "authorize-security-group-ingress", "--group-id", this.#group, "--protocol", "tcp", "--port", "22", "--cidr", `${caller}/32`]);
    run.write(`orly burst: ${name} admits SSH from ${caller} only`);
  }

  async create(run: BurstRun, job: Job): Promise<Machine> {
    const spot = job.kind === "lane" && !run.keep;
    for (const type of this.#settings.aws.types) {
      const launch = await this.#aws(this.#runInstances(run, job, type, spot), { allowFailure: true });
      if (launch.code === 0) {
        const id = launch.stdout.trim();
        this.#launched.push(id);
        run.write(`orly burst: lane=${job.name} ${id} (${type}${spot ? " spot" : " on-demand"}) started from ${job.image.name}`);
        return { id, label: type, address: undefined, hourly: spot ? await this.#spotPrice(type) : undefined };
      }
      if (!CAPACITY_ERRORS.test(launch.stderr)) throw new OrlyError(`run-instances refused: ${launch.stderr.trim()}`);
      run.write(`orly burst: lane=${job.name} no capacity for ${type}; trying the next type`);
    }
    throw new OrlyError(`no capacity for any of: ${this.#settings.aws.types.join(" ")}`);
  }

  // A Spot instance reclaimed while it boots is gone before it answers.
  async ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine> {
    const address = await until("a running instance with a public address", async () => {
      const described = await this.#aws(["ec2", "describe-instances", "--instance-ids", machine.id, "--query", "Reservations[0].Instances[0].[State.Name,PublicIpAddress]", "--output", "text"], { allowFailure: true });
      const [state = "", ip = ""] = described.stdout.trim().split(/\s+/);
      if (GONE_STATES.has(state)) throw new OrlyError(`${machine.id} is ${state} before it was reachable (Spot interruption?)`);
      return state === "running" && IPV4.test(ip) ? ip : undefined;
    }, { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs });
    return { ...machine, address };
  }

  async capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot> {
    await this.#aws(["ec2", "stop-instances", "--instance-ids", machine.id]);
    await this.#waitFor(["instance-stopped", "--instance-ids", machine.id], job, run);
    const tags = `Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${run.repo}}]`;
    const created = await this.#aws(["ec2", "create-image", "--instance-id", machine.id, "--name", name, "--description", `orly burst warm image of ${run.repo}`,
      "--tag-specifications", `ResourceType=image,${tags}`, `ResourceType=snapshot,${tags}`, "--query", "ImageId", "--output", "text"]);
    const id = created.stdout.trim();
    run.write(`orly burst: capturing ${name} as ${id}`);
    await this.#waitFor(["image-available", "--image-ids", id], job, run);
    const [snapshot] = await this.#describeImages(["--image-ids", id]);
    if (!snapshot) throw new OrlyError(`image ${id} is not visible after it became available`);
    return snapshot;
  }

  async remove(_run: BurstRun, machine: Machine): Promise<void> {
    await this.#aws(["ec2", "terminate-instances", "--instance-ids", machine.id]);
  }

  async deleteSnapshot(_run: BurstRun, snapshot: Snapshot): Promise<void> {
    await this.#aws(["ec2", "deregister-image", "--image-id", snapshot.id]);
    for (const part of snapshot.parts) await this.#aws(["ec2", "delete-snapshot", "--snapshot-id", part]);
  }

  // A security group cannot be deleted while an instance still uses it, so
  // this waits for the run's instances to finish terminating first.
  async finish(run: BurstRun): Promise<void> {
    const name = runName(run);
    const cleanups = [
      ...(this.#group ? [["ec2", "delete-security-group", "--group-id", this.#group]] : []),
      ...(this.#keyImported ? [["ec2", "delete-key-pair", "--key-name", name]] : []),
    ];
    if (cleanups.length === 0) return;
    if (run.keep) {
      run.write(`orly burst: --keep left key pair ${name} and security group ${this.#group ?? "none"}; delete them with the instances`);
      return;
    }
    if (this.#launched.length > 0) await this.#aws(["ec2", "wait", "instance-terminated", "--instance-ids", ...this.#launched], { allowFailure: true });
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

  async #spotPrice(type: string): Promise<number | undefined> {
    const price = await this.#aws(["ec2", "describe-spot-price-history", "--instance-types", type, "--product-descriptions", "Linux/UNIX", "--max-items", "1",
      "--query", "SpotPriceHistory[0].SpotPrice", "--output", "text"], { allowFailure: true });
    const value = Number(price.stdout.trim());
    return price.code === 0 && Number.isFinite(value) && value > 0 ? value : undefined;
  }

  // An `aws ec2 wait` gives up after its own fixed attempts; this repeats it
  // until the job's deadline, which is the bound that matters here.
  async #waitFor(waiter: string[], job: Job, run: BurstRun): Promise<void> {
    await until(waiter.join(" "), async () => (await this.#aws(["ec2", "wait", ...waiter], { allowFailure: true })).code === 0 || undefined,
      { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs });
  }

  async #describeImages(selection: string[]): Promise<Snapshot[]> {
    const listed = await this.#aws(["ec2", "describe-images", ...selection, "--query", "Images[].{id:ImageId,name:Name,devices:BlockDeviceMappings}", "--output", "json"]);
    return imagesSchema.parse(JSON.parse(listed.stdout || "[]")).map((image) => {
      const volumes = image.devices.flatMap((device) => device.Ebs ? [device.Ebs] : []);
      const sizes = volumes.flatMap((volume) => volume.VolumeSize === undefined ? [] : [volume.VolumeSize]);
      return { id: image.id, name: image.name, launchId: image.id, sizeGb: sizes.length ? sizes.reduce((sum, size) => sum + size, 0) : undefined, parts: volumes.flatMap((volume) => volume.SnapshotId ? [volume.SnapshotId] : []) };
    });
  }

  async #aws(args: string[], options: { allowFailure?: boolean } = {}) {
    const result = await captureProcess(["aws", "--region", this.#settings.aws.region, ...args], { env: { ...this.#settings.env, AWS_PAGER: "" }, timeoutMs: AWS_TIMEOUT_MS });
    if (result.code !== 0 && !options.allowFailure) throw new OrlyError(`aws ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`);
    return result;
  }
}

function runName(run: BurstRun): string {
  return `orly-burst-${run.runId}`;
}
