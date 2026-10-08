import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { CONSUMER_SCENARIOS, CONSUMER_SOURCE, CONSUMER_TEST, OWNER_FILES, consumerProbe, mutateConsumer } from "../evals/judgments/comparison/consumer-checks";
import { consumerJevExamples, consumerReceiptSchema, CONSUMER_JEV_ERROR } from "../evals/judgments/comparison/jev-consumer";
import { MAX_JEV_REPORT_BYTES } from "../evals/judgments/comparison/jev-report";
import { CANDIDATE, CLASSIFICATION } from "../evals/judgments/comparison/types";
import { validateCatalog } from "../evals/judgments/comparison/validate";
import { MAX_SOURCE_BYTES } from "./judgments/constants";
import { digest, readBounded } from "./judgments/files";

const ROOT = resolve(import.meta.dir, "..");
const FIXTURE_ROOT = join(ROOT, "evals/judgments/comparison/fixtures");
const RECEIPT = join(ROOT, "evals/judgments/comparison/receipts/consumer-final.json");
const CLI = join(ROOT, "evals/judgments/comparison/jev-run.ts");
const PRIVATE_OWNER = "Owner bytes preserved in this isolated test.";
const TIMEOUT = 30_000;

class ConsumerFixture {
  readonly parent = realpathSync(mkdtempSync(join(tmpdir(), "orly-jev-consumer-")));
  readonly root = join(this.parent, "consumer");
  readonly receipt = join(this.parent, "consumer.json");

  async setup() {
    const source = await readBounded(join(FIXTURE_ROOT, "consumer-source.txt"), MAX_SOURCE_BYTES);
    const tests = await readBounded(join(FIXTURE_ROOT, "consumer-tests.txt"), MAX_SOURCE_BYTES);
    for (const file of [CONSUMER_SOURCE, ...OWNER_FILES]) {
      const path = join(this.root, file);
      mkdirSync(dirname(path), { recursive: true });
      await Bun.write(path, file === CONSUMER_SOURCE ? source : file === CONSUMER_TEST ? tests : PRIVATE_OWNER);
    }
    const report = consumerReceiptSchema.parse(JSON.parse(await readBounded(RECEIPT, MAX_SOURCE_BYTES)));
    report.metadata.owner_files = Object.fromEntries(OWNER_FILES.map((file) => [file, digest(file === CONSUMER_TEST ? tests : PRIVATE_OWNER)]));
    for (const scenario of CONSUMER_SCENARIOS) for (const suffix of ["submitted", "hidden", "repaired"]) {
      const text = suffix === "repaired" ? source : mutateConsumer(source, scenario);
      const identity = digest(JSON.stringify([{ path: "consumer-source.txt", digest: digest(text) },
        { path: "probe.ts", digest: digest(consumerProbe(this.root, suffix !== "submitted")) }]));
      const entry = report.attempts.find((item) => item.label === `${scenario}:${suffix}`);
      if (!entry) throw new Error("Missing recorded example.");
      entry.receipt.source_before = identity;
      entry.receipt.source_after = identity;
    }
    await Bun.write(this.receipt, JSON.stringify(report));
    return report;
  }

  async examples() {
    const catalog = validateCatalog(await Bun.file(join(ROOT, "evals/judgments/comparison/catalog.json")).json());
    return consumerJevExamples(this.root, this.receipt, catalog);
  }

  [Symbol.dispose]() { rmSync(this.parent, { recursive: true, force: true }); }
}

test("jev_inputs_exclude_expected_labels_and_validate_consumer_receipts", async () => {
  using fixture = new ConsumerFixture();
  await fixture.setup();
  const examples = await fixture.examples();
  expect(examples).toHaveLength(12);
  expect(examples.find((entry) => entry.id === "consumer-context-known-gap")).toMatchObject({ question: CANDIDATE.evidence, expected: CLASSIFICATION.defective });
  expect(examples.find((entry) => entry.id === "consumer-context-unknown-dependencies")).toMatchObject({ question: CANDIDATE.evidence, expected: CLASSIFICATION.insufficient });
  for (const entry of examples) {
    const state = JSON.parse(entry.input.request).state;
    expect(Object.keys(state).sort()).toEqual(["evidence", "requirement"]);
    expect(entry.input.request).not.toContain(entry.id);
  }
});

