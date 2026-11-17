import type { BurstSettings } from "../settings";
import type { BurstRun, CloudProvider, Fetch, Image, Job, Machine, Snapshot } from "../types";
import type { OsImage, Plan, VmSnapshot } from "./tir";

import { OrlyError } from "../../model";
import { pause, until } from "../process";
import { callerAddress } from "../ssh";
import { E2eApi, E2eRequestFailed } from "./tir";

const DEFAULT_IMAGE = "Ubuntu 24.04";
// A deleted VM can hold its group briefly, so the group's delete is retried
// for this long before it is reported for deletion by hand.
const GROUP_DELETE_MS = 5 * 60_000;
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

  constructor(settings: BurstSettings, fetcher: Fetch) {
    this.#settings = settings;
    this.user = settings.e2e.user;
    this.#fetch = fetcher;
    this.#api = new E2eApi(settings.e2e, fetcher);
  }

  cost(machine: Machine | undefined): string {
    return machine ? `₹${RUPEES_PER_HOUR}/h + GST (billed hourly)` : "none";
  }

  storage(): string {
    return `₹${RUPEES_PER_SNAPSHOT_MONTH}/month + GST`;
  }

  baseImage(): Image {
    return { id: DEFAULT_IMAGE, name: DEFAULT_IMAGE, snapshot: false };
  }

  // ORLY_BURST_E2E_IMAGE names a ready snapshot when one has that name, and an
  // OS image, such as `Ubuntu 22.04`, otherwise.
  async override(): Promise<Image | undefined> {
    const name = this.#settings.e2e.image;
    if (!name) return undefined;
    const saved = (await this.#api.snapshots()).find((snapshot) => snapshot.name === name && snapshot.status === READY);
    return saved ? { id: saved.id, name, snapshot: true } : { id: name, name, snapshot: false };
  }

  async snapshots(): Promise<Snapshot[]> {
    return (await this.#api.snapshots()).filter((snapshot) => snapshot.status === READY).map(toSnapshot);
  }

  async prepare(run: BurstRun): Promise<void> {
    const name = `orly-burst-${run.runId}`;
    await this.#api.addKey(name, run.publicKey);
    this.#keyLabel = name;
    const caller = await callerAddress(this.#fetch);
    this.#group = await this.#api.createSshGroup(name, caller);
    run.write(`orly burst: ${name} admits SSH from ${caller} only`);
  }

  async create(run: BurstRun, job: Job): Promise<Machine> {
    const plan = await this.#resolvePlan();
    const source = job.image.snapshot ? await this.#snapshotSource(job.image.id) : await this.#osImage(job.image.name);
    const name = `orly-burst-${job.name}-${run.runId.slice(-4)}`;
    let id: string;
    try {
      id = await this.#api.createVm({
        name, kind: "vm", cluster_type: "tir-cluster", image_type: "pre-built", image_version_id: source.versionId,
        sku_item_price_id: plan.priceId, disk_size_in_gb: DISK_GB, quantity: 1,
        public_key: [run.publicKey], security_group_id: Number(this.#group), ...(source.snapshotId ? { snapshot_id: Number(source.snapshotId) } : {}),
      });
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
      const vm = await this.#api.vm(machine.id);
      if (vm.status === "error") throw new OrlyError(`VM ${machine.id} failed to start`);
      return vm.status === "running" ? vm.address : undefined;
    });
    return { ...machine, address };
  }

  // The VM is stopped first, so the snapshot is of a disk at rest. Saving is
  // polled until ready or failed; one still saving at the run's deadline is
  // left to finish and reported as pending.
  async capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot> {
    await this.#api.stopVm(machine.id);
    await this.#until(run, job, "the VM to stop", async () => (await this.#api.vm(machine.id)).status === "stopped" || undefined);
    const created = await this.#api.createSnapshot(machine.id, name);
    run.write(`orly burst: saving ${name} as snapshot ${created.id}`);
    for (;;) {
      const saved = (await this.#api.snapshots()).find((snapshot) => snapshot.id === created.id) ?? created;
      if (saved.status === READY) return toSnapshot(saved);
      if (FAILED.has(saved.status)) throw new OrlyError(`snapshot ${name} is ${saved.status}`);
      if (run.signal.aborted || Date.now() >= job.deadline) return toSnapshot(saved);
      await pause(this.#settings.pollMs, run.signal);
    }
  }

  async remove(_run: BurstRun, machine: Machine): Promise<void> {
    await this.#api.deleteVm(machine.id);
  }

  async deleteSnapshot(_run: BurstRun, snapshot: Snapshot): Promise<void> {
    await this.#api.deleteSnapshot(snapshot.id);
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
    const pk = (await this.#api.keys()).find((key) => key.label === label)?.pk;
    if (pk) await this.#api.deleteKey(pk);
    const group = this.#group;
    if (!group) return;
    const never = new AbortController().signal;
    const deleted = async () => this.#api.deleteSecurityGroup(group).then(() => true, () => undefined);
    await until(`security group ${group} to delete`, deleted, { deadline: Date.now() + GROUP_DELETE_MS, signal: never, pollMs: this.#settings.pollMs })
      .catch(() => run.write(`orly burst: could not delete TIR security group ${group} (${label}); delete it by hand`));
  }

  #resolvePlan(): Promise<Plan> {
    const { plan: sku, location } = this.#settings.e2e;
    this.#plan ??= this.#api.plans().then((plans) => {
      const match = plans.find((entry) => entry.sku === sku);
      if (match) return match;
      throw new OrlyError(`TIR offers no hourly ${sku} plan in ${location}; it offers: ${plans.map((entry) => entry.sku).join(", ") || "none"}`);
    });
    return this.#plan;
  }

  // `Ubuntu 24.04` is the image named Ubuntu at exactly version 24.04, never
  // `24.04-cuda13.0`. TIR lists some versions more than once; the highest
  // identifier is the newest build.
  async #osImage(wanted: string): Promise<{ versionId: number; snapshotId?: string }> {
    const [name = "", version = ""] = wanted.split(/\s+/, 2);
    const images = await this.#api.images();
    const matches = images.filter((image) => image.name.toLowerCase() === name.toLowerCase() && image.version === version);
    if (matches.length > 0) return { versionId: Math.max(...matches.map((image) => image.versionId)) };
    const named = images.filter((image) => image.name.toLowerCase() === name.toLowerCase());
    const offered = (named.length > 0 ? named : images.slice(0, 20)).map((image: OsImage) => `${image.name} ${image.version}`);
    throw new OrlyError(`TIR has no image ${wanted}; it has: ${offered.join(", ") || "none"}`);
  }

  async #snapshotSource(id: string): Promise<{ versionId: number | undefined; snapshotId: string }> {
    const snapshot = (await this.#api.snapshots()).find((candidate) => candidate.id === id);
    return { versionId: snapshot?.versionId, snapshotId: id };
  }

  #until<T>(run: BurstRun, job: Job, what: string, probe: () => Promise<T | undefined>): Promise<T> {
    return until(what, probe, { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs });
  }
}

function toSnapshot(snapshot: VmSnapshot): Snapshot {
  return { id: snapshot.id, name: snapshot.name, sizeGb: snapshot.sizeGb, launchId: snapshot.id, parts: [], ready: snapshot.status === READY };
}
