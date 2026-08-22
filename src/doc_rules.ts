import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Mechanical enforcement of docs/DOCUMENTATION_RULES.md over the markdown orly
// writes and renders.
//
// It lives in the CLI, not in this repository's audits/, because the gap it
// closes is in what orly RENDERS. A shell script here would only ever guard
// this checkout; a criterion in the engine travels with every install and
// reads the pages wherever they land.
//
// What it enforces, mechanically and without judgment:
//   DOCWORD  DOC-05 + DOC-07 + DOC-14b banned vocabulary, exact forms only.
//   DOCDASH  DOC-14b em-dash budget: none in short copy, two per long page.
//   DOCSENT  DOC-02 prose sentences carry at most 25 words.
//   DOCPARA  DOC-03 paragraphs carry at most three sentences.
//   DOCHEAD  DOC-25 one level-one heading, and no skipped heading level.
//
// What it deliberately leaves alone: DOC-06 (meaning survives the shorter
// form), DOC-12 (pronoun referents), DOC-34 (review checks), and the
// reading-joy set DOC-36..DOC-42. Each needs a reader who understands the
// page. DOC-33 and DOC-34 already split the rules that way, and faking the
// judgment half would report confidence nobody has.

export const DOC_WORD = "DOCWORD";
export const DOC_DASH = "DOCDASH";
export const DOC_SENTENCE = "DOCSENT";
export const DOC_PARAGRAPH = "DOCPARA";
export const DOC_HEADING = "DOCHEAD";

export type DocFinding = { file: string; line: number; code: string; message: string; weight: number };

const MAX_SENTENCE_WORDS = 25;
const MAX_PARAGRAPH_SENTENCES = 3;
// "Short copy" and "long page" need a bound to be mechanical. A page under
// this many words of prose is short copy and gets no em dash at all.
const SHORT_COPY_WORDS = 300;
const LONG_PAGE_DASHES = 2;
const EM_DASH = "—";
const README = "README.md";
const CONFIG_RELATIVE_PATH = ".oracle/orly.json";
const REGISTRY_FILE = "registry.json";
const CODE_PLACEHOLDER = "Code";
const EMPTY = "";
const CLOSERS = "]\")'";
const ENDERS = ".!?";
const SPACE = " ";
const UTF8 = "utf8";
const FRONT_MATTER_FENCE = "---";
// The first capture group, kept when a markdown span is unwrapped.
const FIRST_GROUP = "$1";

// Enumerated, never stemmed: a stemmer that turns "execute" into "executable"
// bans a correct English word, and one false positive is what gets a check
// switched off. The inflections that carry the same slop are listed by hand.
const BANNED_WORDS = new Set([
  "utilise", "utilises", "utilised", "utilising", "utilisation",
  "utilize", "utilizes", "utilized", "utilizing", "utilization",
  "facilitate", "facilitates", "facilitated", "facilitating",
  "leverage", "leverages", "leveraged", "leveraging",
  "orchestrate", "orchestrates", "orchestrated", "orchestrating", "orchestration",
  "instantiate", "instantiates", "instantiated", "instantiating", "instantiation",
  "terminate", "terminates", "terminated", "terminating", "termination",
  "provision", "provisions", "provisioned", "provisioning",
  "execute", "executes", "executed", "executing", "execution", "executions",
  "persist", "persists", "persisted", "persisting", "persistence",
  "hydrate", "hydrates", "hydrated", "hydrating", "hydration",
  "artifact", "artifacts",
  "powerful", "revolutionary", "enterprise-grade", "seamless", "seamlessly",
  "cutting-edge", "robust", "next-generation", "world-class", "intelligent",
  "delve", "delves", "delved", "delving",
  "foster", "fosters", "fostered", "fostering",
  "elevate", "elevates", "elevated", "elevating",
  "harness", "harnesses", "harnessed", "harnessing",
  "supercharge", "supercharges", "supercharged", "supercharging",
  "embark", "embarks", "embarked", "embarking",
  "ever-evolving", "tapestry", "realm", "realms",
]);

const BANNED_PHRASES = ["paradigm shift", "game changer", "game-changer"];

