import { isObject, isString } from "./model";

const EMPTY = "";
const SPACE = " ";
const CODE_PLACEHOLDER = "Code";
const CLOSERS = "]\")'";
const ENDERS = ".!?";
const FIRST_GROUP = "$1";
const ABBREVIATIONS = new Set(["e.g.", "i.e.", "etc.", "vs.", "cf.", "no.", "fig.", "approx."]);
const LOWERCASE_OPENERS = new Set(["orly", "gstack", "agentsfleet", "bun", "bunx", "git", "npm"]);
const MAX_EXCEPTIONS = 3;

export function frontMatter(text: string): { hasTitle: boolean; ignores: string[] } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { hasTitle: false, ignores: [] };
  let parsed: unknown;
  try { parsed = Bun.YAML.parse(match[1] ?? EMPTY); }
  catch { return { hasTitle: false, ignores: [] }; }
  if (!isObject(parsed)) return { hasTitle: false, ignores: [] };
  const declared = parsed["lint-ignore"];
  const values = Array.isArray(declared) ? declared : [declared];
  const ignores = values.length > MAX_EXCEPTIONS ? [] : values.flatMap((value) => {
    const code = isString(value) ? /^(DOC[A-Za-z0-9-]+)[ \t]+—[ \t]+\S/.exec(value)?.[1] : undefined;
    return code ? [code] : [];
  });
  const title = parsed.title;
  return { hasTitle: isString(title) && title.trim().length > 0, ignores };
}

export function words(prose: string): string[] {
  return prose.replace(/[^A-Za-z0-9_/.-]+/g, SPACE).split(/[ \t]+/).filter(Boolean);
}

// Everything the rules exempt comes out before any rule reads the text. An
// inline code span becomes a placeholder word rather than a hole: a hole loses
// the capital that starts the next sentence, and the splitter then welds two
// sentences into one long false positive. A link keeps its text and drops its
// target, because the text is prose and the target is a path no rule governs.
export function clean(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, SPACE)
    .replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, CODE_PLACEHOLDER)
    .replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, CODE_PLACEHOLDER)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, FIRST_GROUP)
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, FIRST_GROUP)
    .replace(/https?:\/\/[^\s)>]+/g, SPACE)
    .replace(/<[^>]*>/g, SPACE);
}

// Use versus mention: a word inside quotation marks is being named, not used.
// A rule that bans a word has to print it to ban it, and a page quoting a
// caller is reporting speech rather than writing it.
export function unquote(prose: string): string {
  return prose.replace(/“[^”]*”/g, SPACE).replace(/"[^"]*"/g, SPACE);
}

export function excerpt(sentence: string): string {
  const limit = 57;
  return sentence.length > limit + 3 ? `${sentence.slice(0, limit)}...` : sentence;
}

// A period, question mark, or exclamation mark, then optional closing brackets
// or quotes, then a space, then the next sentence. What follows the space
// decides: a lowercase letter, a digit, or more punctuation continues the
// sentence, unless the word is one of the lowercase product names.
export function sentences(paragraph: string): string[] {
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
