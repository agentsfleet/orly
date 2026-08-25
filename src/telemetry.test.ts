import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TelemetryEvent } from "./telemetry";
import {
  beginTelemetry,
  parseTelemetryEvent,
  readTelemetrySpool,
  recordTelemetry,
  replaceTelemetrySpool,
  resolveTelemetryConsent,
  TELEMETRY_PROMPT,
  withSpoolLock,
} from "./telemetry";
import { syncTelemetry } from "./telemetry_sync";

const FIXED_TIME = new Date("2026-08-25T12:00:00.000Z");
const FIVE_MINUTES_MILLISECONDS = 5 * 60 * 1_000;
const MAX_SPOOL_BYTES = 10 * 1024 * 1024;
const STATE_ENV = "AGENTSFLEET_STATE_DIR";
const ANONYMOUS_ENV = "ORLY_TELEMETRY";
const PRIVATE_SENTINEL = "private-context-sentinel";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("telemetry consent", () => {
  test("resolves_telemetry_consent_in_precedence_order", () => {
    expect(resolveTelemetryConsent({ ORLY_TELEMETRY_OFF: "1", ORLY_TELEMETRY: "anonymous" }, "anonymous")).toBe("off");
    expect(resolveTelemetryConsent({ ORLY_TELEMETRY: "off" }, "anonymous")).toBe("off");
    expect(resolveTelemetryConsent({ ORLY_TELEMETRY: "anonymous" }, "off")).toBe("anonymous");
    expect(resolveTelemetryConsent({ ORLY_TELEMETRY: "invalid" }, "anonymous")).toBe("off");
    expect(resolveTelemetryConsent({}, "anonymous")).toBe("anonymous");
    expect(resolveTelemetryConsent({})).toBe("off");
  });

  test("prompts_once_and_marks_aborted_prompt", async () => {
    const root = temporaryRoot();
    let prompts = 0;
    const options = {
      env: { [STATE_ENV]: root }, stdinIsTty: true, stdoutIsTty: true,
      ask: () => { prompts += 1; return null; },
    };
    expect(await beginTelemetry(["doctor"], options)).toBeUndefined();
    expect(await beginTelemetry(["doctor"], options)).toBeUndefined();
    expect(prompts).toBe(1);
    expect(await Bun.file(join(root, "orly/.telemetry-prompted")).exists()).toBe(true);
    expect(await Bun.file(join(root, "orly/.orly.json")).json()).toEqual({ telemetry: "off" });
  });

  test("anonymous_opt_in_persists_identity_and_does_not_reprompt", async () => {
    const root = temporaryRoot();
    let prompts = 0;
    const options = {
      env: { [STATE_ENV]: root }, stdinIsTty: true, stdoutIsTty: true,
      ask: () => { prompts += 1; return "2"; }, randomId: idSequence(40, 41, 42),
    };
    const first = await beginTelemetry(["doctor"], options);
    const second = await beginTelemetry(["doctor"], options);

    expect(prompts).toBe(1);
    expect(first).toMatchObject({ command: "doctor", invocation: "direct", installationId: uuid(41) });
    expect(second?.installationId).toBe(first?.installationId);
    expect(await Bun.file(join(root, "orly/.orly.json")).json()).toEqual({ telemetry: "anonymous" });
    expect(await Bun.file(join(root, "orly/installation-id")).text()).toBe(`${uuid(41)}\n`);
  });

  test("automation_never_prompts_for_telemetry", async () => {
    const root = temporaryRoot();
    let prompts = 0;
    const ask = () => { prompts += 1; return "2"; };
    await beginTelemetry(["gate"], { env: { [STATE_ENV]: root, ORLY_INVOCATION: "hook" }, stdinIsTty: true, stdoutIsTty: true, ask });
    await beginTelemetry(["gate"], { env: { [STATE_ENV]: root, CI: "true" }, stdinIsTty: true, stdoutIsTty: true, ask });
    await beginTelemetry(["gate"], { env: { [STATE_ENV]: root }, stdinIsTty: false, stdoutIsTty: false, ask });
    await beginTelemetry(["skill-event", "orly-spec-new"], { env: { [STATE_ENV]: root, ORLY_INVOCATION: "skill" }, stdinIsTty: true, stdoutIsTty: true, ask });
    expect(prompts).toBe(0);
  });

  test("consent_prompt_discloses_complete_collection_boundary", () => {
    for (const phrase of [
      "command, gate, and packaged Orly skill names", "failed gate criterion", "duration, Orly version", "installation IDs", "persists",
      "source code, file contents, prompts", "file paths, working directory", "environment variables", "raw error messages",
      "name, email, username, hostname", "Off", "default", "Anonymous",
    ]) expect(TELEMETRY_PROMPT).toContain(phrase);
  });
});

