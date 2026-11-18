import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./index";
import { tirLabel } from "./e2e";
import { MACHINE_WAIT_MS, machineDeadline } from "./process";
import { DEBIAN_13, FakeTir } from "./fake_tir";
import { burstDependencies, burstEnvironment, burstRepository, CALLER_ADDRESS, fakeBin, fields, recordedCalls, REPOSITORY, SECRET_VALUE } from "./test_support";
import { cleanupTemporaryDirectories, git, gitOutput, temporaryDirectory } from "../gates_test_support";

const API_KEY = "e2e_test_key_00000000";
const AUTH_TOKEN = "e2e_test_token_00000000";
const CREDENTIALS = { E2E_API_KEY: API_KEY, E2E_AUTH_TOKEN: AUTH_TOKEN, E2E_PROJECT_ID: "12345" };
const SECRETS = { secrets: { API_TOKEN: "op://Burst Vault/api/credential" } };
const LANES = ["acceptance", "integration", "--provider", "e2e"];
const ONE_LANE = ["acceptance", "--provider", "e2e"];
const SNAPSHOT_NAME = new RegExp(`^orly-burst-${REPOSITORY}-\\d{17}-[0-9a-f]{8}$`);
const CREATE = /^\/notebooks\/$/;
const VM = /^\/notebooks\/\d+\/$/;

setDefaultTimeout(60_000);
afterEach(cleanupTemporaryDirectories);

function e2eRun(extra: Record<string, string> = {}, burstConfig: Record<string, unknown> = {}) {
  const root = burstRepository(burstConfig);
  const { bin, state } = fakeBin();
  const api = new FakeTir();
  const env = burstEnvironment(bin, state, { ...CREDENTIALS, ...extra });
  return { root, state, api, env, ...burstDependencies(root, env, api.fetch) };
}

function machineScript(state: string): string {
  const machine = [...new Bun.Glob("203.0.113.*").scanSync({ cwd: state, onlyFiles: false })][0] ?? "";
  return readFileSync(join(state, machine, "job.sh"), "utf8");
}

function created(api: FakeTir): Array<Record<string, unknown>> {
  return api.callsTo("POST", CREATE).map((call) => fields(call.body));
}

