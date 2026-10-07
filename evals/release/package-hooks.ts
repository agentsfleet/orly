import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import { COMMAND_FILES, stopOwnedGroup } from "../../src/command_process";
import { hash, PackageRegistry, readManifest, type PackedPackage } from "./package-registry";

const CLI_SOURCE = "src/cli.ts";
const INIT = "init";
const CHECK_EXIT_FILE = "check.exit";
const IGNORE_OUTPUT = "ignore";
const CONFIG_NAME = "config";
const EVAL_FLAG = "-e";
const NPM_CONFIG_FILE = ".npmrc";
const PACKAGE = "@agentsfleet/orly";
const CONFIG = ".orly/orly.json";
const COMMAND_TIMEOUT_MS = 60_000;
const OUTPUT_BYTES = 1024 * 1024;
const PACKAGE_FILE_BYTES = 2 * OUTPUT_BYTES;
const KILL = "SIGKILL";
const SUPERVISOR = resolve(import.meta.dir, "../../src/command_process.ts");
const MARKER = "check.called";
const HOOK = { commit: ".orly/hooks/pre-commit", push: ".orly/hooks/pre-push" } as const;
const CHECK = `const p=Bun.spawnSync(['ps','-p',String(process.ppid),'-o','command='],{stdout:'pipe'});await Bun.write('${MARKER}',p.stdout);process.exit(Number(await Bun.file('check.exit').text()));`;
const RECEIPT_PREFIX = "hook-command-";
const ROOT_PREFIX = "orly-package-proof-";
const GZIP_TIMESTAMP_OFFSET = 4;

class HookProof {
  readonly root = mkdtempSync(join(tmpdir(), ROOT_PREFIX));
  readonly repository = join(this.root, "repository");
  readonly commands: Array<{ argv: string[]; exit: number | null; stdout: string; stderr: string }> = [];
  #environment: Record<string, string>;

