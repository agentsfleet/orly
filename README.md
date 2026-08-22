<div align="center">

<img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agentsfleet-mark-glow.png" width="180" alt="agentsfleet" />

# orly

[![npm](https://img.shields.io/npm/v/@agentsfleet/orly?logo=npm&logoColor=white)](https://www.npmjs.com/package/@agentsfleet/orly)
[![coverage](https://img.shields.io/codecov/c/github/agentsfleet/orly?logo=codecov&logoColor=white)](https://codecov.io/gh/agentsfleet/orly)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Rules your coding agent reads before it edits — and the checks that catch it
when it ignores them.**

</div>

An agent reads your conventions, then writes whatever it wants. Nothing checks.
orly ships both halves: the rules, and gate scripts wired into git hooks that
fail the commit when a rule was ignored.

The rules were derived from gstack and gbrain, then hardened over 500+ merged
pull requests shipping
[agentsfleet](https://github.com/agentsfleet/agentsfleet). Where you disagree,
your own `AGENTS.md` wins.

Works with Claude Code, Codex, OpenCode, and Amp.

## Install the harness

```bash
bunx @agentsfleet/orly init
```

Run it inside the repository you want governed. It detects your languages and
installs only those rules.

```text
orly init
  ├─ rules ──► the agent reads them before it edits
  └─ gates ──► git hooks check every commit
                 ├─ followed the rules ─► lands
                 └─ ignored them ───────► blocked
```

Commit what it wrote. Teammates get the rules on clone. One exception: git
never clones hooks, so each person runs `orly init` once in their own checkout.

## Two files, always

| File | Owner | On `orly update` |
|---|---|---|
| `AGENTS.md` | **yours** | untouched, except one delimited pointer block |
| `AGENTS.orly.md` | orly | rewritten |

Every agent runtime auto-loads `AGENTS.md`, so it stays yours. orly writes its
rules beside it and adds a pointer so they get read.

- **Your rules win** on any disagreement.
- **Your files are never overwritten.** A hook or rule page orly did not write
  is refused; `--force` and `--no-hooks` are the ways through.
- **A refused run changes nothing.**

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
bun install --frozen-lockfile
make audit
```

`make audit` is the fast suite — its steps run in parallel (~20s):

- **typecheck and unit tests**
- **render determinism** — the same sources always produce the same rules
- **gate fixtures** — every gate proved against one passing and one failing case

Install evals — real installs into throwaway repositories — moved off the
local chain for costing half its wall-clock: `make install-evals` runs them on
demand, and CI runs them on every pull request and release.

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
