// EC2, in memory, as orly's aws-spot provider uses it. aws-sdk-client-mock
// answers every EC2Client in the process from here while a FakeEc2 is
// installed; restoreEc2 removes it. Each launched instance gets its own
// address, which the fake `ssh` then plays the machine at.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AuthorizeSecurityGroupIngressCommand, CreateImageCommand, CreateSecurityGroupCommand, DeleteKeyPairCommand, DeleteSecurityGroupCommand,
  DeleteSnapshotCommand, DeregisterImageCommand, DescribeImagesCommand, DescribeInstancesCommand, DescribeSpotPriceHistoryCommand, EC2Client,
  ImportKeyPairCommand, RunInstancesCommand, StopInstancesCommand, TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { mockClient } from "aws-sdk-client-mock";

import { burstDependencies, burstEnvironment, burstRepository, callerAddress, fakeBin, REPOSITORY } from "./test_support";

// noCapacity: types with no capacity. refuse: the error every launch answers.
// vanish: an instance is terminated before it answers. lostReply: the
// instance launches but the launch call fails. describeFails: every instance
// read fails with this error. imagePendingPolls and imageFails shape every
// image a capture makes.
export type Ec2Scenario = { noCapacity?: string[]; refuse?: string; vanish?: boolean; lostReply?: boolean; describeFails?: string; imagePendingPolls?: number; imageFails?: string; priceUnavailable?: boolean };
type Instance = { id: string; type: string; state: string; address: string; run: string; spot: boolean; shutdown: string };
type FakeImage = { id: string; name: string; repo: string; snapshots: string[]; size: number; pendingPolls: number; fails?: string };
type Call = { command: string; input: Record<string, unknown>; region: string };
type Tagged = { TagSpecifications?: Array<{ Tags?: Array<{ Key?: string; Value?: string }> }> };

const COMMANDS = {
  AuthorizeSecurityGroupIngressCommand, CreateImageCommand, CreateSecurityGroupCommand, DeleteKeyPairCommand, DeleteSecurityGroupCommand,
  DeleteSnapshotCommand, DeregisterImageCommand, DescribeImagesCommand, DescribeInstancesCommand, DescribeSpotPriceHistoryCommand,
  ImportKeyPairCommand, RunInstancesCommand, StopInstancesCommand, TerminateInstancesCommand,
};
export const GROUP_ID = "sg-0123456789abcdef0";
let installed: ReturnType<typeof mockClient> | undefined;

export class FakeEc2 {
  readonly calls: Call[] = [];
  readonly instances = new Map<string, Instance>();
  images: FakeImage[] = [];
  #nextInstance = 1;

  constructor(readonly scenario: Ec2Scenario = {}) {
    restoreEc2();
    installed = mockClient(EC2Client);
    for (const [name, command] of Object.entries(COMMANDS)) {
      installed.on(command as never).callsFake(async (input: Record<string, unknown>, getClient: () => unknown) => {
        this.calls.push({ command: name.replace(/Command$/, ""), input, region: await (getClient() as EC2Client).config.region() });
        return this.#answer(name.replace(/Command$/, ""), input);
      });
    }
  }

  inputs(command: string): Array<Record<string, unknown>> {
    return this.calls.filter((call) => call.command === command).map((call) => call.input);
  }

  // Images named as orly names them, owned by REPOSITORY, available.
  seed(names: string[]): void {
    this.images = names.map((name, index) => ({ id: imageId(index + 1), name, repo: REPOSITORY, snapshots: [`snap-${index + 1}`], size: 80, pendingPolls: 0 }));
  }

