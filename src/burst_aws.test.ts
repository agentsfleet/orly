import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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
    expect(verbs.slice(-3)).toEqual(["wait", "delete-security-group", "delete-key-pair"]);
    expect(aws(run.state, "wait").at(-1)?.slice(3, 4)).toEqual(["instance-terminated"]);
    const ssh = recordedCalls(run.state).filter((call) => call[0] === "ssh");
    expect(ssh.every((call) => call.includes("admin@198.51.100.1") || call.includes("admin@198.51.100.2"))).toBe(true);
    expect(ssh.some((call) => call.at(-1) === "sudo -n bash -s")).toBe(true);
    const text = run.output.text();
    expect(text).toContain("no capacity for c7i.4xlarge; trying the next type");
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

  test("a refusal that is not capacity stops the lane before any machine exists", async () => {
    const run = await awsRun({ refuse: "An error occurred (UnauthorizedOperation) when calling the RunInstances operation" });

    const code = await burst(["acceptance", "--provider", "aws-spot"], run.dependencies);

    expect(code).toBe(1);
    expect(run.output.text()).toContain("run-instances refused: An error occurred (UnauthorizedOperation)");
    expect(run.output.text()).toMatch(/machine=none minutes=0 cost≈none exit=unlaunched /);
    expect(aws(run.state, "terminate-instances")).toHaveLength(0);
    expect(aws(run.state, "delete-key-pair")).toHaveLength(1);
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
    expect(run.output.text()).toMatch(new RegExp(`orly burst: snapshot provider=aws-spot id=ami-\\d+ name=orly-burst-${REPOSITORY}-\\d{12} size=80\\.0GB storage≈\\$4\\.00/month at most`));
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
