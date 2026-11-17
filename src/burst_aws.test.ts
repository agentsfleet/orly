import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./burst";
import { burstDependencies, burstEnvironment, burstRepository, CALLER_ADDRESS, callerAddress, fakeBin, recordedCalls, REPOSITORY, SECRET_VALUE } from "./burst_test_support";
import { cleanupTemporaryDirectories } from "./gates_test_support";

const BASE_IMAGE = "resolve:ssm:/aws/service/debian/release/13/latest/amd64";
const LANES = ["acceptance", "integration", "--provider", "aws-spot"];
const RUN_NAME = /^orly-burst-feat-burst-fixture-\d{14}-[0-9a-f]{4}$/;
const SECRETS = { secrets: { API_TOKEN: "op://Burst Vault/api/credential" } };

setDefaultTimeout(60_000);
afterEach(cleanupTemporaryDirectories);

async function awsRun(scenario: Record<string, unknown> = {}, burstConfig: Record<string, unknown> = {}) {
  const root = burstRepository(burstConfig);
  const { bin, state } = fakeBin();
  await Bun.write(join(state, "scenario.json"), JSON.stringify(scenario));
  return { root, state, ...burstDependencies(root, burstEnvironment(bin, state), callerAddress) };
}

async function awsRunWith(extra: Record<string, string>, scenario: Record<string, unknown> = {}) {
  const root = burstRepository();
  const { bin, state } = fakeBin();
  await Bun.write(join(state, "scenario.json"), JSON.stringify(scenario));
  return { root, state, bin, ...burstDependencies(root, burstEnvironment(bin, state, extra), callerAddress) };
}

function aws(state: string, verb?: string): string[][] {
  return recordedCalls(state).filter((call) => call[0] === "aws" && (verb === undefined || call[2] === verb));
}

function option(call: string[] | undefined, name: string): string {
  const index = call?.indexOf(name) ?? -1;
  return index < 0 ? "" : call?.[index + 1] ?? "";
}

function machineScript(state: string, address: string): string {
  return readFileSync(join(state, address, "job.sh"), "utf8");
}

async function seedImages(state: string, names: string[]): Promise<void> {
  const images = names.map((name, index) => ({ id: `ami-0000000000000000${index + 1}`, name, repo: REPOSITORY, snapshots: [`snap-${index + 1}`], size: 80 }));
  await Bun.write(join(state, "images.json"), JSON.stringify(images));
}

