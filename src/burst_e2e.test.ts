import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./burst";
import { burstDependencies, burstEnvironment, burstRepository, fakeBin, FakeE2e, fields, recordedCalls, REPOSITORY, SECRET_VALUE } from "./burst_test_support";
import { cleanupTemporaryDirectories, temporaryDirectory } from "./gates_test_support";

const API_KEY = "e2e_test_key_00000000";
const AUTH_TOKEN = "e2e_test_token_00000000";
const CREDENTIALS = { E2E_API_KEY: API_KEY, E2E_AUTH_TOKEN: AUTH_TOKEN, E2E_PROJECT_ID: "12345" };
const SECRETS = { secrets: { API_TOKEN: "op://Burst Vault/api/credential" } };
const LANES = ["acceptance", "integration", "--provider", "e2e"];
const SNAPSHOT_NAME = new RegExp(`^orly-burst-${REPOSITORY}-\\d{12}$`);

setDefaultTimeout(60_000);
afterEach(cleanupTemporaryDirectories);

function e2eRun(extra: Record<string, string> = {}, burstConfig: Record<string, unknown> = {}) {
  const root = burstRepository(burstConfig);
  const { bin, state } = fakeBin();
  const api = new FakeE2e();
  const env = burstEnvironment(bin, state, { ...CREDENTIALS, ...extra });
  return { root, state, api, env, ...burstDependencies(root, env, api.fetch) };
}

function nodeScript(state: string): string {
  const node = [...new Bun.Glob("203.0.113.*").scanSync({ cwd: state, onlyFiles: false })][0] ?? "";
  return readFileSync(join(state, node, "job.sh"), "utf8");
}

