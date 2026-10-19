import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { scanDocument, type DocFinding, type DocScanOptions } from "./doc_rules";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { defaultMergeBase } from "./surfaces";

const PIPE_OUTPUT = "pipe";
const UTF8 = "utf8";
const NUL = "\0";
const REV_PARSE = "rev-parse";
const LS_FILES = "ls-files";
const NUL_PATHS = "-z";
const END_OPTIONS = "--";
const MARKDOWN = /\.mdx?$/i;
const SNAPSHOT_OR_DEPENDENCY = /(^|\/)(\.orly|node_modules|vendor|third_party|dist|build)\//;
const SPEC_RECORD = /^docs\/v\d+(?:\.\d+)*\/(pending|active|done)\//;
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
const DIFF = ["diff", "--no-ext-diff", "--no-textconv", "--no-color"];

// Compare the merge base with the working tree, so committed, staged, and
// unstaged changes use the same line numbers. New, untracked pages join them.
export function scanChangedDocuments(root: string): DocFinding[] {
  gitText(root, [REV_PARSE, "--git-dir"]);
  const base = defaultMergeBase(root) || gitText(root, [REV_PARSE, "--verify", "HEAD"], true).trim();
  const untracked = paths(gitText(root, [LS_FILES, "--others", "--exclude-standard", NUL_PATHS]));
  const tracked = base
    ? paths(gitText(root, [...DIFF, "--name-only", "--diff-filter=ACMRT", NUL_PATHS, base, END_OPTIONS]))
    : paths(gitText(root, [LS_FILES, "--cached", NUL_PATHS]));
  const candidates = new Set([...tracked, ...untracked]);
  const findings: DocFinding[] = [];
  for (const file of candidates) {
    if (!MARKDOWN.test(file) || SNAPSHOT_OR_DEPENDENCY.test(file) || SPEC_RECORD.test(file)) continue;
    const absolute = join(root, file);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) continue;
    const patch = base && !untracked.has(file)
      ? gitText(root, [...DIFF, "--unified=0", base, END_OPTIONS, file]) : "";
    const options = !base || untracked.has(file) || /^--- \/dev\/null$|^old mode 120000$/m.test(patch)
      ? {} : changedLines(patch);
    findings.push(...scanDocument(file, readFileSync(absolute, UTF8), options));
  }
  return findings;
}

function changedLines(patch: string): DocScanOptions {
  const lines = new Set<number>();
  for (const match of patch.matchAll(HUNK)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let offset = 0; offset < count; offset += 1) lines.add(start + offset);
    // Removing a separator can join paragraphs without adding any text.
    if (count === 0) {
      lines.add(Math.max(1, start));
      lines.add(start + 1);
    }
  }
  return { lines, headingsChanged: /^[-+][ \t]{0,3}#{1,6}[ \t]/m.test(patch) };
}

function paths(output: string): Set<string> {
  return new Set(output.split(NUL).filter(Boolean));
}

function gitText(root: string, args: string[], allowMissingHead = false): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT,
  });
  if (result.exitCode === 0) return result.stdout.toString();
  if (allowMissingHead && result.exitCode === 128) return "";
  throw new Error(`git ${args[0]} failed: ${result.stderr.toString().trim()}`);
}