describe("aws-spot lanes", () => {
  test("a run imports its key, opens SSH to the caller only, launches lanes at once and removes it all", async () => {
    const run = await awsRun({ noCapacity: ["c7i.4xlarge"] });

    const code = await burst(LANES, run.dependencies);

    expect(code).toBe(0);
    const verbs = aws(run.state).map((call) => call[2]);
    expect(verbs.slice(0, 4)).toEqual(["describe-images", "import-key-pair", "create-security-group", "authorize-security-group-ingress"]);
    expect(option(aws(run.state, "import-key-pair")[0], "--key-name")).toMatch(RUN_NAME);
    expect(option(aws(run.state, "authorize-security-group-ingress")[0], "--cidr")).toBe(`${CALLER_ADDRESS}/32`);
    expect(option(aws(run.state, "authorize-security-group-ingress")[0], "--port")).toBe("22");
    const launches = aws(run.state, "run-instances");
    expect(launches.map((call) => option(call, "--instance-type")).sort()).toEqual(["c7a.4xlarge", "c7a.4xlarge", "c7i.4xlarge", "c7i.4xlarge"]);
    expect(verbs.lastIndexOf("run-instances")).toBeLessThan(verbs.indexOf("terminate-instances"));
    const launch = launches.find((call) => option(call, "--instance-type") === "c7a.4xlarge");
    expect(option(launch, "--image-id")).toBe(BASE_IMAGE);
    expect(option(launch, "--key-name")).toMatch(RUN_NAME);
    expect(option(launch, "--security-group-ids")).toBe("sg-0123456789abcdef0");
    expect(option(launch, "--instance-market-options")).toBe("MarketType=spot,SpotOptions={SpotInstanceType=one-time,InstanceInterruptionBehavior=terminate}");
    expect(option(launch, "--instance-initiated-shutdown-behavior")).toBe("terminate");
    expect(option(launch, "--metadata-options")).toBe("HttpTokens=required");
    expect(option(launch, "--tag-specifications")).toMatch(/^ResourceType=instance,Tags=\[\{Key=owner,Value=agent\},\{Key=orly-burst,Value=feat-burst-fixture-/);
    expect(launch).not.toContain("--iam-instance-profile");
    expect(launch).not.toContain("--user-data");
    expect(aws(run.state, "terminate-instances")).toHaveLength(2);
    expect(verbs.slice(-3)).toEqual(["describe-instances", "delete-security-group", "delete-key-pair"]);
    expect(aws(run.state, "describe-instances").at(-1)).toContain(`Name=tag:orly-burst,Values=${option(launch, "--tag-specifications").match(/Value=(feat-[^}]+)\}/)?.[1]}`);
    const ssh = recordedCalls(run.state).filter((call) => call[0] === "ssh");
    expect(ssh.every((call) => call.includes("admin@198.51.100.1") || call.includes("admin@198.51.100.2"))).toBe(true);
    expect(ssh.some((call) => call.at(-1) === "sudo -n bash -s")).toBe(true);
    const text = run.output.text();
    expect(text).toContain("no capacity for c7i.4xlarge (InsufficientInstanceCapacity); trying the next type");
    expect(text).toContain(`admits SSH from ${CALLER_ADDRESS} only`);
    expect(text).toMatch(/orly burst: lane=acceptance provider=aws-spot machine=c7a\.4xlarge minutes=\d+ cost≈\$0\.2345\/h \(spot\) exit=0 evidence=\S+/);
    expect(text).toContain("[integration] lane integration ran");
    expect(text).toContain("orly burst: total provider=aws-spot lanes=2 passed=2 failed=0");
  });

  test("secrets go only through the session's input, and the results come home", async () => {
    const run = await awsRun({}, SECRETS);

    await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);

    expect(machineScript(run.state, "198.51.100.1")).toContain(`  export API_TOKEN='${SECRET_VALUE}'`);
    expect(JSON.stringify(recordedCalls(run.state))).not.toContain(SECRET_VALUE);
    expect(run.output.text()).not.toContain(SECRET_VALUE);
    const evidence = run.output.text().match(/evidence=(\S+)/)?.[1] ?? "";
    expect(readFileSync(join(evidence, "report/summary.txt"), "utf8")).toBe("lane acceptance results\n");
    expect(readFileSync(join(evidence, "run.log"), "utf8")).toBe("== packages\nlane acceptance ran\n");
  });

  test("a lane's exit code is the run's, and a dropped session is interrupted", async () => {
    const run = await awsRun();
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ exits: { acceptance: 4, integration: "drop" } }));

    const code = await burst(LANES, run.dependencies);

    expect(code).toBe(4);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=4 /);
    expect(run.output.text()).toMatch(/lane=integration .* exit=interrupted /);
  });

  test("an instance gone before it answers is interrupted, and still terminated", async () => {
    const run = await awsRun({ vanish: true });

    const code = await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(1);
    expect(run.output.text()).toContain("is terminated before it was reachable (Spot interruption?)");
    expect(run.output.text()).toMatch(/exit=interrupted /);
    expect(aws(run.state, "terminate-instances")).toHaveLength(1);
  });

  test("when no type can start, the lane says what AWS last said, such as a Spot quota", async () => {
    const quota = "An error occurred (MaxSpotInstanceCountExceeded) when calling the RunInstances operation: Max spot instance count exceeded";
    const run = await awsRun({ refuse: quota });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);
    expect(aws(run.state, "run-instances")).toHaveLength(4);
    expect(run.output.text()).toContain("no capacity for m7i.4xlarge (MaxSpotInstanceCountExceeded); trying the next type");
    expect(run.output.text()).toContain(`no capacity for any of: c7i.4xlarge c7a.4xlarge c6i.4xlarge m7i.4xlarge; AWS last said: ${quota}`);
    expect(run.output.text()).toMatch(/exit=unlaunched /);
  });

  test("a refusal that is not capacity stops the lane before any machine exists", async () => {
    const run = await awsRun({ refuse: "An error occurred (UnauthorizedOperation) when calling the RunInstances operation" });

    const code = await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(1);
    expect(run.output.text()).toContain("run-instances refused: An error occurred (UnauthorizedOperation)");
    expect(run.output.text()).toMatch(/machine=none minutes=0 cost≈none exit=unlaunched /);
    expect(aws(run.state, "terminate-instances")).toHaveLength(0);
    expect(aws(run.state, "delete-key-pair")).toHaveLength(1);
  });

  test("an account's first Spot launch names the one-time service-linked role command", async () => {
    const run = await awsRun({ refuse: "An error occurred (AuthFailure.ServiceLinkedRoleCreationNotPermitted) when calling the RunInstances operation" });

    const code = await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(1);
    expect(run.output.text()).toContain("this account has never launched a Spot instance: an administrator runs `aws iam create-service-linked-role --aws-service-name spot.amazonaws.com` once (docs/BURST.md)");
    expect(aws(run.state, "run-instances")).toHaveLength(1);
  });

  test("an instance whose launch reply was lost is found by its run tag and terminated", async () => {
    const run = await awsRun({ lostReply: true });

    const code = await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(1);
    expect(run.output.text()).toMatch(/exit=unlaunched /);
    const terminated = aws(run.state, "terminate-instances");
    expect(terminated).toHaveLength(1);
    expect(terminated[0]).toContain("i-00000000000000001");
    const verbs = aws(run.state).map((call) => call[2]);
    expect(verbs.indexOf("terminate-instances")).toBeLessThan(verbs.indexOf("delete-security-group"));
    expect(verbs.slice(-4)).toEqual(["terminate-instances", "describe-instances", "delete-security-group", "delete-key-pair"]);
    expect(verbs).not.toContain("wait");
  });

  test("a describe failure that is not transient ends the wait at once, and the instance is terminated", async () => {
    const run = await awsRun({ describeFails: "AuthFailure" });
    const started = Date.now();

    const code = await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(1);
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(run.output.text()).toContain("aws ec2 describe-instances failed: An error occurred (AuthFailure)");
    expect(run.output.text()).toMatch(/exit=interrupted /);
    expect(aws(run.state, "terminate-instances")).toHaveLength(1);
  });

  test("a setup that fails after the key is imported still removes the key and the group", async () => {
    const root = burstRepository();
    const { bin, state } = fakeBin();
    const unreachable = async () => new Response("", { status: 503 });
    const { dependencies } = burstDependencies(root, burstEnvironment(bin, state), unreachable);

    await expect(burst(["acceptance", "--provider", "aws-spot"], dependencies)).rejects.toThrow("could not learn this machine's public IPv4 address");
    expect(aws(state, "run-instances")).toHaveLength(0);
    expect(aws(state, "delete-security-group")).toHaveLength(1);
    expect(aws(state, "delete-key-pair")).toHaveLength(1);
    expect([...new Bun.Glob("**/id_ed25519*").scanSync(join(state, "out"))]).toEqual([]);
  });

  test("--keep launches on-demand so the machine can stop, skips the shutdown, and removes nothing", async () => {
    const run = await awsRun();

    await burst(["acceptance", "--provider", "aws-spot", "--keep"], run.dependencies);

    const launch = aws(run.state, "run-instances")[0];
    expect(launch).not.toContain("--instance-market-options");
    expect(option(launch, "--instance-initiated-shutdown-behavior")).toBe("stop");
    expect(machineScript(run.state, "198.51.100.1")).not.toContain("shutdown -h");
    for (const verb of ["terminate-instances", "delete-security-group", "delete-key-pair"]) expect(aws(run.state, verb)).toHaveLength(0);
    expect(run.output.text()).toContain("--keep left key pair orly-burst-feat-burst-fixture-");
  });
});

