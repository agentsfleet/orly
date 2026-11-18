// A stand-in for the `aws` command-line tool, for the aws-spot tests. It keeps
// instances, images, key pairs and security groups under FAKE_AWS_STATE and
// records every call. Each launched instance gets its own address, which the
// fake `ssh` then plays the machine at.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Instance = { id: string; type: string; state: string; address: string; run: string; spot: boolean };
// pendingPolls: how many more state reads answer `pending`; fails: the reason
// the image ends `failed` instead of `available`.
type Image = { id: string; name: string; repo: string; snapshots: string[]; size: number; pendingPolls?: number; fails?: string };
// lostReply: the instance launches but the caller never hears its identifier.
// describeFails: every describe-instances call fails with this error.
// imagePendingPolls and imageFails shape every image create-image makes.
type Scenario = { noCapacity?: string[]; refuse?: string; vanish?: boolean; lostReply?: boolean; describeFails?: string; imagePendingPolls?: number; imageFails?: string; priceUnavailable?: boolean };

const state = process.env.FAKE_AWS_STATE ?? "";
const args = Bun.argv.slice(2);
const rest = args[0] === "--region" ? args.slice(2) : args;
// The region is recorded last, so a call's verb stays at index 2.
appendFileSync(join(state, "calls.jsonl"), `${JSON.stringify(["aws", ...rest, ...(rest === args ? [] : ["--region", args[1] ?? ""])])}\n`);
const scenario: Scenario = existsSync(join(state, "scenario.json")) ? JSON.parse(readFileSync(join(state, "scenario.json"), "utf8")) : {};
process.exit(dispatch(rest));

function dispatch(command: string[]): number {
  const [service, verb] = command;
  if (service !== "ec2") return unsupported(command);
  if (verb === "import-key-pair" || verb === "delete-key-pair" || verb === "authorize-security-group-ingress" || verb === "delete-security-group" || verb === "wait" || verb === "delete-snapshot") return 0;
  if (verb === "create-security-group") return print("sg-0123456789abcdef0");
  if (verb === "run-instances") return launch(command);
  if (verb === "describe-instances") return describe(command);
  if (verb === "terminate-instances") {
    for (const id of command.slice(command.indexOf("--instance-ids") + 1).filter((argument) => argument.startsWith("i-"))) setState(id, "terminated");
    return 0;
  }
  if (verb === "stop-instances") return setState(option(command, "--instance-ids"), "stopped");
  if (verb === "describe-spot-price-history") return scenario.priceUnavailable ? 254 : print("0.2345");
  if (verb === "create-image") return createImage(command);
  if (verb === "describe-images") return describeImages(command);
  if (verb === "deregister-image") return saveImages(images().filter((image) => image.id !== option(command, "--image-id")));
  return unsupported(command);
}

function launch(command: string[]): number {
  const type = option(command, "--instance-type");
  if (scenario.noCapacity?.includes(type)) {
    process.stderr.write("An error occurred (InsufficientInstanceCapacity) when calling the RunInstances operation\n");
    return 254;
  }
  if (scenario.refuse) {
    process.stderr.write(`${scenario.refuse}\n`);
    return 254;
  }
  // Lanes launch at once; mkdir is atomic, so no two instances share a number.
  let number = 1;
  while (!claim(`instance-${number}`)) number += 1;
  const id = `i-${String(number).padStart(17, "0")}`;
  const run = option(command, "--tag-specifications").match(/Key=orly-burst,Value=([^}]+)\}/)?.[1] ?? "";
  const instance: Instance = { id, type, state: scenario.vanish ? "terminated" : "running", address: `198.51.100.${number}`, run, spot: command.includes("--instance-market-options") };
  writeFileSync(join(state, `${id}.json`), JSON.stringify(instance));
  if (scenario.lostReply) {
    process.stderr.write("Connection was closed before we received a valid response from endpoint URL\n");
    return 255;
  }
  return print(id);
}

