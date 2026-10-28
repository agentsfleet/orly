import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_PATH } from "./config";
import { criteriaFor, runCommand } from "./criteria";
import { cleanupTemporaryDirectories, git, modelFor, newRepository, newSpecRepository } from "./gates_test_support";

const README = "README.md";
const WORK = "work";
const VERIFY = "verify";
const PR = "pr";
const REPO_CONFIG = "repo.config";

afterEach(cleanupTemporaryDirectories);

// criteriaFor is the composition point: gates.ts asks it what a named gate
// evaluates, so a criterion silently dropped from a group would be invisible
// to every other suite. These pin the membership of each group by name.
describe("criteriaFor", () => {
  async function contextFor(root: string) {
    return { root, model: await modelFor(root), acceptDirty: false };
  }

  function named(gate: string, context: Awaited<ReturnType<typeof contextFor>>): string[] {
    return criteriaFor(gate, context).map((criterion) => criterion.name).sort();
  }

  // work is the commit-time gate, and a commit hook's tree is dirty by
  // construction. It asks the repository's own conform command and nothing
  // about git state.
  test("work evaluates the profile and the conform tier", async () => {
    const project = newSpecRepository();
    expect(named(WORK, await contextFor(project))).toEqual(["cmd.conform", REPO_CONFIG]);
  });

  test("verify permits unfinished Sections and excludes boundary test suites", async () => {
    const project = newSpecRepository();
    const names = named(VERIFY, await contextFor(project));

    expect(names.filter((name) => name.startsWith("spec."))).toEqual([]);
    expect(names).not.toContain("cmd.verify.unit");
    // conform is the work gate's tier now, so the chain runs it once.
    expect(names).not.toContain("cmd.conform");
    // The slow tier belongs to the pr gate; leaking it here would make every
    // verify run pay for integration and memory suites.
    expect(names).not.toContain("cmd.verify.integration");
  });

  // A spec is reviewed while it is written; the gate checks code and Git only,
  // even on a branch that carries an active spec.
  test("pr gate runs no spec criterion", async () => {
    const project = newSpecRepository();
    const names = named(PR, await contextFor(project));

    expect(names.filter((name) => name.startsWith("spec."))).toEqual([]);
    for (const required of ["git.pushed", REPO_CONFIG, "docs.language", "docs.updated"]) {
      expect(names).toContain(required);
    }
    // git.branch belongs here and only here. It was a work-gate criterion until
    // the generated pre-commit hook was found refusing every commit made on the
    // default branch — including the commit that installs orly, and the
    // spec-on-main commit the operating model itself prescribes. The question
    // "is this the default branch" is only ever decisive where a Pull Request
    // would open from it, so it is asked there. Running `orly gate pr` on a
    // merged branch reds, which is the honest answer: no PR opens from main.
    expect(names).toContain("git.branch");
    expect(names).toContain("git.tree");
  });

  test("final verification runs test lanes even when push verification never ran", async () => {
    const root = newRepository();
    const commands = Object.fromEntries(["unit", "integration", "memory", "lint"].map((lane) => [
      `verify.${lane}`, [["sh", "-c", `echo ${lane} >> ran.txt`]],
    ]));
    const context = {
      root, model: await modelFor(root, undefined, commands), acceptDirty: false,
      surfaces: { changed: ["app.rs"], code: ["app.rs"], docs: [], userSurface: [] },
    };
    const checks = criteriaFor(PR, context).filter((entry) => entry.name.startsWith("cmd."));
    expect(checks.map((entry) => entry.evaluate(context).ok)).toEqual([true, true, true, true]);
    expect((await Bun.file(join(root, "ran.txt")).text()).trim().split("\n").sort()).toEqual(["integration", "lint", "memory", "unit"]);
  });

  test("an unknown gate name yields no criteria rather than throwing", async () => {
    const project = newSpecRepository();
    expect(criteriaFor("nonsense", await contextFor(project))).toEqual([]);
  });

  test("an unregistered repository still yields a red profile criterion on verify", async () => {
    const stranger = newRepository();
    const context = { root: stranger, model: await modelFor(newSpecRepository()), acceptDirty: false };

    const results = criteriaFor(VERIFY, context).map((criterion) => criterion.evaluate(context));
    const config = results.find((result) => result.name === REPO_CONFIG);
    expect(config?.ok).toBeFalse();
    expect(config?.detail).toContain("orly init");
  });
});

