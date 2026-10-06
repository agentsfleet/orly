import { afterEach, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { cleanupTemporaryDirectories, git, newRepository, ROOT } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const INVENTORY = "evals/release/inventory.json";
const REVIEWED_RECORD = "evals/release/reviewed.json";
const SCRIPT = "evals/release/inventory.ts";
const SOURCE = "src/subject.ts";
const CONTENT = "export const value = true;\n";
const REVIEWED = "reviewed";
const PENDING = "pending";
const ENCODING = "utf8";
const TEST_TIMEOUT_MS = 20_000;
const EMPTY_DIGEST = `sha256:${new Bun.CryptoHasher("sha256").update("").digest("hex")}`;
type Row = { path: string; present: boolean; package: boolean; digest: string; review: { status: string; evidence: string; previousReview?: { reviewedDigest?: string } } };

afterEach(cleanupTemporaryDirectories);

function fixture() {
  const repo = newRepository();
  mkdirSync(join(repo, dirname(SCRIPT)), { recursive: true });
  mkdirSync(join(repo, dirname(SOURCE)), { recursive: true });
  copyFileSync(join(ROOT, SCRIPT), join(repo, SCRIPT));
  writeFileSync(join(repo, SOURCE), CONTENT);
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "inventory-fixture", version: "1.0.0", files: ["src"] }));
  writeFileSync(join(repo, "registry.json"), JSON.stringify({ core_documents: [], packs: {} }));
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "fixture sources");
  return repo;
}

function review(repo: string, digest?: string) {
  writeFileSync(join(repo, REVIEWED_RECORD), JSON.stringify({
    [SOURCE]: { status: REVIEWED, evidence: "Reviewed these exact fixture bytes.", findings: ["A41"], ...(digest === undefined ? {} : { reviewedDigest: digest }) },
    [INVENTORY]: { status: REVIEWED, evidence: "Self review is insufficient.", findings: [], reviewedDigest: EMPTY_DIGEST },
    [REVIEWED_RECORD]: { status: REVIEWED, evidence: "Self review is insufficient.", findings: [], reviewedDigest: EMPTY_DIGEST },
  }));
}

function rows(repo: string): Row[] {
  const result = Bun.spawnSync(["bun", join(repo, SCRIPT)], { cwd: repo, env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe", timeout: TEST_TIMEOUT_MS });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  return (JSON.parse(readFileSync(join(repo, INVENTORY), ENCODING)) as { files: Row[] }).files;
}

test("inventory_covers_repository_and_package without inheriting a changed-byte review", () => {
  const repo = fixture();
  const digest = `sha256:${new Bun.CryptoHasher("sha256").update(CONTENT).digest("hex")}`;
  review(repo, digest);
  const initial = rows(repo);
  expect(initial.find((row) => row.path === SOURCE)).toMatchObject({ present: true, package: true, digest, review: { status: REVIEWED } });
  writeFileSync(join(repo, SOURCE), "export const value = false;\n");
  const changed = rows(repo).find((row) => row.path === SOURCE)!;
  expect(changed.review.status).toBe(PENDING);
  expect(changed.digest).not.toBe(digest);
  expect(changed.review.previousReview?.reviewedDigest).toBe(digest);
  expect(changed.package).toBeTrue();
}, TEST_TIMEOUT_MS);

test("a review missing a digest cannot authorize current bytes", () => {
  const repo = fixture();
  review(repo);
  expect(rows(repo).find((row) => row.path === SOURCE)?.review.status).toBe(PENDING);
}, TEST_TIMEOUT_MS);

test("inventory and review records require an external snapshot binding", () => {
  const repo = fixture();
  review(repo, EMPTY_DIGEST);
  const current = rows(repo);
  for (const path of [INVENTORY, REVIEWED_RECORD]) {
    const row = current.find((candidate) => candidate.path === path)!;
    expect(row.review.status).toBe(PENDING);
    expect(row.review.evidence).toContain("independently bound snapshot");
    expect(row.package).toBeFalse();
  }
}, TEST_TIMEOUT_MS);