  #answer(command: string, input: Record<string, unknown>): unknown {
    switch (command) {
      case "CreateSecurityGroup": return { GroupId: GROUP_ID };
      case "RunInstances": return this.#launch(input);
      case "DescribeInstances": return this.#describe(input);
      case "TerminateInstances": return this.#set(input, "terminated");
      case "StopInstances": return this.#set(input, "stopped");
      case "DescribeSpotPriceHistory":
        if (this.scenario.priceUnavailable) throw named("UnauthorizedOperation", "not allowed");
        return { SpotPriceHistory: [{ SpotPrice: "0.2345" }] };
      case "CreateImage": return this.#capture(input);
      case "DescribeImages": return this.#describeImages(input);
      case "DeregisterImage":
        this.images = this.images.filter((image) => image.id !== input.ImageId);
        return {};
      default: return {};
    }
  }

  #launch(input: Record<string, unknown>): unknown {
    const type = String(input.InstanceType);
    if (this.scenario.noCapacity?.includes(type)) throw named("InsufficientInstanceCapacity", `no ${type} capacity`);
    if (this.scenario.refuse) throw named(this.scenario.refuse, `${this.scenario.refuse} refused the launch`);
    const number = this.#nextInstance;
    this.#nextInstance += 1;
    const id = `i-${String(number).padStart(17, "0")}`;
    const run = tag(input, "orly-burst");
    this.instances.set(id, { id, type, state: this.scenario.vanish ? "terminated" : "running", address: `198.51.100.${number}`, run, spot: Boolean(input.InstanceMarketOptions), shutdown: String(input.InstanceInitiatedShutdownBehavior) });
    if (this.scenario.lostReply) throw named("RequestTimeout", "the connection closed before the reply");
    return { Instances: [{ InstanceId: id, Placement: { AvailabilityZone: "ap-south-1a" } }] };
  }

  #describe(input: Record<string, unknown>): unknown {
    if (this.scenario.describeFails) throw named(this.scenario.describeFails, "describe refused");
    const filters = (input.Filters ?? []) as Array<{ Name?: string; Values?: string[] }>;
    const run = filters.find((filter) => filter.Name === "tag:orly-burst")?.Values?.[0];
    const found = run
      ? [...this.instances.values()].filter((instance) => instance.run === run && instance.state !== "terminated")
      : ((input.InstanceIds ?? []) as string[]).flatMap((id) => this.instances.get(id) ?? []);
    return { Reservations: [{ Instances: found.map((instance) => ({ InstanceId: instance.id, State: { Name: instance.state }, PublicIpAddress: instance.address })) }] };
  }

  #set(input: Record<string, unknown>, state: string): unknown {
    for (const id of (input.InstanceIds ?? []) as string[]) {
      const instance = this.instances.get(id);
      if (instance) instance.state = state;
    }
    return {};
  }

  #capture(input: Record<string, unknown>): unknown {
    const id = imageId(this.images.length + 1);
    this.images.push({ id, name: String(input.Name), repo: tag(input, "orly-burst"), snapshots: [`snap-${this.images.length + 1}`], size: 80, pendingPolls: this.scenario.imagePendingPolls ?? 0, ...(this.scenario.imageFails ? { fails: this.scenario.imageFails } : {}) });
    return { ImageId: id };
  }

  // By identifier, each read of an image orly made spends one pending poll;
  // an AMI orly did not make is Ubuntu-like, rooted at /dev/sda1.
  #describeImages(input: Record<string, unknown>): unknown {
    const ids = (input.ImageIds ?? []) as string[];
    if (ids.length === 0) {
      const repo = ((input.Filters ?? []) as Array<{ Name?: string; Values?: string[] }>).find((filter) => filter.Name === "tag:orly-burst")?.Values?.[0];
      return { Images: this.images.filter((image) => image.repo === repo && image.pendingPolls === 0 && !image.fails).map(described) };
    }
    return {
      Images: ids.map((id) => {
        const image = this.images.find((candidate) => candidate.id === id);
        if (!image) return { ImageId: id, RootDeviceName: "/dev/sda1", State: "available" };
        if (image.pendingPolls > 0) {
          image.pendingPolls -= 1;
          return { ...described(image), State: "pending" };
        }
        return image.fails ? { ...described(image), State: "failed", StateReason: { Message: image.fails } } : described(image);
      }),
    };
  }
}

export function restoreEc2(): void {
  installed?.restore();
  installed = undefined;
}

export async function awsRun(scenario: Ec2Scenario = {}, burstConfig: Record<string, unknown> = {}, extra: Record<string, string> = {}) {
  const root = burstRepository(burstConfig);
  const { bin, state } = fakeBin();
  const ec2 = new FakeEc2(scenario);
  return { root, state, ec2, ...burstDependencies(root, burstEnvironment(bin, state, extra), callerAddress) };
}

export function machineScript(state: string, address: string): string {
  return readFileSync(join(state, address, "job.sh"), "utf8");
}

function described(image: FakeImage) {
  return {
    ImageId: image.id, Name: image.name, State: "available", RootDeviceName: "/dev/xvda",
    BlockDeviceMappings: image.snapshots.map((snapshot) => ({ Ebs: { SnapshotId: snapshot, VolumeSize: image.size } })),
  };
}

function imageId(number: number): string {
  return `ami-${String(number).padStart(17, "0")}`;
}

function tag(input: Tagged, key: string): string {
  return input.TagSpecifications?.flatMap((spec) => spec.Tags ?? []).find((entry) => entry.Key === key)?.Value ?? "";
}

function named(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}
