import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./index";
import { UNSCOPED_ENVIRONMENT } from "../git_env";
import { FakeTir } from "./fake_tir";
import { created, CREDENTIALS, e2eRun, LANES, machineScript, ONE_LANE } from "./e2e-test-support";
import { burstDependencies, burstEnvironment, burstRepository, fakeBin } from "./test_support";
import { cleanupTemporaryDirectories, git, gitOutput } from "../gates_test_support";

setDefaultTimeout(60_000);
afterEach(cleanupTemporaryDirectories);

describe("e2e cleanup, failures and what a warm machine is sent", () => {
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
      const verified = Bun.spawnSync(["git", "bundle", "verify", bundle], { cwd: run.root, env: UNSCOPED_ENVIRONMENT, stderr: "pipe", stdout: "pipe" });
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
        const verified = Bun.spawnSync(["git", "bundle", "verify", sent(run) ?? ""], { cwd: run.root, env: UNSCOPED_ENVIRONMENT, stderr: "pipe", stdout: "pipe" });
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

  test("a refused create starts nothing and looks for no VM", async () => {
    const run = e2eRun();
    run.api.createStatus = 400;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toMatch(/lane=acceptance provider=e2e machine=none minutes=0 cost≈none exit=unlaunched /);
    expect(run.api.callsTo("GET", /^\/notebooks\/$/)).toHaveLength(0);
    expect(run.api.keys.size).toBe(0);
  });

  test("a VM whose create reply was lost is found by name and deleted before the key", async () => {
    const run = e2eRun();
    run.api.lostCreate = true;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toMatch(/lane=acceptance provider=e2e machine=none minutes=0 cost≈none exit=unlaunched /);
    expect(run.output.text()).toMatch(/🟢 deleted VM 5001 \(orly-burst-acceptance-\w{4}\), whose create reply was lost/);
    expect(run.api.vms.size).toBe(0);
    expect(run.api.keys.size).toBe(0);
  });

  test("TIR busy while a VM boots is waited out, not a failed lane", async () => {
    const run = e2eRun();
    run.api.busyPolls = 2;

    expect(await burst(ONE_LANE, run.dependencies)).toBe(0);
    expect(run.output.text()).not.toContain("🔴");
  });

  test("a key TIR no longer lists is reported for a person, never as deleted", async () => {
    const run = e2eRun();
    run.api.hideKeys = true;

    await burst(ONE_LANE, run.dependencies);
    expect(run.output.text()).toMatch(/🔴 could not delete TIR key orly-burst-\S+: TIR lists no such key; delete it by hand/);
    expect(run.output.text()).not.toContain("🟢 deleted TIR key");
  });

  test("a failed burst.setup reports the lane as not run, never as its exit code", async () => {
    const run = e2eRun();
    await Bun.write(join(run.state, "scenario.json"), JSON.stringify({ exits: { acceptance: 254 } }));

    expect(await burst(ONE_LANE, run.dependencies)).toBe(1);
    expect(run.output.text()).toMatch(/🔴 lane=acceptance the machine or burst.setup failed before the lane started; see \S+run\.log/);
    expect(run.output.text()).toMatch(/lane=acceptance .* exit=not_run /);
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

  test.each(["/ssh_keys/", "/security_groups/"])("a create of %s whose reply was lost is still deleted by name", async (path) => {
    const run = e2eRun();
    run.api.lostReplies.add(path);

    await expect(burst(ONE_LANE, run.dependencies)).rejects.toThrow("answered 504");
    expect(run.api.keys.size).toBe(0);
    expect(run.api.groups.size).toBe(0);
    expect(created(run.api)).toHaveLength(0);
  });
});
