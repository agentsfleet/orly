import type { BurstSettings } from "./settings";
import type { BurstRun, CloudProvider, Fetch, Image, Job, Machine, Snapshot, SnapshotScope } from "./types";
import type { OsImage, Plan, VmSnapshot } from "./tir";

import { messageOf, OrlyError } from "../model";
import { pause, until } from "./process";
import { callerAddress } from "./ssh";
import { E2eApi, E2eRequestFailed } from "./tir";

const DEFAULT_IMAGE = "Debian 13";
// How long VM deletion, then the group's delete, are waited for before each
// is reported for deletion by hand.
const CLEANUP_MS = 5 * 60_000;
const NOT_FOUND = 404;
// Statuses TIR reports for a VM that will not come up.
const FAILED_VM = new Set(["error", "failed"]);
// TIR reports a booted VM as `ready`; `running` is accepted as well.
const BOOTED = new Set(["ready", "running"]);
// Root disk of every VM; a VM launched from a snapshot needs at least the
// snapshot's source disk, so it never shrinks.
const DISK_GB = 100;
const READY = "ready";
const FAILED = new Set(["failed", "error"]);
// The owner's planning figures (Nov 16, 2026), used in place of the rate card:
// a run hour costs ₹25 before 18% GST, billed by the started hour, and each
// stored snapshot ₹200 a month.
const RUPEES_PER_HOUR = 25;
const RUPEES_PER_SNAPSHOT_MONTH = 200;

// E2E Networks TIR virtual machines: whole Linux machines with their own
// kernel, reached as root over SSH. TIR accepts only a public key already
// saved in the account, so each run saves its key; each run also makes a
// security group admitting SSH from the caller's address alone. Both go when
// the run's VMs have.
export class E2eNodes implements CloudProvider {
  readonly name = "e2e";
  readonly user: string;
  readonly #settings: BurstSettings;
  readonly #api: E2eApi;
  readonly #fetch: Fetch;
  #plan: Promise<Plan> | undefined;
  #group: string | undefined;
  #keyLabel: string | undefined;
  readonly #statuses = new Map<string, string>();

  constructor(settings: BurstSettings, fetcher: Fetch) {
    this.#settings = settings;
    this.user = settings.e2e.user;
    this.#fetch = fetcher;
    this.#api = new E2eApi(settings.e2e, fetcher);
  }

  cost(): string {
    return `₹${RUPEES_PER_HOUR}/h + GST (billed hourly)`;
  }

  storage(): string {
    return `₹${RUPEES_PER_SNAPSHOT_MONTH}/month + GST`;
  }

  // A snapshot warms from ORLY_BURST_E2E_IMAGE when it is set, so the
  // snapshot's OS is the one its lanes were chosen for.
  baseImage(): Image {
    const name = this.#settings.e2e.image ?? DEFAULT_IMAGE;
    return { id: name, name, snapshot: false };
  }

  // ORLY_BURST_E2E_IMAGE names a ready snapshot when one has that name, and an
  // OS image, such as `Ubuntu 22.04`, otherwise.
  async override(signal?: AbortSignal): Promise<Image | undefined> {
    const name = this.#settings.e2e.image;
    if (!name) return undefined;
    const saved = (await this.#api.snapshots(signal)).find((snapshot) => snapshot.name === name && snapshot.status === READY);
    return saved ? { id: saved.id, name, snapshot: true } : { id: name, name, snapshot: false };
  }

  async snapshots(scope: SnapshotScope): Promise<Snapshot[]> {
    return (await this.#api.snapshots(scope.signal)).filter((snapshot) => snapshot.status === READY).map(toSnapshot);
  }

  async prepare(run: BurstRun): Promise<void> {
    const name = tirLabel(run.runId);
    await this.#api.addKey(name, run.publicKey, run.signal);
    this.#keyLabel = name;
    const caller = await callerAddress(this.#fetch);
    this.#group = await this.#api.createSshGroup(name, caller, run.signal);
    run.write(`orly burst: ${name} admits SSH from ${caller} only`);
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
      // A request that failed after reaching TIR may still have made the VM.
      if (!(error instanceof E2eRequestFailed && error.status < 500)) run.write(`orly burst: lane=${job.name} TIR may have created VM ${name}; check TIR, it bills until deleted`);
      throw error;
    }
    run.write(`orly burst: lane=${job.name} VM ${id} (${plan.sku}, ${job.image.name}) created`);
    return { id, label: plan.sku, address: undefined, hourly: RUPEES_PER_HOUR };
  }

  async ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine> {
    const address = await this.#until(run, job, "a running VM with a public address", async () => {
      const vm = await this.#api.vm(machine.id, run.signal);
      this.#seen(run, machine.id, vm.status);
      if (FAILED_VM.has(vm.status)) throw new OrlyError(`VM ${machine.id} failed to start: TIR reports ${vm.status}`);
      return BOOTED.has(vm.status) ? vm.address : undefined;
    });
    return { ...machine, address };
  }

