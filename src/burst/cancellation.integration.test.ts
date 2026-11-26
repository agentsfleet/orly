import { afterEach, expect, setSystemTime, test } from "bun:test";

import { cleanupTemporaryDirectories } from "../gates_test_support";
import { FakeTailscale } from "./fake_tailscale";
import { FakeTir } from "./fake_tir";
import { burst } from "./index";
import { burstSettings } from "./settings";
import { burstDependencies, burstEnvironment, burstRepository, fakeBin, REPOSITORY } from "./test_support";
import { E2eApi } from "./tir";

const CREDENTIALS = { E2E_API_KEY: "fixture-key", E2E_AUTH_TOKEN: "fixture-token", E2E_PROJECT_ID: "12345" };

// The request ky hands to fetch, or the one a plain call describes.
function seen(input: string | URL | Request, init?: RequestInit): { method: string; path: string } {
  const request = input instanceof Request ? input : new Request(input, init);
  return { method: request.method, path: new URL(request.url).pathname };
}
afterEach(() => { setSystemTime(); cleanupTemporaryDirectories(); });

test("already cancelled cloud runs rent nothing", async () => {
  const { api, dependencies } = fixture();
  dependencies.signal = AbortSignal.abort();
  await expect(burst(["acceptance", "--provider", "e2e"], dependencies)).rejects.toThrow("cancelled before cloud mutation");
  expect(api.calls).toHaveLength(0);
  expect(api.vms.size).toBe(0);
});

test("cancellation after a catalogue read prevents VM creation and still cleans up", async () => {
  const { api, dependencies } = fixture();
  const controller = new AbortController();
  dependencies.signal = controller.signal;
  dependencies.fetch = async (input, init) => {
    const response = await api.fetch(input, init);
    if (seen(input, init).path.endsWith("/gpu_service/image/")) controller.abort();
    return response;
  };
  expect(await burst(["acceptance", "--provider", "e2e"], dependencies)).toBe(1);
  expect(api.callsTo("POST", /^\/notebooks\/$/)).toHaveLength(0);
  expect(api.vms.size).toBe(0);
  expect(api.groups.size).toBe(0);
  expect(api.keys.size).toBe(0);
});

test("a failed key deletion still attempts security group cleanup", async () => {
  const { api, dependencies, output } = fixture();
  dependencies.fetch = async (input, init) => {
    const { method, path } = seen(input, init);
    if (method === "DELETE" && /\/ssh_keys\/\d+\/$/.test(path)) return new Response("{}", { status: 500 });
    return api.fetch(input, init);
  };
  expect(await burst(["acceptance", "--provider", "e2e"], dependencies)).toBe(0);
  expect(api.vms.size).toBe(0);
  expect(api.groups.size).toBe(0);
  expect(api.keys.size).toBe(1);
  expect(output.text()).toContain("could not delete TIR key");
});

test.each(["/ssh_keys/", "/security_groups/", "/notebooks/"])("cancellation after creating %s retains ownership for cleanup", async (path) => {
  const { api, dependencies } = fixture();
  const controller = new AbortController();
  const reason = new Error("fixture cancellation after remote effect");
  dependencies.signal = controller.signal;
  dependencies.fetch = async (input, init) => {
    const response = await api.fetch(input, init);
    const request = seen(input, init);
    // The create took effect and its reply arrives; the run is cancelled meanwhile.
    if (request.method === "POST" && request.path.endsWith(path)) controller.abort(reason);
    return response;
  };
  const status = await burst(["acceptance", "--provider", "e2e"], dependencies).catch((error: unknown) => {
    expect(error).toBe(reason);
    return 1;
  });
  expect(status).toBe(1);
  expect(controller.signal.aborted).toBeTrue();
  expect(api.calls.filter((call) => call.method === "POST" && call.path === path)).toHaveLength(1);
  expect(api.keys.size).toBe(0);
  expect(api.groups.size).toBe(0);
  expect(api.vms.size).toBe(0);
});

test("TIR requests receive cancellation and already aborted mutations never fetch", async () => {
  const controller = new AbortController();
  let requests = 0;
  const api = new E2eApi(burstSettings(CREDENTIALS), async (input) => {
    requests += 1;
    const signal = input instanceof Request ? input.signal : undefined;
    if (!signal) throw new Error("request has no cancellation signal");
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("fixture request cancelled")), { once: true });
      controller.abort();
    });
  });
  await expect(api.images(controller.signal)).rejects.toThrow(/aborted|cancelled/);
  await expect(api.createVm({}, controller.signal)).rejects.toBe(controller.signal.reason);
  expect(requests).toBe(1);
});

test("same-instant snapshots have distinct names and legacy snapshots are never pruned", async () => {
  setSystemTime(new Date("2026-11-17T00:00:00.000Z"));
  const { api, dependencies } = fixture();
  for (let i = 0; i < 2; i += 1) expect(await burst(["snapshot", "--provider", "e2e"], dependencies)).toBe(0);
  const names = api.snapshots.map((snapshot) => snapshot.name);
  expect(new Set(names).size).toBe(2);
  for (const name of names) expect(name).toMatch(new RegExp(`^orly-burst-${REPOSITORY}-20261117000000000-[a-f0-9]{8}$`));
  api.snapshot("orly-burst-acme-widget-202611170000", 9002);
  api.snapshot(`orly-burst-${REPOSITORY}-202611170000`, 9003);
  expect(await burst(["snapshot", "--prune", "--provider", "e2e"], dependencies)).toBe(0);
  const left = api.snapshots.map((snapshot) => snapshot.name);
  expect(left).toHaveLength(3);
  expect(left).toEqual(expect.arrayContaining(["orly-burst-acme-widget-202611170000", `orly-burst-${REPOSITORY}-202611170000`]));
});

function fixture() {
  const root = burstRepository();
  const { bin, state } = fakeBin();
  const api = new FakeTir(new FakeTailscale(state));
  return { api, ...burstDependencies(root, burstEnvironment(bin, state, CREDENTIALS), api.fetch) };
}