describe("e2e lanes", () => {
  test("lanes start at once from the base image and every node is deleted", async () => {
    const run = e2eRun();

    const code = await burst(LANES, run.dependencies);

    expect(code).toBe(0);
    const creates = run.api.callsTo("POST", /^\/nodes\/$/);
    const deletes = run.api.callsTo("DELETE", /^\/nodes\/\d+\/$/);
    expect(creates).toHaveLength(2);
    expect(deletes).toHaveLength(2);
    expect(run.api.calls.indexOf(creates[1]!)).toBeLessThan(run.api.calls.indexOf(deletes[0]!));
    expect(run.api.nodes.size).toBe(0);
    const body = fields(creates[0]?.body);
    expect(body.plan).toBe("C3-16vCPU-32RAM-200DISK-C3-Onetemplate-Ubuntu24.04-Delhi");
    expect(body.image).toBe("Ubuntu-24.04-Distro");
    expect(body.is_saved_image).toBe(false);
    expect(body.label).toBe("orly-burst");
    expect(Array.isArray(body.ssh_keys) ? String(body.ssh_keys[0]) : "").toStartWith("ssh-ed25519 ");
    expect(creates[0]?.query).toEqual({ project_id: "12345", apikey: API_KEY, location: "Delhi" });
    expect(creates[0]?.authorization).toBe(`Bearer ${AUTH_TOKEN}`);
    const text = run.output.text();
    expect(text).toContain("[acceptance] lane acceptance ran");
    expect(text).toContain("[integration] lane integration ran");
    expect(text).toMatch(/orly burst: lane=acceptance provider=e2e machine=C3\.32GB minutes=\d+ cost≈₹25\/h \+ GST \(billed hourly\) exit=0 evidence=\S+/);
    expect(text).toContain("orly burst: total provider=e2e lanes=2 passed=2 failed=0");
    expect(text).not.toContain(API_KEY);
  });

  test("secrets are read on the caller and reach the lane only through the session's input", async () => {
    const run = e2eRun({}, SECRETS);

    await burst(["acceptance", "--provider", "e2e"], run.dependencies);

    const job = nodeScript(run.state);
    expect(job.indexOf("  step 'true'")).toBeLessThan(job.indexOf(`  export API_TOKEN='${SECRET_VALUE}'`));
    expect(job.indexOf(`  export API_TOKEN='${SECRET_VALUE}'`)).toBeLessThan(job.lastIndexOf("  step 'true'"));
    expect(readFileSync(join(run.state, "op-calls.txt"), "utf8")).toBe("read --no-newline op://Burst Vault/api/credential\n");
    expect(JSON.stringify(recordedCalls(run.state))).not.toContain(SECRET_VALUE);
    expect(run.output.text()).not.toContain(SECRET_VALUE);
    const evidence = run.output.text().match(/evidence=(\S+)/)?.[1] ?? "";
    expect(readFileSync(join(evidence, "run.log"), "utf8")).toBe("== packages\nlane acceptance ran\n");
    expect(readFileSync(join(evidence, "report/summary.txt"), "utf8")).toBe("lane acceptance results\n");
    expect(existsSync(join(evidence, "..", "id_ed25519"))).toBe(false);
  });

  test("a secret already in the caller's environment is used without op", async () => {
    const run = e2eRun({ API_TOKEN: "preset-value-0000" }, SECRETS);

    await burst(["acceptance", "--provider", "e2e"], run.dependencies);

    expect(nodeScript(run.state)).toContain("  export API_TOKEN='preset-value-0000'");
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
  });

  test("a secret that cannot be read stops the run before any node exists", async () => {
    const run = e2eRun({ FAKE_OP_FAIL: "1" }, SECRETS);

    await expect(burst(LANES, run.dependencies)).rejects.toThrow("could not read the secret for API_TOKEN");
    expect(run.api.callsTo("POST", /^\/nodes\/$/)).toHaveLength(0);
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

    const code = await burst(["acceptance", "--provider", "e2e"], run.dependencies);

    expect(code).toBe(0);
    const node = [...new Bun.Glob("203.0.113.*").scanSync({ cwd: run.state, onlyFiles: false })][0] ?? "";
    const listed = Bun.spawnSync(["tar", "-tzf", join(run.state, node, "input-TOOLBOX_DIR.tgz")], { stdout: "pipe" }).stdout.toString();
    expect(listed).toContain("./toolbox-0000.erofs");
    const job = nodeScript(run.state);
    const exported = job.indexOf("  export TOOLBOX_DIR='/tmp/orly-burst-inputs/TOOLBOX_DIR'");
    expect(exported).toBeGreaterThan(job.indexOf("  step 'true'"));
    expect(exported).toBeLessThan(job.lastIndexOf("  step 'true'"));
    expect(job).not.toContain(toolbox);
  });

  test("a declared directory that is not set is refused before any node exists", async () => {
    const run = e2eRun({}, { directories: ["TOOLBOX_DIR"] });

    await expect(burst(["acceptance", "--provider", "e2e"], run.dependencies)).rejects.toThrow("burst.directories names TOOLBOX_DIR; set it to a directory on this machine");
    expect(run.api.callsTo("POST", /^\/nodes\/$/)).toHaveLength(0);
  });

  test("a lane's own exit code is the run's, and a dropped session is interrupted", async () => {
    const run = e2eRun();
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ exits: { acceptance: 3, integration: "drop" } }));

    const code = await burst(LANES, run.dependencies);

    expect(code).toBe(3);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=3 /);
    expect(run.output.text()).toMatch(/lane=integration .* exit=interrupted /);
    expect(run.api.nodes.size).toBe(0);
  });

  test("a lane past the deadline is stopped and its node deleted", async () => {
    const run = e2eRun({ ORLY_BURST_DEADLINE_MINUTES: "0.01" });
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ sleepMs: 2_000 }));

    const code = await burst(["acceptance", "--provider", "e2e"], run.dependencies);

    expect(code).toBe(1);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=deadline /);
    expect(run.api.nodes.size).toBe(0);
  });

  test("a cancelled run deletes the node it started", async () => {
    const root = burstRepository();
    const { bin, state } = fakeBin();
    const api = new FakeE2e();
    const controller = new AbortController();
    await Bun.write(join(state, "scenario.json"), JSON.stringify({ sleepMs: 2_000 }));
    const { dependencies, output } = burstDependencies(root, burstEnvironment(bin, state, CREDENTIALS), api.fetch, controller.signal);
    setTimeout(() => controller.abort(), 1_500);

    const code = await burst(["acceptance", "--provider", "e2e"], dependencies);

    expect(code).toBe(1);
    expect(output.text()).toMatch(/exit=cancelled /);
    expect(api.nodes.size).toBe(0);
  });

  test("a refused create starts nothing; a lost reply names the node to check", async () => {
    for (const [status, warned] of [[400, false], [502, true]] as const) {
      const run = e2eRun();
      run.api.createStatus = status;

      const code = await burst(["acceptance", "--provider", "e2e"], run.dependencies);

      expect(code).toBe(1);
      expect(run.output.text()).toMatch(/lane=acceptance provider=e2e machine=none minutes=0 cost≈none exit=unlaunched /);
      expect(run.output.text().includes("E2E may have created node orly-burst-acceptance-")).toBe(warned);
      expect(run.api.callsTo("DELETE", /^\/nodes\//)).toHaveLength(0);
    }
  });

  test("--keep leaves the node and the key", async () => {
    const run = e2eRun();

    await burst(["acceptance", "--provider", "e2e", "--keep"], run.dependencies);

    expect(run.api.nodes.size).toBe(1);
    expect(run.output.text()).toContain("--keep left e2e machine 4001 at 203.0.113.1");
    const key = run.output.text().match(/kept the run's SSH key at (\S+);/)?.[1] ?? "";
    expect(existsSync(key)).toBe(true);
    expect(nodeScript(run.state)).not.toContain("shutdown -h");
  });

  test("missing credentials are named before any request", async () => {
    const run = e2eRun({ E2E_AUTH_TOKEN: "" });

    await expect(burst(LANES, run.dependencies)).rejects.toThrow("set E2E_AUTH_TOKEN for this provider");
    expect(run.api.calls).toHaveLength(0);
  });
});

describe("e2e snapshots", () => {
  test("a snapshot warms a base node with no secret, saves it stopped and deletes the node", async () => {
    const run = e2eRun({}, { ...SECRETS, warm: [["make", "build"]] });

    const code = await burst(["snapshot", "--provider", "e2e"], run.dependencies);

    expect(code).toBe(0);
    const job = nodeScript(run.state);
    expect(job).toContain("BURST_MODE='warm'");
    expect(job).toContain("  step 'make' 'build'\n  warmed\n");
    expect(job).toContain("  shutdown -h +120 ");
    expect(job).not.toContain("export API_TOKEN");
    expect(job).not.toContain("export CI=");
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
    const actions = run.api.callsTo("PUT", /\/actions\/$/).map((call) => fields(call.body));
    expect(actions.map((action) => action.type)).toEqual(["power_off", "save_images"]);
    expect(String(actions[1]?.name)).toMatch(SNAPSHOT_NAME);
    const order = run.api.calls.map((call) => `${call.method} ${call.path}`);
    expect(order.indexOf("PUT /nodes/4001/actions/")).toBeLessThan(order.lastIndexOf("DELETE /nodes/4001/"));
    expect(run.api.nodes.size).toBe(0);
    expect(run.output.text()).toMatch(new RegExp(`orly burst: snapshot provider=e2e id=\\d+ name=orly-burst-${REPOSITORY}-\\d{12} size=40\\.0GB storage≈₹200/month \\+ GST`));
  });

  test("lanes start from the repository's newest ready snapshot unless told otherwise", async () => {
    const run = e2eRun();
    run.api.savedImage(`orly-burst-${REPOSITORY}-202611010000`, 7001);
    run.api.savedImage(`orly-burst-${REPOSITORY}-202611150000`, 7002);
    run.api.savedImage(`orly-burst-${REPOSITORY}-202611160000`, 7003, "Creating");
    run.api.savedImage("orly-burst-other-202612010000", 7004);
    // Another repository whose name starts with this one's sorts first.
    run.api.savedImage(`orly-burst-${REPOSITORY}-app-202612010000`, 7005);

    await burst(["acceptance", "--provider", "e2e"], run.dependencies);
    await burst(["acceptance", "--provider", "e2e", "--no-snapshot"], run.dependencies);

    const bodies = run.api.callsTo("POST", /^\/nodes\/$/).map((call) => fields(call.body));
    expect(bodies[0]).toMatchObject({ is_saved_image: true, saved_image_template_id: 7002, image: "Ubuntu-24.04-Distro" });
    expect(bodies[1]).toMatchObject({ is_saved_image: false, saved_image_template_id: null });
  });

  test("ORLY_BURST_E2E_IMAGE picks a saved image by name, or an OS image", async () => {
    const run = e2eRun({ ORLY_BURST_E2E_IMAGE: "hand-made" });
    run.api.savedImage("hand-made", 7100);

    await burst(["acceptance", "--provider", "e2e"], run.dependencies);

    expect(run.api.callsTo("POST", /^\/nodes\/$/)[0]?.body).toMatchObject({ is_saved_image: true, saved_image_template_id: 7100 });
  });

  test("pruning keeps the newest snapshots of this repository only", async () => {
    const run = e2eRun();
    for (const [stamp, template] of [["202611010000", 7001], ["202611020000", 7002], ["202611030000", 7003], ["202611040000", 7004]] as const) {
      run.api.savedImage(`orly-burst-${REPOSITORY}-${stamp}`, template);
    }
    run.api.savedImage("orly-burst-other-202611010000", 7005);
    run.api.savedImage(`orly-burst-${REPOSITORY}-app-202612010000`, 7006);

    const code = await burst(["snapshot", "--prune", "--provider", "e2e"], run.dependencies);

    expect(code).toBe(0);
    expect(run.api.callsTo("DELETE", /^\/images\//).map((call) => call.path)).toEqual(["/images/8002/", "/images/8001/"]);
    expect(run.api.images.map((image) => image.name).sort()).toEqual([
      `orly-burst-${REPOSITORY}-202611030000`, `orly-burst-${REPOSITORY}-202611040000`, `orly-burst-${REPOSITORY}-app-202612010000`, "orly-burst-other-202611010000",
    ]);
    expect(run.api.callsTo("POST", /^\/nodes\/$/)).toHaveLength(0);
  });
});
