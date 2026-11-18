// E2E Networks TIR, in memory, as orly uses it, for the e2e tests, plus the
// caller-address lookup. A VM runs after one status poll, and reads as
// `terminating`, as TIR's does, for one poll while it stops. A snapshot is
// pending for `savingLists` list calls, then `ready`, or `savedStatus`. A
// group's delete fails `groupDeleteFailures` times.
import { CALLER_ADDRESS, fields } from "./test_support";
import { TIR_LABEL_LIMIT } from "./e2e";
import { isObject } from "../model";

type Call = { method: string; path: string; query: Record<string, string>; body: unknown; authorization: string | null };
type FakeVm = { id: string; name: string; status: string; polls: number; address: string; body: Record<string, unknown> };
type FakeSnapshot = { id: number; name: string; status: string; size_gb: number; image_details: { version_id: number } };

const PREFIX = "/myaccount/api/v1/gpu";
const UBUNTU_24 = 106;
export const DEBIAN_13 = 121;
// The order and the repeats TIR really lists: a CUDA build before the plain
// 24.04, and 22.04 more than once.
const IMAGES = [
  { name: "Transformers", versions: [{ image_version_id: 59, version: "v4.51.3" }] },
  { name: "Debian", versions: [{ image_version_id: DEBIAN_13, version: "13" }, { image_version_id: 120, version: "12" }] },
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
  // The VM is made, but the reply to its create is a gateway timeout.
  lostCreate = false;
  // How many VM status reads answer 503 before TIR answers again.
  busyPolls = 0;
  // Paths whose create is made but answered with a gateway timeout.
  lostReplies = new Set<string>();
  // TIR lists no keys, as if the run's key were already gone.
  hideKeys = false;
  groupDeleteFailures = 0;
  // Calls after a VM delete before TIR has removed it.
  deleteLag = 2;
  // What a booted VM reports; `error` is a VM that will not come up.
  bootStatus = "ready";
  #nextGroup = 700;
  savingLists = 1;
  savedStatus = "ready";
  #saving = new Map<number, number>();
  #nextVm = 5001;
  #nextKey = 1;
  // The caller's address after the run's first lookup, when its network changes mid-run.
  callerMovesTo: string | undefined;
  #addressLookups = 0;

  // ky hands a Request; the caller-address lookup hands a URL string.
  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.host === "checkip.amazonaws.com") {
      this.#addressLookups += 1;
      return new Response(`${this.#addressLookups > 1 && this.callerMovesTo ? this.callerMovesTo : CALLER_ADDRESS}\n`);
    }
    const method = request.method;
    const path = url.pathname.replace(PREFIX, "");
    const text = await request.text();
    const body: unknown = text ? JSON.parse(text) : undefined;
    const query = Object.fromEntries(url.searchParams);
    this.calls.push({ method, path, query, body, authorization: request.headers.get("Authorization") });
    this.#settleDeletes();
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
    if (route === "POST /ssh_keys/") return this.lost(path, this.addKey(body));
    if (route === "GET /ssh_keys/") return reply(this.hideKeys ? [] : [...this.keys.values()]);
    if (route === "DELETE /ssh_keys/{id}/") return this.deleteKey(id);
    if (route === "POST /security_groups/") return this.lost(path, this.addGroup(body));
    if (route === "GET /security_groups/") return reply([...this.groups.values()].map((group) => ({ id: group.id, name: group.name })));
    if (route === "DELETE /security_groups/{id}/") return this.deleteGroup(id);
    if (route === "POST /notebooks/") return this.create(body);
    if (route === "GET /notebooks/") return reply([...this.vms.values()].map((vm) => ({ id: Number(vm.id), name: vm.name, status: vm.status })));
    if (route === "GET /notebooks/{id}/") return this.poll(id);
    if (route === "DELETE /notebooks/{id}/") return this.deleteVm(id);
    if (route === "PUT /notebooks/{id}/actions/") return this.act(id, query.action ?? "");
    if (route === "POST /notebooks/{id}/snapshots/") return this.save(body);
    if (route === "GET /notebooks/vm/snapshots/") return this.listSnapshots();
    if (route === "DELETE /notebooks/vm/snapshots/{id}/") {
      this.snapshots = this.snapshots.filter((snapshot) => String(snapshot.id) !== id);
      return reply({});
    }
    return reply({}, 404);
  }

  private lost(path: string, made: Response): Response {
    return this.lostReplies.has(path) ? reply({}, 504) : made;
  }

  // TIR refuses a key label over 50 characters, as the real API does.
  private addKey(body: Record<string, unknown>): Response {
    if (String(body.label).length > TIR_LABEL_LIMIT) return reply({ label: ["Ensure this field has no more than 50 characters."] }, 412);
    const pk = this.#nextKey;
    this.#nextKey += 1;
    this.keys.set(String(body.label), { pk, label: String(body.label), ssh_key: String(body.ssh_key) });
    return reply({ label: body.label, ssh_key: body.ssh_key });
  }

  // TIR refuses a group without both an inbound and an outbound rule.
  // TIR deletes a VM in the background: it is gone, and its key free, only
  // after `deleteLag` more calls of any kind.
  private deleteVm(id: string): Response {
    const vm = this.vms.get(id);
    if (!vm || vm.status === "terminating") return reply({}, 404);
    vm.status = "terminating";
    vm.polls = this.deleteLag;
    return reply({});
  }

  #settleDeletes(): void {
    for (const vm of [...this.vms.values()]) {
      if (vm.status !== "terminating") continue;
      vm.polls -= 1;
      if (vm.polls <= 0) this.vms.delete(vm.id);
    }
  }

  // A key a VM still holds is refused, as TIR does.
  private deleteKey(id: string): Response {
    const entry = [...this.keys].find(([, key]) => String(key.pk) === id);
    if (!entry) return reply({}, 404);
    const held = [...this.vms.values()].some((vm) => JSON.stringify(vm.body.public_key ?? "").includes(entry[1].ssh_key));
    if (held) return reply("SSH Key is attached to one or more resources. Please detach the key from all resources before deleting it.", 412);
    this.keys.delete(entry[0]);
    return reply({});
  }

  private addGroup(body: Record<string, unknown>): Response {
    const kinds = new Set((Array.isArray(body.rules) ? body.rules : []).map((rule) => String(fields(rule).rule_type)));
    if (!kinds.has("inbound") || !kinds.has("outbound")) return reply("Atleast one Inbound and one Outbound Rule is required in a Security Group", 400);
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
    if (this.lostCreate) return reply({}, 504);
    return reply({ id: Number(id), status: "waiting", public_ip: "" }, 201);
  }

  private poll(id: string): Response {
    if (this.busyPolls > 0) {
      this.busyPolls -= 1;
      return reply({}, 503);
    }
    const vm = this.vms.get(id);
    if (!vm) return reply({}, 404);
    if (vm.status === "terminating") return reply({ id: Number(id), status: "terminating", public_ip: "" });
    vm.polls += 1;
    if (vm.status === "waiting" && vm.polls > 1) vm.status = this.bootStatus;
    else if (vm.status === "stopping") vm.status = "stopped";
    return reply({ id: Number(id), status: vm.status === "stopping" ? "terminating" : vm.status, public_ip: vm.status === "waiting" ? "" : vm.address });
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
