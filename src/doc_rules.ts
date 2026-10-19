import { clean, excerpt, frontMatter, sentences, unquote, words } from "./doc_prose";

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
// The em-dash budget is calibrated for prose a first-day reader skims. The
// rule corpus is not that: dispatch pages, the operating model, and skill
// bodies are dense reference text where the dash separates a claim from its
// consequence, and a comma or a period there reads worse. Measured across the
// corpus the budget flagged 36 of 39 pages, which is a rule mis-fit rather
// than 36 defects. These pages keep every other rule.
const RULE_PAGE_DIRECTORIES = ["dispatch/", "core/", "audits/", "skills/"];
const RULE_PAGE_FILES = ["AGENTS.md", "AGENTS.orly.md", "SOUL.md", "RULES.md"];

function isRulePage(file: string): boolean {
  const normalised = file.replaceAll("\\", "/");
  if (RULE_PAGE_DIRECTORIES.some((directory) => normalised.includes(directory))) return true;
  const name = normalised.slice(normalised.lastIndexOf("/") + 1);
  return RULE_PAGE_FILES.includes(name);
}
const EMPTY = "";
const SPACE = " ";
const FRONT_MATTER_FENCE = "---";
const SLOP_RULE = "DOC-14b";
const BULLET_LEAD = "$1 ";

// Enumerated, never stemmed: a stemmer that turns "execute" into "executable"
// bans a correct English word, and one false positive is what gets a check
// switched off. The inflections that carry the same slop are listed by hand.
const BANNED_WORD_GROUPS = {
  "DOC-05": [
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
  ],
  "DOC-07": [
  "powerful", "revolutionary", "enterprise-grade", "seamless", "seamlessly",
  "cutting-edge", "robust", "next-generation", "world-class", "intelligent",
  ],
  [SLOP_RULE]: [
  "delve", "delves", "delved", "delving",
  "foster", "fosters", "fostered", "fostering",
  "elevate", "elevates", "elevated", "elevating",
  "supercharge", "supercharges", "supercharged", "supercharging",
  "embark", "embarks", "embarked", "embarking",
  "ever-evolving", "tapestry", "realm", "realms",
  // SOUL.md's reply-shape list restated these and drifted from this one. The
  // prose in DOCUMENTATION_RULES.md named only the British "utilise" while
  // the American forms above were already enforced here.
  "streamline", "streamlines", "streamlined", "streamlining",
  "empower", "empowers", "empowered", "empowering",
  "journey", "journeys", "landscape", "landscapes", "testament",
  "pivotal", "notably", "moreover", "furthermore", "myriad", "plethora",
  "aforementioned", "meticulous", "meticulously", "boasts", "cornerstone",
  "best-in-class", "industry-leading", "state-of-the-art", "unparalleled",
  "effortless", "effortlessly", "turnkey", "battle-tested", "rock-solid",
  "innovative",
  // core/operating-model.md already bans these two and names the
  // replacements: Prototype/Milestone/Workstream/Section/Dimension/Batch for
  // the hierarchy, "stages" for lifecycle steps, "rules" for what AGENTS.md
  // enforces. The rule shipped to every consumer with nothing enforcing it.
  "contract", "contracts", "contracted", "contracting",
  "phase", "phases", "phased", "phasing",
  ],
};
const BANNED_WORDS = new Map(Object.entries(BANNED_WORD_GROUPS).flatMap(([rule, terms]) => terms.map((term) => [term, rule] as const)));

const BANNED_PHRASES = ["paradigm shift", "game changer", "game-changer", "deep dive", "blazing fast", "blazingly fast",
  "it is important to note", "it is worth noting", "it's worth noting", "in conclusion",
  "we're excited to", "we are excited to", "we are pleased to"];

// Which DOC identifiers each code stands for, so a `lint-ignore` may name
// either the code or the rule it enforces.
const RULE_NAMES: Record<string, string> = {
  [DOC_WORD]: "DOC-05 DOC-07 DOC-14b",
  [DOC_DASH]: SLOP_RULE,
  [DOC_SENTENCE]: "DOC-02",
  [DOC_PARAGRAPH]: "DOC-03",
  [DOC_HEADING]: "DOC-25",
};

export type DocScanOptions = { lines?: ReadonlySet<number>; headingsChanged?: boolean };

export function scanDocument(file: string, text: string, options: DocScanOptions = {}): DocFinding[] {
  return new Reader(file, text, options).run();
}

type Paragraph = { text: string; line: number; end: number; ignore: string };

