import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { burst } from "./index";
import { aws, awsRunWith, option } from "./aws-test-support";
import { cleanupTemporaryDirectories } from "../gates_test_support";

setDefaultTimeout(60_000);
afterEach(cleanupTemporaryDirectories);

describe("aws-spot markets", () => {
  test("a Spot lane whose price AWS does not say reports that, not a made-up price", async () => {
    const run = await awsRunWith({}, { priceUnavailable: true });
    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(0);
    expect(run.output.text()).toContain("cost≈spot rate unavailable exit=0");
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