  // The VM is stopped first, so the snapshot is of a disk at rest. Saving is
  // polled until ready or failed; one still saving at the run's deadline is
  // left to finish and reported as pending.
  async capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot> {
    await this.#api.stopVm(machine.id, run.signal);
    await this.#until(run, job, "the VM to stop", async () => {
      const { status } = await this.#api.vm(machine.id, run.signal);
      this.#seen(run, machine.id, status);
      if (FAILED_VM.has(status)) throw new OrlyError(`VM ${machine.id} failed while stopping: TIR reports ${status}`);
      return status === "stopped" || undefined;
    });
    const created = await this.#api.createSnapshot(machine.id, name, run.signal);
    run.write(`orly burst: saving ${name} as snapshot ${created.id}`);
    for (;;) {
      const saved = (await this.#api.snapshots(run.signal)).find((snapshot) => snapshot.id === created.id) ?? created;
      if (saved.status === READY) return toSnapshot(saved);
      if (FAILED.has(saved.status)) throw new OrlyError(`snapshot ${name} is ${saved.status}`);
      if (run.signal.aborted || Date.now() >= job.deadline) return toSnapshot(saved);
      await pause(this.#settings.pollMs, run.signal);
    }
  }

  // TIR deletes a VM in the background and keeps its key attached until it is
  // gone, so removal waits for the VM to read as not found.
  async remove(machine: Machine): Promise<void> {
    await this.#api.deleteVm(machine.id);
    const never = new AbortController().signal;
    const gone = async () => this.#api.vm(machine.id).then(() => undefined, (error: unknown) => {
      if (error instanceof E2eRequestFailed && error.status === NOT_FOUND) return true;
      throw error;
    });
    await until(`VM ${machine.id} to delete`, gone, { deadline: Date.now() + CLEANUP_MS, signal: never, pollMs: this.#settings.pollMs });
  }

  // Each VM's status is written once per change, so a status orly does not
  // expect is visible on the first poll instead of at the deadline.
  #seen(run: BurstRun, id: string, status: string): void {
    if (this.#statuses.get(id) === status) return;
    this.#statuses.set(id, status);
    run.write(`orly burst: VM ${id} is ${status}`);
  }

  async deleteSnapshot(snapshot: Snapshot, signal: AbortSignal): Promise<void> {
    await this.#api.deleteSnapshot(snapshot.id, signal);
  }

  // The run's key and group leave once its VMs are gone; --keep keeps both so
  // the kept VMs stay reachable. Cleanup takes no cancellation: it is what a
  // cancellation runs.
  async finish(run: BurstRun): Promise<void> {
    const label = this.#keyLabel;
    if (!label) return;
    if (run.keep) {
      run.write(`orly burst: --keep left TIR key ${label} and security group ${this.#group ?? "none"}; delete them with the VMs`);
      return;
    }
    // Every VM has read as gone (`remove`), so TIR no longer holds the key.
    try {
      const pk = (await this.#api.keys()).find((key) => key.label === label)?.pk;
      if (pk) await this.#api.deleteKey(pk);
    } catch (error) {
      run.write(`orly burst: could not delete TIR key ${label}: ${messageOf(error)}; delete it by hand`);
    }
    const group = this.#group;
    if (!group) return;
    const never = new AbortController().signal;
    const deleted = async () => this.#api.deleteSecurityGroup(group).then(() => true, () => undefined);
    await until(`security group ${group} to delete`, deleted, { deadline: Date.now() + CLEANUP_MS, signal: never, pollMs: this.#settings.pollMs })
      .catch(() => run.write(`orly burst: could not delete TIR security group ${group} (${label}); delete it by hand`));
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

  #until<T>(run: BurstRun, job: Job, what: string, probe: () => Promise<T | undefined>): Promise<T> {
    return until(what, probe, { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs });
  }
}

function toSnapshot(snapshot: VmSnapshot): Snapshot {
  return { id: snapshot.id, name: snapshot.name, sizeGb: snapshot.sizeGb, launchId: snapshot.id, parts: [], ready: snapshot.status === READY };
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
