<div align="center">

<img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agentsfleet-mark-glow.png" width="180" alt="agentsfleet" />

# orly

[![npm](https://img.shields.io/npm/v/@agentsfleet/orly?logo=npm&logoColor=white)](https://www.npmjs.com/package/@agentsfleet/orly)
[![coverage](https://img.shields.io/codecov/c/github/agentsfleet/orly?logo=codecov&logoColor=white)](https://codecov.io/gh/agentsfleet/orly)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Rules your coding agent reads before it edits — and the checks that catch it
when it ignores them.**

</div>

An agent reads your conventions, agrees with them, and then writes whatever it
wants. Documentation asks. Nothing checks.

orly ships both halves: the rules the agent reads, and gate scripts that fail
when it ignored them — wired into git hooks, so nothing lands unchecked.

It began as one engineer's dotfiles. [indykish](https://github.com/indykish)
built it on macOS while shipping
[agentsfleet](https://github.com/agentsfleet/agentsfleet) through coding agents,
hardening it across 500+ merged Pull Requests. It is still changing.

**Opinionated on purpose.** These are one engineer's conventions, taken from
real work rather than assembled in the abstract. Where you disagree, your own
`AGENTS.md` wins.

Works with Claude Code, Codex, OpenCode, and Amp.

## Install the harness

```bash
bunx @agentsfleet/orly init
```

One command, run inside the repository you want governed. Nothing to clone
first, nothing to set up in your `$HOME`.

It reads the files already in your repository and works out which languages you
write. A Rust crate gets the Rust rules. It never gets rules for a language you
do not use.

Then commit what it wrote. Your teammates clone, and the rules are simply
there — nothing for them to install, nothing to remember.

One exception: **git never clones hooks.** Each person runs `orly init` once in
their own checkout to switch them on.

## Two files, always

| File | Owner | On `orly update` |
|---|---|---|
| `AGENTS.md` | **yours** | untouched, except one delimited pointer block |
| `AGENTS.orly.md` | orly | rewritten |

`AGENTS.md` is the file every agent runtime auto-loads, so it stays yours. orly
writes its rules beside it, then adds a pointer so they get read.

Three promises:

- **Your rules win.** Where yours and orly's disagree, yours is the answer.
- **Nothing you wrote is overwritten.** A hook or rule page orly did not write
  is refused, and the refusal names `--force` and `--no-hooks` as your ways
  through.
- **A refused run changes nothing.** There is no half-installed tree to clean
  up afterwards.

## Commands

| Command | Does |
|---|---|
| `orly init` | write the rules, gates, skills, and hooks |
| `orly init --dry-run` | show what would be written; change nothing |
| `orly update` | re-materialise at a newer engine version |
| `orly update --with <pack>` | add an opt-in pack, recorded for every clone |
| `orly gate` | run your declared checks in order, stopping at the first failure |
| `orly override <criterion> --reason <why>` | record a gate exception as an empty commit that rides into the Pull Request |
| `orly doctor` | compare what is installed against what orly would write today |

`orly init` also seeds `.oracle/orly.json` with any gate commands it can find in
your `Makefile` or `package.json`. Fill in the rest, commit it, and every clone
gates identically.

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

`make audit` is the whole suite:

- **typecheck and unit tests**
- **render determinism** — the same sources always produce the same rules
- **gate fixtures** — every gate proved against one passing and one failing case
- **install evals** — real installs into throwaway repositories

Coverage is gated at a 90% line floor. The workflow fails below it.

### Releasing

Merge to `main` with a new `package.json` version. That publishes it, tags it,
and cuts a GitHub release. There is no second command to remember.

### Rendering orly's own rules

orly governs itself with the same verb everyone else uses:

```bash
bin/orly update --no-hooks
```

`--no-hooks` because this checkout hand-wrote its `.githooks/`, and orly refuses
to replace hooks it did not write.

## License

[MIT](LICENSE)
