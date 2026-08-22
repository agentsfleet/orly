<div align="center">

<img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agentsfleet-mark-glow.png" width="180" alt="agentsfleet" />

# orly

[![npm](https://img.shields.io/npm/v/@agentsfleet/orly?logo=npm&logoColor=white)](https://www.npmjs.com/package/@agentsfleet/orly)
[![bun ≥1.4](https://img.shields.io/badge/bun-%E2%89%A51.4-FBF0DF?logo=bun&logoColor=black&labelColor=FBF0DF)](https://bun.sh)
[![coverage](https://img.shields.io/codecov/c/github/agentsfleet/orly?logo=codecov&logoColor=white)](https://codecov.io/gh/agentsfleet/orly)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![Claude Code](https://img.shields.io/badge/Claude_Code-D97757?logo=claude&logoColor=white)](https://platform.claude.com/docs/en/claude-code)
[![Codex](https://img.shields.io/badge/Codex-412991)](https://github.com/openai/codex)
[![OpenCode](https://img.shields.io/badge/OpenCode-000000?logo=opencode&logoColor=white)](https://opencode.ai)
[![Amp](https://img.shields.io/badge/Amp-091C1E)](https://ampcode.com)

**AI-native development, made deterministic. Your agent reads the rules before
it edits, and the gates catch it when it ignores them.**

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

| You need | Why | Version |
|---|---|---|
| bun | runs orly, and `bunx` fetches it | ≥ 1.4.0 |
| git | orly writes the hooks, and `orly gate` reads the branch | any |
| a coding agent | something has to read the rules | Claude Code, Codex, OpenCode, or Amp |
| your own check commands | `orly gate` runs what `.oracle/orly.json` names | whatever your repository already runs |

gstack is not required. The rules name `gstack /review` at the review stage, and
no gate enforces it.

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

## What happens when you use it

`orly init` is the setup. This is the loop you live in, one task from prompt
to Pull Request.

The spec is a file on disk, and its directory is the status. Only the stages the
rules name move it, and `orly gate pr` reads where it ended up.

```text
  🤠 you ──► "add webhook retries"
   │
   ▼
  🦉 Claude Code · Codex · OpenCode · Amp
   │  writes the spec itself
   ▼
  ▣ docs/v1/pending/    committed on main
   │
   │  CHORE(open)       branch cut, baseline recorded, no code until it commits
   ▼
  ▣ docs/v1/active/     PLAN · EXECUTE · CONFORM · VERIFY · REVIEW · DOCUMENT · COMMIT
   │                    each edit trips the rule page for its file kind
   │                    a red gate sends it back to EXECUTE
   │
   │  CHORE(close)      session notes, orphan sweep
   ▼
  ▣ docs/v1/done/       orly gate pr green ──► PR opens
```

The agent cannot skip a stage quietly. The hooks run the gates on every commit
and push. `orly gate pr` then refuses the Pull Request until each criterion is
green, or carries an override you recorded with a reason.

A gstack plan review produces the prompt at the top of that diagram. orly
takes it from there.

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

## Which packs you get

Nine packs are chosen by the file extensions in your own source. orly scans four
directories deep. It skips `node_modules`, `target`, `.venv`, and the other
dependency trees, so one stray file cannot select a language you do not write.

| Pack | Selected when your source has |
|---|---|
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-zig.svg" width="14" alt=""> `language.zig` | `.zig` |
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-typescript.svg" width="14" alt=""> `language.typescript` | `.ts`, `.tsx` |
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-javascript.svg" width="14" alt=""> `language.javascript` | `.js`, `.jsx` |
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-rust.svg" width="14" alt=""> `language.rust` | `.rs` |
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-go.svg" width="14" alt=""> `language.go` | `.go` |
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-python.svg" width="14" alt=""> `language.python` | `.py` |
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-shell.svg" width="14" alt=""> `language.shell` | `.sh` |
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-mdx.svg" width="14" alt=""> `language.mdx` | `.mdx` |
| <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/lang-sql.svg" width="14" alt=""> `domain.sql` | `.sql` |

Seven more install in every repository.

| Pack | What it carries |
|---|---|
| `universal.authoring` | file length, logging, named constants, no dead code, the lifecycle runbook |
| `domain.http` | REST API design rules |
| `domain.auth` | auth-flow invariants |
| `domain.documentation` | `DOCUMENTATION_RULES.md`, the voice standard for published pages |
| `domain.changelog` | changelog voice, and what never gets rewritten |
| `workflow.specifications` | the spec template and the gate that checks its shape |
| `workflow.skills` | four skills, written once for all four agents |

Three install only when `.oracle/orly.json` names them:

| Pack | What it adds | Why it is opt-in |
|---|---|---|
| 🦉 `workflow.governance` | the rules for editing rules, their questionnaire, and orly's architecture | only useful if you edit orly itself |
| `product.agentsfleet` | three audit scripts, the verify dispatch page, and four `agentsfleet` docs | a product surface that means nothing in another checkout |
| 🤠 `persona.indy` | no files; it rewrites the address handles and tone in the generated rules | one maintainer's name and voice |

## What lands

| Path | Contents |
|---|---|
| `AGENTS.orly.md` | the generated rules — safety, the dispatch router, the lifecycle |
| `dispatch/*.md` | one rule page per kind of work |
| `audits/*.sh` | the deterministic gates |
| `docs/*.md` | the standards those rules cite |
| `.claude/skills/`, `.agents/skills/`, `.opencode/skills/` | the skills the rules name, materialised for <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agent-claude-code.svg" width="14" alt=""> Claude Code, <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agent-codex.png" width="14" alt=""> Codex, <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agent-opencode.svg" width="14" alt=""> OpenCode, and <img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agent-amp.svg" width="14" alt=""> Amp |
| `.githooks/` | pre-commit and pre-push, wired to `orly gate` |
| `.oracle/orly.json` | which packs, which commands, what orly installed |

## Developing orly

Pull requests are welcome. `make audit` is the bar: if it passes, the change is
reviewable.

```bash
git clone git@github.com:agentsfleet/orly.git && cd orly
git config core.hooksPath .githooks
bun install --frozen-lockfile
make audit
```

`make audit` is the fast suite. Its steps run in parallel (~20s):

- **typecheck and unit tests**
- **render determinism**: the same sources always produce the same rules
- **gate fixtures**: every gate proved against one passing and one failing case

Install evals are real installs into throwaway repositories. They cost half the
local chain's wall-clock, so they run on demand with `make install-evals`.
Continuous Integration (CI) runs them on every pull request and release.

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

## Try it

Run this in a repository you own. It writes nothing until you drop the flag.

```bash
bunx @agentsfleet/orly init --dry-run
```

It prints the rules it would install, already rendered for the languages it
found in your source. Read them. If you disagree with one, that is the point:
your own `AGENTS.md` overrides it.

Then hand your agent the prompt orly was built for:

```text
Read AGENTS.orly.md. Tell me which of my last ten commits would have tripped a
gate, and name the rule that caught each one.
```

## License

[MIT](LICENSE)

<div align="center">

[![from agentsfleet](https://img.shields.io/badge/from-agentsfleet-5EEAD4?labelColor=0A0D0E)](https://github.com/agentsfleet/agentsfleet)

Made by 🤠 [Indy](https://github.com/indykish) · written with 🦉 Orly

</div>
