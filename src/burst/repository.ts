import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    if (url.protocol === "file:") return `local:${realpathSync(fileURLToPath(url))}`;
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
