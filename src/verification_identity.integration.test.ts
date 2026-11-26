import { afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { limitsFor } from "./command_limits";
import { cleanupTemporaryDirectories, git, gitOutput, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { verificationIdentity, type IdentityRequest } from "./verification_identity";
import { verificationFixture, VERIFICATION_LANE } from "./verification_test_support";

afterEach(cleanupTemporaryDirectories);

async function requestFixture(): Promise<IdentityRequest> {
  const { root, config, policy } = await verificationFixture();
  return {
    root, engineRoot: ROOT, config, policy, lane: VERIFICATION_LANE,
    invocations: config.commands[VERIFICATION_LANE]!, limits: limitsFor(config.limits, VERIFICATION_LANE),
    key: randomBytes(32),
  };
}

function binding(request: IdentityRequest): string {
  const result = verificationIdentity(request);
  expect(result).toHaveProperty("binding");
  if (!("binding" in result)) throw new Error(result.reason);
  return result.binding;
}

test.each(["configuration", "argv", "limits", "toolchain", "base"])("changed_verification_inputs_invalidate_reuse: %s", async (kind) => {
  const request = await requestFixture();
  const original = binding(request);
  if (kind === "configuration") request.config.orly_version = "0.1.0";
  else if (kind === "argv") request.invocations = [[process.execPath, "verify-fixture.ts", "extra"]];
  else if (kind === "limits") request.limits = { ...request.limits, timeout_ms: request.limits.timeout_ms + 1 };
  else if (kind === "toolchain") request.policy.toolchain = [[process.execPath, "-e", "console.log('changed toolchain identity')"]];
  else git(request.root, "update-ref", "refs/remotes/origin/main", "HEAD^");
  expect(binding(request)).not.toBe(original);
});

test("effective environment is bound without retaining raw values", async () => {
  const request = await requestFixture();
  const original = binding(request);
  const name = "ORLY_FIXTURE_ENVIRONMENT";
  const saved = UNSCOPED_ENVIRONMENT[name];
  const secret = randomUUID();
  try {
    UNSCOPED_ENVIRONMENT[name] = secret;
    const changed = binding(request);
    expect(changed).not.toBe(original);
    expect(changed).not.toContain(secret);
  } finally {
    if (saved === undefined) delete UNSCOPED_ENVIRONMENT[name];
    else UNSCOPED_ENVIRONMENT[name] = saved;
  }
});

test("declared ignored bytes are bound and missing or symlink inputs disable reuse", async () => {
  const request = await requestFixture();
  const directory = join(request.root, "extra-input");
  mkdirSync(directory);
  writeFileSync(join(directory, "data"), "first");
  request.policy.inputs = ["extra-input/data"];
  const original = binding(request);
  writeFileSync(join(directory, "data"), "second");
  expect(binding(request)).not.toBe(original);
  request.policy.inputs = ["extra-input/missing"];
  expect(verificationIdentity(request)).toHaveProperty("reason");
  const external = temporaryDirectory();
  writeFileSync(join(external, "data"), "external");
  symlinkSync(external, join(directory, "link"));
  request.policy.inputs = ["extra-input/link/data"];
  expect(verificationIdentity(request)).toHaveProperty("reason");
});

test("an uncommitted tree binds the same evidence as the commit that records it", async () => {
  const request = await requestFixture();
  writeFileSync(join(request.root, "tracked-input.txt"), "changed");
  const uncommitted = verificationIdentity(request);
  expect(uncommitted).toMatchObject({ uncommitted: true, current: false });
  git(request.root, "add", ".");
  git(request.root, "commit", "-q", "-m", "test: unpushed input");
  const unpushed = verificationIdentity(request);
  expect(unpushed).toMatchObject({ uncommitted: false, current: false });
  git(request.root, "push", "-q");
  const pushed = verificationIdentity(request);
  expect(pushed).toMatchObject({ uncommitted: false, current: true });
  expect("binding" in pushed && pushed.binding).toBe("binding" in uncommitted && uncommitted.binding);
  expect("binding" in unpushed && unpushed.binding).toBe("binding" in uncommitted && uncommitted.binding);
});

test("a different tree binds different evidence", async () => {
  const request = await requestFixture();
  writeFileSync(join(request.root, "tracked-input.txt"), "changed");
  const first = binding(request);
  writeFileSync(join(request.root, "README.md"), "another tracked edit\n");
  expect(binding(request)).not.toBe(first);
});

test("untracked files leave the tree unbound", async () => {
  const request = await requestFixture();
  writeFileSync(join(request.root, "scratch.ts"), "export const unstaged = 1;\n");
  expect(verificationIdentity(request)).toMatchObject({ reason: "untracked files are outside the tree; add or remove them" });
});

test("a tracked file deleted from the working tree binds as the commit that deletes it", async () => {
  const request = await requestFixture();
  unlinkSync(join(request.root, "README.md"));
  const deleted = binding(request);
  git(request.root, "commit", "-q", "-am", "test: delete a tracked file");
  expect(binding(request)).toBe(deleted);
});

test("engine sources and executable bytes invalidate matching version output", async () => {
  const request = await requestFixture();
  const engine = temporaryDirectory();
  for (const path of gitOutput(ROOT, "ls-files", "-z").split("\0").filter(Boolean)) {
    mkdirSync(dirname(join(engine, path)), { recursive: true });
    cpSync(join(ROOT, path), join(engine, path), { recursive: true });
  }
  request.engineRoot = engine;
  const original = binding(request);
  writeFileSync(join(engine, "SOUL.md"), "Changed registered guidance.");
  expect(binding(request)).not.toBe(original);
  const directory = join(request.root, "extra-input");
  mkdirSync(directory);
  const executable = join(directory, "tool");
  writeFileSync(executable, "#!/bin/sh\nprintf fixture-version\\n\n");
  chmodSync(executable, 0o700);
  request.policy.toolchain = [[executable]];
  const first = binding(request);
  writeFileSync(executable, "#!/bin/sh\n# different executable bytes\nprintf fixture-version\\n\n");
  expect(binding(request)).not.toBe(first);
});

test("before and after hashes do not assert detection of transient restored edits", async () => {
  const request = await requestFixture();
  const original = binding(request);
  writeFileSync(join(request.root, "tracked-input.txt"), "transient");
  writeFileSync(join(request.root, "tracked-input.txt"), "original input");
  expect(binding(request)).toBe(original);
});

test("scoped identity reuses the tracked snapshot and hashes overlapping extras once", async () => {
  const request = await requestFixture();
  request.policy.tracked_inputs = ["tracked-input.txt", "verify-fixture.ts"];
  mkdirSync(join(request.root, "extra-input"));
  writeFileSync(join(request.root, "extra-input/data"), "extra");
  request.policy.inputs = ["extra-input", "extra-input/data", "extra-input"];
  const opened = spyOn(fs, "openSync");
  try {
    binding(request);
    // The identity opens each file at its resolved path; macOS's temporary
    // directory is a symbolic link, so compare resolved paths.
    for (const path of ["tracked-input.txt", "extra-input/data"]) {
      expect(opened.mock.calls.filter(([file]) => file === realpathSync(join(request.root, path)))).toHaveLength(1);
    }
  } finally { opened.mockRestore(); }
});
