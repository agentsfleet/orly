import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { scan, SCANNER_TIMEOUT_MS, STAGED, staged } from "./scanner_test_support";

const SOURCE = "lib/a.ts";
const DUPLICATE = "export function first() { return \"duplicate value\"; }\nexport function second() { return \"duplicate value\"; }\n";
const FLAGGED = `string-dup-file ${SOURCE} "duplicate value" 2`;
const MANIFEST = "crates/app/Cargo.toml";
const RUST_SOURCE = "crates/app/src/lib.rs";
const ERROR_TYPE = "pub struct Error;\npub type Result<T, E = Error> = core::result::Result<T, E>;\n";
const LOSSY = "pub fn read() -> Result<()> {\n    std::fs::read(\"x\").map_err(|e| Error::Io(e.to_string()))?;\n    Ok(())\n}\n";
const CODE = "UZ-AUTH-001";
const NOT_A_FILE = "audit target is not a file: missing.ts";
const SECONDS_PER_MINUTE = 60;

setDefaultTimeout(SCANNER_TIMEOUT_MS);
afterEach(cleanupTemporaryDirectories);

test.each([
  'export const ROUTE = "/api/*";',
  "export const ROUTE = '/api/*';",
  "export const ROUTE = `/api/*`;",
  "/* the user's choice */ export const PICK = 'x';",
])("a quoted comment marker does not hide the lines after it: %s", async (opening) => {
  const project = newRepository();
  await staged(project, SOURCE, `${opening}\n${DUPLICATE}`);
  const result = scan(project, "audits/ufs.sh", [STAGED]);
  expect(result.code).toBe(1);
  expect(result.text).toContain(FLAGGED);
});

test("lines inside a real block comment are still skipped", async () => {
  const project = newRepository();
  await staged(project, SOURCE, `/* example:\n${DUPLICATE}*/\nexport const MESSAGE = "once";\n`);
  expect(scan(project, "audits/ufs.sh", [STAGED]).code).toBe(0);
});

async function rustCrate(source: string): Promise<string> {
  const project = newRepository();
  await staged(project, MANIFEST, '[package]\nname = "app"\nversion = "0.0.0"\n');
  await staged(project, RUST_SOURCE, source);
  return project;
}

test.each(["#[cfg(test)]\nmod tests;\n", "#[cfg(test)] mod tests;\n"])("production code after an out-of-line test module is audited: %j", async (module) => {
  const project = await rustCrate(`${ERROR_TYPE}${module}\n${LOSSY}`);
  const result = scan(project, "audits/rust-error.sh", [STAGED]);
  expect(result.code).toBe(1);
  expect(result.text).toContain("lossy-map_err=1");
});

test("a one-line test module opener keeps its body out of production", async () => {
  const project = await rustCrate(`${ERROR_TYPE}#[cfg(test)] mod tests {\n    use super::*;\n${LOSSY}}\n`);
  const result = scan(project, "audits/rust-error.sh", [STAGED]);
  expect(result.code).toBe(0);
  expect(result.text).toContain("lossy-map_err=0");
});

test("a raw error code after a one-line out-of-line test module is a leak", async () => {
  const project = newRepository();
  await staged(project, "crates/app/src/codes.rs", `pub const AUTH: ErrorCode = ErrorCode::declare("${CODE}");\n`);
  await staged(project, "crates/app/src/handler.rs", `#[cfg(test)] mod tests;\n\npub fn handler() -> &'static str { "${CODE}" }\n`);
  const result = scan(project, "audits/error-codes.sh", [STAGED]);
  expect(result.code).toBe(1);
  expect(result.text).toContain("handler.rs");
});

test("explicit files resolve from the caller's directory, and a missing name refuses", async () => {
  const project = newRepository();
  await staged(project, SOURCE, `export function seconds(minutes: number) { return minutes * ${SECONDS_PER_MINUTE}; }\n`);
  const nested = Bun.spawnSync(["bash", join(ROOT, "dispatch/write_any.sh"), "a.ts"], {
    cwd: join(project, "lib"), env: { ...UNSCOPED_ENVIRONMENT, TMPDIR: temporaryDirectory() }, stdout: "pipe", stderr: "pipe",
  });
  expect(nested.exitCode).toBe(1);
  expect(nested.stdout.toString()).toContain(`numeric-suspect ${SOURCE}:1 ${SECONDS_PER_MINUTE}`);
  for (const script of ["audits/ufs.sh", "audits/msid-ui.sh"]) {
    const missing = scan(project, script, ["missing.ts"]);
    expect(missing.code).toBe(2);
    expect(missing.text).toContain(NOT_A_FILE);
  }
});