test("jev_consumer_refuses_each_tampered_probe_missing_outcome_and_duplicate", async () => {
  using fixture = new ConsumerFixture();
  const original = await fixture.setup();
  for (const scenario of CONSUMER_SCENARIOS) for (const suffix of ["submitted", "hidden", "repaired"]) {
    const changed = structuredClone(original);
    const entry = changed.attempts.find((item: { label: string }) => item.label === `${scenario}:${suffix}`);
    if (!entry) throw new Error("Missing attempt.");
    entry.receipt.source_after = digest("unrelated source");
    await Bun.write(fixture.receipt, JSON.stringify(changed));
    await expect(fixture.examples()).rejects.toThrow(CONSUMER_JEV_ERROR);
  }
  for (const mutate of [
    (report: typeof original) => { const entry = report.attempts.find((item) => item.label.endsWith(":submitted")); if (!entry) throw new Error("Missing attempt."); entry.label = "unrelated-attempt"; },
    (report: typeof original) => { const entry = report.attempts.find((item) => item.label.endsWith(":hidden")); if (!entry) throw new Error("Missing attempt."); entry.receipt.result.exit_code = 0; },
    (report: typeof original) => { const entry = report.attempts.find((item) => item.label.endsWith(":repaired")); if (!entry) throw new Error("Missing attempt."); entry.receipt.result.failure = "injected failure"; },
    (report: typeof original) => { const entry = report.attempts[1]; if (!entry) throw new Error("Missing attempt."); report.attempts[0] = entry; },
    (report: typeof original) => { const entry = report.attempts.find((item) => item.label.endsWith(":hidden")); if (!entry) throw new Error("Missing attempt."); entry.receipt.stdout = "[]"; },
    (report: typeof original) => { report.metadata.restored_source = digest("not restored"); },
    (report: typeof original) => { const owner = OWNER_FILES[0]; if (!owner) throw new Error("Missing owner."); report.metadata.owner_files[owner] = digest("changed owner"); },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    await Bun.write(fixture.receipt, JSON.stringify(changed));
    await expect(fixture.examples()).rejects.toThrow(CONSUMER_JEV_ERROR);
  }
});

test("jev_cli_without_credentials_retains_every_scheduled_attempt_and_preserves_output", async () => {
  using fixture = new ConsumerFixture();
  await fixture.setup();
  const output = join(fixture.parent, "results");
  const invoke = (destination: string) => Bun.spawnSync([process.execPath, CLI, "--live", fixture.root, fixture.receipt, destination], {
    env: { PATH: Bun.env.PATH ?? "", TYPESAFE_API_KEY: "" }, stdout: "pipe", stderr: "pipe", timeout: TIMEOUT,
  });
  const first = invoke(output);
  if (first.exitCode !== 0) throw new Error(first.stderr.toString());
  expect(first.exitCode).toBe(0);
  const file = Bun.file(join(output, "report.json"));
  const bytes = await file.text();
  const report = JSON.parse(bytes);
  expect(report.completed).toBe(true);
  expect(report.requests).toBe(0);
  expect(report.attempts).toHaveLength(188);
  expect(report.results.every((entry: { status: string }) => entry.status === "unavailable")).toBe(true);
  expect(invoke(output).exitCode).not.toBe(0);
  expect(await file.text()).toBe(bytes);
  const inside = invoke(join(fixture.root, "results"));
  expect(inside.exitCode).toBe(2);
  expect(inside.stderr.toString()).toContain("outside the authoring and consumer worktrees");
  expect(await Bun.file(join(fixture.root, "results/report.json")).exists()).toBe(false);
}, TIMEOUT);

test("jev_cli_refuses_symlink_outputs_authoring_outputs_and_oversized_replay", async () => {
  using fixture = new ConsumerFixture();
  await fixture.setup();
  const alias = join(fixture.parent, "consumer-alias");
  symlinkSync(fixture.root, alias);
  const oversized = join(fixture.parent, "oversized.json");
  await Bun.write(oversized, " ".repeat(MAX_JEV_REPORT_BYTES + 1));
  for (const [destination, mode, saved] of [
    [join(alias, "results"), "--live", []],
    [join(ROOT, "forbidden-jev-test-output"), "--live", []],
    [alias, "--live", []],
    [join(fixture.parent, "replay"), "--replay", [oversized]],
  ] as const) {
    const result = Bun.spawnSync([process.execPath, CLI, mode, fixture.root, fixture.receipt, destination, ...saved], {
      env: { PATH: Bun.env.PATH ?? "", TYPESAFE_API_KEY: "" }, stdout: "pipe", stderr: "pipe", timeout: TIMEOUT,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout.toString()).toBe("");
  }
  expect(await Bun.file(join(fixture.root, "results/report.json")).exists()).toBe(false);
  expect(await Bun.file(join(ROOT, "forbidden-jev-test-output/report.json")).exists()).toBe(false);
}, TIMEOUT);
