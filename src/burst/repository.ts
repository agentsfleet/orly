import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { git } from "../git_env";
import { OrlyError } from "../model";

// The host, path and home-relative account own snapshots. A slug can collide through
// punctuation, truncation or another host, and must never authorize pruning.
export function repositoryIdentity(root: string): string {
  const remote = git(root, ["remote", "get-url", "origin"]);
  let source: string;
  if (remote.exitCode === 0 && !remote.signalCode) source = remoteIdentity(remote.stdout.toString().trim(), root);
  else {
    const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (common.exitCode !== 0 || common.signalCode) throw new OrlyError("cannot identify the repository for snapshot ownership");
    source = `local:${realpathSync(common.stdout.toString().trim())}`;
  }
  // 96 bits plus timestamp and random suffix keep provider names below 64 characters.
  return new Bun.CryptoHasher("sha256").update(source).digest("hex").slice(0, 24);
}

function remoteIdentity(remote: string, root: string): string {
  if (remote.includes("://")) {
    const url = new URL(remote);
    if (url.protocol === "file:") return `local:${realpathSync(Bun.fileURLToPath(url))}`;
    if (url.protocol === "ssh:" && url.pathname.startsWith("/~")) return homeIdentity(url.username, url.host.toLowerCase(), trimPath(url.pathname));
    return `${url.host.toLowerCase()}${trimPath(url.pathname)}`;
  }
  const scp = remote.match(/^(?:([^@/]+)@)?([^/:]+):(.+)$/);
  if (scp?.[2] && scp[3]) {
    const host = scp[2].toLowerCase();
    const path = trimPath(scp[3]);
    return path.startsWith("/") ? `${host}${path}` : homeIdentity(scp[1], host, `/${path}`);
  }
  return `local:${realpathSync(resolve(root, remote))}`;
}

function homeIdentity(account: string | undefined, host: string, path: string): string {
  if (!account) throw new OrlyError("home-relative SSH origin needs an explicit account for snapshot ownership");
  return `ssh-home:${account}@${host}${path}`;
}

function trimPath(path: string): string {
  return path.replace(/\/+$/, "").replace(/\.git$/, "");
}

// The bundle a machine needs, given the commit its warm checkout holds: none
// when that checkout already contains `commit`, the commits since `base` when
// this repository knows it, and the whole ref otherwise. Git answers each
// test, so the same base always gets the same bundle.
export function bundleFor(root: string, ref: string, commit: string, base: string | undefined, full: string): string | undefined {
  if (!base) return full;
  if (git(root, ["merge-base", "--is-ancestor", commit, base]).exitCode === 0) return undefined;
  if (git(root, ["cat-file", "-e", `${base}^{commit}`]).exitCode !== 0) return full;
  const since = join(dirname(full), `since-${base}.bundle`);
  if (existsSync(since) || git(root, ["bundle", "create", since, ref, `^${base}`]).exitCode === 0) return since;
  return full;
}
