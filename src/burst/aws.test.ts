import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./index";
import { awsRun, GROUP_ID, machineScript, restoreEc2 } from "./aws-test-support";
import { recordedCalls, REPOSITORY, SECRET_VALUE, snapshotOf } from "./test_support";
import { cleanupTemporaryDirectories } from "../gates_test_support";

const BASE_IMAGE = "resolve:ssm:/aws/service/debian/release/13/latest/amd64";
const LANES = ["acceptance", "integration", "--provider", "aws-spot"];
const RUN_NAME = /^orly-burst-feat-burst-fixture-\d{14}-[0-9a-f]{4}$/;
const SECRETS = { secrets: { API_TOKEN: "op://Burst Vault/api/credential" } };

setDefaultTimeout(60_000);
afterEach(() => {
  restoreEc2();
  cleanupTemporaryDirectories();
});

describe("aws-spot lanes", () => {
  test("a run imports its key, opens no inbound port, launches lanes at once and removes it all", async () => {
    const run = await awsRun({ noCapacity: ["c7i.4xlarge"] });

    expect(await burst(LANES, run.dependencies)).toBe(0);

    const commands = run.ec2.calls.map((call) => call.command);
    expect(commands.slice(0, 3)).toEqual(["DescribeImages", "ImportKeyPair", "CreateSecurityGroup"]);
    expect(commands).not.toContain("AuthorizeSecurityGroupIngress");
    expect(String(run.ec2.inputs("ImportKeyPair")[0]?.KeyName)).toMatch(RUN_NAME);
    const launches = run.ec2.inputs("RunInstances");
    expect(launches.map((launch) => launch.InstanceType).sort()).toEqual(["c7a.4xlarge", "c7a.4xlarge", "c7i.4xlarge", "c7i.4xlarge"]);
    expect(commands.lastIndexOf("RunInstances")).toBeLessThan(commands.indexOf("TerminateInstances"));
    const launch = launches.find((input) => input.InstanceType === "c7a.4xlarge") ?? {};
    expect(launch).toMatchObject({
      ImageId: BASE_IMAGE, SecurityGroupIds: [GROUP_ID], InstanceInitiatedShutdownBehavior: "terminate", MetadataOptions: { HttpTokens: "required" },
      InstanceMarketOptions: { MarketType: "spot", SpotOptions: { SpotInstanceType: "one-time", InstanceInterruptionBehavior: "terminate" } },
      BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeSize: 80, VolumeType: "gp3", DeleteOnTermination: true } }],
    });
    expect(String(launch.KeyName)).toMatch(RUN_NAME);
    expect(String(launch.ClientToken)).toMatch(/^[0-9a-f]{64}$/);
    expect(run.ec2.inputs("TerminateInstances")).toHaveLength(2);
    expect(commands.slice(-3)).toEqual(["DescribeInstances", "DeleteSecurityGroup", "DeleteKeyPair"]);
    const ssh = recordedCalls(run.state).filter((call) => call[0] === "ssh");
    expect(ssh.every((call) => call.includes("admin@100.64.0.1") || call.includes("admin@100.64.0.2"))).toBe(true);
    expect(ssh.some((call) => call.at(-1)?.startsWith("sudo -n bash -c "))).toBe(true);
    const text = run.output.text();
    expect(text).toContain("no capacity for c7i.4xlarge (InsufficientInstanceCapacity); trying the next type");
    expect(text).toContain("opens no inbound port; the run's instances are reached over the tailnet");
    expect(text).toMatch(/orly burst: lane=acceptance provider=aws-spot machine=c7a\.4xlarge minutes=\d+ cost≈\$0\.2345\/h \(spot\) exit=0 evidence=\S+/);
    expect(text).toContain("orly burst: total provider=aws-spot lanes=2 passed=2 failed=0");
  });

  test("secrets go only through the session's input, and the results come home", async () => {
    const run = await awsRun({}, SECRETS);

    await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);

    expect(machineScript(run.state, "100.64.0.1")).toContain(`  export API_TOKEN='${SECRET_VALUE}'`);
    expect(JSON.stringify(run.ec2.calls)).not.toContain(SECRET_VALUE);
    expect(run.output.text()).not.toContain(SECRET_VALUE);
    const evidence = run.output.text().match(/evidence=(\S+)/)?.[1] ?? "";
    expect(readFileSync(join(evidence, "report/summary.txt"), "utf8")).toBe("lane acceptance results\n");
    expect(readFileSync(join(evidence, "run.log"), "utf8")).toBe("== packages\nlane acceptance ran\n");
  });

  test("a lane's exit code is the run's, and a dropped session is resumed", async () => {
    const run = await awsRun();
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ exits: { acceptance: 4 }, drops: { integration: 1 } }));

    expect(await burst(LANES, run.dependencies)).toBe(4);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=4 /);
    expect(run.output.text()).toMatch(/lane=integration .* exit=0 /);
  });

  test("an instance gone before it answers is interrupted, and still terminated", async () => {
    const run = await awsRun({ vanish: true });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);
    expect(run.output.text()).toContain("is terminated before it was reachable (Spot interruption?)");
    expect(run.output.text()).toMatch(/exit=interrupted /);
    expect(run.ec2.inputs("TerminateInstances")).toHaveLength(1);
  });

  test("when no type can start, the lane says what AWS last said, such as a Spot quota", async () => {
    const run = await awsRun({ refuse: "MaxSpotInstanceCountExceeded" });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);
    expect(run.ec2.inputs("RunInstances")).toHaveLength(4);
    expect(run.output.text()).toContain("no capacity for m7i.4xlarge (MaxSpotInstanceCountExceeded); trying the next type");
    expect(run.output.text()).toContain("no capacity for any of: c7i.4xlarge c7a.4xlarge c6i.4xlarge m7i.4xlarge; AWS last said: MaxSpotInstanceCountExceeded: MaxSpotInstanceCountExceeded refused the launch");
    expect(run.output.text()).toMatch(/exit=unlaunched /);
  });

  test("a refusal that is not capacity stops the lane before any machine exists", async () => {
    const run = await awsRun({ refuse: "UnauthorizedOperation" });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);
    expect(run.output.text()).toContain("run-instances refused: UnauthorizedOperation: UnauthorizedOperation refused the launch");
    expect(run.output.text()).toMatch(/machine=none minutes=0 cost≈none exit=unlaunched /);
    expect(run.ec2.inputs("TerminateInstances")).toHaveLength(0);
    expect(run.ec2.inputs("DeleteKeyPair")).toHaveLength(1);
  });

  test("an account's first Spot launch names the one-time service-linked role command", async () => {
    const run = await awsRun({ refuse: "AuthFailure.ServiceLinkedRoleCreationNotPermitted" });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);
    expect(run.output.text()).toContain("this account has never launched a Spot instance: an administrator runs `aws iam create-service-linked-role --aws-service-name spot.amazonaws.com` once (https://github.com/agentsfleet/orly/blob/main/docs/BURST.md)");
    expect(run.ec2.inputs("RunInstances")).toHaveLength(1);
  });

  test("an instance whose launch reply was lost is found by its run tag and terminated", async () => {
    const run = await awsRun({ lostReply: true });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);
    expect(run.output.text()).toMatch(/exit=unlaunched /);
    expect(run.ec2.inputs("TerminateInstances")).toEqual([{ InstanceIds: ["i-00000000000000001"] }]);
    const commands = run.ec2.calls.map((call) => call.command);
    expect(commands.indexOf("TerminateInstances")).toBeLessThan(commands.indexOf("DeleteSecurityGroup"));
    expect(commands.slice(-2)).toEqual(["DeleteSecurityGroup", "DeleteKeyPair"]);
  });

  test.each(["ImportKeyPair", "CreateSecurityGroup"] as const)("a %s whose reply was lost is still deleted by name", async (command) => {
    const run = await awsRun({ lostCreate: command });

    await expect(burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).rejects.toThrow("made, but its reply was lost");
    expect(run.ec2.inputs("DeleteKeyPair")).toHaveLength(1);
    expect(run.ec2.inputs("DeleteSecurityGroup")).toEqual(command === "CreateSecurityGroup" ? [{ GroupId: GROUP_ID }] : []);
    expect(run.ec2.inputs("RunInstances")).toHaveLength(0);
  });

  test("an instance read that fails after the SDK's own retries ends the wait at once, and the instance is terminated", async () => {
    const run = await awsRun({ describeFails: "AuthFailure" });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);
    expect(run.ec2.inputs("DescribeInstances").filter((input) => input.InstanceIds)).toHaveLength(1);
    expect(run.output.text()).toContain("describe refused");
    expect(run.output.text()).toMatch(/exit=interrupted /);
    expect(run.ec2.inputs("TerminateInstances").length).toBeGreaterThanOrEqual(1);
  });

  test("ORLY_BURST_MARKET=on-demand rents a lane on demand that still terminates when it shuts down", async () => {
    const run = await awsRun({}, {}, { ORLY_BURST_MARKET: "on-demand" });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(0);
    const launch = run.ec2.inputs("RunInstances")[0] ?? {};
    expect(launch).not.toHaveProperty("InstanceMarketOptions");
    expect(launch.InstanceInitiatedShutdownBehavior).toBe("terminate");
    expect(run.output.text()).toMatch(/lane=acceptance provider=aws-spot machine=c7i\.4xlarge minutes=\d+ cost≈on-demand rate exit=0 /);
  });

  test("a Spot lane whose price AWS does not say reports that, not a made-up price", async () => {
    const run = await awsRun({ priceUnavailable: true });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(0);
    expect(run.output.text()).toContain("cost≈spot rate unavailable exit=0");
  });
});

