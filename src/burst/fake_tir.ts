// E2E Networks TIR, in memory, as orly uses it, for the e2e tests, plus the
// caller-address lookup. A VM runs after one status poll and stops after one
// more once stopped. A snapshot is pending for `savingLists` list calls, then
// `ready`, or `savedStatus`. A group's delete fails `groupDeleteFailures` times.
import { CALLER_ADDRESS } from "./test_support";
import { isObject } from "../model";

type Call = { method: string; path: string; query: Record<string, string>; body: unknown; authorization: string | null };
type FakeVm = { id: string; name: string; status: string; polls: number; address: string; body: Record<string, unknown> };
type FakeSnapshot = { id: number; name: string; status: string; size_gb: number; image_details: { version_id: number } };

const PREFIX = "/myaccount/api/v1/gpu";
const UBUNTU_24 = 106;
// The order and the repeats TIR really lists: a CUDA build before the plain
// 24.04, and 22.04 more than once.
const IMAGES = [
  { name: "Transformers", versions: [{ image_version_id: 59, version: "v4.51.3" }] },
  { name: "Ubuntu", versions: [{ image_version_id: 111, version: "24.04-cuda13.0" }, { image_version_id: 107, version: "22.04" }, { image_version_id: UBUNTU_24, version: "24.04" }, { image_version_id: 48, version: "22.04" }] },
];
const JSON_HEADERS = { "Content-Type": "application/json" };

export class FakeTir {
  readonly calls: Call[] = [];
  readonly vms = new Map<string, FakeVm>();
  readonly keys = new Map<string, { pk: number; label: string; ssh_key: string }>();
  readonly groups = new Map<string, { id: number; name: string; rules: unknown }>();
  snapshots: FakeSnapshot[] = [];
  createStatus = 201;
  groupDeleteFailures = 0;
  #nextGroup = 700;
  savingLists = 1;
  savedStatus = "ready";
  #saving = new Map<number, number>();
  #nextVm = 5001;
  #nextKey = 1;

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    if (url.host === "checkip.amazonaws.com") return new Response(`${CALLER_ADDRESS}\n`);
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(PREFIX, "");
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    const query = Object.fromEntries(url.searchParams);
    this.calls.push({ method, path, query, body, authorization: new Headers(init?.headers).get("Authorization") });
    return this.answer(method, path, query, isObject(body) ? body : {});
  };

  callsTo(method: string, pattern: RegExp): Call[] {
    return this.calls.filter((call) => call.method === method && pattern.test(call.path));
  }

  snapshot(name: string, id: number, status = "ready"): void {
    this.snapshots.push({ id, name, status, size_gb: 100, image_details: { version_id: UBUNTU_24 } });
  }

  answer(method: string, path: string, query: Record<string, string>, body: Record<string, unknown>): Response {
    const route = `${method} ${path.replace(/\/\d+\//g, "/{id}/")}`;
    const id = path.match(/\/(\d+)\//)?.[1] ?? "";
    if (route === "GET /gpu_service/sku/") return reply({ CPU: [sku("C3.32GB", 3, 18.6), sku("C3.16GB", 6, 9.2)], GPU: [] });
    if (route === "GET /gpu_service/image/") return reply(IMAGES);
    if (route === "POST /ssh_keys/") return this.addKey(body);
    if (route === "GET /ssh_keys/") return reply([...this.keys.values()]);
    if (route === "DELETE /ssh_keys/{id}/") return reply({}, [...this.keys].some(([label, key]) => String(key.pk) === id && this.keys.delete(label)) ? 200 : 404);
    if (route === "POST /security_groups/") return this.addGroup(body);
    if (route === "DELETE /security_groups/{id}/rules/") return this.deleteGroup(id);
    if (route === "POST /notebooks/") return this.create(body);
    if (route === "GET /notebooks/{id}/") return this.poll(id);
    if (route === "DELETE /notebooks/{id}/") return reply({}, this.vms.delete(id) ? 200 : 404);
    if (route === "PUT /notebooks/{id}/actions/") return this.act(id, query.action ?? "");
    if (route === "POST /notebooks/{id}/snapshots/") return this.save(body);
    if (route === "GET /notebooks/vm/snapshots/") return this.listSnapshots();
    if (route === "DELETE /notebooks/vm/snapshots/{id}/") {
      this.snapshots = this.snapshots.filter((snapshot) => String(snapshot.id) !== id);
      return reply({});
    }
    return reply({}, 404);
  }

  private addKey(body: Record<string, unknown>): Response {
    const pk = this.#nextKey;
    this.#nextKey += 1;
    this.keys.set(String(body.label), { pk, label: String(body.label), ssh_key: String(body.ssh_key) });
    return reply({ label: body.label, ssh_key: body.ssh_key });
  }

  private addGroup(body: Record<string, unknown>): Response {
    const group = { id: this.#nextGroup, name: String(body.name), rules: body.rules };
    this.#nextGroup += 1;
    this.groups.set(String(group.id), group);
    return reply(group, 201);
  }

  private deleteGroup(id: string): Response {
    if (this.groupDeleteFailures > 0) {
      this.groupDeleteFailures -= 1;
      return reply({}, 400);
    }
    return reply("Security Group deleted successfully", this.groups.delete(id) ? 200 : 404);
  }

  private create(body: Record<string, unknown>): Response {
    if (this.createStatus !== 201) return reply({}, this.createStatus);
    const id = String(this.#nextVm);
    const address = `203.0.113.${this.#nextVm - 5000}`;
    this.#nextVm += 1;
    this.vms.set(id, { id, name: String(body.name), status: "waiting", polls: 0, address, body });
    return reply({ id: Number(id), status: "waiting", public_ip: "" }, 201);
  }

  private poll(id: string): Response {
    const vm = this.vms.get(id);
    if (!vm) return reply({}, 404);
    vm.polls += 1;
    if (vm.status === "waiting" && vm.polls > 1) vm.status = "running";
    else if (vm.status === "stopping") vm.status = "stopped";
    return reply({ id: Number(id), status: vm.status === "stopping" ? "running" : vm.status, public_ip: vm.status === "waiting" ? "" : vm.address });
  }

  private act(id: string, action: string): Response {
    const vm = this.vms.get(id);
    if (!vm) return reply({}, 404);
    if (action === "Stop") vm.status = "stopping";
    return reply({ id: Number(id) });
  }

  private save(body: Record<string, unknown>): Response {
    const id = 9000 + this.snapshots.length;
    this.snapshot(String(body.name), id, "pending");
    this.#saving.set(id, this.savingLists);
    return reply(this.snapshots.at(-1));
  }

  private listSnapshots(): Response {
    const listed = this.snapshots.map((snapshot) => ({ ...snapshot }));
    for (const snapshot of this.snapshots) {
      const left = this.#saving.get(snapshot.id) ?? 0;
      if (left > 1) this.#saving.set(snapshot.id, left - 1);
      else if (snapshot.status === "pending") snapshot.status = this.#saving.has(snapshot.id) ? this.savedStatus : "ready";
    }
    return reply(listed);
  }
}

function sku(name: string, priceId: number, hourly: number) {
  return { name, series: "CPU", plans: [{ sku_item_price_id: priceId, committed_days: 0, unit_price: hourly, is_active: true }, { sku_item_price_id: priceId + 100, committed_days: 90, unit_price: hourly * 1500, is_active: true }] };
}

function reply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: status, data, message: status < 300 ? "Success" : "Failed" }), { status, headers: JSON_HEADERS });
}
