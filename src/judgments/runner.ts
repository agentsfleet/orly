import type { CompletedItem, IncompleteItem, Item, Manifest, Prepared, Report } from "./types";
import type { Reply } from "./wire";

import { OrlyError } from "../model";
import { assess } from "./advice";
import { JUDGMENT_MODE, MODEL, RESULT_STATUS } from "./constants";
import { prepareItem } from "./evidence";
import { validateManifest } from "./questions";
import { readReplay, replayDestination, writeReplay } from "./replay";
import { scanUpload } from "./scan";
import { requestAdvice, type Fetch } from "./transport";

type Dependencies = { fetch: Fetch; scan: (request: string) => Promise<void>; credential: string | undefined };
type Preparation = { status: "prepared"; value: Prepared } | IncompleteItem;
const PREPARED_STATUS = "prepared";
const ENVIRONMENT = Object.freeze({ credential: Bun.env.TYPESAFE_API_KEY });
const PREFLIGHT_REASON = "Input preflight is incomplete; no live requests were made.";

export async function judge(root: string, manifest: Manifest, refresh: boolean, dependencies: Dependencies = {
  fetch, scan: scanUpload, credential: ENVIRONMENT.credential,
}): Promise<Report> {
  validateManifest(manifest, manifest.stage);
  const prepared: Preparation[] = [];
  for (const item of manifest.items) {
    try { prepared.push({ status: PREPARED_STATUS, value: await prepareItem(root, item) }); }
    catch (error) { prepared.push(incomplete(item, error)); }
  }
  if (refresh) {
    if (prepared.some((item) => item.status === RESULT_STATUS.incomplete)) return failedPreflight(manifest, prepared);
    const failure = await livePreflight(root, prepared, dependencies);
    if (failure) return { stage: manifest.stage, advisory: true, requests: 0, results: manifest.items.map((item) => incomplete(item, failure)) };
  }
  const results: Report["results"] = [];
  // MAX_ITEMS bounds this sequential loop. Each item permits at most one request and no retry.
  for (const item of prepared) {
    if (item.status === RESULT_STATUS.incomplete) results.push(item);
    else results.push(await runItem(root, item.value, refresh, dependencies));
  }
  return { stage: manifest.stage, advisory: true, requests: results.reduce((total, item) => total + item.requests, 0), results };
}

async function livePreflight(root: string, prepared: Preparation[], dependencies: Dependencies): Promise<OrlyError | undefined> {
  try {
    if (!dependencies.credential?.trim()) throw new OrlyError("TYPESAFE_API_KEY is missing; nothing was uploaded.");
    for (const item of prepared) if (item.status === PREPARED_STATUS) await dependencies.scan(item.value.request);
    for (const item of prepared) if (item.status === PREPARED_STATUS) replayDestination(root, item.value);
    return undefined;
  } catch (error) {
    return new OrlyError(safeReason(error));
  }
}

async function runItem(root: string, prepared: Prepared, refresh: boolean, dependencies: Dependencies): Promise<CompletedItem | IncompleteItem> {
  const started = performance.now();
  let requests = 0;
  let reply: Reply | undefined;
  try {
    if (!refresh) {
      const cached = await readReplay(root, prepared);
      return complete(prepared, cached.reply, cached.elapsedMs, JUDGMENT_MODE.replay);
    }
    const credential = dependencies.credential;
    if (!credential) throw new OrlyError("Provider credential is unavailable.");
    requests = 1;
    reply = await requestAdvice(prepared, credential, dependencies.fetch);
    const elapsedMs = performance.now() - started;
    await writeReplay(root, prepared, reply, elapsedMs);
    return complete(prepared, reply, elapsedMs, JUDGMENT_MODE.live);
  } catch (error) {
    return { ...incomplete(prepared.item, error), requests, elapsedMs: performance.now() - started, usage: reply?.usage ?? null };
  }
}

function complete(prepared: Prepared, reply: Parameters<typeof assess>[1], elapsedMs: number, mode: "live" | "replay"): CompletedItem {
  const answer = reply.answers.decision;
  if (!answer) throw new OrlyError("Validated reply has no requested answer.");
  return {
    status: RESULT_STATUS.complete, id: prepared.item.id, question: prepared.item.question,
    mode, model: MODEL, identity: prepared.identity, sources: prepared.references,
    assessment: assess(prepared, reply), answer, requests: mode === JUDGMENT_MODE.live ? 1 : 0, elapsedMs, usage: reply.usage,
  };
}

function incomplete(item: Item, error: unknown): IncompleteItem {
  return { status: RESULT_STATUS.incomplete, id: item.id, question: item.question, reason: safeReason(error), requests: 0, elapsedMs: 0, usage: null };
}

function safeReason(error: unknown): string {
  return error instanceof OrlyError ? error.message : "Judgment unavailable; raw source and provider details were not logged.";
}

function failedPreflight(manifest: Manifest, prepared: Preparation[]): Report {
  return {
    stage: manifest.stage, advisory: true, requests: 0,
    results: prepared.map((item) => item.status === RESULT_STATUS.incomplete ? item : incomplete(item.value.item, new OrlyError(PREFLIGHT_REASON))),
  };
}