// By identifier, the state and address; by run tag, the run's live instances.
function describe(command: string[]): number {
  if (scenario.describeFails) {
    process.stderr.write(`An error occurred (${scenario.describeFails}) when calling the DescribeInstances operation\n`);
    return 254;
  }
  const run = command.find((argument) => argument.startsWith("Name=tag:orly-burst,Values="))?.split("=").pop();
  if (run) {
    const live = [...new Bun.Glob("i-*.json").scanSync(state)].map((file) => instance(file.replace(".json", ""))).filter((found) => found?.run === run && found.state !== "terminated");
    return print(live.map((found) => found?.id).join("\t"));
  }
  const ids = command.slice(command.indexOf("--instance-ids") + 1).filter((argument) => argument.startsWith("i-"));
  if (option(command, "--query").includes("PublicIpAddress")) {
    const found = instance(ids[0] ?? "");
    return print(found ? `${found.state}\t${found.address}` : "None\tNone");
  }
  return print(ids.map((id) => instance(id)?.state ?? "unknown").join("\t"));
}

function createImage(command: string[]): number {
  const repo = option(command, "--tag-specifications").match(/Key=orly-burst,Value=([^}]+)\}/)?.[1] ?? "";
  const id = `ami-${String(images().length + 1).padStart(17, "0")}`;
  const image: Image = { id, name: option(command, "--name"), repo, snapshots: [`snap-${id.slice(4)}`], size: 80, pendingPolls: scenario.imagePendingPolls ?? 0, ...(scenario.imageFails ? { fails: scenario.imageFails } : {}) };
  saveImages([...images(), image]);
  return print(id);
}

// orly's own images are Debian's, rooted at /dev/xvda; any other AMI here is
// rooted at /dev/sda1, as Ubuntu's are.
function describeImages(command: string[]): number {
  const wanted = option(command, "--image-ids");
  if (option(command, "--query").includes("RootDeviceName")) return print(images().some((image) => image.id === wanted) ? "/dev/xvda" : "/dev/sda1");
  if (option(command, "--query").includes("State")) return imageState(wanted);
  const repo = command.find((argument) => argument.startsWith("Name=tag:orly-burst,Values="))?.split("=").pop();
  const listed = images().filter((image) => wanted ? image.id === wanted : image.repo === repo);
  return print(JSON.stringify(listed.map((image) => ({ id: image.id, name: image.name, devices: image.snapshots.map((snapshot) => ({ Ebs: { SnapshotId: snapshot, VolumeSize: image.size } })) }))));
}

// Each state read spends one pending poll, so a slow image turns available
// after the number of reads the scenario set.
function imageState(id: string): number {
  const list = images();
  const image = list.find((candidate) => candidate.id === id);
  if (!image) return print("None\tNone");
  if ((image.pendingPolls ?? 0) > 0) {
    image.pendingPolls = (image.pendingPolls ?? 0) - 1;
    saveImages(list);
    return print("pending\tNone");
  }
  return print(image.fails ? `failed\t${image.fails}` : "available\tNone");
}

function claim(name: string): boolean {
  try {
    mkdirSync(join(state, name));
    return true;
  } catch {
    return false;
  }
}

function setState(id: string, next: string): number {
  const found = instance(id);
  if (found) writeFileSync(join(state, `${id}.json`), JSON.stringify({ ...found, state: next }));
  return 0;
}

function instance(id: string): Instance | undefined {
  const file = join(state, `${id}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

function images(): Image[] {
  return existsSync(join(state, "images.json")) ? JSON.parse(readFileSync(join(state, "images.json"), "utf8")) : [];
}

function saveImages(list: Image[]): number {
  writeFileSync(join(state, "images.json"), JSON.stringify(list));
  return 0;
}

function option(command: string[], name: string): string {
  const index = command.indexOf(name);
  return index < 0 ? "" : command[index + 1] ?? "";
}

function print(text: string): number {
  process.stdout.write(`${text}\n`);
  return 0;
}

function unsupported(command: string[]): number {
  process.stderr.write(`fake aws: unsupported ${command.join(" ")}\n`);
  return 2;
}