describe("aws-spot snapshots", () => {
  test("a snapshot warms an on-demand instance with no secret, images it stopped and terminates it", async () => {
    const run = await awsRun({}, SECRETS);

    const code = await burst(["snapshot", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(0);
    const launch = aws(run.state, "run-instances")[0];
    expect(launch).not.toContain("--instance-market-options");
    expect(option(launch, "--instance-initiated-shutdown-behavior")).toBe("stop");
    const job = machineScript(run.state, "198.51.100.1");
    expect(job).toContain("BURST_MODE='warm'");
    expect(job).not.toContain("export API_TOKEN");
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
    const verbs = aws(run.state).map((call) => call[2]);
    expect(verbs.indexOf("stop-instances")).toBeLessThan(verbs.indexOf("create-image"));
    expect(verbs.indexOf("create-image")).toBeLessThan(verbs.indexOf("terminate-instances"));
    const image = aws(run.state, "create-image")[0];
    expect(option(image, "--name")).toMatch(new RegExp(`^orly-burst-${REPOSITORY}-\\d{12}$`));
    expect(image).toContain(`ResourceType=image,Tags=[{Key=owner,Value=agent},{Key=orly-burst,Value=${REPOSITORY}}]`);
    expect(run.output.text()).toMatch(new RegExp(`orly burst: snapshot provider=aws-spot id=ami-\\d+ name=orly-burst-${REPOSITORY}-\\d{12} state=ready size=80\\.0GB storage≈\\$4\\.00/month at most`));
  });

  // The real capture outlasted `aws ec2 wait image-available` and orly killed
  // the waiter; the image itself went on saving.
  test("an image pending for several checks is waited out with short describe calls, never a waiter", async () => {
    const run = await awsRun({ imagePendingPolls: 4 });

    const code = await burst(["snapshot", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(0);
    const stateReads = aws(run.state, "describe-images").filter((call) => option(call, "--query").includes("State"));
    expect(stateReads).toHaveLength(5);
    expect(aws(run.state, "wait")).toHaveLength(0);
    expect(run.output.text()).toMatch(/snapshot provider=aws-spot id=ami-\d+ name=\S+ state=ready size=80\.0GB/);
  });

  test("a failed image fails the capture with AWS's reason, and the instance still goes", async () => {
    const run = await awsRun({ imagePendingPolls: 2, imageFails: "Client.InternalError: Snapshot creation failed" });

    await expect(burst(["snapshot", "--provider", "aws-spot"], run.dependencies)).rejects.toThrow("image ami-00000000000000001 is failed: Client.InternalError: Snapshot creation failed");
    expect(aws(run.state, "terminate-instances")).toHaveLength(1);
    expect(aws(run.state, "delete-key-pair")).toHaveLength(1);
  });

  test("an image still saving at the deadline is left to finish and reported as pending, not as nothing saved", async () => {
    const root = burstRepository();
    const { bin, state } = fakeBin();
    await Bun.write(join(state, "scenario.json"), JSON.stringify({ imagePendingPolls: 100_000 }));
    const { dependencies, output } = burstDependencies(root, burstEnvironment(bin, state, { ORLY_BURST_DEADLINE_MINUTES: "0.05" }), callerAddress);

    const code = await burst(["snapshot", "--provider", "aws-spot"], dependencies);

    expect(code).toBe(0);
    expect(output.text()).toMatch(/snapshot provider=aws-spot id=ami-00000000000000001 name=\S+ state=pending size=unknown/);
    expect(output.text()).toContain("aws-spot is still saving");
    expect(aws(state, "deregister-image")).toHaveLength(0);
    expect(aws(state, "terminate-instances")).toHaveLength(1);
  });

  test("lanes start from the newest snapshot, or the base image with --no-snapshot", async () => {
    const run = await awsRun();
    await seedImages(run.state, [`orly-burst-${REPOSITORY}-202611010000`, `orly-burst-${REPOSITORY}-202611150000`]);

    await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);
    await burst(["acceptance", "--provider", "aws-spot", "--no-snapshot"], run.dependencies);

    expect(aws(run.state, "run-instances").map((call) => option(call, "--image-id"))).toEqual(["ami-00000000000000002", BASE_IMAGE]);
  });

  test("pruning deregisters the older images and deletes their EBS snapshots, renting nothing", async () => {
    const run = await awsRun();
    await seedImages(run.state, ["202611010000", "202611020000", "202611030000"].map((stamp) => `orly-burst-${REPOSITORY}-${stamp}`));

    const code = await burst(["snapshot", "--prune", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(0);
    expect(aws(run.state, "deregister-image").map((call) => option(call, "--image-id"))).toEqual(["ami-00000000000000001"]);
    expect(aws(run.state, "delete-snapshot").map((call) => option(call, "--snapshot-id"))).toEqual(["snap-1"]);
    expect(aws(run.state, "run-instances")).toHaveLength(0);
    expect(aws(run.state, "import-key-pair")).toHaveLength(0);
  });
});

describe("aws-spot markets", () => {
  test("ORLY_BURST_MARKET=on-demand rents a lane on demand that still terminates when it shuts down", async () => {
    const run = await awsRunWith({ ORLY_BURST_MARKET: "on-demand" });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(0);

    const launch = aws(run.state, "run-instances")[0];
    expect(launch).not.toContain("--instance-market-options");
    expect(option(launch, "--instance-initiated-shutdown-behavior")).toBe("terminate");
    expect(run.output.text()).toContain("(c7i.4xlarge on-demand) started");
    expect(run.output.text()).toMatch(/lane=acceptance provider=aws-spot machine=c7i\.4xlarge minutes=\d+ cost≈on-demand rate exit=0 /);
    expect(aws(run.state, "terminate-instances")).toHaveLength(1);
  });

  test("spot-then-on-demand runs a lane AWS took back once more on demand, with its own evidence", async () => {
    const run = await awsRunWith({ ORLY_BURST_MARKET: "spot-then-on-demand" }, { reclaimSpot: true, dropAddresses: ["198.51.100.1"] });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(0);

    const launches = aws(run.state, "run-instances");
    expect(launches).toHaveLength(2);
    expect(launches[0]).toContain("--instance-market-options");
    expect(launches[1]).not.toContain("--instance-market-options");
    expect(aws(run.state, "describe-instances").filter((call) => option(call, "--query").includes("StateReason"))).toHaveLength(1);
    expect(aws(run.state, "terminate-instances")).toHaveLength(2);
    const text = run.output.text();
    expect(text).toContain("orly burst: lane=acceptance aws-spot took its machine back; running it once more on demand");
    expect(text).toMatch(/lane=acceptance provider=aws-spot machine=c7i\.4xlarge minutes=\d+ cost≈\$0\.2345\/h \(spot\), then on-demand rate exit=0 evidence=\S+acceptance-on-demand/);
    expect(text).toContain("orly burst: total provider=aws-spot lanes=1 passed=1 failed=0");
  });

  test("a dropped session on a machine AWS did not take back is not run again", async () => {
    const run = await awsRunWith({ ORLY_BURST_MARKET: "spot-then-on-demand" }, { dropAddresses: ["198.51.100.1"] });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);

    expect(aws(run.state, "run-instances")).toHaveLength(1);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=interrupted /);
    expect(run.output.text()).not.toContain("once more on demand");
  });

  test("on the default market a lane AWS took back is reported, and its state reason never read", async () => {
    const run = await awsRunWith({}, { reclaimSpot: true, dropAddresses: ["198.51.100.1"] });

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(1);

    expect(aws(run.state, "run-instances")).toHaveLength(1);
    expect(aws(run.state, "describe-instances").filter((call) => option(call, "--query").includes("StateReason"))).toHaveLength(0);
    expect(run.output.text()).toMatch(/exit=interrupted /);
  });
});

describe("aws-spot over Systems Manager", () => {
  const SSM = { ORLY_BURST_AWS_ACCESS: "ssm", ORLY_BURST_AWS_INSTANCE_PROFILE: "orly-burst-ssm" };
  const PROXY = "ProxyCommand=aws --region us-east-1 ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p";

  test("ssm opens no inbound rule, gives the machine its profile and agent, and reaches it by identifier", async () => {
    const run = await awsRunWith(SSM);

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(0);

    expect(aws(run.state, "authorize-security-group-ingress")).toHaveLength(0);
    const launch = aws(run.state, "run-instances")[0];
    expect(option(launch, "--iam-instance-profile")).toBe("Name=orly-burst-ssm");
    expect(option(launch, "--user-data")).toContain("https://s3.us-east-1.amazonaws.com/amazon-ssm-us-east-1/latest/debian_amd64/amazon-ssm-agent.deb");
    expect(option(launch, "--user-data")).toContain("systemctl is-active --quiet amazon-ssm-agent && exit 0");
    const ssh = recordedCalls(run.state).filter((call) => call[0] === "ssh");
    expect(ssh.length).toBeGreaterThan(0);
    expect(ssh.every((call) => call.includes(PROXY) && call.includes("admin@i-00000000000000001"))).toBe(true);
    expect(machineScript(run.state, "i-00000000000000001")).toContain("BURST_LANE='acceptance'");
    expect(run.output.text()).toContain("admits no inbound connection; SSH goes through Systems Manager");
    expect(aws(run.state, "delete-security-group")).toHaveLength(1);
  });

  test("ssm without the Session Manager plugin stops before anything is rented", async () => {
    const run = await awsRunWith(SSM);
    rmSync(join(run.bin, "session-manager-plugin"));

    await expect(burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).rejects.toThrow("ORLY_BURST_AWS_ACCESS=ssm needs AWS's session-manager-plugin on this machine (docs/BURST.md)");
    expect(aws(run.state, "import-key-pair")).toHaveLength(0);
    expect(aws(run.state, "run-instances")).toHaveLength(0);
  });

  test("ssm without an instance profile names the variable before anything is rented", async () => {
    const run = await awsRunWith({ ORLY_BURST_AWS_ACCESS: "ssm" });

    await expect(burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).rejects.toThrow("set ORLY_BURST_AWS_INSTANCE_PROFILE for this provider (see docs/BURST.md)");
    expect(aws(run.state, "import-key-pair")).toHaveLength(0);
  });
});