// Forms that end in a period without ending a sentence.
const ABBREVIATIONS = new Set(["e.g.", "i.e.", "etc.", "vs.", "cf.", "no.", "fig.", "approx."]);
// Product names are written lowercase and open sentences all over these pages.
// Without this list "…host. orly neither…" reads as one sentence and both
// length rules quietly under-report. The list is closed on purpose: guessing
// at lowercase sentence starts in general would split mid-sentence and invent
// violations.
const LOWERCASE_OPENERS = new Set(["orly", "gstack", "agentsfleet", "bun", "bunx", "git", "npm"]);

// Which DOC identifiers each code stands for, so a `lint-ignore` may name
// either the code or the rule it enforces.
const RULE_NAMES: Record<string, string> = {
  [DOC_WORD]: "DOC-05 DOC-07 DOC-14b",
  [DOC_DASH]: "DOC-14b",
  [DOC_SENTENCE]: "DOC-02",
  [DOC_PARAGRAPH]: "DOC-03",
  [DOC_HEADING]: "DOC-25",
};

// The pages orly renders into a repository, plus its readme. The materialised
// set is authoritative and it is recorded, not guessed: `.oracle/orly.json`
// names every file orly wrote here. In the engine's own checkout the registry
// names the sources those files are rendered from, which is the same set one
// step earlier. README.md joins either list by the scope rule in
// docs/DOCUMENTATION_RULES.md — the rules cover any documentation orly writes.
export function documentationSurfaces(root: string): string[] {
  const found = new Set<string>();
  for (const path of [join(root, REGISTRY_FILE), join(root, CONFIG_RELATIVE_PATH)]) {
    if (!existsSync(path)) continue;
    for (const match of readFileSync(path, UTF8).matchAll(/"([^"\n]+\.md)"/g)) {
      const relative = match[1] ?? EMPTY;
      if (!relative.startsWith("/") && !relative.includes("..")) found.add(relative);
    }
  }
  found.add(README);
  return [...found].filter((relative) => existsSync(join(root, relative))).sort();
}

export function scanSurfaces(root: string, surfaces: string[]): DocFinding[] {
  return surfaces.flatMap((relative) => scanDocument(relative, readFileSync(join(root, relative), UTF8)));
}

export function scanDocument(file: string, text: string): DocFinding[] {
  return new Reader(file, text).run();
}

type Paragraph = { text: string; line: number; ignore: string };

class Reader {
  private readonly findings: DocFinding[] = [];
  private paragraph: Paragraph = { text: EMPTY, line: 0, ignore: EMPTY };
  // A pragma introduces the paragraph under it, so it outlives its own line
  // and dies with the paragraph it was written for.
  private pendingIgnore = EMPTY;
  private readonly declared = new Set<string>();
  private proseWords = 0;
  private dashes = 0;
  private headingLevels: number[] = [];
  private inComment = false;
  private inFence = false;
  private inFrontMatter = false;

  constructor(private readonly file: string, private readonly text: string) {}

  run(): DocFinding[] {
    const lines = this.text.split(/\r?\n/);
    for (const [index, raw] of lines.entries()) this.read(raw, index + 1);
    this.flush();
    this.reportHeadings();
    this.reportDashes();
    return this.findings;
  }

