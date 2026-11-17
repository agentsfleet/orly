import { afterEach, expect, test } from "bun:test";

import { cleanupTemporaryDirectories, git, newRepository } from "../gates_test_support";
import { repositoryIdentity } from "./repository";

afterEach(cleanupTemporaryDirectories);

test("snapshot ownership retains host, full path and punctuation", () => {
  const root = newRepository();
  const names = [
    "https://one.invalid/acme/web.git", "https://two.invalid/acme/web.git",
    "https://one.invalid/acme/web-app.git", "https://one.invalid/acme/web_app.git",
    `https://one.invalid/acme/${"long".repeat(20)}-one.git`, `https://one.invalid/acme/${"long".repeat(20)}-two.git`,
  ];
  git(root, "remote", "add", "origin", names[0] ?? "");
  const identities = names.map((name) => {
    git(root, "remote", "set-url", "origin", name);
    return repositoryIdentity(root);
  });
  expect(new Set(identities).size).toBe(6);
  for (const id of identities) expect(id).toMatch(/^[0-9a-f]{24}$/);
});

test("absolute repository paths retain ownership across transports and credentials", () => {
  const root = newRepository();
  git(root, "remote", "add", "origin", "https://example.invalid/acme/widget.git");
  const first = repositoryIdentity(root);
  for (const remote of ["git@example.invalid:/acme/widget.git", "ssh://git@example.invalid/acme/widget.git", "https://fixture@example.invalid/acme/widget/"]) {
    git(root, "remote", "set-url", "origin", remote);
    expect(repositoryIdentity(root)).toBe(first);
  }
});

test("repositories without an origin retain independent ownership", () => {
  expect(repositoryIdentity(newRepository())).not.toBe(repositoryIdentity(newRepository()));
});

test("home-relative SSH repositories retain their account namespace", () => {
  const root = newRepository();
  const names = [
    "alice@host.invalid:repo.git", "bob@host.invalid:repo.git",
    "ssh://alice@host.invalid/~/repo.git", "ssh://bob@host.invalid/~/repo.git",
    "ssh://git@host.invalid/~alice/repo.git", "ssh://git@host.invalid/~bob/repo.git",
    "https://host.invalid/repo.git",
  ];
  git(root, "remote", "add", "origin", names[0] ?? "");
  const identities = names.map((remote) => {
    git(root, "remote", "set-url", "origin", remote);
    return repositoryIdentity(root);
  });
  expect(identities[0]).not.toBe(identities[1]);
  expect(identities[2]).not.toBe(identities[3]);
  expect(identities[4]).not.toBe(identities[5]);
  expect(identities[0]).not.toBe(identities[6]);
});
