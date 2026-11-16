import type { Fetch, Plan, SavedImage } from "./burst_e2e_api";
import type { BurstSettings } from "./burst_settings";
import type { BurstRun, CloudProvider, Image, Job, Machine, Snapshot } from "./burst_types";

import { E2eApi, E2eRequestFailed } from "./burst_e2e_api";
import { until } from "./burst_process";
import { OrlyError } from "./model";

const BASE_IMAGE = Object.freeze({ id: "Ubuntu-24.04-Distro", name: "Ubuntu-24.04-Distro", snapshot: false });
const NODE_LABEL = "orly-burst";
const READY = "Ready";
// The owner's planning figures (Nov 16, 2026), used in place of the rate card:
// a run hour costs ₹25 before 18% GST, billed by the started hour, and each
// stored snapshot ₹200 a month.
const RUPEES_PER_HOUR = 25;
const RUPEES_PER_SNAPSHOT_MONTH = 200;

// E2E Networks nodes through the MyAccount API. The run's public key is the
// node's only credential, passed at creation and gone with the node; a start
// script would be readable back through the node-details API, so none is
// used, and the job travels on the SSH session instead.
export class E2eNodes implements CloudProvider {
  readonly name = "e2e";
  readonly user: string;
  readonly #settings: BurstSettings;
  readonly #api: E2eApi;
  readonly #plans = new Map<string, Promise<Plan>>();

  constructor(settings: BurstSettings, fetcher: Fetch) {
    this.#settings = settings;
    this.user = settings.e2e.user;
    this.#api = new E2eApi(settings.e2e, fetcher);
  }

  cost(machine: Machine | undefined): string {
    return machine ? `₹${RUPEES_PER_HOUR}/h + GST (billed hourly)` : "none";
  }

  storage(): string {
    return `₹${RUPEES_PER_SNAPSHOT_MONTH}/month + GST`;
  }

  baseImage(): Image {
    return BASE_IMAGE;
  }

  // ORLY_BURST_E2E_IMAGE names a saved image when one has that name, and an
  // OS image otherwise.
  async override(): Promise<Image | undefined> {
    const name = this.#settings.e2e.image;
    if (!name) return undefined;
    const saved = (await this.#api.savedImages()).find((image) => image.name === name && image.state === READY);
    return saved ? { id: saved.templateId, name, snapshot: true } : { id: name, name, snapshot: false };
  }

  async snapshots(): Promise<Snapshot[]> {
    return (await this.#api.savedImages()).filter((image) => image.state === READY).map(toSnapshot);
  }

  // Each node takes the run's public key at creation, so nothing is
  // registered with the account ahead of it.
  async prepare(): Promise<void> {
    return undefined;
  }

  async create(run: BurstRun, job: Job): Promise<Machine> {
    // A saved image launches on the plan of the OS image it was captured from.
    const plan = await this.#plan(job.image.snapshot ? BASE_IMAGE.name : job.image.name);
    const name = `orly-burst-${job.name}-${run.runId.slice(-4)}`;
    let id: string;
    try {
      id = await this.#api.createNode({
        label: NODE_LABEL, name, plan: plan.plan, image: plan.image, ssh_keys: [run.publicKey], start_scripts: [],
        disable_password: true, default_public_ip: true, backups: false, number_of_instances: 1,
        is_saved_image: job.image.snapshot, saved_image_template_id: job.image.snapshot ? Number(job.image.id) : null,
      });
    } catch (error) {
      // A request that failed after reaching E2E may still have made the node.
      if (!(error instanceof E2eRequestFailed && error.status < 500)) run.write(`orly burst: lane=${job.name} E2E may have created node ${name} (label ${NODE_LABEL}); check MyAccount, it bills until deleted`);
      throw error;
    }
    run.write(`orly burst: lane=${job.name} node ${id} (${this.#settings.e2e.plan}, ${job.image.name}) created`);
    return { id, label: this.#settings.e2e.plan, address: undefined, hourly: RUPEES_PER_HOUR };
  }

  async ready(run: BurstRun, job: Job, machine: Machine): Promise<Machine> {
    const address = await this.#until(run, job, "a running node with a public address", async () => {
      const node = await this.#api.node(machine.id);
      if (node.status === "Failed") throw new OrlyError(`node ${machine.id} failed to start`);
      return node.status === "Running" ? node.address : undefined;
    });
    return { ...machine, address };
  }

  // A node is powered off before it is saved, so the image is of a disk at
  // rest. Saving answers at once; the image is usable once it reads Ready.
  async capture(run: BurstRun, job: Job, machine: Machine, name: string): Promise<Snapshot> {
    await this.#api.action(machine.id, "power_off");
    await this.#until(run, job, "the node to stop", async () => (await this.#api.node(machine.id)).status === "Stopped" || undefined);
    await this.#api.action(machine.id, "save_images", name);
    run.write(`orly burst: saving ${name}`);
    const saved = await this.#until(run, job, `saved image ${name}`, async () => (await this.#api.savedImages()).find((image) => image.name === name && image.state === READY));
    return toSnapshot(saved);
  }

  async remove(_run: BurstRun, machine: Machine): Promise<void> {
    await this.#api.deleteNode(machine.id);
  }

  async deleteSnapshot(_run: BurstRun, snapshot: Snapshot): Promise<void> {
    await this.#api.deleteImage(snapshot.id);
  }

  async finish(): Promise<void> {
    return undefined;
  }

  #plan(image: string): Promise<Plan> {
    const cached = this.#plans.get(image);
    if (cached) return cached;
    const { plan: sku, location } = this.#settings.e2e;
    const found = this.#api.plans().then((plans) => {
      const match = plans.find((entry) => entry.sku === sku && entry.image === image);
      if (match) return match;
      const offered = [...new Set(plans.filter((entry) => entry.image === image).map((entry) => entry.sku))].join(", ") || "none";
      throw new OrlyError(`E2E offers no ${sku} plan for ${image} in ${location}; it offers: ${offered}`);
    });
    this.#plans.set(image, found);
    return found;
  }

  #until<T>(run: BurstRun, job: Job, what: string, probe: () => Promise<T | undefined>): Promise<T> {
    return until(what, probe, { deadline: job.deadline, signal: run.signal, pollMs: this.#settings.pollMs });
  }

}

function toSnapshot(image: SavedImage): Snapshot {
  return { id: image.imageId, name: image.name, sizeGb: image.sizeGb, launchId: image.templateId, parts: [] };
}