  private read(raw: string, lineNumber: number): void {
    if (lineNumber === 1 && raw === FRONT_MATTER_FENCE) {
      this.inFrontMatter = true;
      return;
    }
    if (this.inFrontMatter) {
      if (raw === FRONT_MATTER_FENCE) this.inFrontMatter = false;
      return;
    }
    if (/^[ \t]*(```|~~~)/.test(raw)) {
      this.inFence = !this.inFence;
      this.flush();
      return;
    }
    if (this.inFence) return;
    if (this.inComment) {
      if (raw.includes("-->")) this.inComment = false;
      return;
    }
    // A comment that opens and closes on one line is cut out of the line, not
    // used to drop it: a prose line ending in a pack marker is still prose.
    // One comment is read rather than dropped, `lint-ignore: <CODE> — reason`,
    // the spelling DOC-35 already gives an exception. It clears that code for
    // the paragraph it introduces, and it is how a page that must NAME a
    // banned word says so out loud instead of silently.
    const ignore = /lint-ignore:[ \t]*(DOC[A-Z0-9-]*)/.exec(raw)?.[1] ?? EMPTY;
    if (ignore) {
      this.declared.add(ignore);
      this.pendingIgnore = ignore;
    }
    const active = this.pendingIgnore;
    const line = raw.replace(/<!--.*?-->/g, SPACE);
    if (line.includes("<!--")) {
      this.inComment = true;
      return;
    }
    // Tables are exempt by DOC-13, and a cell is not a sentence.
    if (/^[ \t]*\|/.test(line)) {
      this.flush();
      return;
    }
    const heading = /^(#{1,6})[ \t]+(.*)$/.exec(line);
    if (heading) {
      this.flush();
      this.readHeading(heading[1]?.length ?? 0, clean(heading[2] ?? EMPTY), lineNumber, active);
      return;
    }
    if (/^[ \t]*$/.test(line)) {
      // Unless the line went blank because it held nothing but a lint-ignore:
      // a pragma on its own line introduces the paragraph under it.
      if (!ignore) this.flush();
      return;
    }
    if (/^[ \t]*([-*+]|[0-9]+[.)])[ \t]/.test(line)) this.flush();
    const prose = clean(line.replace(/^[ \t]*>[ \t]?/, EMPTY).replace(/^[ \t]*([-*+]|[0-9]+[.)])[ \t]+/, EMPTY));
    if (/^[ \t]*$/.test(prose)) return;
    this.scanWords(prose, lineNumber, active);
    this.countDashes(prose);
    if (!this.paragraph.text) this.paragraph = { text: prose, line: lineNumber, ignore: active };
    else this.paragraph.text += `${SPACE}${prose}`;
  }

  private readHeading(level: number, title: string, lineNumber: number, ignore: string): void {
    this.scanWords(title, lineNumber, ignore);
    this.countDashes(title);
    const previous = this.headingLevels[this.headingLevels.length - 1];
    if (previous === undefined) {
      if (level !== 1) this.report(lineNumber, DOC_HEADING, `first heading is H${level}, not H1`, 1, ignore);
    } else if (level > previous + 1) {
      this.report(lineNumber, DOC_HEADING, `heading level jumps H${previous} to H${level}`, 1, ignore);
    }
    this.headingLevels.push(level);
  }

  private scanWords(prose: string, lineNumber: number, ignore: string): void {
    this.proseWords += words(prose).length;
    const spoken = unquote(prose);
    for (const token of words(spoken)) {
      // An all-caps token is a name, not vocabulary: EXECUTE is a lifecycle
      // stage, CONFORM is a gate, DOC-05 is a rule identifier. DOC-09 asks for
      // one canonical name per concept, and this is how those names are written.
      if (/^[A-Z0-9_.-]+$/.test(token) && /[A-Z]/.test(token)) continue;
      const word = token.toLowerCase().replace(/^[./-]+/, EMPTY).replace(/[.,;:!?)/-]+$/, EMPTY);
      if (BANNED_WORDS.has(word)) {
        this.report(lineNumber, DOC_WORD, `banned word "${token}" (DOC-05/DOC-07/DOC-14b)`, 1, ignore);
      }
    }
    const lowered = spoken.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lowered.includes(phrase)) this.report(lineNumber, DOC_WORD, `banned phrase "${phrase}" (DOC-14b)`, 1, ignore);
    }
  }

  private countDashes(prose: string): void {
    this.dashes += prose.split(EM_DASH).length - 1;
  }

  private flush(): void {
    const { text, line, ignore } = this.paragraph;
    this.paragraph = { text: EMPTY, line: 0, ignore: EMPTY };
    if (!text) return;
    this.pendingIgnore = EMPTY;
    const parts = sentences(text);
    if (parts.length > MAX_PARAGRAPH_SENTENCES) {
      this.report(line, DOC_PARAGRAPH, `${parts.length} sentences in one paragraph, DOC-03 allows ${MAX_PARAGRAPH_SENTENCES}`, 1, ignore);
    }
    for (const sentence of parts) {
      const count = words(sentence).length;
      if (count > MAX_SENTENCE_WORDS) {
        this.report(line, DOC_SENTENCE, `${count} words in one sentence, DOC-02 allows ${MAX_SENTENCE_WORDS}: "${excerpt(sentence)}"`, 1, ignore);
      }
    }
  }

  private reportHeadings(): void {
    const first = this.headingLevels.filter((level) => level === 1).length;
    if (first === 0) this.reportPage(DOC_HEADING, "no level-one heading", 1);
    if (first > 1) this.reportPage(DOC_HEADING, `${first} level-one headings, DOC-25 allows one`, first - 1);
  }

  private reportDashes(): void {
    const short = this.proseWords < SHORT_COPY_WORDS;
    const budget = short ? 0 : LONG_PAGE_DASHES;
    if (this.dashes <= budget) return;
    const where = short ? `short copy (${this.proseWords} prose words), budget 0` : `a long page, budget ${budget}`;
    this.reportPage(DOC_DASH, `${this.dashes} em dashes in ${where}`, this.dashes - budget);
  }

  // `weight` is how much debt a finding carries: one for a line-level
  // violation, the overage for a page-level budget. A page five dashes over
  // and a page one dash over are not the same finding.
  private report(line: number, code: string, message: string, weight: number, ignore: string): void {
    if (ignore && allows(ignore, code)) return;
    this.findings.push({ file: this.file, line, code, message, weight });
  }

  private reportPage(code: string, message: string, weight: number): void {
    for (const declared of this.declared) if (allows(declared, code)) return;
    this.findings.push({ file: this.file, line: 0, code, message, weight });
  }
}

function allows(ignore: string, code: string): boolean {
  return ignore === code || (RULE_NAMES[code] ?? EMPTY).includes(ignore);
}

function words(prose: string): string[] {
  return prose.replace(/[^A-Za-z0-9_/.-]+/g, SPACE).split(/[ \t]+/).filter(Boolean);
}

// Everything the rules exempt comes out before any rule reads the text. An
// inline code span becomes a placeholder word rather than a hole: a hole loses
// the capital that starts the next sentence, and the splitter then welds two
// sentences into one long false positive. A link keeps its text and drops its
// target, because the text is prose and the target is a path no rule governs.
function clean(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, SPACE)
    .replace(/`[^`]*`/g, CODE_PLACEHOLDER)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, FIRST_GROUP)
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, FIRST_GROUP)
    .replace(/https?:\/\/[^\s)>]+/g, SPACE)
    .replace(/<[^>]*>/g, SPACE);
}

