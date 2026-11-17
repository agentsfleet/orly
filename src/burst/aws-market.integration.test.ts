import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./index";
import { aws, awsRunWith, machineScript, option } from "./aws-test-support";
import { recordedCalls } from "./test_support";
import { cleanupTemporaryDirectories } from "../gates_test_support";

setDefaultTimeout(60_000);
afterEach(cleanupTemporaryDirectories);

describe("aws-spot markets", () => {
  test("unavailable pricing neither disables a requested retry nor claims an on-demand price", async () => {
    const run = await awsRunWith({ ORLY_BURST_MARKET: "spot-then-on-demand" }, { reclaimSpot: true, priceUnavailable: true, dropAddresses: ["198.51.100.1"] });
    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(0);
    expect(aws(run.state, "run-instances")).toHaveLength(2);
    expect(run.output.text()).toContain("cost≈spot rate unavailable, then on-demand rate exit=0");
    expect(aws(run.state, "terminate-instances")).toHaveLength(2);
  });
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

});

describe("aws-spot retry policy", () => {
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
    // A failing stand-in shadows any plugin the machine has, as CI runners do.
    writeFileSync(join(run.bin, "session-manager-plugin"), "#!/bin/sh\nexit 127\n");
    chmodSync(join(run.bin, "session-manager-plugin"), 0o755);

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