describe("aws-spot snapshots", () => {
  test("a snapshot warms an on-demand instance with no secret, images it stopped and terminates it", async () => {
    const run = await awsRun({}, SECRETS);

    expect(await burst(["snapshot", "--provider", "aws-spot"], run.dependencies)).toBe(0);

    const launch = run.ec2.inputs("RunInstances")[0] ?? {};
    expect(launch).not.toHaveProperty("InstanceMarketOptions");
    expect(launch.InstanceInitiatedShutdownBehavior).toBe("stop");
    const job = machineScript(run.state, "100.64.0.1");
    expect(job).toContain("BURST_MODE='warm'");
    expect(job).not.toContain("export API_TOKEN");
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
    const commands = run.ec2.calls.map((call) => call.command);
    expect(commands.indexOf("StopInstances")).toBeLessThan(commands.indexOf("CreateImage"));
    expect(commands.indexOf("CreateImage")).toBeLessThan(commands.indexOf("TerminateInstances"));
    const image = run.ec2.inputs("CreateImage")[0] ?? {};
    expect(String(image.Name)).toMatch(new RegExp(`^orly-burst-${REPOSITORY}-\\d{17}-[0-9a-f]{8}$`));
    expect(image.TagSpecifications).toEqual([
      { ResourceType: "image", Tags: [{ Key: "owner", Value: "agent" }, { Key: "orly-burst", Value: REPOSITORY }] },
      { ResourceType: "snapshot", Tags: [{ Key: "owner", Value: "agent" }, { Key: "orly-burst", Value: REPOSITORY }] },
    ]);
    expect(run.output.text()).toMatch(/orly burst: 🟢 saved image ami-\d+\n/);
    expect(run.output.text()).toMatch(new RegExp(`orly burst: snapshot provider=aws-spot id=ami-\\d+ name=orly-burst-${REPOSITORY}-\\d{17}-[0-9a-f]{8} state=ready size=80\\.0GB storage≈\\$4\\.00/month at most`));
  });

  test("an image pending for several reads is waited out", async () => {
    const run = await awsRun({ imagePendingPolls: 4 });

    expect(await burst(["snapshot", "--provider", "aws-spot"], run.dependencies)).toBe(0);
    expect(run.output.text()).toMatch(/snapshot provider=aws-spot id=ami-\d+ name=\S+ state=ready size=80\.0GB/);
  });

  test("a failed image fails the capture with AWS's reason, and the instance still goes", async () => {
    const run = await awsRun({ imagePendingPolls: 2, imageFails: "Client.InternalError: Snapshot creation failed" });

    await expect(burst(["snapshot", "--provider", "aws-spot"], run.dependencies)).rejects.toThrow("image ami-00000000000000001 is failed: Client.InternalError: Snapshot creation failed");
    expect(run.ec2.inputs("TerminateInstances")).toHaveLength(1);
    expect(run.ec2.inputs("DeleteKeyPair")).toHaveLength(1);
  });

  test("an image still saving at the deadline is left to finish and reported as pending, not as nothing saved", async () => {
    const run = await awsRun({ imagePendingPolls: 100_000 }, {}, { ORLY_BURST_DEADLINE_MINUTES: "0.05" });

    expect(await burst(["snapshot", "--provider", "aws-spot"], run.dependencies)).toBe(0);
    expect(run.output.text()).toMatch(/snapshot provider=aws-spot id=ami-00000000000000001 name=\S+ state=pending size=unknown/);
    expect(run.output.text()).toContain("aws-spot is still saving");
    expect(run.ec2.inputs("DeregisterImage")).toHaveLength(0);
    expect(run.ec2.inputs("TerminateInstances")).toHaveLength(1);
  });

  test("burst.aws places the instances and names the base image, whose own root device carries the disk", async () => {
    const image = "ami-0123456789abcdef0";
    const run = await awsRun({}, { aws: { region: "ap-south-1", instance_types: ["c7i.4xlarge"], image } });
    run.ec2.seed([snapshotOf(image, "20261115000000000")]);

    await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);
    await burst(["acceptance", "--provider", "aws-spot", "--no-snapshot"], run.dependencies);

    const launches = run.ec2.inputs("RunInstances");
    expect(launches.map((launch) => launch.ImageId)).toEqual(["ami-00000000000000001", image]);
    expect(launches.map((launch) => launch.InstanceType)).toEqual(["c7i.4xlarge", "c7i.4xlarge"]);
    expect(launches.map((launch) => (launch.BlockDeviceMappings as Array<{ DeviceName: string }>)[0]?.DeviceName)).toEqual(["/dev/xvda", "/dev/sda1"]);
    expect(new Set(run.ec2.calls.map((call) => call.region))).toEqual(new Set(["ap-south-1"]));
  });

  test("lanes start from the newest snapshot of the base image, or the base image with --no-snapshot", async () => {
    const run = await awsRun();
    run.ec2.seed([snapshotOf(BASE_IMAGE, "20261101000000000"), snapshotOf(BASE_IMAGE, "20261115000000000"), snapshotOf("ami-0123456789abcdef0", "20261120000000000")]);

    await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);
    await burst(["acceptance", "--provider", "aws-spot", "--no-snapshot"], run.dependencies);

    expect(run.ec2.inputs("RunInstances").map((launch) => launch.ImageId)).toEqual(["ami-00000000000000002", BASE_IMAGE]);
  });

  test("pruning keeps the newest snapshot of the base image, deletes the rest with their EBS snapshots, and rents nothing", async () => {
    const run = await awsRun();
    run.ec2.seed([snapshotOf(BASE_IMAGE, "20261101000000000"), snapshotOf(BASE_IMAGE, "20261102000000000"), snapshotOf("ami-0123456789abcdef0", "20261103000000000")]);

    expect(await burst(["snapshot", "--prune", "--provider", "aws-spot", "--ref", "feat/burst-fixture"], run.dependencies)).toBe(0);
    expect(run.ec2.inputs("DeregisterImage").map((input) => input.ImageId)).toEqual(["ami-00000000000000003", "ami-00000000000000001"]);
    expect(run.ec2.inputs("DeleteSnapshot").map((input) => input.SnapshotId)).toEqual(["snap-3", "snap-1"]);
    expect(run.ec2.inputs("RunInstances")).toHaveLength(0);
    expect(run.ec2.inputs("ImportKeyPair")).toHaveLength(0);
  });
});