class Reader {
  private readonly findings: DocFinding[] = [];
  private paragraph: Paragraph = { text: EMPTY, line: 0, end: 0, ignore: EMPTY };
  // A pragma introduces the paragraph under it, so it outlives its own line
  // and dies with the paragraph it was written for.
  private pendingIgnore = EMPTY;
  private readonly declared = new Set<string>();
  private proseWords = 0;
  private dashes = 0;
  private changedDashes = 0;
  private headingLevels: number[] = [];
  private inComment = false;
  private fence = EMPTY;
  private codeTag = EMPTY;
  private inFrontMatter = false;
  private readonly pageIgnores: string[];

  constructor(private readonly file: string, private readonly text: string, private readonly options: DocScanOptions) {
    // Mintlify renders the front-matter title as H1.
    const metadata = frontMatter(text);
    this.pageIgnores = metadata.ignores;
    for (const code of this.pageIgnores) this.declared.add(code);
    if (/\.mdx$/i.test(file) && metadata.hasTitle) this.headingLevels = [1];
  }

  run(): DocFinding[] {
    const lines = this.text.split(/\r?\n/);
    for (const [index, raw] of lines.entries()) this.read(raw, index + 1);
    this.flush();
    this.reportHeadings();
    this.reportDashes();
    return this.findings;
  }

