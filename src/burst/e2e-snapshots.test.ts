import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./index";
import { CREATE, created, e2eRun, machineScript, ONE_LANE, SECRETS, SNAPSHOT_NAME } from "./e2e-test-support";
import { fields, REPOSITORY, snapshotOf } from "./test_support";
import { cleanupTemporaryDirectories } from "../gates_test_support";

setDefaultTimeout(60_000);
afterEach(cleanupTemporaryDirectories);

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

  test("lanes start from the newest ready snapshot of the configured image unless told otherwise", async () => {
    const run = e2eRun();
    run.api.snapshot(snapshotOf("Debian 13", "20261101000000000"), 7001);
    run.api.snapshot(snapshotOf("Debian 13", "20261115000000000"), 7002);
    run.api.snapshot(snapshotOf("Debian 13", "20261116000000000"), 7003, "pending");
    run.api.snapshot(snapshotOf("Ubuntu 22.04", "20261117000000000"), 7005);
    run.api.snapshot(`orly-burst-${REPOSITORY}-app-20261201000000000-1234abcd`, 7004);

    await burst(ONE_LANE, run.dependencies);
    await burst([...ONE_LANE, "--no-snapshot"], run.dependencies);

    const bodies = created(run.api);
    expect(bodies[0]).toMatchObject({ snapshot_id: 7002, image_version_id: 106, disk_size_in_gb: 100 });
    expect(bodies[1]).not.toHaveProperty("snapshot_id");
  });

  test("burst.e2e.image is the base image: a lane starts from its newest snapshot, a capture warms from it", async () => {
    const run = e2eRun({}, { e2e: { image: "Ubuntu 22.04" } });
    run.api.snapshot(snapshotOf("Ubuntu 22.04", "20261115000000000"), 7002);
    run.api.snapshot(snapshotOf("Debian 13", "20261116000000000"), 7003);

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

  test("pruning keeps the newest snapshot of the configured image, deletes the rest of this repository's, and rents nothing", async () => {
    const run = e2eRun();
    for (const [stamp, id] of [["20261101000000000", 7001], ["20261102000000000", 7002], ["20261103000000000", 7003]] as const) run.api.snapshot(snapshotOf("Debian 13", stamp), id);
    run.api.snapshot(snapshotOf("Ubuntu 22.04", "20261104000000000"), 7004);
    run.api.snapshot(`orly-burst-${REPOSITORY}-app-20261201000000000-1234abcd`, 7006);

    expect(await burst(["snapshot", "--prune", "--provider", "e2e"], run.dependencies)).toBe(0);
    expect(run.api.callsTo("DELETE", /^\/notebooks\/vm\/snapshots\//).map((call) => call.path)).toEqual(["/notebooks/vm/snapshots/7004/", "/notebooks/vm/snapshots/7002/", "/notebooks/vm/snapshots/7001/"]);
    expect(run.api.snapshots.map((snapshot) => snapshot.id).sort()).toEqual([7003, 7006]);
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
