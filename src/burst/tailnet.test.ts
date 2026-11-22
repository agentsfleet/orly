import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { burst } from "./index";
import { awsRun, restoreEc2 } from "./aws-test-support";
import { CREATE, e2eRun, LANES, ONE_LANE } from "./e2e-test-support";
import { CLIENT_SECRET } from "./fake_tailscale";
import { bootScript, launchScript, UPLOAD_CUT } from "./job";
import { fields, recordedCalls } from "./test_support";
import { cleanupTemporaryDirectories } from "../gates_test_support";

const KEYS = "/api/v2/tailnet/-/keys";
const NODE = /^orly-burst-acceptance-\d{14}-[0-9a-f]{4}$/;

setDefaultTimeout(60_000);
afterEach(() => {
  restoreEc2();
  cleanupTemporaryDirectories();
});

describe("the caller's tailnet", () => {
  test.each([
    ["no Tailscale daemon", undefined, false, "this machine's `tailscale status` failed: failed to connect to local Tailscale daemon"],
    ["a stopped Tailscale", "Stopped", false, "this machine is not on a tailnet (Tailscale reports Stopped, offline); run `tailscale up`"],
    ["an offline Tailscale", "Running", false, "this machine is not on a tailnet (Tailscale reports Running, offline)"],
  ])("a caller with %s is refused before anything is minted or rented", async (_case, backend, online, reason) => {
    const run = e2eRun();
    run.tailnet.caller(backend, online);

    await expect(burst(ONE_LANE, run.dependencies)).rejects.toThrow(reason);
    expect(run.api.calls).toHaveLength(0);
    expect(run.tailnet.calls).toHaveLength(0);
    expect(existsSync(join(run.state, "out"))).toBe(false);
  });

  test("missing OAuth credentials are named before any request", async () => {
    const run = e2eRun({ TS_OAUTH_CLIENT_SECRET: "" });

    await expect(burst(ONE_LANE, run.dependencies)).rejects.toThrow("set TS_OAUTH_CLIENT_SECRET");
    expect(run.api.calls).toHaveLength(0);
    expect(run.tailnet.calls).toHaveLength(0);
  });

  test("an OAuth client Tailscale refuses stops the run before anything is rented, and the secret is never said", async () => {
    const run = e2eRun({ TS_OAUTH_CLIENT_SECRET: "tskey-fake-wrong-secret" });

    const refused = burst(ONE_LANE, run.dependencies);
    await expect(refused).rejects.toThrow("Tailscale POST /api/v2/oauth/token answered 401: invalid client credentials");
    await refused.catch((error: unknown) => expect(String(error)).not.toContain("tskey-fake-wrong-secret"));
    expect(run.api.calls).toHaveLength(0);
    expect(existsSync(join(run.state, "out"))).toBe(false);
  });

  test("each machine joins with a single-use, ephemeral, tagged key of its own, deleted once it joined", async () => {
    const run = e2eRun();

    expect(await burst(LANES, run.dependencies)).toBe(0);

    const minted = run.tailnet.bodies(KEYS);
    expect(minted).toHaveLength(2);
    for (const body of minted) {
      expect(body.capabilities).toEqual({ devices: { create: { reusable: false, ephemeral: true, preauthorized: true, tags: ["tag:orly-burst"] } } });
      expect(body.expirySeconds).toBe(600);
    }
    expect(run.tailnet.keys.size).toBe(0);
    for (const id of ["k1", "k2"]) {
      const order = run.tailnet.events.filter((event) => event.split(" ")[1] === id).map((event) => event.split(" ")[0]);
      expect(order).toEqual(["mint", "join", "delete"]);
    }
    const scripts = run.api.callsTo("POST", /^\/notebooks\/init-script\/$/).map((call) => String(fields(call.body).init_script));
    expect(scripts.map((script) => script.match(/--auth-key='([^']+)'/)?.[1]).sort()).toEqual(["tskey-fake-auth-k1", "tskey-fake-auth-k2"]);
    expect(scripts.some((script) => /--hostname='orly-burst-acceptance-\d{14}-[0-9a-f]{4}'/.test(script))).toBe(true);
    const tokenForm = new URLSearchParams(run.tailnet.calls.find((call) => call.path === "/api/v2/oauth/token")?.body ?? "");
    expect(tokenForm.get("client_secret")).toBe(CLIENT_SECRET);
    const elsewhere = JSON.stringify(recordedCalls(run.state)) + run.output.text() + readFileSync(join(run.output.text().match(/evidence=(\S+)/)?.[1] ?? "", "run.log"), "utf8");
    expect(elsewhere).not.toContain("tskey-fake-auth");
    expect(elsewhere).not.toContain(CLIENT_SECRET);
    expect(run.output.text()).toMatch(/🟢 deleted the tailnet key k\d of orly-burst-acceptance-/);
  });

  test("a machine that never boots never joins, and its key is still deleted", async () => {
    const run = e2eRun();
    run.api.bootStatus = "error";

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.tailnet.events).toEqual(["mint k1", "delete k1"]);
    expect(run.api.vms.size).toBe(0);
    expect(run.api.scripts.size).toBe(0);
  });

  test("a key Tailscale will not delete is reported by its identifier, for a person to delete", async () => {
    const run = e2eRun();
    run.tailnet.deleteStatus = 500;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    expect(run.output.text()).toMatch(/🔴 could not delete the tailnet key k1 of orly-burst-acceptance-\S+: Tailscale DELETE \/api\/v2\/tailnet\/-\/keys\/k1 answered 500: delete refused; delete it in the Tailscale admin console/);
  });

  test("a refused mint rents no machine", async () => {
    const run = e2eRun();
    run.tailnet.mintStatus = 403;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.api.callsTo("POST", CREATE)).toHaveLength(0);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=unlaunched /);
  });

  test("SSH goes only to the machine's tailnet address, and the node logs out before the machine is deleted", async () => {
    const run = e2eRun();

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    const ssh = recordedCalls(run.state);
    expect(ssh.every((call) => call.includes("root@100.64.0.1"))).toBe(true);
    expect(ssh.findIndex((call) => call.at(-1)?.includes("tailscale logout"))).toBeGreaterThan(-1);
    expect(run.tailnet.nodes()).toEqual([]);
    const text = run.output.text();
    expect(text.indexOf("is leaving the tailnet")).toBeLessThan(text.indexOf("deleting e2e machine 5001"));
    expect(text).toMatch(/🟢 orly-burst-acceptance-\S+ is leaving the tailnet/);
  });

  test("a warm-up leaves the tailnet before it is imaged, so no snapshot carries its node", async () => {
    const run = e2eRun();

    expect(await burst(["snapshot", "--provider", "e2e"], run.dependencies)).toBe(0);
    const text = run.output.text();
    expect(text.indexOf("left the tailnet")).toBeGreaterThan(-1);
    expect(text.indexOf("left the tailnet")).toBeLessThan(text.indexOf("stopping VM 5001 to save it"));
    expect(text).not.toContain("is leaving the tailnet");
    expect(run.tailnet.nodes()).toEqual([]);
  });

  test("a device that claims the node's name without the burst tag is never reached", async () => {
    const run = e2eRun();
    run.tailnet.impostorTags = [];

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    expect(recordedCalls(run.state).some((call) => call.some((argument) => argument.includes("100.64.9.9")))).toBe(false);
  });

  test("two burst-tagged nodes of one name are refused rather than guessed between", async () => {
    const run = e2eRun();
    run.tailnet.impostorTags = ["tag:orly-burst"];

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toMatch(/🔴 lane=acceptance 2 tailnet nodes tagged tag:orly-burst are named orly-burst-acceptance-\S+; remove the stale ones/);
    expect(recordedCalls(run.state).filter((call) => call.at(-1) !== undefined && !call.at(-1)?.includes("tailscale logout"))).toEqual([]);
    expect(run.api.vms.size).toBe(0);
  });

  test("a node that joins after the run stopped waiting for it is still logged out", async () => {
    const run = e2eRun({ ORLY_BURST_DEADLINE_MINUTES: "0.02" });
    run.tailnet.joinOffline = true;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toContain("the deadline passed while waiting for orly-burst-acceptance-");
    expect(recordedCalls(run.state).filter((call) => call.at(-1)?.includes("tailscale logout"))).toHaveLength(1);
    expect(run.tailnet.nodes()).toEqual([]);
    expect(run.tailnet.keys.size).toBe(0);
  });

  test("a warm-up forgets its node and its user data before it is imaged; a lane only logs out", async () => {
    const run = e2eRun();

    expect(await burst(["snapshot", "--provider", "e2e"], run.dependencies)).toBe(0);
    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    const leaves = recordedCalls(run.state).flatMap((call) => call.at(-1)?.includes("tailscale logout") ? [call.at(-1) ?? ""] : []);
    expect(leaves).toHaveLength(2);
    expect(leaves[0]).toContain("cloud-init clean --logs; tailscale logout; systemctl stop tailscaled; rm -f /var/lib/tailscale/tailscaled.state");
    expect(leaves[1]).toBe("setsid nohup tailscale logout >/dev/null 2>&1 </dev/null &");
  });

  test("the boot script quotes its key and name, and parses", () => {
    const script = bootScript("orly-burst-acceptance-20261122000000-ab12", "tskey-fake-it's");

    expect(script).toContain("tailscale up --reset --auth-key='tskey-fake-it'\\''s' --hostname='orly-burst-acceptance-20261122000000-ab12'");
    expect(Bun.spawnSync(["bash", "-n"], { stdin: new Blob([script]) }).exitCode).toBe(0);
  });
});

