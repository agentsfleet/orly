import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { burst } from "./burst";
import { burstDependencies, burstEnvironment, burstRepository, fakeBin, SECRET_VALUE } from "./burst_test_support";
import { cleanupTemporaryDirectories } from "./gates_test_support";

const REFERENCE = "op://Burst Vault/api/credential";
const OP_TOKEN = "ops_test_00000000";
// Each command records what it saw, so a test reads the environment a step
// ran with rather than trusting the summary line.
const record = (file: string) => ["sh", "-c", `printf '%s|%s|%s' "\${API_TOKEN-unset}" "\${OP_SERVICE_ACCOUNT_TOKEN-unset}" "\${CI-unset}" > ${file}`];

setDefaultTimeout(30_000);
afterEach(cleanupTemporaryDirectories);

function hereRun(burstConfig: Record<string, unknown>, lanes: Record<string, string[][]>, extra: Record<string, string> = {}) {
  const root = burstRepository(burstConfig, lanes);
  const { bin, state } = fakeBin();
  const env = burstEnvironment(bin, state, { OP_SERVICE_ACCOUNT_TOKEN: OP_TOKEN, ...extra });
  return { root, state, ...burstDependencies(root, env) };
}

function seen(root: string, file: string): string {
  return readFileSync(join(root, file), "utf8");
}

describe("here lanes", () => {
  test("setup runs without any secret, and lanes get the resolved secrets through their environment only", async () => {
    const run = hereRun({ setup: [record("setup.seen")], secrets: { API_TOKEN: REFERENCE } }, { "burst.acceptance": [record("lane.seen")] });

    const code = await burst(["acceptance", "--provider", "here"], run.dependencies);

    expect(code).toBe(0);
    expect(seen(run.root, "setup.seen")).toBe("unset|unset|unset");
    expect(seen(run.root, "lane.seen")).toBe(`${SECRET_VALUE}|${OP_TOKEN}|1`);
    expect(readFileSync(join(run.state, "op-calls.txt"), "utf8")).toBe(`read --no-newline ${REFERENCE}\n`);
    expect(run.output.text()).not.toContain(SECRET_VALUE);
    expect(run.output.text()).toMatch(new RegExp(`orly burst: lane=acceptance provider=here machine=local minutes=\\d+ cost≈none exit=0 evidence=${run.root}`));
  });

  test("a secret the caller already holds is used as it is, without op", async () => {
    const run = hereRun({ secrets: { API_TOKEN: REFERENCE } }, { "burst.acceptance": [record("lane.seen")] }, { API_TOKEN: "preset-value-0000" });

    await burst(["acceptance", "--provider", "here"], run.dependencies);

    expect(seen(run.root, "lane.seen")).toStartWith("preset-value-0000|");
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
  });

  test("lanes run one after another, each reports, and the first failing code is the exit", async () => {
    const run = hereRun({}, { "burst.acceptance": [["sh", "-c", "echo first; exit 3"], ["sh", "-c", "touch never-ran"]], "burst.integration": [["sh", "-c", "echo second"]] });

    const code = await burst(["acceptance", "integration", "--provider", "here"], run.dependencies);

    expect(code).toBe(3);
    expect(existsSync(join(run.root, "never-ran"))).toBe(false);
    const text = run.output.text();
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
    expect(text).toMatch(/lane=acceptance .* exit=3 /);
    expect(text).toMatch(/lane=integration .* exit=0 /);
    expect(text).toContain("orly burst: total provider=here lanes=2 passed=1 failed=1");
  });

  test("the caller's own CI value wins over the lane default", async () => {
    const run = hereRun({}, { "burst.acceptance": [record("lane.seen")] }, { CI: "true" });

    await burst(["acceptance", "--provider", "here"], run.dependencies);

    expect(seen(run.root, "lane.seen")).toEndWith("|true");
  });

  test("a secret that cannot be read stops every lane and names the variable", async () => {
    const run = hereRun({ secrets: { API_TOKEN: REFERENCE } }, { "burst.acceptance": [["sh", "-c", "touch ran"]] }, { FAKE_OP_FAIL: "1" });

    const code = await burst(["acceptance", "--provider", "here"], run.dependencies);

    expect(code).toBe(1);
    expect(existsSync(join(run.root, "ran"))).toBe(false);
    expect(run.output.text()).toContain("orly burst: could not read the secret for API_TOKEN: [ERROR] could not read secret; no lane ran");
    expect(run.output.text()).toMatch(/exit=not_run /);
  });

  test("a failed setup resolves no secret and runs no lane", async () => {
    const run = hereRun({ setup: [["sh", "-c", "exit 7"]], secrets: { API_TOKEN: REFERENCE } }, {});

    const code = await burst(["acceptance", "--provider", "here"], run.dependencies);

    expect(code).toBe(1);
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
    expect(run.output.text()).toContain("burst.setup did not finish: exit=7; no lane ran");
  });

  test("a command missing from PATH is not run, not a crash", async () => {
    const run = hereRun({}, { "burst.acceptance": [["orly-burst-no-such-command"]] });

    const code = await burst(["acceptance", "--provider", "here"], run.dependencies);

    expect(code).toBe(1);
    expect(run.output.text()).toContain("orly burst: orly-burst-no-such-command is not on PATH");
    expect(run.output.text()).toMatch(/exit=not_run /);
  });
});

describe("here warm-up", () => {
  test("a snapshot warm-up runs setup then warm with no secret, no token and no 1Password call", async () => {
    const run = hereRun({ setup: [record("setup.seen")], warm: [record("warm.seen")], secrets: { API_TOKEN: REFERENCE } }, {}, { API_TOKEN: "stale-value-in-caller" });

    const code = await burst(["snapshot", "--provider", "here"], run.dependencies);

    expect(code).toBe(0);
    expect(seen(run.root, "setup.seen")).toBe("unset|unset|unset");
    expect(seen(run.root, "warm.seen")).toBe("unset|unset|unset");
    expect(existsSync(join(run.state, "op-calls.txt"))).toBe(false);
    expect(run.output.text()).toContain("orly burst: warm-up provider=here exit=0");
  });

  test("warm does not run when setup fails", async () => {
    const run = hereRun({ setup: [["sh", "-c", "exit 5"]], warm: [["sh", "-c", "touch warmed"]] }, {});

    const code = await burst(["snapshot", "--provider", "here"], run.dependencies);

    expect(code).toBe(1);
    expect(existsSync(join(run.root, "warmed"))).toBe(false);
    expect(run.output.text()).toContain("orly burst: warm-up provider=here exit=5");
  });
});