// Use versus mention: a word inside quotation marks is being named, not used.
// A rule that bans a word has to print it to ban it, and a page quoting a
// caller is reporting speech rather than writing it.
function unquote(prose: string): string {
  return prose.replace(/“[^”]*”/g, SPACE).replace(/"[^"]*"/g, SPACE);
}

function excerpt(sentence: string): string {
  const limit = 57;
  return sentence.length > limit + 3 ? `${sentence.slice(0, limit)}...` : sentence;
}

// A period, question mark, or exclamation mark, then optional closing brackets
// or quotes, then a space, then the next sentence. What follows the space
// decides: a lowercase letter, a digit, or more punctuation continues the
// sentence, unless the word is one of the lowercase product names.
function sentences(paragraph: string): string[] {
  const parts: string[] = [];
  let current = EMPTY;
  for (let index = 0; index < paragraph.length; index += 1) {
    const character = paragraph[index] ?? EMPTY;
    current += character;
    if (!ENDERS.includes(character)) continue;
    while (CLOSERS.includes(paragraph[index + 1] ?? EMPTY) && index + 1 < paragraph.length) {
      index += 1;
      current += paragraph[index];
    }
    const gap = paragraph[index + 1] ?? EMPTY;
    if (gap !== SPACE && gap !== "\t" && gap !== EMPTY) continue;
    const rest = paragraph.slice(index + 2);
    if (gap !== EMPTY && /^[a-z0-9,;:]/.test(rest) && !LOWERCASE_OPENERS.has(/^[A-Za-z0-9_-]+/.exec(rest)?.[0] ?? EMPTY)) continue;
    const previous = current.split(/[ \t]/).pop() ?? EMPTY;
    if (ABBREVIATIONS.has(previous.toLowerCase()) || /^[A-Za-z]\.$/.test(previous)) continue;
    parts.push(current.trim());
    current = EMPTY;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
