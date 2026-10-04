import type { Evidence, Item, Prepared, Reference } from "./types";

import { realpathSync } from "node:fs";

import { OrlyError } from "../model";
import { CATALOG_VERSION, MAX_REQUEST_BYTES, MAX_SOURCE_BYTES, MAX_STATE_BYTES, MODEL, NEWLINE, REPLY_KEY } from "./constants";
import { byteLength, containedFile, digest, readBounded } from "./files";
import { CATALOG } from "./questions";
import { selectSyntax } from "./syntax";

export async function prepareItem(root: string, item: Item): Promise<Prepared> {
  const definition = CATALOG[item.question];
  const evidence: Evidence[] = [];
  // MAX_EVIDENCE bounds this sequential loop; all semantic units are kept whole.
  for (const reference of item.evidence) evidence.push(await selectEvidence(root, reference));
  const state = { requirement: item.requirement, evidence };
  if (byteLength(JSON.stringify(state)) > MAX_STATE_BYTES) throw new OrlyError("Selected state exceeds the byte budget; choose smaller complete units.");
  const request = JSON.stringify({ state, model: MODEL, questions: { [REPLY_KEY]: definition.question } });
  if (byteLength(request) > MAX_REQUEST_BYTES) throw new OrlyError("Judgment request exceeds the byte budget.");
  const identity = digest(JSON.stringify({ root: realpathSync(root), catalog: CATALOG_VERSION, question: item.question, request }));
  const references = evidence.map(({ text, ...reference }) => ({ ...reference, digest: digest(text) }));
  return { item, definition, identity, request, references };
}

async function selectEvidence(root: string, reference: Reference): Promise<Evidence> {
  const path = containedFile(root, reference.path);
  const source = await readBounded(path, MAX_SOURCE_BYTES);
  const span = await selectSyntax(path, source, reference.selector);
  const text = source.slice(span.start, span.end);
  if (!text.trim()) throw new OrlyError("Selected evidence is empty.");
  const startLine = source.slice(0, span.start).split(NEWLINE).length;
  const endLine = source.slice(0, Math.max(span.start, span.end - 1)).split(NEWLINE).length;
  return { ...reference, startLine, endLine, text };
}
