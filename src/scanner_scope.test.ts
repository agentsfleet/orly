import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { statSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

import { cleanupTemporaryDirectories, git, newRepository, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const TEST_TIMEOUT_MS = 30_000;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PERMISSION_BITS = 0o777;
const CONCURRENT_RECEIPTS = 2;
const SECONDS_PER_MINUTE = 60;
const STAGED = "--staged";
const ALL = "--all";
const ADD = "add";
const COMMIT = "commit";
const SOURCE = "lib/odd 'quote\" back\\slash.ts";
const ZIG_SOURCE = "lib/runtime one.zig";
const RUST_SOURCE = "crates/runtime one/src/error 'quoted.rs";
const ALIAS_SOURCE = "crates/runtime one/src/result alias.rs";
const MANIFEST = "crates/runtime one/Cargo.toml";
const CONFIG = ".orly/orly.json";
const CLEAN = "export const MESSAGE = \"once\";\n";
const DUPLICATE = "export function first() { return \"duplicate value\"; }\nexport function second() { return \"duplicate value\"; }\n";
const NUMERIC = "export function seconds(minutes: number) { return minutes * 60; }\n";
const MARKER = "M" + "9_001";
const MARKED = `// ${MARKER}\nexport const VALUE = true;\n`;
const OWNED_ALIAS = "pub type Result<T, E = Error> = core::result::Result<T, E>;\n";
const ERROR_TYPE = "pub struct Error;\n";
const VALUE_INIT = "pub fn init() Self { return .{}; }\n";
const ALLOCATING_INIT = "pub fn init(a: std.mem.Allocator) !Self { const owned = try a.alloc(u8, COUNT); return .{ .owned = owned }; }\n";
const DIFF = "--diff";
const SCANNERS = ["ufs.sh", "logging.sh", "deinit-pairs.sh", "sql-mod.sh", "error-codes.sh", "rust-error.sh", "design-tokens.sh"];

setDefaultTimeout(TEST_TIMEOUT_MS);
afterEach(cleanupTemporaryDirectories);

function scan(project: string, script: string, args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(["bash", join(ROOT, script), ...args], {
    cwd: project, env: { ...UNSCOPED_ENVIRONMENT, TMPDIR: temporaryDirectory(), ...env },
    stdout: "pipe", stderr: "pipe", timeout: TEST_TIMEOUT_MS,
  });
  return { code: result.exitCode, text: result.stdout.toString() + result.stderr.toString() };
}

async function staged(project: string, path: string, content: string) {
  await Bun.write(join(project, path), content);
  git(project, ADD, path);
}

test.each([true, false])("staged literal checks grade index bytes with staged violation %s", async (badIndex) => {
  const project = newRepository();
  await staged(project, SOURCE, badIndex ? DUPLICATE : CLEAN);
  await Bun.write(join(project, SOURCE), badIndex ? CLEAN : DUPLICATE);
  const result = scan(project, "audits/ufs.sh", [STAGED], { ORLY_AUDIT_INDEX_SNAPSHOT: "1" });
  expect(result.code).toBe(badIndex ? 1 : 0);
  if (badIndex) expect(result.text).toContain(`string-dup-file ${SOURCE} "duplicate value" 2`);
  else expect(result.text).toContain("no violations across 1 file(s)");
});

test("explicit dispatch checks working bytes and forwards only the named file", async () => {
  const project = newRepository();
  await staged(project, SOURCE, CLEAN);
  await staged(project, "lib/unrelated.ts", DUPLICATE);
  await Bun.write(join(project, SOURCE), NUMERIC);
  const result = scan(project, "dispatch/write_any.sh", [SOURCE]);
  expect(result.code).toBe(1);
  expect(result.text).toContain(`ANY DISPATCH — 1 file(s)`);
  const receipt = result.text.match(/UFS.*see (.+receipt\.log)/)?.[1];
  expect(receipt).toBeDefined();
  const details = await Bun.file(receipt ?? "").text();
  expect(details).toContain(`numeric-suspect ${SOURCE}:1 ${SECONDS_PER_MINUTE}`);
  expect(details).not.toContain("unrelated.ts");
});

test("successful concurrent dispatch receipts have distinct readable private owners", async () => {
  const project = newRepository();
  await staged(project, SOURCE, CLEAN);
  const receiptsRoot = temporaryDirectory();
  const commands = Array.from({ length: CONCURRENT_RECEIPTS }, () => Bun.spawn(["bash", join(ROOT, "dispatch/write_any.sh"), SOURCE], {
    cwd: project, env: { ...UNSCOPED_ENVIRONMENT, TMPDIR: receiptsRoot }, stdout: "pipe", stderr: "pipe",
  }));
  const outputs = await Promise.all(commands.map(async (command) => {
    const output = await new Response(command.stdout).text();
    const error = await new Response(command.stderr).text();
    expect(await command.exited).toBe(0);
    return output + error;
  }));
  const receipts = outputs.flatMap((output) => Array.from(output.matchAll(/receipt: (.+receipt\.log)/g), (match) => match[1] ?? ""));
  expect(receipts).toHaveLength(6);
  expect(new Set(receipts).size).toBe(receipts.length);
  for (const path of receipts) {
    expect(await Bun.file(path).exists()).toBe(true);
    expect(await Bun.file(path).text()).toMatch(/OK:/);
    expect(statSync(dirname(path)).mode & PERMISSION_BITS).toBe(PRIVATE_DIRECTORY_MODE);
  }
});

test.each([true, false])("staged Rust aliases come from the same index with alias present %s", async (hasAlias) => {
  const project = newRepository();
  await staged(project, MANIFEST, '[package]\nname = "runtime"\nversion = "0.0.0"\n');
  await staged(project, RUST_SOURCE, ERROR_TYPE);
  await staged(project, ALIAS_SOURCE, hasAlias ? OWNED_ALIAS : "// no alias\n");
  await Bun.write(join(project, ALIAS_SOURCE), hasAlias ? "// no alias\n" : OWNED_ALIAS);
  const result = scan(project, "audits/rust-error.sh", [STAGED]);
  expect(result.code).toBe(hasAlias ? 0 : 1);
  expect(result.text).toContain(`missing-result-alias=${hasAlias ? 0 : 1}`);
});

test.each([true, false])("single-line initializers outside src need cleanup only when allocating %s", async (allocates) => {
  const project = newRepository();
  await staged(project, ZIG_SOURCE, allocates ? ALLOCATING_INIT : VALUE_INIT);
  const result = scan(project, "audits/deinit-pairs.sh", [STAGED]);
  expect(result.code).toBe(allocates ? 1 : 0);
  expect(result.text).toContain(allocates ? "requires cleanup (allocates) but no cleanup method" : "0 require cleanup, 0 unpaired");
});

test.each([true, false])("managed paths parse structurally with pretty configuration %s", async (pretty) => {
  const project = newRepository();
  await staged(project, SOURCE, DUPLICATE);
  await staged(project, CONFIG, JSON.stringify({ managed: [], arbitrary: SOURCE }, null, pretty ? 2 : undefined));
  const result = scan(project, "dispatch/write_any.sh", [STAGED]);
  expect(result.code).toBe(1);
  expect(result.text).toContain("ANY DISPATCH — 1 file(s)");
  expect(result.text).toContain("UFS");
});

test.each(["{", '{"managed":"src/code.ts"}', '{"managed":[false]}'])("malformed managed metadata refuses before a clean verdict: %s", async (content) => {
  const project = newRepository();
  await staged(project, SOURCE, CLEAN);
  await staged(project, CONFIG, content);
  const result = scan(project, "dispatch/write_any.sh", [STAGED]);
  expect(result.code).toBe(2);
  expect(result.text).not.toContain("all dispatched gates pass");
});

test("staged renames are checked and deleted paths are skipped", async () => {
  const project = newRepository();
  const before = "lib/old.ts";
  await staged(project, before, CLEAN);
  git(project, COMMIT, "-qm", "test: seed rename");
  git(project, "mv", before, SOURCE);
  await staged(project, SOURCE, DUPLICATE);
  const bad = scan(project, "audits/ufs.sh", [STAGED]);
  expect(bad.code).toBe(1);
  expect(bad.text).toContain(`string-dup-file ${SOURCE}`);
  git(project, "rm", "-f", SOURCE);
  const deleted = scan(project, "audits/ufs.sh", [STAGED]);
  expect(deleted.code).toBe(0);
  expect(deleted.text).toContain("no source files in scope");
});

test.each(SCANNERS)("%s preserves help and rejects unknown or mixed options", (leaf) => {
  const project = newRepository();
  expect(scan(project, `audits/${leaf}`, ["--help"]).text).toContain("usage:");
  expect(scan(project, `audits/${leaf}`, ["--help"]).code).toBe(0);
  expect(scan(project, `audits/${leaf}`, ["--invalid"]).code).toBe(2);
  const mixed = scan(project, `audits/${leaf}`, [STAGED, SOURCE]);
  expect(mixed.code).toBe(2);
  expect(mixed.text).toContain("cannot be mixed");
});

test("inherited SCOPE defaults select the index and ignore unstaged bytes", async () => {
  const project = newRepository();
  await staged(project, SOURCE, CLEAN);
  await Bun.write(join(project, SOURCE), NUMERIC);
  const scoped = scan(project, "audits/ufs.sh", [], { SCOPE: "staged" });
  expect(scoped.code).toBe(0);
  expect(scoped.text).toContain("no violations across 1 file(s)");
  expect(scan(project, "audits/ufs.sh", [ALL]).code).toBe(1);
});

test.each([true, false])("diff marker checks grade staged quoted paths with staged violation %s", async (badIndex) => {
  const project = newRepository();
  await staged(project, SOURCE, badIndex ? MARKED : CLEAN);
  await Bun.write(join(project, SOURCE), badIndex ? CLEAN : MARKED);
  const result = scan(project, "audits/msid-ui.sh", [STAGED]);
  expect(result.code).toBe(badIndex ? 1 : 0);
  expect(result.text).toContain(badIndex ? `MS-ID  ${SOURCE}: // ${MARKER}` : "0 hits");
});

test("diff marker explicit files use working bytes and missing comparisons refuse", async () => {
  const project = newRepository();
  await staged(project, SOURCE, CLEAN);
  await Bun.write(join(project, SOURCE), MARKED);
  expect(scan(project, "audits/msid-ui.sh", [SOURCE]).text).toContain(`MS-ID  ${SOURCE}`);
  const missing = scan(project, "audits/msid-ui.sh", [DIFF], { BASE: "missing-revision" });
  expect(missing.code).toBe(2);
  expect(missing.text).toContain("comparison revision is missing: missing-revision");
});

test("indexed source links cannot read outside their owned snapshot", async () => {
  const project = newRepository();
  const external = join(temporaryDirectory(), "owner.ts");
  await Bun.write(external, DUPLICATE);
  symlinkSync(external, join(project, "source.ts"));
  git(project, ADD, ".");
  const result = scan(project, "audits/ufs.sh", [STAGED]);
  expect(result.code).toBe(2);
  expect(result.text).toContain("unsafe indexed symbolic link: source.ts");
  expect(await Bun.file(external).text()).toBe(DUPLICATE);
});
