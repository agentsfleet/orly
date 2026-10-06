import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTemporaryDirectories, newRepository, ROOT } from "../gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "../git_env";
import { installationLock } from "./lock";

const LOCK_MODULE = join(ROOT, "src/installation/lock.ts");
const LOCK_PATH = ".orly/install.lock";

afterEach(cleanupTemporaryDirectories);

function leaveStaleLock(root: string): void {
  const result = Bun.spawnSync([process.execPath, "-e", `import {installationLock} from ${JSON.stringify(LOCK_MODULE)}; installationLock(process.argv[1]);`, root], {
    env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe", timeout: 5000,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
}

test("stale cleanup cannot remove a lock acquired by another installer", () => {
  const root = newRepository();
  leaveStaleLock(root);
  const actor = join(root, "actor.ts");
  writeFileSync(actor, `import * as fs from "node:fs";
import {join} from "node:path";
import {installationLock} from ${JSON.stringify(LOCK_MODULE)};
const root=Bun.argv[2];
const release=installationLock(root);
fs.writeFileSync(join(root,"ready"),String(process.pid));
const until=performance.now()+5000;
while(!fs.existsSync(join(root,"stop")) && performance.now()<until) await Bun.sleep(10);
try {release();} catch(error) {console.error(String(error));}
`);
  const contender = join(root, "contender.ts");
  writeFileSync(contender, `import * as fs from "node:fs";
import {join} from "node:path";
import {mock} from "bun:test";
const root=Bun.argv[2];
let other;
let attempted=false;
const unlink=fs.unlinkSync;
mock.module("node:fs",()=>({...fs,unlinkSync(path) {
  if(!attempted) {
    attempted=true;
    other=Bun.spawn([process.execPath,${JSON.stringify(actor)},root],{stdout:"pipe",stderr:"pipe"});
    const until=performance.now()+3000;
    while(!fs.existsSync(join(root,"ready")) && performance.now()<until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
    if(!fs.existsSync(join(root,"ready"))) throw new Error("contender did not reach acquisition");
  }
  unlink(path);
}}));
const {installationLock}=await import(${JSON.stringify(LOCK_MODULE)});
let acquired=false;
let release;
try {release=installationLock(root);acquired=true;} catch {}
console.log(JSON.stringify({acquired,otherAcquired:fs.existsSync(join(root,"ready")),attempted}));
if(release) release();
fs.writeFileSync(join(root,"stop"),"stop");
if(other) await other.exited;
`);
  const result = Bun.spawnSync([process.execPath, contender, root], {
    env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe", timeout: 10_000,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const observed = JSON.parse(result.stdout.toString());
  expect(observed.attempted).toBe(true);
  expect(observed.otherAcquired).toBe(true);
  expect(observed.acquired).toBe(false);
  expect(existsSync(join(root, LOCK_PATH))).toBe(false);
});

test("a live owner excludes contenders and a released lock can be acquired again", () => {
  const root = newRepository();
  const release = installationLock(root);
  expect(() => installationLock(root)).toThrow("another installation");
  release();
  installationLock(root)();
  expect(existsSync(join(root, LOCK_PATH))).toBe(false);
});

test("a dead owner can be recovered without changing unrelated owner files", () => {
  const root = newRepository();
  const owner = join(root, "owner-note");
  writeFileSync(owner, "owner data");
  leaveStaleLock(root);
  installationLock(root)();
  expect(readFileSync(owner, "utf8")).toBe("owner data");
  expect(existsSync(join(root, LOCK_PATH))).toBe(false);
});

test("an unrecognized lock file is preserved for owner inspection", () => {
  const root = newRepository();
  mkdirSync(join(root, ".orly"));
  writeFileSync(join(root, LOCK_PATH), "owner data");
  expect(() => installationLock(root)).toThrow("inspect it");
  expect(readFileSync(join(root, LOCK_PATH), "utf8")).toBe("owner data");
});
