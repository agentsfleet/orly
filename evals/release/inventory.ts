import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const OUTPUT = "evals/release/inventory.json";
const DISPOSITIONS = "evals/release/reviewed.json";
const MAX_CHECK_MS = 10_000;
const REVIEWED = "reviewed";
const PENDING = "pending";
const ENCODING = "utf8";
const PIPE_OUTPUT = "pipe";
const GIT = "git";
const LS_FILES = "ls-files";
const ZERO_DELIMITED = "-z";
const NULL_BYTE = "\0";
const HEAD = "HEAD";
const EXCLUDED = [".agents/skills/typesafe-ai/", "skills-lock.json"];
type Disposition = { status: string; evidence: string; findings: string[]; reviewedDigest?: string };
type Pack = { managed_files: Array<{ source: string; target: string }> };

function command(argv: string[]): string {
  const result = Bun.spawnSync(argv, { cwd: ROOT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, timeout: MAX_CHECK_MS });
  if (result.exitCode !== 0) throw new Error(`${argv.join(" ")} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

function purpose(path: string, text: string): string {
  if (path.startsWith("docs/v1/done/")) return "Historical specification; preserve the recorded outcome.";
  if (path.startsWith("fixtures/")) return "Declared positive or negative fixture; validate through its caller.";
  if (path.endsWith(".test.ts")) return "Behavior assertions and failure-path evidence.";
  if (path.startsWith(".github/workflows/")) return "Hosted verification or publication job.";
  if (path.endsWith(".md")) return text.match(/^# (.+)$/m)?.[1] ?? "Instructions or supporting prose.";
  if (path.startsWith("schemas/")) return "Machine-readable boundary definition.";
  if (path.startsWith("branding/")) return "Brand asset referenced by published documentation.";
  if (path.startsWith("src/")) return "Runtime implementation or test support.";
  if (path.startsWith("evals/")) return "Evaluation inputs, runner or recorded observations.";
  if (path.startsWith("audits/") || path.startsWith("dispatch/")) return "Rule checking, routing or shared audit support.";
  return "Repository build, distribution, discovery or governance support.";
}

function reviewFor(path: string, digest: string, disposition?: Disposition) {
  if (!disposition) return { status: PENDING, evidence: "Awaiting semantic review; mechanical inspection is not completion.", findings: [] };
  if (disposition.status !== REVIEWED) return disposition;
  const selfReference = path === OUTPUT || path === DISPOSITIONS;
  if (!selfReference && disposition.reviewedDigest === digest) return disposition;
  return {
    status: PENDING,
    evidence: selfReference ? "Self-referential records require an independently bound snapshot digest." : "Recorded review does not cover the current bytes.",
    findings: disposition.findings,
    previousReview: disposition,
  };
}

function inspect(path: string, packed: Set<string>, generated: Map<string, string>, dispositions: Record<string, Disposition>) {
  const absolute = resolve(ROOT, path);
  const present = existsSync(absolute);
  const link = present && lstatSync(absolute).isSymbolicLink();
  const bytes = present ? (link ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute)) : Buffer.alloc(0);
  const binary = bytes.includes(0);
  const text = binary ? "" : bytes.toString(ENCODING);
  const shell = path.endsWith(".sh") || text.startsWith("#!/usr/bin/env bash");
  const syntax = shell && present ? Bun.spawnSync(["bash", "-n", absolute], { stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, timeout: MAX_CHECK_MS }) : undefined;
  const disposition = dispositions[path];
  const digest = `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`;
  return {
    path, present, package: packed.has(path), bytes: bytes.length,
    digest: path === OUTPUT ? "self-generated" : digest,
    kind: link ? "symlink" : binary ? "binary" : extname(path).slice(1) || "support",
    purpose: purpose(path, text), authority: generated.get(path) ?? "repository-owned source",
    inspection: { completeBytesRead: present && !link, shellSyntax: syntax ? (syntax.exitCode === 0 ? "pass" : syntax.stderr.toString().trim()) : "not applicable", lines: binary ? null : text.split("\n").length - 1 },
    review: reviewFor(path, digest, disposition),
  };
}

export function inventory() {
  const tracked = command([GIT, LS_FILES, ZERO_DELIMITED]).split(NULL_BYTE).filter(Boolean);
  const untracked = command([GIT, LS_FILES, "--others", "--exclude-standard", ZERO_DELIMITED]).split(NULL_BYTE).filter(Boolean);
  const pack = JSON.parse(command(["npm", "pack", "--dry-run", "--json"])) as Array<{ files: Array<{ path: string }> }>;
  const packed = new Set(pack.flatMap((entry) => entry.files.map((file) => file.path)));
  const dispositions = JSON.parse(readFileSync(resolve(ROOT, DISPOSITIONS), ENCODING)) as Record<string, Disposition>;
  const registry = JSON.parse(readFileSync(resolve(ROOT, "registry.json"), ENCODING)) as { packs: Record<string, Pack>; core_documents: string[] };
  const generated = new Map<string, string>([["AGENTS.md", registry.core_documents.join(" + ") + " via bin/orly update"]]);
  for (const pack of Object.values(registry.packs)) for (const entry of pack.managed_files) {
    if (entry.source !== entry.target && existsSync(resolve(ROOT, entry.target))) generated.set(entry.target, entry.source);
  }
  const previous = command([GIT, "ls-tree", "-r", "--name-only", ZERO_DELIMITED, HEAD]).split(NULL_BYTE).filter(Boolean);
  const paths = [...new Set([...previous, ...tracked, ...untracked, ...packed, OUTPUT])].filter((path) => !EXCLUDED.some((excluded) => path === excluded || path.startsWith(excluded))).sort();
  const files = paths.map((path) => inspect(path, packed, generated, dispositions));
  return {
    source_revision: command([GIT, "rev-parse", HEAD]).trim(),
    scope: "Tracked, new release files and packed contents; user-owned installed skill and lock excluded explicitly.",
    totals: { files: files.length, packed: packed.size, reviewed: files.filter((file) => file.review.status === REVIEWED).length, pending: files.filter((file) => file.review.status === PENDING).length },
    excluded: EXCLUDED,
    files,
  };
}

if (import.meta.main) {
  const result = inventory();
  writeFileSync(resolve(ROOT, OUTPUT), `${JSON.stringify(result, undefined, 2)}\n`);
  // The report distinguishes byte inspection from semantic review completion.
  console.log(JSON.stringify(result.totals));
}
