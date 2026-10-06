type Node = string | { type?: unknown; props?: { children?: Node[] } };
type Section = { title: string; nodes: Node[] };
type Dimension = { id: string; done: boolean };

const DIMENSION = /^Dimension (\d+\.\d+)\s*[—-]\s*/;
const COMPLETED = /^DONE(?:\s*[—-]|$)/;
const CLAIM = /\bdeferr(ed|al|als)\b|\bMOVED\s+to\s+M\d+_\d+|\btransferred\b/i;
const ACK = /^Indy \([^\n()]+\): "([^"\n]+)"\s*[—-]\s*context:\s*\S/;
const BLOCKQUOTE = "blockquote";
const LIST_ITEM = "li";

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
    return node.type === kind ? [text(node)] : prose(children(node), kind);
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
  const claims = sections.flatMap((section) => [...prose(section.nodes, LIST_ITEM), ...prose(section.nodes, "p"), ...prose(section.nodes, "tr")])
    .filter((line) => CLAIM.test(line));
  const unacknowledged = claims.flatMap((claim) => {
    const items = obligations(claim);
    if (!items.length && /\bdeferred\s+(to|until|for)\b|\bMOVED\s+to\s+M\d+_\d+/i.test(claim)) return [`unnamed obligation: ${claim}`];
    return items.filter((item) => !quotes.some((quote) => binds(quote, item)));
  });
  return [...new Set(unacknowledged)];
}