describe("a detached lane", () => {
  test("a dropped session reconnects, and the log resumes from the last byte received", async () => {
    const run = e2eRun();
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ drops: { acceptance: 1 } }));

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    const offsets = recordedCalls(run.state).flatMap((call) => call.at(-1)?.match(/tail -c \+(\d+)/)?.[1] ?? []);
    expect(offsets).toEqual(["1", String("== packages\n".length + 1)]);
    const evidence = run.output.text().match(/evidence=(\S+)/)?.[1] ?? "";
    expect(readFileSync(join(evidence, "run.log"), "utf8")).toBe("== packages\nlane acceptance ran\n");
    expect(run.output.text()).toContain("lane=acceptance lost its session to 100.64.0.1; reconnecting, the log resumes at byte 12");
    expect(run.output.text().match(/\[acceptance\] lane acceptance ran/g)).toHaveLength(1);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=0 /);
  });

  test("a launch whose session was lost mid-upload is sent again, and the job starts once", async () => {
    const run = e2eRun();
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ cutUpload: true }));

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    expect(recordedCalls(run.state).filter((call) => call.at(-1)?.includes("mkdir /run/orly-burst/launched"))).toHaveLength(2);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=0 /);
  });

  test("the launcher discards a script that arrived short, and keeps one that arrived whole", () => {
    const directory = mkdtempSync(join(tmpdir(), "orly-launch-"));
    try {
      const script = "echo whole\n";
      const launch = (input: string) => Bun.spawnSync(["bash", "-c", launchScript(Buffer.byteLength(script)).replaceAll("/run/orly-burst", directory)], { stdin: new Blob([input]), stdout: "ignore", stderr: "ignore" }).exitCode;

      expect(launch(script.slice(0, 4))).toBe(UPLOAD_CUT);
      expect(existsSync(join(directory, "launched"))).toBe(false);
      expect(existsSync(join(directory, "job.part"))).toBe(false);
      expect(launch(script)).toBe(0);
      expect(existsSync(join(directory, "launched"))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("a launch is sent once: the job is started on the machine a single time", async () => {
    const run = e2eRun();

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    expect(recordedCalls(run.state).filter((call) => call.at(-1)?.includes("mkdir /run/orly-burst/launched"))).toHaveLength(1);
  });

  test("a machine that never answers again before the deadline leaves the lane interrupted, and the VM still goes", async () => {
    // Long enough that a loaded machine reaches the lost session before the deadline.
    const run = e2eRun({ ORLY_BURST_DEADLINE_MINUTES: "0.15" });
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ drops: { acceptance: 1 }, lost: ["acceptance"], sleepMs: 200 }));

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    const text = run.output.text();
    expect(text).toContain("lost its session to 100.64.0.1");
    expect(text).toMatch(/🔴 lane=acceptance could not reconnect to 100\.64\.0\.1 within \d+s/);
    expect(text).toMatch(/lane=acceptance .* exit=interrupted /);
    expect(run.api.vms.size).toBe(0);
    expect(run.tailnet.keys.size).toBe(0);
  });
});

