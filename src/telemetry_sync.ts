import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type TelemetryEvent,
  readPersistedConsent,
  readTelemetrySpool,
  replaceTelemetrySpool,
  resolveTelemetryConsent,
  telemetryStateRoot,
  withSpoolLock,
} from "./telemetry";

type SyncOptions = {
  env?: Record<string, string | undefined>;
  home?: string;
  now?: () => Date;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

type PendingBatch = {
  stateRoot: string;
  events: TelemetryEvent[];
};

const ANALYTICS_DIRECTORY = "analytics";
const LAST_ATTEMPT_FILE = ".last-sync-time";
const POSTHOG_HOST_ENV = "ORLY_POSTHOG_HOST";
const POSTHOG_KEY_ENV = "ORLY_POSTHOG_KEY";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const DEFAULT_POSTHOG_KEY = "phc_qhwWd6d67T4X4yDjQNeuBqrMKAPstGUeQtKLFF9t8fEF"; // gitleaks:allow — public capture-only project key
const POSTHOG_BATCH_PATH = "/batch";
const COMMAND_EVENT_NAME = "orly_command_run";
const SKILL_EVENT_NAME = "orly_skill_run";
const BATCH_LIMIT = 100;
const ATTEMPT_INTERVAL_MILLISECONDS = 5 * 60 * 1_000;
const REQUEST_TIMEOUT_MILLISECONDS = 3_000;

export async function syncTelemetry(options: SyncOptions = {}): Promise<void> {
  try {
    const env = options.env ?? process.env;
    const stateRoot = telemetryStateRoot(env, options.home);
    const persisted = await readPersistedConsent(stateRoot);
    if (resolveTelemetryConsent(env, persisted) !== "anonymous") return;
    const now = (options.now ?? (() => new Date()))();
    const pending = await pendingBatch(stateRoot, now);
    if (!pending || pending.events.length === 0) return;
    const response = await postBatch(pending.events, env, options.fetchImpl ?? fetch);
    if (!response.ok) return;
    await compactAcknowledgedPrefix(pending, now);
  } catch {
    return;
  }
}

async function pendingBatch(stateRoot: string, now: Date): Promise<PendingBatch | undefined> {
  let pending: PendingBatch | undefined;
  await withSpoolLock(stateRoot, async () => {
    const events = await readTelemetrySpool(stateRoot, now);
    await replaceTelemetrySpool(stateRoot, events, now);
    if (await attemptedRecently(stateRoot, now)) return;
    await writeFile(lastAttemptPath(stateRoot), `${now.toISOString()}\n`, { mode: 0o600 });
    pending = { stateRoot, events: events.slice(0, BATCH_LIMIT) };
  });
  return pending;
}

async function postBatch(events: TelemetryEvent[], env: Record<string, string | undefined>, fetchImpl: NonNullable<SyncOptions["fetchImpl"]>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MILLISECONDS);
  try {
    return await fetchImpl(new URL(POSTHOG_BATCH_PATH, env[POSTHOG_HOST_ENV] || DEFAULT_POSTHOG_HOST), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: env[POSTHOG_KEY_ENV] || DEFAULT_POSTHOG_KEY, batch: events.map(postHogEvent) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function postHogEvent(event: TelemetryEvent): Record<string, unknown> {
  return {
    event: event.skill ? SKILL_EVENT_NAME : COMMAND_EVENT_NAME,
    timestamp: event.timestamp,
    properties: {
      distinct_id: event.installation_id,
      $insert_id: event.event_id,
      schema_version: event.schema_version,
      event_id: event.event_id,
      command: event.command,
      ...(event.gate ? { gate: event.gate } : {}),
      ...(event.skill ? { skill: event.skill } : {}),
      outcome: event.outcome,
      ...(event.failed_criterion ? { failed_criterion: event.failed_criterion } : {}),
      duration_ms: event.duration_ms,
      orly_version: event.orly_version,
      os: event.os,
      arch: event.arch,
      invocation: event.invocation,
      session_id: event.session_id,
      installation_id: event.installation_id,
    },
  };
}

async function compactAcknowledgedPrefix(batch: PendingBatch, now: Date): Promise<void> {
  await withSpoolLock(batch.stateRoot, async () => {
    const current = await readTelemetrySpool(batch.stateRoot, now);
    const acknowledged = new Set(batch.events.map((event) => event.event_id));
    const firstUnacknowledged = current.findIndex((event) => !acknowledged.has(event.event_id));
    const remaining = firstUnacknowledged < 0 ? [] : current.slice(firstUnacknowledged);
    await replaceTelemetrySpool(batch.stateRoot, remaining, now);
  });
}

async function attemptedRecently(stateRoot: string, now: Date): Promise<boolean> {
  const path = lastAttemptPath(stateRoot);
  try {
    const timestamp = Date.parse((await readFile(path, "utf8")).trim());
    if (Number.isFinite(timestamp)) return now.getTime() - timestamp < ATTEMPT_INTERVAL_MILLISECONDS;
    const details = await stat(path);
    return now.getTime() - details.mtimeMs < ATTEMPT_INTERVAL_MILLISECONDS;
  } catch {
    return false;
  }
}

function lastAttemptPath(stateRoot: string): string {
  return join(stateRoot, ANALYTICS_DIRECTORY, LAST_ATTEMPT_FILE);
}

if (import.meta.main) await syncTelemetry();
