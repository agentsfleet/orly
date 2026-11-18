import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./index";
import { tirLabel } from "./e2e";
import { MACHINE_WAIT_MS, machineDeadline } from "./process";
import { DEBIAN_13 } from "./fake_tir";
import { API_KEY, AUTH_TOKEN, CREATE, e2eRun, LANES, machineScript, ONE_LANE, SECRETS, VM } from "./e2e-test-support";
import { burstDependencies, CALLER_ADDRESS, fields, recordedCalls, SECRET_VALUE } from "./test_support";
import { cleanupTemporaryDirectories, git, temporaryDirectory } from "../gates_test_support";

setDefaultTimeout(60_000);
afterEach(cleanupTemporaryDirectories);

describe("e2e lanes on TIR virtual machines", () => {
  test("lanes start at once as VMs reached over SSH, and every VM and the run's key are removed", async () => {
    const run = e2eRun();

    const code = await burst(LANES, run.dependencies);

    expect(code).toBe(0);
    const creates = run.api.callsTo("POST", CREATE);
    const deletes = run.api.callsTo("DELETE", VM);
    expect(creates).toHaveLength(2);
    expect(deletes).toHaveLength(2);
    const firstDelete = deletes[0];
    if (!firstDelete) throw new Error("no VM was deleted");
    expect(run.api.calls.indexOf(creates[1] ?? firstDelete)).toBeLessThan(run.api.calls.indexOf(firstDelete));
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
    git(run.root, "branch", branch);

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
    expect(recordedCalls(run.state).filter((call) => call.at(-1) === "true")).toHaveLength(3);
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
});