describe("telemetry events", () => {
  test("appends_one_valid_event_per_command", async () => {
    const root = temporaryRoot();
    const session = await anonymousSession(root, idSequence(1, 2));
    let launches = 0;
    await recordTelemetry(session, observation(), { now: () => FIXED_TIME, randomId: () => uuid(3), launchSync: () => { launches += 1; } });
    const events = await readTelemetrySpool(join(root, "orly"), FIXED_TIME);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ command: "gate", gate: "verify", outcome: "error", failed_criterion: "verify.unit" });
    expect(launches).toBe(1);
  });

  test("anonymous_installation_identity_is_stable_and_random", async () => {
    const root = temporaryRoot();
    const first = await anonymousSession(root, idSequence(10, 11));
    const second = await anonymousSession(root, idSequence(12, 13));
    expect(first?.installationId).toBe(uuid(11));
    expect(second?.installationId).toBe(first?.installationId);
    expect(first?.installationId).not.toContain(process.env.USER ?? PRIVATE_SENTINEL);
  });

  test("event_schema_rejects_private_context", async () => {
    const root = temporaryRoot();
    const session = await beginTelemetry(["gate", PRIVATE_SENTINEL], {
      env: { [STATE_ENV]: root, [ANONYMOUS_ENV]: "anonymous", PRIVATE_VALUE: PRIVATE_SENTINEL },
      stdinIsTty: false, stdoutIsTty: false, randomId: idSequence(20, 21),
    });
    await recordTelemetry(session, observation(), { now: () => FIXED_TIME, randomId: () => uuid(22), launchSync: () => undefined });
    const text = await Bun.file(join(root, "orly/analytics/orly-usage.jsonl")).text();
    expect(text).not.toContain(PRIVATE_SENTINEL);
    const value = JSON.parse(text);
    expect(parseTelemetryEvent(JSON.stringify({ ...value, repository: PRIVATE_SENTINEL }))).toBeUndefined();
  });

  test("packaged_skill_uses_the_command_spool", async () => {
    const root = temporaryRoot();
    const session = await beginTelemetry(["skill-event", "orly-write-unit-test"], {
      env: { [STATE_ENV]: root, [ANONYMOUS_ENV]: "anonymous", ORLY_INVOCATION: "skill" },
      stdinIsTty: true, stdoutIsTty: true, randomId: idSequence(30, 31),
    });
    await recordTelemetry(session, { outcome: "success", durationMs: 1, version: "0.6.9" }, {
      now: () => FIXED_TIME, randomId: () => uuid(32), launchSync: () => undefined,
    });
    const events = await readTelemetrySpool(join(root, "orly"), FIXED_TIME);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ command: "skill", skill: "orly-write-unit-test", invocation: "skill" });
    expect(parseTelemetryEvent(JSON.stringify({ ...events[0], skill: "unknown-skill" }))).toBeUndefined();
  });

  test("spool_lock_drops_contention_without_losing_the_owner_write", async () => {
    const root = join(temporaryRoot(), "orly");
    let contenderResult: boolean | undefined;
    const ownerResult = await withSpoolLock(root, async () => {
      contenderResult = await withSpoolLock(root, async () => {
        throw new Error("contending writer must not run");
      });
      await replaceTelemetrySpool(root, [event(450)], FIXED_TIME);
    });

    expect(ownerResult).toBe(true);
    expect(contenderResult).toBe(false);
    expect((await readTelemetrySpool(root, FIXED_TIME)).map((entry) => entry.event_id)).toEqual([uuid(450)]);
  });
});