describe("e2e start scripts", () => {
  test("a refused start script is named by its status alone, never by what TIR quoted back", async () => {
    const run = e2eRun();
    run.api.scriptStatus = 400;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toContain("E2E TIR POST /notebooks/init-script/ answered 400");
    expect(run.output.text()).not.toContain("tskey-fake-auth");
    expect(run.tailnet.keys.size).toBe(0);
  });

  test("a script whose create reply was lost is deleted by name, with a dead run's orphans; others stay", async () => {
    const run = e2eRun();
    run.api.lostReplies.add("/notebooks/init-script/");
    run.api.leftScript("obs-20200101000000-ab12-acceptance");
    const recent = `obs-${new Date().toISOString().replaceAll(/\D/g, "").slice(0, 14)}-cd34-acceptance`;
    run.api.leftScript(recent);
    run.api.leftScript("someone-elses-script");

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect([...run.api.scripts.values()].map((script) => script.name).sort()).toEqual([recent, "someone-elses-script"]);
    expect(run.output.text()).toMatch(/🟢 deleted TIR start script \d+ \(obs-\d{14}-[0-9a-f]{4}-acceptance\)/);
    expect(run.output.text()).toContain("(obs-20200101000000-ab12-acceptance)");
  });
});

describe("aws-spot on the tailnet", () => {
  test("an instance opens no inbound port and joins the tailnet from its user data", async () => {
    const run = await awsRun();

    expect(await burst(["acceptance", "--provider", "aws-spot"], run.dependencies)).toBe(0);
    expect(run.ec2.inputs("AuthorizeSecurityGroupIngress")).toHaveLength(0);
    const boot = Buffer.from(String(run.ec2.inputs("RunInstances")[0]?.UserData ?? ""), "base64").toString();
    expect(boot.split("\n")[0]).toBe("#!/bin/bash");
    expect(boot.match(/--hostname='([^']+)'/)?.[1]).toMatch(NODE);
    expect(run.tailnet.events).toEqual(["mint k1", expect.stringMatching(/^join k1 orly-burst-acceptance-/), "delete k1"]);
    expect(recordedCalls(run.state).every((call) => call.includes("admin@100.64.0.1"))).toBe(true);
    expect(run.output.text()).toContain("opens no inbound port; the run's instances are reached over the tailnet");
  });
});