describe("e2e lanes on TIR virtual machines", () => {
  test("lanes start at once as VMs reached over SSH, and every VM and the run's key are removed", async () => {
    const run = e2eRun();

    const code = await burst(LANES, run.dependencies);

    expect(code).toBe(0);
    const creates = run.api.callsTo("POST", CREATE);
    const deletes = run.api.callsTo("DELETE", VM);
    expect(creates).toHaveLength(2);
    expect(deletes).toHaveLength(2);
    expect(run.api.calls.indexOf(creates[1] ?? deletes[0]!)).toBeLessThan(run.api.calls.indexOf(deletes[0]!));
    expect(run.api.vms.size).toBe(0);
    const body = fields(creates[0]?.body);
    expect(body).toMatchObject({ kind: "vm", image_type: "pre-built", image_version_id: DEBIAN_13, sku_item_price_id: 3, disk_size_in_gb: 100, quantity: 1, security_group_id: 700 });
    expect(body).not.toHaveProperty("snapshot_id");
    const key = Array.isArray(body.public_key) ? String(body.public_key[0]) : "";
    expect(key).toStartWith("ssh-ed25519 ");
    const registered = run.api.callsTo("POST", /^\/ssh_keys\/$/);
    expect(fields(registered[0]?.body).ssh_key).toBe(key);
    expect(registered[0]?.query).toEqual({ location: "Delhi", apikey: API_KEY });
    expect(run.api.keys.size).toBe(0);
    expect(creates[0]?.query).toEqual({ project_id: "12345", location: "Delhi", apikey: API_KEY });
    expect(creates[0]?.authorization).toBe(`Bearer ${AUTH_TOKEN}`);
    const group = fields(run.api.callsTo("POST", /^\/security_groups\/$/)[0]?.body);
    expect(String(group.name)).toMatch(/^orly-burst-feat-burst-fixture-\d{14}-[0-9a-f]{4}$/);
    expect(group.rules).toEqual([
      { rule_type: "inbound", protocol: "TCP", protocol_type: "CustomTCP", network_type: "manual", cidr_ip: CALLER_ADDRESS, cidr_subnet: 32, ports: [22], description: "SSH from the orly burst caller" },
      { rule_type: "outbound", protocol: "All", protocol_type: "AllTraffic", network_type: "any", ports: [], description: "All traffic from the orly burst machine" },
    ]);
    expect(run.api.groups.size).toBe(0);
    const order = run.api.calls.map((call) => `${call.method} ${call.path}`);
    expect(order.lastIndexOf("DELETE /notebooks/5002/")).toBeLessThan(order.indexOf("DELETE /security_groups/700/"));
    const text = run.output.text();
    expect(text).toContain(`admits SSH from ${CALLER_ADDRESS} only`);
    expect(text).toContain("[acceptance] lane acceptance ran");
    expect(text).toMatch(/orly burst: lane=acceptance provider=e2e machine=C3\.32GB minutes=\d+ cost≈₹25\/h \+ GST \(billed hourly\) exit=0 evidence=\S+/);
    expect(text).toContain("orly burst: total provider=e2e lanes=2 passed=2 failed=0");
    expect(text).toMatch(/orly burst: ⏳ sending feat\/burst-fixture \(\d+\.\d MB\) to 5001…/);
    expect(text).toMatch(/orly burst: 🟢 sent feat\/burst-fixture to 5001 in \d+s/);
    expect(text).toContain("orly burst: 🟢 e2e machine 5001 is deleted");
    expect(text).toMatch(/orly burst: 🟢 deleted TIR key orly-burst-/);
    expect(text).toContain("orly burst: 🟢 deleted TIR security group 700");
    expect(text).not.toContain(API_KEY);
  });

  test("a branch name past 19 characters still fits TIR's 50-character key label", async () => {
    const run = e2eRun();
    const branch = "feat/m246-tenant-owned-runners";
    expect(Bun.spawnSync(["git", "-C", run.root, "branch", branch]).exitCode).toBe(0);

    expect(await burst(["acceptance", "--provider", "e2e", "--ref", branch], run.dependencies)).toBe(0);
    const label = String(fields(run.api.callsTo("POST", /^\/ssh_keys\/$/)[0]?.body).label);
    expect(label).toMatch(/^orly-burst-feat-m246-tenant-ow-\d{14}-[0-9a-f]{4}$/);
    expect(label.length).toBeLessThanOrEqual(50);
    expect(run.api.keys.size).toBe(0);
  });

  test("tirLabel keeps the run id's stamp and suffix and never ends the ref part in a hyphen", () => {
    expect(tirLabel("feat-burst-fixture-20261117120000-ab12")).toBe("orly-burst-feat-burst-fixture-20261117120000-ab12");
    expect(tirLabel("feat-m246-tenant-owned-runners-20261117120000-ab12")).toBe("orly-burst-feat-m246-tenant-ow-20261117120000-ab12");
    expect(tirLabel("feat-m246-tenant-o-x-20261117120000-ab12").length).toBeLessThanOrEqual(50);
    expect(tirLabel("abcdefghijklmnopqr--20261117120000-ab12")).toBe("orly-burst-abcdefghijklmnopqr-20261117120000-ab12");
  });

  test("a VM TIR reports as ready is booted, and each status it passes through is written once", async () => {
    const run = e2eRun();

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    const text = run.output.text();
    expect(text).toContain("[acceptance] lane acceptance ran");
    expect(text.match(/VM 5001 is waiting/g)).toHaveLength(1);
    expect(text.match(/VM 5001 is ready/g)).toHaveLength(1);
  });

  test("a VM TIR reports as failed ends the lane at its first poll, and the VM still goes", async () => {
    const run = e2eRun();
    run.api.bootStatus = "error";

    await burst(ONE_LANE, run.dependencies);
    expect(run.output.text()).toContain("TIR reports error");
    expect(run.api.callsTo("GET", VM).length).toBeLessThan(5);
    expect(run.api.vms.size).toBe(0);
    expect(run.api.keys.size).toBe(0);
  });

  test("removal waits for TIR to report the VM gone before the key is deleted", async () => {
    const run = e2eRun();
    run.api.deleteLag = 6;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    const order = run.api.calls.map((call) => `${call.method} ${call.path}`);
    const lastVmRead = order.lastIndexOf("GET /notebooks/5001/");
    expect(lastVmRead).toBeGreaterThan(order.indexOf("DELETE /notebooks/5001/"));
    expect(lastVmRead).toBeLessThan(order.findIndex((call) => call.startsWith("DELETE /ssh_keys/")));
    expect(run.api.callsTo("DELETE", /^\/ssh_keys\/\d+\/$/)).toHaveLength(1);
    expect(run.api.keys.size).toBe(0);
  });

  test("a group delete that TIR refuses at first is retried until the group is gone", async () => {
    const run = e2eRun();
    run.api.groupDeleteFailures = 2;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    expect(run.api.callsTo("DELETE", /^\/security_groups\/\d+\/$/)).toHaveLength(3);
    expect(run.api.groups.size).toBe(0);
  });

  test("a caller address that cannot be learnt stops the run before any VM, and the key still goes", async () => {
    const run = e2eRun();
    const answer = run.api.fetch;
    const { dependencies } = burstDependencies(run.root, run.env, async (input, init) => String(input).includes("checkip") ? new Response("", { status: 503 }) : answer(input, init));

    await expect(burst(ONE_LANE, dependencies)).rejects.toThrow("could not learn this machine's public IPv4 address");
    expect(run.api.callsTo("POST", CREATE)).toHaveLength(0);
    expect(run.api.groups.size).toBe(0);
    expect(run.api.keys.size).toBe(0);
  });

  test("secrets are read on the caller and reach the lane only through the session's input", async () => {
    const run = e2eRun({}, SECRETS);

    await burst(ONE_LANE, run.dependencies);

    const job = machineScript(run.state);
    expect(job.indexOf("  step 'true'")).toBeLessThan(job.indexOf(`  export API_TOKEN='${SECRET_VALUE}'`));
    expect(job.indexOf(`  export API_TOKEN='${SECRET_VALUE}'`)).toBeLessThan(job.lastIndexOf("  step 'true'"));
    expect(JSON.stringify(recordedCalls(run.state))).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(run.api.calls)).not.toContain(SECRET_VALUE);
    expect(run.output.text()).not.toContain(SECRET_VALUE);
    const evidence = run.output.text().match(/evidence=(\S+)/)?.[1] ?? "";
    expect(readFileSync(join(evidence, "run.log"), "utf8")).toBe("== packages\nlane acceptance ran\n");
    expect(readFileSync(join(evidence, "report/summary.txt"), "utf8")).toBe("lane acceptance results\n");
    expect(existsSync(join(evidence, "..", "id_ed25519"))).toBe(false);
  });

  test("a secret already in the caller's environment is used without op", async () => {
    const run = e2eRun({ API_TOKEN: "preset-value-0000" }, SECRETS);

    await burst(ONE_LANE, run.dependencies);

    expect(machineScript(run.state)).toContain("  export API_TOKEN='preset-value-0000'");
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
  });

  test("a secret that cannot be read stops the run before any key or VM exists", async () => {
    const run = e2eRun({ FAKE_OP_FAIL: "1" }, SECRETS);

    await expect(burst(LANES, run.dependencies)).rejects.toThrow("could not read the secret for API_TOKEN");
    expect(run.api.callsTo("POST", /^\/(?:notebooks|ssh_keys)\/$/)).toHaveLength(0);
    expect([...new Bun.Glob("**/id_ed25519*").scanSync(join(run.state, "out"))]).toEqual([]);
  });

  test("an undeclared lane is refused before a key pair or a bundle exists", async () => {
    const run = e2eRun();

    await expect(burst(["smoke", "--provider", "e2e"], run.dependencies)).rejects.toThrow("unknown lane smoke");
    expect(existsSync(join(run.state, "out"))).toBe(false);
    expect(run.api.calls).toHaveLength(0);
  });

  test("a declared directory travels over the session and is pointed at for the lane only", async () => {
    const toolbox = temporaryDirectory();
    await Bun.write(join(toolbox, "toolbox-0000.erofs"), "fixture image\n");
    const run = e2eRun({ TOOLBOX_DIR: toolbox }, { directories: ["TOOLBOX_DIR"] });

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);

    const machine = [...new Bun.Glob("203.0.113.*").scanSync({ cwd: run.state, onlyFiles: false })][0] ?? "";
    const listed = Bun.spawnSync(["tar", "-tzf", join(run.state, machine, "input-TOOLBOX_DIR.tgz")], { stdout: "pipe" }).stdout.toString();
    expect(listed).toContain("./toolbox-0000.erofs");
    const job = machineScript(run.state);
    const exported = job.indexOf("  export TOOLBOX_DIR='/tmp/orly-burst-inputs/TOOLBOX_DIR'");
    expect(exported).toBeGreaterThan(job.indexOf("  step 'true'"));
    expect(exported).toBeLessThan(job.lastIndexOf("  step 'true'"));
    const left = [...new Bun.Glob("**/*").scanSync({ cwd: join(run.state, "out"), onlyFiles: true })];
    expect(left.filter((path) => /(repo\.bundle|\.tgz|id_ed25519(\.pub)?)$/.test(path))).toEqual([]);
    expect(left.some((path) => path.endsWith("acceptance/run.log"))).toBeTrue();
  });

  test("a declared directory that is not set is refused before any VM exists", async () => {
    const run = e2eRun({}, { directories: ["TOOLBOX_DIR"] });

    await expect(burst(ONE_LANE, run.dependencies)).rejects.toThrow("burst.directories names TOOLBOX_DIR; set it to a directory on this machine");
    expect(run.api.callsTo("POST", CREATE)).toHaveLength(0);
  });

  test("a lane's own exit code is the run's, and a dropped session is interrupted", async () => {
    const run = e2eRun();
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ exits: { acceptance: 3, integration: "drop" } }));

    expect(await burst(LANES, run.dependencies)).toBe(3);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=3 /);
    expect(run.output.text()).toMatch(/lane=integration .* exit=interrupted /);
    expect(run.api.vms.size).toBe(0);
  });

  test("a wait for a machine to boot or answer ends within ten minutes, or at the run's deadline when sooner", () => {
    expect(machineDeadline({ deadline: 1_000 + 60 * MACHINE_WAIT_MS }, 1_000)).toBe(1_000 + MACHINE_WAIT_MS);
    expect(machineDeadline({ deadline: 5_000 }, 1_000)).toBe(5_000);
  });

  test("a caller whose address changes mid-run ends the lane at once, naming both addresses", async () => {
    const run = e2eRun();
    run.api.callerMovesTo = "203.0.113.200";
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ unreachable: true }));

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    const text = run.output.text();
    expect(text).toContain("orly burst: ⏳ waiting for SSH on 203.0.113.");
    expect(text).toContain(`🔴 lane=acceptance this machine's address changed from ${CALLER_ADDRESS} to 203.0.113.200, and the run admits SSH from ${CALLER_ADDRESS} only; run it again from this network`);
    expect(recordedCalls(run.state).filter((call) => call.at(-1) === "true")).toHaveLength(1);
    expect(text).toMatch(/lane=acceptance .* exit=interrupted /);
    expect(run.api.vms.size).toBe(0);
  });

  test("SSH that never answers ends the wait with ssh's own error, and the VM still goes", async () => {
    const run = e2eRun({ ORLY_BURST_DEADLINE_MINUTES: "0.01" });
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ unreachable: true }));

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toMatch(/🔴 lane=acceptance the deadline passed while waiting for SSH to 203\.0\.113\.\d+: ssh: connect to host 203\.0\.113\.\d+ port 22: Operation timed out/);
    expect(run.output.text()).not.toContain("answers");
    expect(run.api.vms.size).toBe(0);
  });

  describe("what a warm machine is sent", () => {
    function sent(run: ReturnType<typeof e2eRun>): string | undefined {
      const machine = [...new Bun.Glob("203.0.113.*").scanSync({ cwd: run.state, onlyFiles: false })][0] ?? "";
      const bundle = join(run.state, machine, "repo.bundle");
      return existsSync(bundle) ? bundle : undefined;
    }

    test("a checkout at an older commit receives only the commits since it", async () => {
      const run = e2eRun();
      const older = gitOutput(run.root, "rev-parse", "HEAD");
      git(run.root, "commit", "-q", "--allow-empty", "-m", "test: a newer commit");
      const newer = gitOutput(run.root, "rev-parse", "HEAD");
      await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ warmCommit: older }));

      expect(await burst(ONE_LANE, run.dependencies)).toBe(0);

      const bundle = sent(run) ?? "";
      const verified = Bun.spawnSync(["git", "bundle", "verify", bundle], { cwd: run.root, stderr: "pipe", stdout: "pipe" });
      expect(`${verified.stdout}${verified.stderr}`).toContain(`requires this ref:\n${older}`);
      expect(run.output.text()).toContain(`sending feat/burst-fixture since ${older.slice(0, 7)}`);
      expect(machineScript(run.state)).toContain(`BURST_COMMIT='${newer}'`);
    });

    test("a checkout that already holds the commit receives nothing", async () => {
      const run = e2eRun();
      const head = gitOutput(run.root, "rev-parse", "HEAD");
      await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ warmCommit: head }));

      expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
      expect(sent(run)).toBeUndefined();
      expect(run.output.text()).toContain(`🟢 5001 already holds ${head.slice(0, 7)}; nothing to send`);
    });

    test("a checkout at a commit this repository lacks, or a cold machine, receives the whole ref", async () => {
      for (const scenario of [{ warmCommit: "f".repeat(40) }, {}]) {
        const run = e2eRun();
        await Bun.write(join(run.state, "scenario.json"), JSON.stringify(scenario));

        expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
        const verified = Bun.spawnSync(["git", "bundle", "verify", sent(run) ?? ""], { cwd: run.root, stderr: "pipe", stdout: "pipe" });
        expect(`${verified.stdout}${verified.stderr}`).toContain("records a complete history");
      }
    });
  });

  test("a lane past the deadline is stopped and its VM deleted", async () => {
    const run = e2eRun({ ORLY_BURST_DEADLINE_MINUTES: "0.01" });
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ sleepMs: 2_000 }));

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=deadline /);
    expect(run.api.vms.size).toBe(0);
  });

  test("a cancelled run deletes the VM it started and its key", async () => {
    const root = burstRepository();
    const { bin, state } = fakeBin();
    const api = new FakeTir();
    const controller = new AbortController();
    await Bun.write(join(state, "scenario.json"), JSON.stringify({ sleepMs: 2_000 }));
    const { dependencies, output } = burstDependencies(root, burstEnvironment(bin, state, CREDENTIALS), api.fetch, controller.signal);
    setTimeout(() => controller.abort(), 1_500);

    expect(await burst(ONE_LANE, dependencies)).toBe(1);
    expect(output.text()).toMatch(/exit=cancelled /);
    expect(api.vms.size).toBe(0);
    expect(api.keys.size).toBe(0);
  });

  test("a refused create starts nothing; a lost reply names the VM to check", async () => {
    for (const [status, warned] of [[400, false], [502, true]] as const) {
      const run = e2eRun();
      run.api.createStatus = status;

      expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
      expect(run.output.text()).toMatch(/lane=acceptance provider=e2e machine=none minutes=0 cost≈none exit=unlaunched /);
      expect(run.output.text().includes("TIR may have created VM orly-burst-acceptance-")).toBe(warned);
      expect(run.api.callsTo("DELETE", VM)).toHaveLength(0);
      expect(run.api.keys.size).toBe(0);
    }
  });

  test("--keep leaves the VM, its key in TIR and the private key", async () => {
    const run = e2eRun();

    await burst([...ONE_LANE, "--keep"], run.dependencies);

    expect(run.api.vms.size).toBe(1);
    expect(run.api.keys.size).toBe(1);
    expect(run.api.groups.size).toBe(1);
    expect(run.output.text()).toContain("--keep left e2e machine 5001 at 203.0.113.1");
    expect(run.output.text()).toContain("--keep left TIR key orly-burst-feat-burst-fixture-");
    const key = run.output.text().match(/kept the run's SSH key at (\S+);/)?.[1] ?? "";
    expect(existsSync(key)).toBe(true);
    expect(machineScript(run.state)).not.toContain("shutdown -h");
  });

  test("an unknown plan is refused with the plans TIR offers", async () => {
    const run = e2eRun({}, { e2e: { plan: "C3.999GB" } });

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toContain("TIR offers no hourly C3.999GB plan in Delhi; it offers: C3.32GB, C3.16GB");
  });

  test("missing credentials are named before any request", async () => {
    const run = e2eRun({ E2E_AUTH_TOKEN: "" });

    await expect(burst(LANES, run.dependencies)).rejects.toThrow("set E2E_AUTH_TOKEN for this provider");
    expect(run.api.calls).toHaveLength(0);
  });
});

