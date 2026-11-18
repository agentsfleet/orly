import type { BurstSettings } from "./settings";
import { done, failed, ongoing } from "./progress";
import type { BurstRun, CloudProvider, Fetch, Image, Job, Machine, Snapshot, SnapshotScope } from "./types";
import type { OsImage, Plan, VmSnapshot } from "./tir";

import { messageOf, OrlyError } from "../model";
import { machineDeadline, pause, until } from "./process";
import { E2eApi, E2eRequestFailed } from "./tir";

const DEFAULT_IMAGE = "Debian 13";
// How long VM deletion, then the group's delete, are waited for before each
// is reported for deletion by hand.
const CLEANUP_MS = 5 * 60_000;
const NOT_FOUND = 404;
const TOO_MANY = 429;
const SERVER_ERROR = 500;
// TIR's answer to a second delete of a VM it is already deleting.
const ALREADY_DELETING = 400;
// Statuses TIR reports for a VM that will not come up, or a snapshot that will not save.
const FAILED = new Set(["error", "failed"]);
// TIR reports a booted VM as `ready`; `running` is accepted as well.
const BOOTED = new Set(["ready", "running"]);
// Root disk of every VM; a VM launched from a snapshot needs at least the
// snapshot's source disk, so it never shrinks.
const DISK_GB = 100;
const READY = "ready";
// The owner's planning figures (Nov 16, 2026), used in place of the rate card:
// a run hour costs ₹25 before 18% GST, billed by the started hour, and each
// stored snapshot ₹200 a month.
const RUPEES_PER_HOUR = 25;
const RUPEES_PER_SNAPSHOT_MONTH = 200;

// E2E Networks TIR virtual machines: whole Linux machines with their own
// kernel, reached as root over SSH. TIR accepts only a public key already
// saved in the account, so each run saves its key; each run also makes a
// security group admitting SSH from the caller's address alone. Both go when
// the run's VMs have. TIR answers 429, a 5xx or nothing while it is busy, so
// every wait reads those as no answer yet.
export class E2eNodes implements CloudProvider {
  readonly name = "e2e";
  readonly user: string;
  readonly #settings: BurstSettings;
  readonly #api: E2eApi;
  #plan: Promise<Plan> | undefined;
  #group: string | undefined;
  #keyLabel: string | undefined;
  readonly #statuses = new Map<string, string>();
  // VMs whose create request failed after it may have reached TIR.
  readonly #unconfirmed = new Set<string>();

  constructor(settings: BurstSettings, fetcher: Fetch) {
    this.#settings = settings;
    this.user = settings.e2e.user;
    this.#api = new E2eApi(settings.e2e, fetcher);
  }

  cost(): string {
    return `₹${RUPEES_PER_HOUR}/h + GST (billed hourly)`;
  }

  storage(): string {
    return `₹${RUPEES_PER_SNAPSHOT_MONTH}/month + GST`;
  }

  // What a snapshot warms from and a lane with no snapshot boots.
  baseImage(): Image {
    const name = this.#settings.e2e.image ?? DEFAULT_IMAGE;
    return { id: name, name, snapshot: false };
  }

  async snapshots(scope: SnapshotScope): Promise<Snapshot[]> {
    return (await this.#api.snapshots(scope.signal)).filter((snapshot) => snapshot.status === READY).map(toSnapshot);
  }

  async prepare(run: BurstRun): Promise<void> {
    const name = tirLabel(run.runId);
    await this.#api.addKey(name, run.publicKey, run.signal);
    this.#keyLabel = name;
    this.#group = await this.#api.createSshGroup(name, run.caller, run.signal);
    run.write(done(`${name} admits SSH from ${run.caller} only`));
  }

  async create(run: BurstRun, job: Job): Promise<Machine> {
    const plan = await this.#resolvePlan(run.signal);
    const source = job.image.snapshot ? await this.#snapshotSource(job.image.id, run.signal) : await this.#osImage(job.image.name, run.signal);
    const name = `orly-burst-${job.name}-${run.runId.slice(-4)}`;
    let id: string;
    try {
      id = await this.#api.createVm({
        name, kind: "vm", cluster_type: "tir-cluster", image_type: "pre-built", image_version_id: source.versionId,
        sku_item_price_id: plan.priceId, disk_size_in_gb: DISK_GB, quantity: 1,
        public_key: [run.publicKey], security_group_id: Number(this.#group), ...(source.snapshotId ? { snapshot_id: Number(source.snapshotId) } : {}),
      }, run.signal);
    } catch (error) {
      // A request that failed after reaching TIR may still have made the VM;
      // finish looks for it by name.
      if (!(error instanceof E2eRequestFailed && error.status < SERVER_ERROR)) this.#unconfirmed.add(name);
      throw error;
    }
    run.write(done(`lane=${job.name} VM ${id} (${plan.sku}, ${job.image.name}) created`));
    return { id, label: plan.sku, address: undefined };
  }