describe("telemetry synchronization", () => {
  test("sync_is_consent_gated_and_schema_safe", async () => {
    const root = temporaryRoot();
    const stateRoot = join(root, "orly");
    await replaceTelemetrySpool(stateRoot, [event(1)], FIXED_TIME);
    const bodies: unknown[] = [];
    const fetchImpl = captureFetch(bodies);
    await syncTelemetry({ env: { [STATE_ENV]: root, ORLY_TELEMETRY_OFF: "1" }, now: () => FIXED_TIME, fetchImpl });
    expect(bodies).toHaveLength(0);
    await syncTelemetry({ env: { [STATE_ENV]: root, [ANONYMOUS_ENV]: "anonymous" }, now: () => FIXED_TIME, fetchImpl });
    const sent = postHogBatch(bodies[0]);
    expect(sent).toHaveLength(1);
    const properties = postHogProperties(sent[0]);
    expect(Object.keys(properties).sort()).toEqual([
      "$insert_id", "arch", "command", "distinct_id", "duration_ms", "event_id", "installation_id", "invocation",
      "orly_version", "os", "outcome", "schema_version", "session_id",
    ]);
  });

  test("sync_spaces_attempts_and_bounds_batches", async () => {
    const root = temporaryRoot();
    const stateRoot = join(root, "orly");
    await replaceTelemetrySpool(stateRoot, Array.from({ length: 101 }, (_, index) => event(index + 1)), FIXED_TIME);
    const bodies: unknown[] = [];
    const options = { env: { [STATE_ENV]: root, [ANONYMOUS_ENV]: "anonymous" }, now: () => FIXED_TIME, fetchImpl: captureFetch(bodies) };
    await syncTelemetry(options);
    await syncTelemetry(options);
    expect(bodies).toHaveLength(1);
    expect(postHogBatch(bodies[0])).toHaveLength(100);
    expect((await readTelemetrySpool(stateRoot, FIXED_TIME)).map((entry) => entry.event_id)).toEqual([uuid(101)]);
    expect(await Bun.file(join(stateRoot, "analytics/.last-sync-time")).text()).toBe(`${FIXED_TIME.toISOString()}\n`);
  });

  test("sync_retries_without_losing_or_renaming_events", async () => {
    const root = temporaryRoot();
    const stateRoot = join(root, "orly");
    const original = [event(201), event(202)];
    await replaceTelemetrySpool(stateRoot, original, FIXED_TIME);
    const failedBodies: unknown[] = [];
    const env = { [STATE_ENV]: root, [ANONYMOUS_ENV]: "anonymous" };
    await syncTelemetry({ env, now: () => FIXED_TIME, fetchImpl: failingFetch(failedBodies) });
    expect((await readTelemetrySpool(stateRoot, FIXED_TIME)).map((entry) => entry.event_id)).toEqual(original.map((entry) => entry.event_id));
    const retryTime = new Date(FIXED_TIME.getTime() + FIVE_MINUTES_MILLISECONDS + 1);
    const successBodies: unknown[] = [];
    await syncTelemetry({ env, now: () => retryTime, fetchImpl: captureFetch(successBodies) });
    expect(postHogIds(successBodies[0])).toEqual(postHogIds(failedBodies[0]));
    expect(await readTelemetrySpool(stateRoot, retryTime)).toEqual([]);
  });

  test("sync_retains_events_when_fetch_rejects", async () => {
    const root = temporaryRoot();
    const stateRoot = join(root, "orly");
    const original = [event(250)];
    await replaceTelemetrySpool(stateRoot, original, FIXED_TIME);

    await syncTelemetry({
      env: { [STATE_ENV]: root, [ANONYMOUS_ENV]: "anonymous" },
      now: () => FIXED_TIME,
      fetchImpl: async () => { throw new Error("network unavailable"); },
    });

    expect((await readTelemetrySpool(stateRoot, FIXED_TIME)).map((entry) => entry.event_id)).toEqual(original.map((entry) => entry.event_id));
  });

  test("sync_compacts_and_bounds_local_spool", async () => {
    const root = temporaryRoot();
    const stateRoot = join(root, "orly");
    const old = new Date(FIXED_TIME.getTime() - 8 * 24 * 60 * 60 * 1_000).toISOString();
    const large = Array.from({ length: 20 }, (_, index) => ({ ...event(index + 300), orly_version: "x".repeat(600_000) }));
    await replaceTelemetrySpool(stateRoot, [event(299, old), ...large], FIXED_TIME);
    const path = join(stateRoot, "analytics/orly-usage.jsonl");
    expect(statSync(path).size).toBeLessThanOrEqual(MAX_SPOOL_BYTES);
    const events = await readTelemetrySpool(stateRoot, FIXED_TIME);
    expect(events.some((entry) => entry.event_id === uuid(299))).toBe(false);
    expect(events.at(-1)?.event_id).toBe(uuid(319));
  });

  test("sync_names_skill_events_separately", async () => {
    const root = temporaryRoot();
    const stateRoot = join(root, "orly");
    await replaceTelemetrySpool(stateRoot, [{ ...event(400), command: "skill", skill: "orly-spec-new", invocation: "skill" }], FIXED_TIME);
    const bodies: unknown[] = [];
    await syncTelemetry({
      env: { [STATE_ENV]: root, [ANONYMOUS_ENV]: "anonymous" }, now: () => FIXED_TIME, fetchImpl: captureFetch(bodies),
    });
    const sent = postHogBatch(bodies[0]);
    expect(isRecord(sent[0]) ? sent[0].event : undefined).toBe("orly_skill_run");
    expect(postHogProperties(sent[0]).skill).toBe("orly-spec-new");
  });
});