describe("e2e snapshots on TIR", () => {
  test("a snapshot warms a base VM with no secret, saves it stopped and deletes the VM", async () => {
    const run = e2eRun({}, { ...SECRETS, warm: [["make", "build"]] });

    expect(await burst(["snapshot", "--provider", "e2e"], run.dependencies)).toBe(0);

    const job = machineScript(run.state);
    expect(job).toContain("BURST_MODE='warm'");
    expect(job).toContain("  step 'make' 'build'\n  warmed\n");
    expect(job).not.toContain("export API_TOKEN");
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
    const order = run.api.calls.map((call) => `${call.method} ${call.path}${call.query.action ? `?${call.query.action}` : ""}`);
    expect(order.indexOf("PUT /notebooks/5001/actions/?Stop")).toBeLessThan(order.indexOf("POST /notebooks/5001/snapshots/"));
    expect(order.indexOf("POST /notebooks/5001/snapshots/")).toBeLessThan(order.lastIndexOf("DELETE /notebooks/5001/"));
    expect(String(fields(run.api.callsTo("POST", /\/snapshots\/$/)[0]?.body).name)).toMatch(SNAPSHOT_NAME);
    expect(run.api.vms.size).toBe(0);
    const text = run.output.text();
    expect(text.indexOf("orly burst: 🟢 saved snapshot 9000\n")).toBeLessThan(text.indexOf("deleting e2e machine 5001"));
    expect(text).not.toContain("none of the declared results");
    expect(run.output.text()).toMatch(new RegExp(`orly burst: snapshot provider=e2e id=9000 name=orly-burst-${REPOSITORY}-\\d{17}-[0-9a-f]{8} state=ready size=100\\.0GB storage≈₹200/month \\+ GST`));
  });

  test("lanes start from the repository's newest ready snapshot unless told otherwise", async () => {
    const run = e2eRun();
    run.api.snapshot(`orly-burst-${REPOSITORY}-20261101000000000-1234abcd`, 7001);
    run.api.snapshot(`orly-burst-${REPOSITORY}-20261115000000000-1234abcd`, 7002);
    run.api.snapshot(`orly-burst-${REPOSITORY}-20261116000000000-1234abcd`, 7003, "pending");
    run.api.snapshot(`orly-burst-${REPOSITORY}-app-20261201000000000-1234abcd`, 7004);

    await burst(ONE_LANE, run.dependencies);
    await burst([...ONE_LANE, "--no-snapshot"], run.dependencies);

    const bodies = created(run.api);
    expect(bodies[0]).toMatchObject({ snapshot_id: 7002, image_version_id: 106, disk_size_in_gb: 100 });
    expect(bodies[1]).not.toHaveProperty("snapshot_id");
  });

  test("burst.e2e.image is the base image: a lane still starts from the newest snapshot, a capture warms from it", async () => {
    const run = e2eRun({}, { e2e: { image: "Ubuntu 22.04" } });
    run.api.snapshot(`orly-burst-${REPOSITORY}-20261115000000000-1234abcd`, 7002);

    await burst(ONE_LANE, run.dependencies);
    await burst([...ONE_LANE, "--no-snapshot"], run.dependencies);
    await burst(["snapshot", "--provider", "e2e"], run.dependencies);

    const [lane, cold, capture] = created(run.api);
    expect(lane).toMatchObject({ snapshot_id: 7002 });
    expect(cold).toMatchObject({ image_version_id: 107 });
    expect(cold).not.toHaveProperty("snapshot_id");
    expect(capture).toMatchObject({ image_version_id: 107 });
  });

  test("an image version TIR does not list is refused with the versions it has, before any VM", async () => {
    const run = e2eRun({}, { e2e: { image: "Ubuntu 26.04" } });

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toContain("TIR has no image Ubuntu 26.04; it has: Ubuntu 24.04-cuda13.0, Ubuntu 22.04, Ubuntu 24.04, Ubuntu 22.04");
    expect(run.api.callsTo("POST", CREATE)).toHaveLength(0);
    expect(run.api.groups.size).toBe(0);
  });

  test("pruning keeps the newest snapshots of this repository only, renting nothing", async () => {
    const run = e2eRun();
    for (const [stamp, id] of [["20261101000000000-1234abcd", 7001], ["20261102000000000-1234abcd", 7002], ["20261103000000000-1234abcd", 7003], ["20261104000000000-1234abcd", 7004]] as const) run.api.snapshot(`orly-burst-${REPOSITORY}-${stamp}`, id);
    run.api.snapshot(`orly-burst-${REPOSITORY}-app-20261201000000000-1234abcd`, 7006);

    expect(await burst(["snapshot", "--prune", "--provider", "e2e"], run.dependencies)).toBe(0);
    expect(run.api.callsTo("DELETE", /^\/notebooks\/vm\/snapshots\//).map((call) => call.path)).toEqual(["/notebooks/vm/snapshots/7002/", "/notebooks/vm/snapshots/7001/"]);
    expect(run.api.snapshots.map((snapshot) => snapshot.id).sort()).toEqual([7003, 7004, 7006]);
    expect(run.api.callsTo("POST", /^\/(?:notebooks|ssh_keys)\/$/)).toHaveLength(0);
  });

  test("a snapshot pending for several lists is waited out", async () => {
    const run = e2eRun();
    run.api.savingLists = 4;

    expect(await burst(["snapshot", "--provider", "e2e"], run.dependencies)).toBe(0);
    expect(run.api.callsTo("GET", /^\/notebooks\/vm\/snapshots\/$/).length).toBeGreaterThanOrEqual(5);
    expect(run.output.text()).toMatch(/snapshot provider=e2e id=9000 name=\S+ state=ready/);
  });

  test("a snapshot that fails fails the capture, and the VM still goes", async () => {
    const run = e2eRun();
    run.api.savedStatus = "failed";

    await expect(burst(["snapshot", "--provider", "e2e"], run.dependencies)).rejects.toThrow(/snapshot orly-burst-\S+ is failed/);
    expect(run.api.vms.size).toBe(0);
  });

  test("a snapshot still pending at the deadline is reported as pending, not as nothing saved", async () => {
    const run = e2eRun({ ORLY_BURST_DEADLINE_MINUTES: "0.05" });
    run.api.savingLists = 100_000;

    expect(await burst(["snapshot", "--provider", "e2e"], run.dependencies)).toBe(0);
    expect(run.output.text()).toMatch(/snapshot provider=e2e id=9000 name=\S+ state=pending/);
    expect(run.output.text()).toContain("e2e is still saving");
    expect(run.api.vms.size).toBe(0);
  });
});
