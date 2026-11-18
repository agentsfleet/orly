// The job prelude's /tmp check, run under bash with stand-ins for findmnt and
// mount: a noexec /tmp is remounted before any installer runs from it.
import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UNSCOPED_ENVIRONMENT } from "../git_env";

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

// checkout() against real Git, with the machine's paths in a temporary
// directory: a warm checkout takes only what it lacks, a cold one the whole ref.
function checkout(fixture: { root: string; ref: string; commit: string }): { code: number; head: string; stderr: string } {
  const paths = `WORK='${join(fixture.root, "work")}' BUNDLE='${join(fixture.root, "sent.bundle")}'`;
  const run = Bun.spawnSync(["bash", "-c", `source '${PRELUDE}' && ${paths} BURST_REF='${fixture.ref}' BURST_COMMIT='${fixture.commit}' checkout && git rev-parse HEAD`], { env: { PATH: process.env.PATH ?? "", HOME: fixture.root } });
  return { code: run.exitCode, head: run.stdout.toString().trim().split("\n").at(-1) ?? "", stderr: run.stderr.toString() };
}

function repository(root: string): { older: string; newer: string } {
  const source = join(root, "source");
  const git = (...args: string[]) => gitIn(source, ...args).stdout.toString().trim();
  gitIn(root, "init", "-q", "-b", "lane", source);
  git("commit", "-q", "--allow-empty", "-m", "older");
  const older = git("rev-parse", "HEAD");
  git("commit", "-q", "--allow-empty", "-m", "newer");
  return { older, newer: git("rev-parse", "HEAD") };
}

test("a warm checkout at an older commit takes the commits since it and lands on the exact commit", () => {
  const root = mkdtempSync(join(tmpdir(), "orly-checkout-"));
  try {
    const { older, newer } = repository(root);
    gitIn(root, "clone", "-q", join(root, "source"), join(root, "work"));
    gitIn(join(root, "work"), "checkout", "-q", "--detach", older);
    for (const args of [["branch", "-q", "-D", "lane"], ["update-ref", "-d", "refs/remotes/origin/lane"], ["reflog", "expire", "--expire=now", "--all"], ["gc", "-q", "--prune=now"]]) {
      gitIn(join(root, "work"), ...args);
    }
    expect(gitIn(join(root, "work"), "cat-file", "-e", `${newer}^{commit}`).exitCode).not.toBe(0);
    gitIn(join(root, "source"), "bundle", "create", join(root, "sent.bundle"), "lane", `^${older}`);

    expect(checkout({ root, ref: "lane", commit: newer })).toMatchObject({ code: 0, head: newer });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a warm checkout that holds the commit needs no bundle, and a cold one clones the whole ref", () => {
  const root = mkdtempSync(join(tmpdir(), "orly-checkout-"));
  try {
    const { older, newer } = repository(root);
    gitIn(join(root, "source"), "bundle", "create", join(root, "sent.bundle"), "lane");
    expect(checkout({ root, ref: "lane", commit: newer })).toMatchObject({ code: 0, head: newer });

    expect(existsSync(join(root, "sent.bundle"))).toBeFalse();
    expect(checkout({ root, ref: "lane", commit: older })).toMatchObject({ code: 0, head: older });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Git for these fixtures: inherited GIT_* variables stripped, so a commit
// hook's GIT_DIR never points a fixture command at this repository.
function gitIn(directory: string, ...args: string[]) {
  return Bun.spawnSync(["git", "-C", directory, ...args], {
    env: { ...UNSCOPED_ENVIRONMENT, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
}