function observation() {
  return { gate: "verify", outcome: "error" as const, failedCriterion: "verify.unit", durationMs: 42, version: "0.6.9" };
}

async function anonymousSession(root: string, randomId: () => string) {
  return beginTelemetry(["gate", "verify"], {
    env: { [STATE_ENV]: root, [ANONYMOUS_ENV]: "anonymous" }, stdinIsTty: false, stdoutIsTty: false, randomId,
  });
}

function event(index: number, timestamp = FIXED_TIME.toISOString()): TelemetryEvent {
  return {
    schema_version: 1, event_id: uuid(index), timestamp, command: "gate", outcome: "success", duration_ms: index,
    orly_version: "0.6.9", os: "darwin", arch: "arm64", invocation: "direct", session_id: uuid(9_000 + index), installation_id: uuid(8_000),
  };
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orly-telemetry-test-"));
  temporaryRoots.push(root);
  return root;
}

function idSequence(...values: number[]): () => string {
  let index = 0;
  return () => uuid(values[index++] ?? 999_999);
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function captureFetch(bodies: unknown[]) {
  return async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("ok", { status: 200 });
  };
}

function failingFetch(bodies: unknown[]) {
  return async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("unavailable", { status: 503 });
  };
}

function postHogBatch(body: unknown): unknown[] {
  return isRecord(body) && Array.isArray(body.batch) ? body.batch : [];
}

function postHogProperties(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.properties) ? value.properties : {};
}

function postHogIds(body: unknown): unknown[] {
  return postHogBatch(body).map((entry) => postHogProperties(entry).event_id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
