// A stand-in for the `aws` command-line tool, for the aws-spot tests. It keeps
// instances, images, key pairs and security groups under FAKE_AWS_STATE and
// records every call. Each launched instance gets its own address, which the
// fake `ssh` then plays the machine at.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Instance = { id: string; type: string; state: string; address: string };
type Image = { id: string; name: string; repo: string; snapshots: string[]; size: number };
type Scenario = { noCapacity?: string[]; refuse?: string; vanish?: boolean };

const state = process.env.FAKE_AWS_STATE ?? "";
const args = Bun.argv.slice(2);
const rest = args[0] === "--region" ? args.slice(2) : args;
appendFileSync(join(state, "calls.jsonl"), `${JSON.stringify(["aws", ...rest])}\n`);
const scenario: Scenario = existsSync(join(state, "scenario.json")) ? JSON.parse(readFileSync(join(state, "scenario.json"), "utf8")) : {};
process.exit(dispatch(rest));

function dispatch(command: string[]): number {
  const [service, verb] = command;
  if (service !== "ec2") return unsupported(command);
  if (verb === "import-key-pair" || verb === "delete-key-pair" || verb === "authorize-security-group-ingress" || verb === "delete-security-group" || verb === "wait" || verb === "delete-snapshot") return 0;
  if (verb === "describe-subnets") return print("vpc-0123456789abcdef0");
  if (verb === "create-security-group") return print("sg-0123456789abcdef0");
  if (verb === "run-instances") return launch(command);
  if (verb === "describe-instances") return describe(option(command, "--instance-ids"));
  if (verb === "terminate-instances") return setState(option(command, "--instance-ids"), "terminated");
  if (verb === "stop-instances") return setState(option(command, "--instance-ids"), "stopped");
  if (verb === "describe-spot-price-history") return print("0.2345");
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
  const instance: Instance = { id, type, state: scenario.vanish ? "terminated" : "running", address: `198.51.100.${number}` };
  writeFileSync(join(state, `${id}.json`), JSON.stringify(instance));
  return print(id);
}

function describe(id: string): number {
  const found = instance(id);
  return print(found ? `${found.state}\t${found.address}` : "None\tNone");
}

function createImage(command: string[]): number {
  const repo = option(command, "--tag-specifications").match(/Key=orly-burst,Value=([^}]+)\}/)?.[1] ?? "";
  const id = `ami-${String(images().length + 1).padStart(17, "0")}`;
  saveImages([...images(), { id, name: option(command, "--name"), repo, snapshots: [`snap-${id.slice(4)}`], size: 80 }]);
  return print(id);
}

function describeImages(command: string[]): number {
  const wanted = option(command, "--image-ids");
  const repo = command.find((argument) => argument.startsWith("Name=tag:orly-burst,Values="))?.split("=").pop();
  const listed = images().filter((image) => wanted ? image.id === wanted : image.repo === repo);
  return print(JSON.stringify(listed.map((image) => ({ id: image.id, name: image.name, devices: image.snapshots.map((snapshot) => ({ Ebs: { SnapshotId: snapshot, VolumeSize: image.size } })) }))));
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
