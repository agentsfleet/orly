import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { join } from "node:path";

import { burst, BURST_USAGE } from "./index";
import { remoteScript, resultsScript } from "./job";
import { burstSettings } from "./settings";
import { burstDependencies, burstEnvironment, burstRepository, fakeBin } from "./test_support";
import { cleanupTemporaryDirectories, ROOT } from "../gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "../git_env";

setDefaultTimeout(30_000);
afterEach(cleanupTemporaryDirectories);

function dependencies() {
  const root = burstRepository();
  const { bin, state } = fakeBin();
  return burstDependencies(root, burstEnvironment(bin, state));
}

describe("orly burst arguments", () => {
  test("no lane lists the declared lanes and exits 2, through the real command", () => {
    const root = burstRepository();

    const result = Bun.spawnSync(["bun", join(ROOT, "src/cli.ts"), "--root", ROOT, "burst"], { cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe" });

    expect(result.exitCode).toBe(2);
    expect(result.stdout.toString()).toBe(`orly burst: declared lanes: acceptance, integration\n${BURST_USAGE}\n`);
  });

  test.each([
    [["acceptance"], "name a provider with --provider"],
    [["acceptance", "--provider", "gcp"], "unknown provider gcp (aws-spot, e2e, here)"],
    [["acceptance", "--provider"], "--provider needs a value"],
    [["acceptance", "--provider", "e2e", "--fast"], "unknown flag --fast"],
    [["acceptance", "--provider", "here", "--ref", "main"], "--provider here runs this checkout"],
    [["acceptance", "--provider", "here", "--keep"], "--provider here runs this checkout"],
    [["acceptance", "--provider", "e2e", "--prune"], "--prune belongs to `orly burst snapshot`"],
    [["snapshot", "--prune", "--keep", "--provider", "e2e"], "--prune belongs to `orly burst snapshot`"],
    [["snapshot", "acceptance", "--provider", "e2e"], "snapshot takes no lane"],
    [["snapshot", "--provider", "e2e", "--no-snapshot"], "--no-snapshot applies to lanes"],
    [["snapshot"], "name a provider with --provider"],
    [["acceptance", "acceptance", "--provider", "here"], "a lane is named twice"],
    [["a", "b", "c", "d", "e", "f", "g", "h", "i", "--provider", "here"], "at most 8 lanes run at once"],
  ])("%p is refused with exit 2", async (args, reason) => {
    const { dependencies: deps, output } = dependencies();

    expect(await burst(args, deps)).toBe(2);
    expect(output.lines[0]).toStartWith(`orly burst: ${reason}`);
    expect(output.lines[1]).toBe(BURST_USAGE);
  });

  test("an undeclared lane names the declared ones", async () => {
    const { dependencies: deps } = dependencies();

    await expect(burst(["acceptance", "smoke", "--provider", "here"], deps)).rejects.toThrow("unknown lane smoke; .orly/orly.json declares: acceptance, integration");
  });
});

describe("burst settings", () => {
  test("defaults hold until a variable is set, and a blank one counts as unset", () => {
    const settings = burstSettings({ ORLY_BURST_REGION: "", ORLY_BURST_E2E_USER: "" });

    expect(settings.deadlineMs).toBe(120 * 60_000);
    expect(settings.pollMs).toBe(30_000);
    expect(settings.snapshotKeep).toBe(2);
    expect(settings.aws.region).toBe("us-east-1");
    expect(settings.aws.types).toEqual(["c7i.4xlarge", "c7a.4xlarge", "c6i.4xlarge", "m7i.4xlarge"]);
    expect(settings.aws.user).toBe("admin");
    expect(settings.aws).toMatchObject({ market: "spot", access: "ssh", instanceProfile: undefined });
    expect(settings.e2e).toMatchObject({ location: "Delhi", plan: "C3.32GB", user: "root", image: undefined });
  });

  test.each([
    ["ORLY_BURST_DEADLINE_MINUTES", "-5"], ["ORLY_BURST_DEADLINE_MINUTES", "2000"], ["ORLY_BURST_SNAPSHOT_KEEP", "1.5"],
    ["ORLY_BURST_E2E_LOCATION", "Mumbai"], ["ORLY_BURST_INSTANCE_TYPES", "c7g 4xlarge"], ["E2E_PROJECT_ID", "proj-secret-42"],
    ["ORLY_BURST_AWS_IMAGE", "ubuntu"], ["ORLY_BURST_AWS_USER", "Root User"], ["ORLY_BURST_MARKET", "reserved"],
    ["ORLY_BURST_AWS_ACCESS", "telnet"], ["ORLY_BURST_AWS_INSTANCE_PROFILE", "role with spaces"],
  ])("%s=%s is refused by name, never echoing the value", (name, value) => {
    expect(() => burstSettings({ [name]: value })).toThrow(name);
    try {
      burstSettings({ [name]: value });
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });
});

describe("the machine job script", () => {
  const job = { kind: "lane" as const, name: "acceptance", ref: "it's$(touch pwned)", keep: false, deadlineMinutes: 120, setup: [["make", "setup"]], steps: [["make", "test", "SUITE=a b"]], secrets: { API_TOKEN: "va'lue" }, directories: ["TOOLBOX_DIR"] };

  test("every value is single-quoted, setup runs before the secrets exist, and the script parses", async () => {
    const script = await remoteScript(job);

    expect(script.split("\n")[0]).toBe("#!/bin/bash");
    expect(script).toContain("BURST_REF='it'\\''s$(touch pwned)'");
    expect(script).toContain("  export API_TOKEN='va'\\''lue'");
    expect(script.indexOf("  step 'make' 'setup'")).toBeLessThan(script.indexOf("  export API_TOKEN="));
    expect(script.indexOf("  export API_TOKEN=")).toBeLessThan(script.indexOf("  step 'make' 'test' 'SUITE=a b'"));
    expect(script).toContain('  export CI="${CI:-1}"');
    expect(script.indexOf("  export TOOLBOX_DIR='/tmp/orly-burst-inputs/TOOLBOX_DIR'")).toBeLessThan(script.indexOf("  step 'make' 'test' 'SUITE=a b'"));
    expect(script).toContain('export HOME=/root PATH="/root/.cargo/bin:/root/.bun/bin:/root/.local/bin:$PATH"');
    expect(script).toContain("  shutdown -h +120 >/dev/null 2>&1 || true\n");
    expect(script.trimEnd().endsWith("main </dev/null")).toBe(true);
    expect(Bun.spawnSync(["bash", "-n"], { stdin: new Blob([script]) }).exitCode).toBe(0);
  });

  test("a warm-up exports nothing and marks the image warm; --keep schedules no shutdown", async () => {
    const script = await remoteScript({ ...job, kind: "warm", name: "snapshot", keep: true, steps: [["make", "build"]] });

    expect(script).not.toContain("export API_TOKEN");
    expect(script).not.toContain("export CI=");
    expect(script).not.toContain("export TOOLBOX_DIR");
    expect(script).not.toContain("shutdown -h");
    expect(script).toContain("  step 'make' 'build'\n  warmed\n}");
  });

  test("the results request archives only declared paths that exist", () => {
    const root = Bun.spawnSync(["mktemp", "-d"]).stdout.toString().trim();
    Bun.spawnSync(["mkdir", "-p", `${root}/report`]);
    const script = resultsScript(["report", "missing dir"]).replace("/opt/orly-burst/work", root);

    const archived = Bun.spawnSync(["bash", "-s"], { stdin: new Blob([script]), stdout: "pipe" });
    const nothing = Bun.spawnSync(["bash", "-s"], { stdin: new Blob([resultsScript(["missing dir"]).replace("/opt/orly-burst/work", root)]), stdout: "pipe" });

    expect(archived.exitCode).toBe(0);
    expect(archived.stdout.byteLength).toBeGreaterThan(0);
    expect(nothing.exitCode).toBe(3);
    Bun.spawnSync(["rm", "-rf", root]);
  });
});