  constructor(registry: string) {
    try {
      mkdirSync(this.repository);
      const home = join(this.root, "home");
      const temporary = join(this.root, "tmp");
      for (const path of [home, temporary]) mkdirSync(path);
      this.#environment = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home,
        TMPDIR: temporary, XDG_CONFIG_HOME: join(home, CONFIG_NAME), BUN_INSTALL: join(home, "bun"),
        BUN_INSTALL_CACHE_DIR: join(home, "cache"), BUN_CONFIG_REGISTRY: registry,
        npm_config_registry: registry, npm_config_userconfig: join(home, NPM_CONFIG_FILE),
        GIT_CONFIG_NOSYSTEM: "1", ORLY_TELEMETRY_OFF: "1" };
    } catch (error) { this.close(); throw error; }
  }

  async initialize(registry: string): Promise<void> {
    await Bun.write(join(this.#environment.HOME ?? this.root, NPM_CONFIG_FILE), `registry=${registry}\n`);
    await Bun.write(join(this.repository, "bunfig.toml"), `[install]\nregistry = "${registry}"\n`);
    for (const args of [[INIT, "-q"], [CONFIG_NAME, "user.name", "Package Proof"], [CONFIG_NAME, "user.email", "package-proof@example.invalid"]]) {
      assert.equal((await this.run(["git", ...args])).exit, 0);
    }
    await Bun.write(join(this.repository, "README.md"), "# Package fixture\n");
    await Bun.write(join(this.repository, CONFIG), JSON.stringify({ schema_version: 1, packs: [],
      commands: { conform: [[process.execPath, EVAL_FLAG, CHECK]], "verify.docs": [[process.execPath, EVAL_FLAG, CHECK]] } }));
    await Bun.write(join(this.repository, CHECK_EXIT_FILE), "0");
  }

  async run(argv: string[]) {
    const receipt = mkdtempSync(join(this.root, RECEIPT_PREFIX));
    const request = join(receipt, "request.json");
    await Bun.write(request, JSON.stringify({ command: argv, limits: { timeout_ms: COMMAND_TIMEOUT_MS, output_bytes: OUTPUT_BYTES }, receipt, parent_pid: process.pid }));
    const supervisor = Bun.spawn([process.execPath, SUPERVISOR, request], { cwd: this.repository,
      env: this.#environment, stdout: IGNORE_OUTPUT, stderr: IGNORE_OUTPUT });
    const timer = setTimeout(() => supervisor.kill(KILL), COMMAND_TIMEOUT_MS * 2);
    try {
      assert.equal(await supervisor.exited, 0, "Command supervisor did not finish.");
      const result = await Bun.file(join(receipt, COMMAND_FILES.result)).json();
      assert.equal(result.failure, undefined, "Command exceeded its time/output limits.");
      const record = { argv, exit: result.exit_code as number | null,
        stdout: await Bun.file(join(receipt, COMMAND_FILES.stdout)).text(), stderr: await Bun.file(join(receipt, COMMAND_FILES.stderr)).text() };
      this.commands.push(record);
      return record;
    } finally {
      clearTimeout(timer);
      supervisor.kill(KILL);
      await supervisor.exited;
      const pidFile = Bun.file(join(receipt, COMMAND_FILES.pid));
      if (await pidFile.exists()) stopOwnedGroup(Number(await pidFile.text()));
      rmSync(receipt, { recursive: true, force: true });
    }
  }

  async checkHook(hook: string, expected: number): Promise<string> {
    await Bun.write(join(this.repository, MARKER), "");
    const result = await this.run(["/bin/bash", hook]);
    assert.equal(result.exit, expected, JSON.stringify(result));
    const parent = await Bun.file(join(this.repository, MARKER)).text();
    assert.match(parent, /command_process\.ts/, "The declared check did not run under the package supervisor.");
    return parent;
  }

  freshCache(): void {
    const fresh = join(this.root, "missing-cache");
    const temporary = join(this.root, "missing-tmp");
    mkdirSync(temporary);
    this.#environment = { ...this.#environment, BUN_INSTALL_CACHE_DIR: fresh, TMPDIR: temporary };
  }

  close(): void { rmSync(this.root, { recursive: true, force: true }); }
}

async function verifyResolved(root: string, packages: PackedPackage[], parent: string) {
  const identities = [];
  for (const entry of packages) {
    const matches = [];
    for await (const path of new Bun.Glob("**/package.json").scan({ cwd: root, absolute: true, dot: true, followSymlinks: true })) {
      const file = Bun.file(path);
      if (file.size > OUTPUT_BYTES) continue;
      const metadata = await file.json();
      if (metadata.name !== entry.name || metadata.version !== entry.version) continue;
      const resolved = realpathSync(dirname(path));
      assert.ok(resolved.startsWith(realpathSync(root) + sep), "Resolved package escaped the owned cache.");
      for (const [relative, expected] of Object.entries(entry.files)) {
        const target = realpathSync(join(resolved, relative));
        assert.ok(target.startsWith(resolved + sep));
        const selected = Bun.file(target);
        assert.ok(selected.size <= PACKAGE_FILE_BYTES, "Selected package file exceeds its bound.");
        assert.equal(hash(await selected.bytes()), expected, `${entry.name}/${relative}`);
      }
      matches.push(resolved);
    }
    assert.ok(matches.length > 0, `No resolved files for ${entry.name}`);
    if (entry.name === PACKAGE) assert.ok(matches.some((path) => parent.includes(join(path, "src/command_process.ts"))), "The check ran through a different package.");
    identities.push({ name: entry.name, version: entry.version, tarball_sha256: entry.sha256, verified_files: Object.keys(entry.files).length });
  }
  return identities;
}

async function assertAlteredArchiveRefused(packages: PackedPackage[], candidate: PackedPackage, root: string) {
  const bytes = await Bun.file(candidate.tarball).bytes();
  // Changing a gzip timestamp preserves the unpacked package and version, but changes its byte identity.
  bytes[GZIP_TIMESTAMP_OFFSET] = (bytes[GZIP_TIMESTAMP_OFFSET] ?? 0) ^ 1;
  const altered = join(root, "altered-same-version.tgz");
  await Bun.write(altered, bytes);
  const wrong = packages.map((entry) => entry === candidate ? { ...entry, tarball: altered } : entry);
  await assert.rejects(PackageRegistry.create(wrong), /Package digest mismatch/);
}

async function assertIncompleteInventoriesRefused(packages: PackedPackage[], candidate: PackedPackage, root: string) {
  const partial = { ...candidate.files };
  assert.ok(partial[CLI_SOURCE]);
  delete partial[CLI_SOURCE];
  for (const files of [{}, partial]) {
    const manifest = join(root, "incomplete-manifest.json");
    await Bun.write(manifest, JSON.stringify({ packages: packages.map((entry) => entry === candidate ? { ...entry, files } : entry) }));
    await assert.rejects(readManifest(manifest), /Archive inventory mismatch/);
  }
}

async function proof(manifest: string) {
  const packages = await readManifest(manifest);
  const candidate = packages.find((entry) => entry.name === PACKAGE);
  assert.ok(candidate, "Manifest must include orly.");
  const registry = await PackageRegistry.create(packages);
  let run: HookProof | undefined;
  let report;
  try {
    run = new HookProof(registry.url);
    await assertAlteredArchiveRefused(packages, candidate, run.root);
    await assertIncompleteInventoriesRefused(packages, candidate, run.root);
    await run.initialize(registry.url);
    const installed = await run.run(["bunx", "--bun", `${PACKAGE}@${candidate.version}`, INIT, "--json"]);
    assert.equal(installed.exit, 0, JSON.stringify(installed));
    assert.equal(JSON.parse(installed.stdout).ok, true);
    const parent = await run.checkHook(HOOK.commit, 0);
    await run.checkHook(HOOK.push, 0);
    const identities = await verifyResolved(run.root, packages, parent);
    await Bun.write(join(run.repository, CHECK_EXIT_FILE), "7");
    await run.checkHook(HOOK.commit, 1);
    await run.checkHook(HOOK.push, 1);
    registry.refuseResolution();
    run.freshCache();
    await Bun.write(join(run.repository, MARKER), "");
    const missing = await run.run(["/bin/bash", HOOK.commit]);
    assert.notEqual(missing.exit, 0);
    assert.equal(await Bun.file(join(run.repository, MARKER)).text(), "", "Resolution failure reached a check unexpectedly.");
    report = { version: candidate.version, identities, same_version_wrong_bytes_refused: true, incomplete_inventories_refused: 2,
      real_hooks: { success: 2, failing_check: 2, resolution_failure: 1 }, commands: run.commands,
      registry_requests: registry.requests, live_model_requests: 0 };
  } finally { registry.close(); run?.close(); }
  assert.ok(run);
  assert.equal(existsSync(run.root), false);
  return { ...report, cleanup: { owned_root_removed: true, registry_stopped: true } };
}

if (import.meta.main) {
  const manifest = Bun.argv[2];
  if (!manifest || Bun.argv.length !== 3) throw new Error("Usage: bun evals/release/package-hooks.ts <MANIFEST>");
  process.stdout.write(JSON.stringify(await proof(manifest), null, 2) + "\n"); // logging: this contributor proof writes its bounded receipt to stdout.
}
