type Node = string | { type?: unknown; props?: { children?: Node[] } };
type Section = { title: string; nodes: Node[] };
type Dimension = { id: string; done: boolean };

const DIMENSION = /^Dimension (\d+\.\d+)\s*[—-]\s*/;
const COMPLETED = /^DONE(?:\s*[—-]|$)/;
const CLAIM = /\bdeferr(ed|al|als)\b|\bMOVED\s+to\s+M\d+_\d+|\btransferred\b/i;
// `Owner (<name>, <date>)` names who decided and when (docs/TEMPLATE.md, Owner
// quote). `Indy (<date>)` is the form specs written before it already carry.
// Angle brackets are the template's unfilled placeholders, never a name or date.
const ACK = /^(?:Owner \([^\s(),<>][^\n(),<>]*,\s*[^\s()<>][^\n()<>]*\)|Indy \([^\n()<>]+\)): "([^"\n]+)"\s*[—-]\s*context:\s*\S/;
const UNNAMED = /\bdeferred\s+(to|until|for)\b|\bMOVED\s+to\s+M\d+_\d+/i;
const ROW_ID = /\b[RS]\d+\b/g;
const P0_CELL = /(?:^| \| )P0(?= \| |$)/;
const DEFERRAL = /\bdeferr(ed|al|als)\b/i;
const TRANSFER = /\bMOVED\s+to\s+M\d+_\d+/i;
const BLOCKQUOTE = "blockquote";
const LIST_ITEM = "li";
const TABLE_ROW = "tr";
const CELL_SEPARATOR = " | ";

function isElement(node: Node): node is Exclude<Node, string> { return typeof node !== "string"; }
function children(node: Node): Node[] { return isElement(node) ? node.props?.children ?? [] : []; }
function text(node: Node): string { return isElement(node) ? children(node).map(text).join("") : node; }

function sectionsOf(source: string): Section[] {
  const sections: Section[] = [{ title: "", nodes: [] }];
  for (const node of children(Bun.markdown.react(source) as Node)) {
    if (isElement(node) && node.type === "h2") sections.push({ title: text(node), nodes: [] });
    else if (sections.length) sections[sections.length - 1]!.nodes.push(node);
  }
  return sections;
}

function prose(nodes: Node[], kind: string): string[] {
  return nodes.flatMap((node) => {
    if (!isElement(node) || ["pre", "code", BLOCKQUOTE].includes(String(node.type))) return [];
    if (node.type !== kind) return prose(children(node), kind);
    // Bare-joined cells fuse a Priority "P0" with a Graded "MOVED to …" into one
    // word, and the claim pattern's word boundary then never matches.
    return [kind === TABLE_ROW ? children(node).map(text).join(CELL_SEPARATOR) : text(node)];
  });
}

export function specDimensionsOf(source: string): Dimension[] {
  const section = sectionsOf(source).find((entry) => /^Sections\b/.test(entry.title));
  return prose(section?.nodes ?? [], LIST_ITEM).flatMap((item) => {
    const match = DIMENSION.exec(item);
    return match ? [{ id: match[1]!, done: COMPLETED.test(item.slice(match[0].length)) }] : [];
  });
}

function obligations(claim: string): string[] {
  return [...claim.matchAll(/\bDimension\s+(\d+\.\d+)\b|\bSection\s+(\d+)\b|§\s*(\d+)\b|\b([RS]\d+)\b/gi)]
    .map((match) => match[1] ? `Dimension ${match[1]}` : match[2] || match[3] ? `Section ${match[2] ?? match[3]}` : match[4]!);
}

function binds(quote: string, item: string): boolean {
  const identifier = item.replace(/^(Dimension|Section) /, "");
  const escaped = identifier.replaceAll(".", "\\.");
  return new RegExp(`(?:^|[^\\w.])${escaped}(?=$|[^\\w.])`, "i").test(quote);
}

export function unacknowledgedObligations(source: string): string[] {
  const sections = sectionsOf(source);
  const discovery = sections.find((entry) => /^Discovery\b/.test(entry.title));
  const quotes = (discovery?.nodes ?? []).filter((node) => isElement(node) && node.type === BLOCKQUOTE)
    .flatMap((node) => { const match = ACK.exec(text(node)); return match ? [match[1]!] : []; });
  const owed = (claim: string, items: string[]) => {
    if (!items.length && UNNAMED.test(claim)) return [`unnamed obligation: ${claim}`];
    return items.filter((item) => !quotes.some((quote) => binds(quote, item)));
  };
  const lines = sections.flatMap((section) => [...prose(section.nodes, LIST_ITEM), ...prose(section.nodes, "p")]).filter((line) => CLAIM.test(line));
  const rows = sections.flatMap((section) => prose(section.nodes, TABLE_ROW)).filter((row) => CLAIM.test(row));
  const unacknowledged = [
    ...lines.flatMap((claim) => owed(claim, obligations(claim))),
    // A rubric row owes its own id and, for a transfer, the successor's row; the
    // Section its Criterion cites is a pointer. A P0 row cannot be deferred at
    // all (dispatch/lifecycle.md, Rubric grading and transfers).
    ...rows.flatMap((row) => {
      const ids = [...row.matchAll(ROW_ID)].map((match) => match[0]);
      if (P0_CELL.test(row) && DEFERRAL.test(row) && !TRANSFER.test(row)) {
        return [`${ids[0] ?? row} is P0 and cannot be deferred: MOVE it or return to EXECUTE`];
      }
      return owed(row, ids.length ? ids : obligations(row));
    }),
  ];
  return [...new Set(unacknowledged)];
}
