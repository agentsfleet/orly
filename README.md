<div align="center">

<img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agentsfleet-mark-glow.png" width="180" alt="agentsfleet" />

# orly

[![npm](https://img.shields.io/npm/v/@agentsfleet/orly?logo=npm&logoColor=white)](https://www.npmjs.com/package/@agentsfleet/orly)
[![coverage](https://img.shields.io/codecov/c/github/agentsfleet/orly?logo=codecov&logoColor=white)](https://codecov.io/gh/agentsfleet/orly)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The rules an agent reads before it edits, the gates that enforce them, and
the git hooks that run the gates.**

</div>

Works with Claude Code, Codex, OpenCode, and Amp. The rules land in
`AGENTS.orly.md`; `AGENTS.md` — the file those runtimes auto-load — gains a
pointer to them.

## Install the harness

```bash
bunx @agentsfleet/orly init
```

That is the whole install. No checkout of this repository, no prepared `$HOME`:
it works on a fresh machine, a Continuous Integration (CI) runner, or a remote
container. Which rules you get is read from your own sources — a Rust crate
receives the Rust rules and never the Zig ones.

**Commit everything it writes.** That is how the rules reach your teammates.
The one thing a clone cannot carry is `core.hooksPath`, so each person runs
`orly init` once to arm the hooks.

## Two files, always

| File | Owner | On `orly update` |
|---|---|---|
| `AGENTS.md` | **yours** | untouched, except one delimited pointer block |
| `AGENTS.orly.md` | orly | rewritten |

Yours wins where the two disagree. A hook or rule page orly did not write is
refused rather than replaced, naming `--force` and `--no-hooks`; a refused run
leaves the repository exactly as it found it.

## Commands

| Command | Does |
|---|---|
| `orly init` | write the rules, gates, skills, and hooks |
| `orly init --dry-run` | show what would be written; change nothing |
| `orly update` | re-materialise at a newer engine version |
| `orly update --with <pack>` | take an opt-in pack, recorded for every clone |
| `orly gate` | run work → verify → pr; stop at the first red group |
| `orly override <criterion> --reason <why>` | record a gate exception as an empty commit that rides into the Pull Request |
| `orly doctor` | compare what is installed against what orly would write today |

`orly init` seeds `.oracle/orly.json` with the gate commands it finds in your
`Makefile` or `package.json`. Complete it, commit it, and every clone gates
identically.

## What lands

| Path | Contents |
|---|---|
| `AGENTS.orly.md` | the generated rules — safety, the dispatch router, the lifecycle |
| `dispatch/*.md` | one rule page per kind of work |
| `audits/*.sh` | the deterministic gates |
| `docs/*.md` | the standards those rules cite |
| `.claude/skills/`, `.agents/skills/`, `.opencode/skills/` | the skills the rules name |
| `.githooks/` | pre-commit and pre-push, wired to `orly gate` |
| `.oracle/orly.json` | which packs, which commands, what orly installed |

## Developing orly

```bash
git clone git@github.com:agentsfleet/orly.git && cd orly
git config core.hooksPath .githooks
cd orly && bun install --frozen-lockfile && cd ..
make audit
```

`make audit` is the whole suite: typecheck, unit tests, render determinism, the
gate fixtures, and the install evals that materialise into throwaway
repositories. Coverage is gated at a 90% line floor. A merge to `main` carrying
a new `package.json` version publishes it, tags it, and cuts a GitHub release.

This checkout renders its own rules with the verb every repository uses, and
`--no-hooks` because it wrote its own:

```bash
bin/orly update --no-hooks
```

## License

[MIT](LICENSE)
