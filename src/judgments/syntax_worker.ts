import type { Selector } from "./types";

import { parse, type ParserPlugin } from "@babel/parser";
import { isArrowFunctionExpression, isCallExpression, isExportDefaultDeclaration, isExportNamedDeclaration, isFunctionDeclaration, isFunctionExpression, isIdentifier, isMemberExpression, isStringLiteral, isVariableDeclarator, traverse, type Node, type TraversalAncestors } from "@babel/types";
import { extname } from "node:path";

import { SELECTOR_KIND } from "./constants";

export type ParserReply = { ok: true; start: number; end: number } | { ok: false; reason: string };
type Request = { path: string; text: string; selector: Extract<Selector, { kind: "function" | "test" }> };
type Span = { start: number; end: number };
const TEST_FUNCTIONS = new Set(["it", SELECTOR_KIND.test]);
const SKIPPED_TESTS = new Set(["skip", "todo"]);
const TYPESCRIPT_JSX_EXTENSION = ".tsx";
const JSX_EXTENSIONS = new Set([TYPESCRIPT_JSX_EXTENSION, ".jsx"]);
const TYPESCRIPT_EXTENSIONS = new Set([".ts", TYPESCRIPT_JSX_EXTENSION, ".mts", ".cts"]);
const SELECTOR_ERROR = "Evidence selector must match one complete, executable unit.";
const SYNTAX_ERROR = "Selected TypeScript has syntax errors.";
declare const self: Worker;

self.onmessage = (event: MessageEvent<Request>) => {
  try { self.postMessage({ ok: true, ...selectProgramSpan(event.data) } satisfies ParserReply); }
  catch (error) { self.postMessage({ ok: false, reason: error instanceof Error && error.message === SELECTOR_ERROR ? SELECTOR_ERROR : SYNTAX_ERROR } satisfies ParserReply); }
};

function selectProgramSpan({ path, text, selector }: Request): Span {
  const extension = extname(path);
  const plugins: ParserPlugin[] = [];
  if (TYPESCRIPT_EXTENSIONS.has(extension)) plugins.push("typescript");
  if (JSX_EXTENSIONS.has(extension)) plugins.push("jsx");
  const tree = parse(text, { sourceType: "unambiguous", plugins, errorRecovery: true, attachComment: false });
  const matches: Span[] = [];
  traverse(tree, (node, ancestors) => {
    if (ancestors.some(({ node: ancestor }) => isSkipped(ancestor)) || isSkipped(node) || !matchesSelector(node, selector)) return;
    const selected = declarationSpan(node, ancestors);
    if (selected.start !== null && selected.start !== undefined && selected.end !== null && selected.end !== undefined) {
      matches.push({ start: selected.start, end: selected.end });
    }
  });
  const match = matches[0];
  if (matches.length !== 1 || !match) throw new Error(SELECTOR_ERROR);
  if (tree.errors?.length) throw new Error(SYNTAX_ERROR);
  return match;
}

function declarationSpan(node: Node, ancestors: TraversalAncestors): Node {
  const parent = ancestors.at(-1)?.node;
  return parent && (isExportNamedDeclaration(parent) || isExportDefaultDeclaration(parent)) ? parent : node;
}

function isSkipped(node: Node): boolean {
  if (!isCallExpression(node) || !isMemberExpression(node.callee)) return false;
  const { computed, property } = node.callee;
  const name = computed && isStringLiteral(property) ? property.value : !computed && isIdentifier(property) ? property.name : undefined;
  return name !== undefined && SKIPPED_TESTS.has(name);
}

function matchesSelector(node: Node, selector: Request["selector"]): boolean {
  if (selector.kind === SELECTOR_KIND.function) {
    if (isFunctionDeclaration(node)) return node.id?.name === selector.name && node.body !== undefined;
    return isVariableDeclarator(node) && isIdentifier(node.id) && node.id.name === selector.name
      && (isArrowFunctionExpression(node.init) || isFunctionExpression(node.init));
  }
  if (!isCallExpression(node)) return false;
  const callee = isMemberExpression(node.callee) ? node.callee.object : node.callee;
  const label = node.arguments[0];
  const callback = node.arguments[1];
  return isIdentifier(callee) && TEST_FUNCTIONS.has(callee.name) && isStringLiteral(label)
    && label.value === selector.name && (isArrowFunctionExpression(callback) || isFunctionExpression(callback));
}
