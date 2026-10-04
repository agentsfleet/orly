import type { Selector } from "./types";
import type { ParserReply } from "./syntax_worker";

import { extname } from "node:path";

import { OrlyError } from "../model";
import { PARSE_TIMEOUT_MS } from "./constants";

type Span = { start: number; end: number };
type LocatedHeading = { title: string; level: number; start: number };
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const SECTION_HEADING_ERROR = "Markdown section requires an unambiguous plain heading.";
type ParserOptions = { timeoutMs?: number; workerUrl?: URL };

export async function selectSyntax(path: string, text: string, selector: Selector, options: ParserOptions = {}): Promise<Span> {
  if (selector.kind === "file") return { start: 0, end: text.length };
  if (selector.kind === "section") return selectSection(text, selector.heading);
  if (!TYPESCRIPT_EXTENSIONS.has(extname(path))) throw new OrlyError("Function and test selectors require TypeScript or JavaScript.");
  const worker = new Worker(options.workerUrl ?? new URL("./syntax_worker.ts", import.meta.url));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Span>((resolve, reject) => {
      timer = setTimeout(() => reject(new OrlyError("TypeScript evidence parsing timed out.")), options.timeoutMs ?? PARSE_TIMEOUT_MS);
      worker.onmessage = (event: MessageEvent<ParserReply>) => {
        const reply = event.data;
        if (!reply.ok) reject(new OrlyError(reply.reason));
        else resolve({ start: reply.start, end: reply.end });
      };
      worker.onerror = (event) => { event.preventDefault(); reject(new OrlyError("TypeScript evidence could not be parsed.")); };
      worker.postMessage({ path, text, selector });
    });
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
}

function selectSection(text: string, heading: string): Span {
  const headings = sectionHeadings(text);
  const indices = headings.flatMap((entry, index) => entry.title === heading ? [index] : []);
  if (indices.length !== 1) throw new OrlyError("Markdown section must match one complete heading.");
  const index = indices[0];
  const selected = index === undefined ? undefined : headings[index];
  if (!selected || index === undefined) throw new OrlyError("Markdown section is unavailable.");
  const next = headings.slice(index + 1).find((entry) => entry.level <= selected.level);
  return { start: selected.start, end: next?.start ?? text.length };
}

function sectionHeadings(text: string): LocatedHeading[] {
  const headings: LocatedHeading[] = [];
  const positions = new Map<string, LocatedHeading>();
  const seen = new Set<string>();
  const nonce = Bun.randomUUIDv7();
  // Mark candidate headings in a parsing copy; Bun decides which belong to real sections.
  const marked = text.replace(/^( {0,3})(#{1,6})[\t ]+([^\r\n]+?)[\t ]*$/gm,
    (_line: string, indentation: string, hashes: string, rawTitle: string, offset: number) => {
      const title = rawTitle.replace(/[\t ]+#+$/, "");
      const key = `orly-${nonce}-${offset} ${title}`;
      positions.set(key, { title, level: hashes.length, start: offset });
      return `${indentation}${hashes} ${key}`;
    });
  Bun.markdown.render(marked, { heading: (title, { level }) => {
    const found = positions.get(title);
    const identity = `${level}:${found?.title}`;
    if (!found || found.level !== level || seen.has(identity)) throw new OrlyError(SECTION_HEADING_ERROR);
    seen.add(identity);
    headings.push(found);
    return title;
  } });
  return headings;
}