  private read(raw: string, lineNumber: number): void {
    if (this.skipBlock(raw, lineNumber)) return;
    // A comment that opens and closes on one line is cut out of the line, not
    // used to drop it: a prose line ending in a pack marker is still prose.
    // One comment is read rather than dropped, `lint-ignore: <CODE> — reason`,
    // the spelling DOC-35 already gives an exception. It clears that code for
    // the paragraph it introduces, and it is how a page that must NAME a
    // banned word says so out loud instead of silently.
    const ignore = /lint-ignore:[ \t]*(DOC[A-Za-z0-9-]*)/.exec(raw)?.[1] ?? EMPTY;
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
    if (/^[ \t]*<\/?[A-Za-z][^>]*>[ \t]*$/.test(line)) {
      this.flush();
      return;
    }
    const heading = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/.exec(line);
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
    const content = line
      .replace(/^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\*\*[^*]+\*\*)[ \t]+—[ \t]+/, BULLET_LEAD)
      .replace(/^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\*\*[^*]+?)[ \t]+—[ \t]+/, BULLET_LEAD);
    const prose = clean(content.replace(/^[ \t]*>[ \t]?/, EMPTY).replace(/^[ \t]*([-*+]|[0-9]+[.)])[ \t]+/, EMPTY));
    if (/^[ \t]*$/.test(prose)) return;
    if (!this.paragraph.text) this.paragraph = { text: prose, line: lineNumber, end: lineNumber, ignore: active };
    else this.paragraph.text += `${SPACE}${prose}`;
    this.paragraph.end = lineNumber;
  }

  private skipBlock(raw: string, lineNumber: number): boolean {
    if (lineNumber === 1 && raw === FRONT_MATTER_FENCE) {
      this.inFrontMatter = true;
      return true;
    }
    if (this.inFrontMatter) {
      if (raw === FRONT_MATTER_FENCE) this.inFrontMatter = false;
      return true;
    }
    const fence = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(raw);
    const marker = fence?.[1] ?? EMPTY;
    if (this.fence) {
      if (marker[0] === this.fence[0] && marker.length >= this.fence.length && !fence?.[2]?.trim()) this.fence = EMPTY;
      return true;
    }
    if (this.codeTag) {
      if (new RegExp(`</${this.codeTag}\\s*>`, "i").test(raw)) this.codeTag = EMPTY;
      return true;
    }
    if (this.inComment) {
      if (raw.includes("-->")) this.inComment = false;
      return true;
    }
    if (marker) {
      this.fence = marker;
      this.flush();
      return true;
    }
    const codeTag = /^[ \t]*<(pre|code)(?:\s[^>]*)?>/i.exec(raw)?.[1];
    if (codeTag && !new RegExp(`</${codeTag}\\s*>`, "i").test(raw)) {
      this.codeTag = codeTag.toLowerCase();
      this.flush();
      return true;
    }
    return false;
  }

  private readHeading(level: number, title: string, lineNumber: number, ignore: string): void {
    this.proseWords += words(title).length;
    this.scanWords(title, lineNumber, ignore);
    this.countDashes(title, lineNumber);
    if (/(^|\/)snippets\//.test(this.file)) return;
    const previous = this.headingLevels[this.headingLevels.length - 1];
    if (previous === undefined) {
      if (level !== 1) this.report(lineNumber, DOC_HEADING, `first heading is H${level}, not H1`, 1, ignore);
    } else if (level > previous + 1) {
      this.report(lineNumber, DOC_HEADING, `heading level jumps H${previous} to H${level}`, 1, ignore);
    }
    this.headingLevels.push(level);
  }

  private scanWords(prose: string, lineNumber: number, ignore: string, end = lineNumber): void {
    const spoken = unquote(prose);
    for (const token of words(spoken)) {
      // An all-caps token is a name, not vocabulary: EXECUTE is a lifecycle
      // stage, CONFORM is a gate, DOC-05 is a rule identifier. DOC-09 asks for
      // one canonical name per concept, and this is how those names are written.
      if (/^[A-Z0-9_.-]+$/.test(token) && /[A-Z]/.test(token)) continue;
      const word = token.toLowerCase().replace(/^[./-]+/, EMPTY).replace(/[.,;:!?)/-]+$/, EMPTY);
      const rule = BANNED_WORDS.get(word);
      if (rule) {
        this.report(lineNumber, DOC_WORD, `banned word "${token}" (${rule})`, 1, ignore, end, rule);
      }
    }
    const lowered = spoken.toLowerCase().replaceAll("’", "'");
    for (const phrase of BANNED_PHRASES) {
      if (lowered.includes(phrase)) this.report(lineNumber, DOC_WORD, `banned phrase "${phrase}" (${SLOP_RULE})`, 1, ignore, end, SLOP_RULE);
    }
  }

  private countDashes(prose: string, line: number, end = line): void {
    const count = prose.split(EM_DASH).length - 1;
    this.dashes += count;
    if (this.isChanged(line, end)) this.changedDashes += count;
  }

  private flush(): void {
    const { text, line, end, ignore } = this.paragraph;
    this.paragraph = { text: EMPTY, line: 0, end: 0, ignore: EMPTY };
    if (!text) return;
    this.pendingIgnore = EMPTY;
    this.proseWords += words(text).length;
    this.countDashes(text, line, end);
    if (!this.isChanged(line, end)) return;
    this.scanWords(text, line, ignore, end);
    const parts = sentences(text);
    if (parts.length > MAX_PARAGRAPH_SENTENCES) {
      this.report(line, DOC_PARAGRAPH, `${parts.length} sentences in one paragraph, DOC-03 allows ${MAX_PARAGRAPH_SENTENCES}`, 1, ignore, end);
    }
    for (const sentence of parts) {
      const count = words(sentence).length;
      if (count > MAX_SENTENCE_WORDS) {
        this.report(line, DOC_SENTENCE, `${count} words in one sentence, DOC-02 allows ${MAX_SENTENCE_WORDS}: "${excerpt(sentence)}"`, 1, ignore, end);
      }
    }
  }

  private reportHeadings(): void {
    if (/(^|\/)snippets\//.test(this.file)) return;
    if (this.options.lines && !this.options.headingsChanged) return;
    const first = this.headingLevels.filter((level) => level === 1).length;
    if (first === 0) this.reportPage(DOC_HEADING, "no level-one heading", 1);
    if (first > 1) this.reportPage(DOC_HEADING, `${first} level-one headings, DOC-25 allows one`, first - 1);
  }

  private reportDashes(): void {
    if (isRulePage(this.file) || !this.changedDashes) return;
    const short = this.proseWords < SHORT_COPY_WORDS;
    const budget = short ? 0 : LONG_PAGE_DASHES;
    if (this.dashes <= budget) return;
    const where = short ? `short copy (${this.proseWords} prose words), budget 0` : `a long page, budget ${budget}`;
    this.reportPage(DOC_DASH, `${this.dashes} em dashes in ${where}`, this.dashes - budget);
  }

  // `weight` is how much debt a finding carries: one for a line-level
  // violation, the overage for a page-level budget. A page five dashes over
  // and a page one dash over are not the same finding.
  private report(line: number, code: string, message: string, weight: number, ignore: string, end = line, rule?: string): void {
    if (!(code === DOC_HEADING && this.options.headingsChanged) && !this.isChanged(line, end)) return;
    if (ignore && allows(ignore, code, rule)) return;
    for (const declared of this.pageIgnores) if (allows(declared, code, rule)) return;
    this.findings.push({ file: this.file, line, code, message, weight });
  }

  private isChanged(start: number, end = start): boolean {
    if (!this.options.lines) return true;
    for (let line = start; line <= end; line += 1) if (this.options.lines.has(line)) return true;
    return false;
  }

  private reportPage(code: string, message: string, weight: number): void {
    for (const declared of this.declared) if (allows(declared, code)) return;
    this.findings.push({ file: this.file, line: 0, code, message, weight });
  }
}

function allows(ignore: string, code: string, rule?: string): boolean {
  return ignore === code || (rule ? ignore === rule : (RULE_NAMES[code] ?? EMPTY).split(SPACE).includes(ignore));
}