// Reproduces the pre-push hook inside a linked worktree: git exports GIT_DIR
// and friends to its hooks, and an inherited GIT_DIR pins every spawned git to
// the hook's repository. A linked worktree's .git is a file, so the pinned
// path is not even a directory and every criterion judged the wrong tree.
describe("git scope leaking from a hook environment", () => {
  test("criteria judge the handed path even with GIT_DIR exported", async () => {
    const project = newSpecRepository();
    const model = await modelFor(project);
    const context = { root: project, model, acceptDirty: false };
    const clean = criteriaFor(WORK, context).map((c) => c.evaluate(context));

    const saved = { ...process.env };
    process.env.GIT_DIR = ".git";
    process.env.GIT_INDEX_FILE = ".git/index";
    try {
      const polluted = criteriaFor(WORK, context).map((c) => c.evaluate(context));
      expect(polluted.map((r) => `${r.name}:${r.ok}`)).toEqual(clean.map((r) => `${r.name}:${r.ok}`));
    } finally {
      delete process.env.GIT_DIR; delete process.env.GIT_INDEX_FILE;
      Object.assign(process.env, saved);
    }
  });
});

describe("runCommand", () => {
  test("a zero exit reports ok with the exit-0 detail", () => {
    expect(runCommand(process.cwd(), ["true"])).toEqual({ ok: true, detail: "exit 0" });
  });

  test("a non-zero exit retains all output, including earlier findings", () => {
    const result = runCommand(process.cwd(), ["sh", "-c", "echo first; echo decisive >&2; exit 3"]);

    expect(result.ok).toBeFalse();
    expect(result.detail).toContain("exit 3");
    expect(result.detail).toContain("first");
    expect(result.detail).toEndWith("decisive");
  });

  test("a successful command retains its measured counts", () => {
    expect(runCommand(process.cwd(), ["echo", "12 passed, 0 failed"]).detail).toContain("12 passed, 0 failed");
  });

  test("a silent failure still reports a detail rather than an empty string", () => {
    const result = runCommand(process.cwd(), ["false"]);

    expect(result.ok).toBeFalse();
    expect(result.detail).toBe("exit 1: no output");
  });

  test("a missing binary is a failure, never a throw", () => {
    expect(runCommand(process.cwd(), ["orly-no-such-binary"]).ok).toBeFalse();
  });
});

describe("repo.config", () => {
  test("a repository with a config resolves its declared commands", async () => {
    const project = newSpecRepository();
    const context = { root: project, model: await modelFor(project), acceptDirty: false };
    const criterion = criteriaFor(WORK, context).find((entry) => entry.name === REPO_CONFIG);
    expect(criterion?.evaluate(context).ok).toBeTrue();
  });

  test("a repository with no config names the install command", async () => {
    const project = newSpecRepository();
    const context = { root: project, model: await modelFor(project), acceptDirty: false };
    rmSync(join(project, ".orly/orly.json"));
    const criterion = criteriaFor(WORK, context).find((entry) => entry.name === REPO_CONFIG);
    const verdict = criterion?.evaluate(context);
    expect(verdict?.ok).toBeFalse();
    expect(verdict?.detail).toContain("orly init");
  });
});

describe("the final tree check", () => {
  test("requires an edit to be committed", async () => {
    const root = newSpecRepository();
    const model = await modelFor(root);
    const context = { root, model, acceptDirty: false };
    const check = criteriaFor(PR, context).find((entry) => entry.name === "git.tree");
    expect(check?.evaluate(context).ok).toBe(true);

    const path = join(root, README);
    await Bun.write(path, `${await Bun.file(path).text()}\nUpdated evidence.\n`);
    expect(check?.evaluate(context).ok).toBe(false);
    git(root, "add", README);
    expect(check?.evaluate(context).ok).toBe(false);
    git(root, "commit", "-qm", "docs: record evidence");
    expect(check?.evaluate(context).ok).toBe(true);
  });
});

describe("an optional conform command", () => {
  test("work gate passes without conform", async () => {
    const project = newRepository();
    const model = await modelFor(project);
    const configPath = join(project, CONFIG_PATH);
    const config = await Bun.file(configPath).json();
    delete config.commands.conform;
    await Bun.write(configPath, JSON.stringify(config, undefined, 2));
    const context = { root: project, model, acceptDirty: false };

    const criteria = criteriaFor(WORK, context);
    expect(criteria.map((criterion) => criterion.name)).toEqual([REPO_CONFIG]);
    expect(criteria.every((criterion) => criterion.evaluate(context).ok)).toBe(true);
  });
});