  async ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine> {
    const address = await until("a running VM with a public address", async () => {
      const vm = await whenAnswered(() => this.#api.vm(machine.id, run.signal));
      if (!vm) return undefined;
      this.#seen(run, machine.id, vm.status);
      if (FAILED.has(vm.status)) throw new OrlyError(`VM ${machine.id} failed to start: TIR reports ${vm.status}`);
      return BOOTED.has(vm.status) ? vm.address : undefined;
    }, { deadline: machineDeadline(job), signal: run.signal, pollMs: this.#settings.pollMs });
    return { ...machine, address };
  }

  // The VM is stopped first, so the snapshot is of a disk at rest. Saving is
  // polled until ready or failed; one still saving at the run's deadline is
  // left to finish and reported as pending, and a cancellation fails it.
  async capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot> {
    const timing = { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs };
    run.write(ongoing(`stopping VM ${machine.id} to save it`));
    await this.#api.stopVm(machine.id, run.signal);
    await until("the VM to stop", async () => {
      const vm = await whenAnswered(() => this.#api.vm(machine.id, run.signal));
      if (!vm) return undefined;
      this.#seen(run, machine.id, vm.status);
      if (FAILED.has(vm.status)) throw new OrlyError(`VM ${machine.id} failed while stopping: TIR reports ${vm.status}`);
      return vm.status === "stopped" || undefined;
    }, timing);
    const created = await this.#api.createSnapshot(machine.id, name, run.signal);
    run.write(ongoing(`saving ${name} as snapshot ${created.id}`));
    for (;;) {
      const listed = await whenAnswered(() => this.#api.snapshots(run.signal));
      const saved = listed?.find((snapshot) => snapshot.id === created.id) ?? created;
      if (saved.status === READY) {
        run.write(done(`saved snapshot ${created.id}`));
        return toSnapshot(saved);
      }
      if (FAILED.has(saved.status)) throw new OrlyError(`snapshot ${name} is ${saved.status}`);
      if (Date.now() >= job.deadline) return toSnapshot(saved);
      await pause(this.#settings.pollMs, run.signal);
      if (run.signal.aborted) throw new OrlyError(`cancelled while saving snapshot ${created.id}; TIR may still finish it`);
    }
  }

  // TIR deletes a VM in the background and keeps its key attached until it is
  // gone, so removal waits for the VM to read as not found. Cleanup takes no
  // cancellation: it is what a cancellation runs.
  async remove(machine: Machine): Promise<void> {
    await this.#deleteVm(machine.id);
  }

  // Each VM's status is written once per change, so a status orly does not
  // expect is visible on the first poll instead of at the deadline.
  #seen(run: BurstRun, id: string, status: string): void {
    if (this.#statuses.get(id) === status) return;
    this.#statuses.set(id, status);
    run.write(BOOTED.has(status) || status === "stopped" ? done(`VM ${id} is ${status}`) : FAILED.has(status) ? failed(`VM ${id} is ${status}`) : ongoing(`VM ${id} is ${status}`));
  }

  async #deleteVm(id: string): Promise<void> {
    const timing = { deadline: Date.now() + CLEANUP_MS, signal: new AbortController().signal, pollMs: this.#settings.pollMs };
    await until(`TIR to accept deleting VM ${id}`, () => whenAnswered(() => this.#api.deleteVm(id).then(() => true, (error: unknown) => {
      if (error instanceof E2eRequestFailed && (error.status === ALREADY_DELETING || error.status === NOT_FOUND)) return true;
      throw error;
    })), timing);
    await until(`VM ${id} to delete`, () => whenAnswered(() => this.#api.vm(id).then(() => undefined, (error: unknown) => {
      if (error instanceof E2eRequestFailed && error.status === NOT_FOUND) return true;
      throw error;
    })), timing);
  }

  async deleteSnapshot(snapshot: Snapshot, signal: AbortSignal): Promise<void> {
    await this.#api.deleteSnapshot(snapshot.id, signal);
  }

  // A VM whose create reply was lost is found by name and deleted first, then
  // the run's key and group, which TIR holds while any VM uses them. Cleanup
  // takes no cancellation: it is what a cancellation runs.
  async finish(run: BurstRun): Promise<void> {
    const label = this.#keyLabel;
    if (!label) return;
    if (this.#unconfirmed.size > 0) await this.#sweep(run);
    try {
      const pk = (await this.#api.keys()).find((key) => key.label === label)?.pk;
      if (!pk) throw new OrlyError("TIR lists no such key");
      await this.#api.deleteKey(pk);
      run.write(done(`deleted TIR key ${label}`));
    } catch (error) {
      run.write(failed(`could not delete TIR key ${label}: ${messageOf(error)}; delete it by hand`));
    }
    const group = this.#group;
    if (!group) return;
    const never = new AbortController().signal;
    const deleted = async () => this.#api.deleteSecurityGroup(group).then(() => true, () => undefined);
    await until(`security group ${group} to delete`, deleted, { deadline: Date.now() + CLEANUP_MS, signal: never, pollMs: this.#settings.pollMs })
      .then(() => run.write(done(`deleted TIR security group ${group}`)))
      .catch(() => run.write(failed(`could not delete TIR security group ${group} (${label}); delete it by hand`)));
  }

  async #sweep(run: BurstRun): Promise<void> {
    const found = await this.#api.vms().catch(() => undefined);
    for (const name of this.#unconfirmed) {
      const vm = found?.find((candidate) => candidate.name === name);
      if (!found) run.write(failed(`could not list TIR VMs to find ${name}; check TIR, it bills until deleted`));
      else if (vm) {
        await this.#deleteVm(vm.id)
          .then(() => run.write(done(`deleted VM ${vm.id} (${name}), whose create reply was lost`)))
          .catch((error: unknown) => run.write(failed(`could not delete VM ${vm.id} (${name}): ${messageOf(error)}; delete it by hand`)));
      }
    }
  }

  #resolvePlan(signal: AbortSignal): Promise<Plan> {
    const { plan: sku, location } = this.#settings.e2e;
    this.#plan ??= this.#api.plans(signal).then((plans) => {
      const match = plans.find((entry) => entry.sku === sku);
      if (match) return match;
      throw new OrlyError(`TIR offers no hourly ${sku} plan in ${location}; it offers: ${plans.map((entry) => entry.sku).join(", ") || "none"}`);
    });
    return this.#plan;
  }

  // `Ubuntu 24.04` is the image named Ubuntu at exactly version 24.04, never
  // `24.04-cuda13.0`. TIR lists some versions more than once; the highest
  // identifier is the newest build.
  async #osImage(wanted: string, signal: AbortSignal): Promise<{ versionId: number; snapshotId?: string }> {
    const [name = "", version = ""] = wanted.split(/\s+/, 2);
    const images = await this.#api.images(signal);
    const matches = images.filter((image) => image.name.toLowerCase() === name.toLowerCase() && image.version === version);
    if (matches.length > 0) return { versionId: Math.max(...matches.map((image) => image.versionId)) };
    const named = images.filter((image) => image.name.toLowerCase() === name.toLowerCase());
    const offered = (named.length > 0 ? named : images.slice(0, 20)).map((image: OsImage) => `${image.name} ${image.version}`);
    throw new OrlyError(`TIR has no image ${wanted}; it has: ${offered.join(", ") || "none"}`);
  }

  async #snapshotSource(id: string, signal: AbortSignal): Promise<{ versionId: number | undefined; snapshotId: string }> {
    const snapshot = (await this.#api.snapshots(signal)).find((candidate) => candidate.id === id);
    return { versionId: snapshot?.versionId, snapshotId: id };
  }

}

// A TIR answer, or nothing while TIR is busy: 429, a 5xx, a timeout or a
// dropped connection. A cancellation and any other refusal still throw.
async function whenAnswered<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof E2eRequestFailed && (error.status === TOO_MANY || error.status >= SERVER_ERROR)) return undefined;
    if (error instanceof DOMException && error.name === "TimeoutError") return undefined;
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

function toSnapshot(snapshot: VmSnapshot): Snapshot {
  return { id: snapshot.id, name: snapshot.name, sizeGb: snapshot.sizeGb, parts: [], ready: snapshot.status === READY };
}

// TIR caps a key label at 50 characters. A run id ends in its 14-digit stamp
// and 4-character suffix, which keep labels unique, so the ref part is cut.
export const TIR_LABEL_LIMIT = 50;
const LABEL_PREFIX = "orly-burst-";
const RUN_ID_TAIL = 20;

export function tirLabel(runId: string): string {
  const tail = runId.slice(-RUN_ID_TAIL);
  const ref = runId.slice(0, -RUN_ID_TAIL).slice(0, TIR_LABEL_LIMIT - LABEL_PREFIX.length - RUN_ID_TAIL).replace(/-+$/, "");
  return `${LABEL_PREFIX}${ref}${tail}`;
}
