// The job prelude's /tmp check, run under bash with stand-ins for findmnt and
// mount: a noexec /tmp is remounted before any installer runs from it.
import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PRELUDE = join(import.meta.dir, "job.sh");

function execTmp(options: string): { stdout: string; mounted: string | undefined } {
  const bin = mkdtempSync(join(tmpdir(), "orly-job-"));
  try {
    const record = join(bin, "mount.args");
    writeFileSync(join(bin, "findmnt"), `#!/bin/sh\necho '${options}'\n`);
    writeFileSync(join(bin, "mount"), `#!/bin/sh\necho "$*" > '${record}'\n`);
    chmodSync(join(bin, "findmnt"), 0o755);
    chmodSync(join(bin, "mount"), 0o755);
    const run = Bun.spawnSync(["bash", "-c", `source '${PRELUDE}' && exec_tmp`], {
      env: { PATH: `${bin}:/usr/bin:/bin` },
    });
    expect(run.exitCode).toBe(0);
    return {
      stdout: run.stdout.toString(),
      mounted: existsSync(record) ? readFileSync(record, "utf8").trim() : undefined,
    };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test("a noexec /tmp is remounted exec before setup runs", () => {
  const result = execTmp("rw,nosuid,nodev,noexec,relatime");
  expect(result.mounted).toBe("-o remount,exec /tmp");
  expect(result.stdout).toBe("== remount /tmp exec\n");
});

test("an exec /tmp is left alone", () => {
  expect(execTmp("rw,nosuid,nodev,relatime")).toEqual({ stdout: "", mounted: undefined });
});
