# orly

[![npm](https://img.shields.io/npm/v/@agentsfleet/orly?label=%40agentsfleet%2Forly)](https://www.npmjs.com/package/@agentsfleet/orly)
[![coverage](https://codecov.io/gh/agentsfleet/orly/branch/main/graph/badge.svg)](https://codecov.io/gh/agentsfleet/orly)
[![test](https://github.com/agentsfleet/orly/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/agentsfleet/orly/actions/workflows/test.yml)
[![harness](https://github.com/agentsfleet/orly/actions/workflows/harness.yml/badge.svg?branch=main)](https://github.com/agentsfleet/orly/actions/workflows/harness.yml)

An engineering harness any repository can install with one command: the rules
an agent reads before it edits, the gates that enforce them, and the git hooks
that run the gates. Works with Claude Code, Codex, OpenCode, and Amp — the
rules land in `AGENTS.md`, which every one of them auto-loads.

A merge to `main` carrying a new `package.json` version publishes it, tags it,
and cuts a GitHub release. Coverage is gated at a 90% line floor in
`test.yml` — the badge reports the number, the workflow enforces it.

## Install the harness

In the repository you want rules and gates enforced in:

```bash
bunx @agentsfleet/orly init
```

That is the whole install. It materialises the rule pages, the gate scripts,
the skills those rules name, and git hooks — for your languages, read from
your own sources. A Rust crate receives the Rust rules and never the Zig
ones. No checkout of this repository, no prepared `$HOME`; the same command
works on a fresh machine, a Continuous Integration (CI) runner, or a remote
container.

**Everything it writes is meant to be committed.** That is how the rules
reach your teammates: they clone and the rules are already there, with
nothing to install and nothing to remember. The one thing a clone cannot
carry is `core.hooksPath` — it is local git config — so each person runs
`orly init` once to arm the hooks.

### Two files, always

| File | Owner | On `orly update` |
|---|---|---|
| `AGENTS.md` | **yours** | untouched, except one delimited pointer block |
| `AGENTS.orly.md` | orly | rewritten |

If you already had an `AGENTS.md`, it keeps its name and its bytes and gains
the pointer. If you had none, you get a stub with the pointer and room to
write your own rules whenever you want them — the file is yours from the
start, so nothing you add later is ever at risk. Your rules win where the two
disagree.

Nothing you wrote is replaced without you asking. A hook or a rule page orly
did not write is refused, naming `--force` and `--no-hooks` as the ways
forward, and a refused run leaves the repository exactly as it found it.

### Then

`orly init` seeds `.oracle/orly.json` with the gate commands it can find in
your `Makefile` or `package.json`. Complete it, commit it, and every clone
gates identically.

| Command | Does |
|---|---|
| `orly gate` | run work → verify → pr; stop at the first red group |
| `orly update` | re-materialise at a newer engine version |
| `orly update --with <pack>` | take an opt-in pack, recorded for every clone |
| `orly init --dry-run` | show what would be written; change nothing |
| `orly doctor` | compare what is installed against what orly would write today |

## What lands in your repository

| Path | Contents |
|---|---|
| `AGENTS.orly.md` | the generated rules — safety, the dispatch router, the lifecycle |
| `dispatch/*.md` | one rule page per kind of work, cited by the router |
| `audits/*.sh` | the deterministic gates |
| `docs/*.md` | the standards those rules cite |
| `.claude/skills/`, `.agents/skills/`, `.opencode/skills/` | the skills the rules name |
| `.githooks/` | pre-commit and pre-push, wired to `orly gate` |
| `.oracle/orly.json` | which packs, which commands, what orly installed |

Which packs you get is read from your own sources — a Rust crate receives the
Rust rules and never the Zig ones. Opt-in packs never auto-select; name one
with `--with`.

## Developing orly

```bash
git clone git@github.com:agentsfleet/orly.git && cd orly
git config core.hooksPath .githooks
cd orly && bun install --frozen-lockfile && cd ..
make audit
```

```text
✅ ALL CHECKS PASSED
```

`make audit` is the whole suite: typecheck, unit tests, render determinism,
the gate fixtures, and the install evals that materialise into throwaway
repositories. It runs on every Pull Request and again before any release.

This checkout renders its own rules with the same verb every repository uses.
`--no-hooks` because it wrote its own `.githooks/`, and orly refuses to
replace hooks it did not write:

```bash
bin/orly update --no-hooks
```

Pack sources already living here are skipped rather than copied over
themselves, which is why the command that installs elsewhere also re-renders
here.

## License

[MIT](LICENSE)
