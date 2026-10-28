<!--
SPEC AUTHORING RULES (load-bearing; the one comment that survives):
- Body order is the implementing agent's read order. Fill it with the
  orly-spec-new skill, then delete every "tpl:" guidance comment. The SPEC
  TEMPLATE GATE blocks tpl comments, unfilled fill slots and missing required
  sections (audits/spec-template.ts, run by orly gate pr and by
  audits/spec-template.sh).
- No time or effort estimates anywhere: no effort columns, complexity ratings,
  percentage complete, implementation dates or assigned owners.
- Priority (P0/P1/P2/P3) is the only sizing signal; Depends on is the only
  sequencing signal. A section that contradicts these rules loses; delete it.
-->

# M15_001: orly's rules become standards that three skills and one reviewer apply, and orly ships no audit scripts

**Prototype:** v2.0.0

**Milestone:** M15

**Workstream:** 001

**Date:** Oct 28, 2026

**Status:** PENDING

**Priority:** P1, every consumer's agent reads its rules through what this Workstream ships

**Categories:** GOV, SKILL

**Batch:** B1; M15_002 is the one follow-up Pull Request; the gate's language is M16

**Branch:** pending, set at CHORE(open)

**Baseline revision:** pending, set to the full comparison commit at CHORE(open)

**Test Baseline:** pending, measured before the Pull Request

**Baseline evidence:** pending, set to a report path or run URL before the Pull Request

**Depends on:** none

**Provenance:** LLM-drafted (large language model Claude Opus 5.5, Oct 28, 2026) from the owner's decisions this session (Discovery), source read at `bbfeecf`, the Elephant-Goldfish Model (EGM) plugin layout, and a triage of 800 gstack learnings; replaces the 23-skill draft committed as `32ebffc`

**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`, which this spec amends: rules are standards, steps are three skills, judgment is one reviewer, and `orly gate` checks code and Git only

---

## Overview

**Goal (testable):** after `orly update`, a consumer's rules exist as standards under `.orly/standards/`, three skills and one reviewer apply them, the always-on `AGENTS.md` is at most 16 KiB, `orly gate pr` runs no spec criterion, and orly ships no file under `audits/` or `dispatch/`.

**Problem:** orly delivers rules through a skill system it built by hand, writes them as orders, and backs them with scripts whose value is mostly gone.

1. A trigger table in `AGENTS.md` points to 19 dispatch pages (`ls dispatch/*.md | wc -l`) and 14 rule documents under `docs/`. Nothing loads a page automatically, so `audits/doc-read.sh` (292 lines) logs reads that pre-commit compares to the staged diff (`.githooks/pre-commit`).
2. Rules are orders the model carries out by hand: RULE UFS asks for a "Pre-edit self-audit (mandatory)" grep before every save (`docs/greptile-learnings/RULES.md`).
3. The always-on file is large: `agentsfleet`'s `.orly/AGENTS.md` is 382 lines and 36,763 bytes (`wc -lc .orly/AGENTS.md`).
4. Seven audits and three evaluation suites exist only to keep the hand-built pieces consistent (`Makefile:31-37`).
5. The scripts a consumer runs are low-value: `agentsfleet`'s `make harness-verify` calls six (`make/harness.mk:90-96`). UFS and the spec check are removed by owner decision; the logging check's Zig half scans nothing (`git ls-files '*.zig' | wc -l` prints 0); its Rust and TypeScript halves duplicate lints clippy and oxlint already offer; the rest are judgment calls written as regular expressions. Three more scripts have no caller in any consumer: `error-codes.sh`, `deinit-pairs.sh`, `sql-mod.sh`.
6. Rules still describe a retired stack: Zig and Redis are gone from `agentsfleet`, whose datastore is Dragonfly (`.orly/LOCAL.md`).

**Solution summary:** split orly the way EGM splits itself. **Standards** hold rules as declarations (Applies to, Checked by, Bad, Good, Why). **Three skills** hold the only steps: `orly-spec`, `orly-build`, `orly-ship`. **One reviewer agent**, `orly-standards-reviewer`, judges a diff against the standards with no chat history. gstack and EGM do what they already do. Every audit and dispatch script is deleted: deterministic checks that matter become settings in linters the consumer already runs, and the rest become rules the reviewer judges. `orly gate` drops its spec criteria and the spec parser (EGM reviews specs instead), `conform` becomes optional, and `orly judge` leaves with the parser it imports. Consumers stay safe because each pins its orly version (`agentsfleet` `scripts/check_orly_pin.sh`), Continuous Integration (CI) installs exactly that version (`agentsfleet` `.github/workflows/governance.yml`), and each consumer migrates in its own Pull Request.

**Design flow:**

```text
 idea ─► orly-spec ──────────────► orly-build ─────────────► orly-ship ──────────────────► you merge
         /egm_brainstorm             move spec to active/       gstack /review                 │
         draft from spec standard    branch, worktree           orly-standards-reviewer        ▼
         /egm_review, /egm_resolve   read standards for the     spec to done/                orly-ship's
         commit to pending/          touched files; Section     orly gate pr                 land steps:
                                     loop; hooks run gates      PR body; babysit CI          pull, prune
 rules: .orly/standards/*.md     checks: clippy, oxlint, gitleaks, docs.language     refusal: orly gate + hooks + CI
```

## PR Intent & comprehension handshake

- **PR title (eventual):** feat: turn orly's rules into standards, drop audit scripts and spec criteria
- **Intent (one sentence):** Rules become short declarations an agent and a fresh-eyed reviewer both read, steps shrink to three skills, and every script and spec check whose job moved elsewhere is gone.
- **Authoring handshake:** Restatement: convert every rule page into 17 standards with fixed fields; fold in still-true gstack learnings; drop UFS, Zig and Redis; replace the four orly skills with `orly-spec`, `orly-build`, `orly-ship` and the agent `orly-standards-reviewer`; slim the always-on file; delete every file under `audits/` and `dispatch/`, the read-logging gate and the consistency evaluations; remove the spec criteria, the spec parser and `orly judge`; make `conform` optional. ASSUMPTIONS I'M MAKING: (1) skills, the agent and standards install as committed copies (D1). (2) Surviving rules keep their meaning; Hard Safety stays word for word. (3) Consumers are protected by their version pin and migrate in their own Pull Request; `agentsfleet`'s is described in §6. (4) gstack and EGM are installed where the skills run; `orly doctor` reports when they are not.
- **Implementer handshake:** recorded in the Pull Request Session Notes at PLAN, before any edit. A restatement that differs from the Intent stops the work until the two are reconciled.

## Implementing agent — read these first

1. `registry.json` — packs and the files each materialises; §3 adds `standards` to a pack.
2. `core/operating-model.md` and `SOUL.md` — the always-on source §2 cuts; the skills line is `SOUL.md:63-64`.
3. `docs/greptile-learnings/RULES.md` — the rule identifiers §1 places, each exactly once.
4. `src/criteria.ts` and `src/criteria_spec.ts` — the per-gate criterion list (lines 52-62) and the spec criteria §5 removes.
5. `src/install.ts` and `src/installation/migration.ts` — committed-copy install (line 120) and retirement of managed files (lines 21-30).
6. `https://github.com/google/elephant-goldfish-model` — the split this spec copies: `skills/` for steps, `agents/` for personas, `resources/document_standards/` for rubrics.

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `standards/code.md`, `tests.md`, `spec.md`, `pr.md`, `changelog.md`, `docs.md` | CREATE | cross-language standards |
| `standards/languages/typescript.md`, `rust.md`, `go.md`, `python.md`, `shell.md`, `mdx.md` | CREATE | language standards |
| `standards/domains/sql.md`, `http.md`, `auth.md`, `logging.md`, `architecture.md` | CREATE | domain standards |
| `skills/orly-spec/SKILL.md`, `skills/orly-build/SKILL.md`, `skills/orly-ship/SKILL.md`, `agents/orly-standards-reviewer.md` | CREATE | three skills and the reviewer |
| `skills/orly-spec-new/`, `skills/orly-write-unit-test/`, `skills/orly-write-integration-test/`, `skills/orly-babysit-prs/` | DELETE | folded into the three skills and `standards/tests.md` |
| `core/operating-model.md`, `SOUL.md`, `AGENTS.md` | EDIT | always-on text only; `AGENTS.md` regenerated |
| `registry.json`, `schemas/`, `.orly/orly.json` | EDIT | packs list standards; `language.zig` and `product.agentsfleet` removed |
| `src/criteria_spec.ts`, `src/spec_obligations.ts`, `src/spec_test_search.ts`, `src/judgments/`, `src/spec_completion.test.ts`, `src/spec_template_io.test.ts`, `src/spec_template.test.ts`, `src/spec_baseline.test.ts`, `src/spec_rehearsal.test.ts`, `src/gates_spec.test.ts`, the `src/judgment_*.test.ts` files | DELETE | spec criteria, the parser's callers and `orly judge` |
| `src/criteria.ts`, `src/gates.ts`, `src/validation.ts`, `src/cli.ts`, `src/cli_help.ts`, `src/doc_rules.ts`, `src/git_env.ts`, `src/install.ts`, `src/installation/plan.ts`, `src/loaders.ts`, `src/render.ts`, `src/model.ts`, `src/references.ts` | EDIT | no spec criteria; `conform` optional; no `judge`; rule pages are `standards/`; install standards and the agent |
| `src/standards_catalogue.test.ts` | CREATE | §1 catalogue rules |
| `src/gates.test.ts`, `src/criteria.test.ts`, `src/scanner_index.test.ts`, `src/install.test.ts`, `src/install_packs.test.ts`, `src/render.test.ts`, `src/references.test.ts`, `src/gates_test_support.ts` | EDIT | the new gate list and standards |
| `audits/` (23 files and `fixtures/`), `dispatch/` (19 pages, 7 scripts), `packs/language/*/rules.md` (5) | DELETE | content in standards; checks in linters or review |
| `docs/CHANGELOG_VOICE.md`, `DOCUMENTATION_RULES.md`, `EXECUTE_DOC_READS.md`, `HARNESS_VERIFY_OUTPUT.md`, `LIFECYCLE_PATTERNS.md`, `LOGGING_STANDARD.md`, `RELEASE_TEMPLATE.md`, `REST_API_DESIGN_GUIDELINES.md`, `SCHEMA_CONVENTIONS.md`, `VERIFY_TIERS.md`, `TEMPLATE.md`, `DISPATCH_ARCHITECTURE.md`, `DISPATCH_REVIEW_DISPOSITION.md`, `RULE_ENFORCEMENT.md`, `JUDGMENTS.md`, `docs/greptile-learnings/` | DELETE | content in standards, or the retired dispatch, judge and harness systems |
| `evals/dispatch/`, `evals/ledger/`, `evals/llms/`, `evals/judgments/`, `evals/test-agents-md.sh`, `evals/test-dispatch-parity.sh` | DELETE | evaluations of retired systems |
| `Makefile`, `.githooks/pre-commit`, `.githooks/pre-push` | EDIT | drop deleted steps, the read-logging check, and deleted paths from the governance pattern |
| `docs/ORLY_ARCHITECTURE.md`, `README.md`, `docs/CHANGELOG.md`, `package.json` | EDIT | the new architecture; "Changing a standard"; version 0.26.0 |
| `docs/v2/pending/M15_001_P1_GOV_SKILL_RULES_BECOME_STANDARDS.md` | CREATE | this spec |

## Applicable Rules

- **`docs/greptile-learnings/RULES.md`** (moving into the standards in §1) — NDC and ORP (every retired page, script, criterion and Makefile step leaves in the same diff), NLG (no alias from an old path to a standard, no fallback reader for `dispatch/`, no hidden spec check), NLR (a moved rule is cut to what fires), TST-NAM and MSID (no milestone identifiers in standard, skill, source or test names).
- `dispatch/edit_rules.md` — governance edits until §4 retires it; its content moves to `docs/ORLY_ARCHITECTURE.md`.
- `dispatch/write_ts_adhere_bun.md` — every `src/` edit; the TS FILE SHAPE DECISION is due at PLAN.
- `dispatch/write_any.md` — length, logging and milestone-identifier gates on every source edit.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| `edit_rules` | yes | `make audit` before push; its questionnaire retires in §4, replaced by `src/standards_catalogue.test.ts`; the owner decides any paid comprehension run |
| `write_ts_adhere_bun` | yes, `src/` edits | PLAN records the file shape for the catalogue test, install and gate changes |
| `write_any` | yes | functions within the length caps; no milestone identifiers |
| `name_architecture` | yes, rule delivery and the gate change | `docs/ORLY_ARCHITECTURE.md` changes in the same Pull Request (PR) |
| `verify` | yes | `make conform` and `bun test src` before any done claim |

## Prior-Art / Reference Implementations

- **Reference:** EGM (`https://github.com/google/elephant-goldfish-model`, 0.1.0, Apache-2.0) — 7 skills of 67 to 458 lines, 9 personas of 30 to 74 lines, 5 standards of 30 to 60 lines (`wc -l` per directory of the installed plugin). orly copies the split and persona size; it installs committed copies instead of a plugin (D1).
- **Reference:** `agentsfleet`'s own declarative enforcement — clippy `disallowed-methods` (`rustd/clippy.toml`), workspace lint groups (`rustd/Cargo.toml:898-903`), oxlint `no-console` already at `error` in `ui/packages/app/.oxlintrc.json`. Logging checks move to the same mechanism.
- **Reference:** gstack `/review` — its own checklist and 9 specialists (`review/SKILL.md:474`), which never read repository rules; `orly-standards-reviewer` adds only the rule-ID lens.

## Sections (implementation slices)

### §1 — Seventeen standards

Each standard is Markdown with one block per rule: `### <ID> — <statement>`, then **Applies to** (globs), **Checked by** (`review`, `gate: <criterion>` or `linter: <tool> <rule>`), **Bad**, **Good** and **Why**. No step lists. A standard over 400 lines splits into `<name>-<topic>.md`. Sources: the pages under Files Changed and the promoted learnings in Discovery. Removed by owner decision: RULE UFS, every Zig rule, Redis wording (Dragonfly where a datastore is named), and the template's readiness table, which EGM's implementation-readiness reviewer replaces.

- **Dimension 1.1** — every rule block carries all five fields → Test `every rule declares its five fields`
- **Dimension 1.2** — every identifier in 0.25.0's pages appears in exactly one standard or in the removed-by-decision list → Test `every rule identifier has one home`
- **Dimension 1.3** — no standard mentions Zig, Redis or UFS → Test `standards name no retired stack`
- **Dimension 1.4** — every standard is at most 400 lines and every relative link resolves → Test `standards stay short and links resolve`

### §2 — The always-on file

`core/operating-model.md` and `SOUL.md` keep what applies every turn: names, banned vocabulary, acronyms, the evidence invariant, the self-repair boundary, Hard Safety word for word, auto-mode, the gate's anchor invariant, reply shape, and one new line: gstack `/learn` is not used; durable knowledge goes to a standard, `.orly/LOCAL.md` or architecture docs. `SOUL.md:63-64` becomes "skills are config, not code: one `SKILL.md` whose description is its trigger; rules live in standards; no YAML allowlists in skills". Three promoted learnings join them: challenge the owner's premise and name edge cases before agreeing; prefer the smallest deterministic, testable design and add no configurable engine unasked; a delegated agent gets one question or one directory of diff, and a fork sharing the worktree runs no Git. The reference-checkout line (`core/operating-model.md:94`) names only paths that exist: `oss/js/supabase`, `oss/js/cli`, `oss/rs/arrow-rs`, `oss/rs/builder`, `oss/rs/codex`, `oss/ocaml/mirage` and `agentsfleet/rustd/`; `oss/supabase`, `oss/cli`, `oss/rs/exonum` and `oss/ghostty` are gone (`ls ~/Projects/oss`). The renderer appends one index line per selected skill and standard.

- **Dimension 2.1** — the rendered `AGENTS.md` for the full pack set is at most 16,384 bytes → Test `rendered agents file fits sixteen kibibytes`
- **Dimension 2.2** — every Hard Safety bullet in the 0.25.0 render appears unchanged → Test `hard safety survives verbatim`
- **Dimension 2.3** — the render says gstack `/learn` is not used → Test `always-on file disallows gstack learn`

### §3 — Three skills and one reviewer

| Skill or agent | Steps it owns | Calls |
|---|---|---|
| `orly-spec` | explore, choose, draft, review, resolve, commit to `pending/` on a branch and open a docs-only PR, because orly's and `agentsfleet`'s `main` both require pull requests (`gh api repos/agentsfleet/<repo>/rules/branches/main` lists `pull_request`) | `/egm_brainstorm`, `standards/spec.md`, `/egm_review`, `/egm_resolve` |
| `orly-build` | move the spec to `active/` with `Status`, `Branch` and `Baseline revision`; branch and worktree; read the standards for the files a Section touches; code and tests; mark Dimensions `DONE` in the same commit | `standards/*`, `orly lifecycle`, gstack `/investigate` and `/qa` |
| `orly-ship` | review, fix, move the spec to `done/`, `orly gate pr`, PR body, babysit CI and greptile until two quiet polls, then after your merge pull and prune | gstack `/review`, `orly-standards-reviewer`, `standards/pr.md`, `standards/changelog.md` |
| `orly-standards-reviewer` | sees the diff, the spec and the matching standards only; reports `{rule ID, file:line, fix}`; nothing it cannot tie to a rule | read-only tools |

Packs select standards (`"standards": [...]` beside `extensions`). Install writes `.orly/standards/`, the skills to `.orly/skills/` with runtime stubs as today, and the agent to `.claude/agents/`. **Implementation default:** where a runtime has no subagent support, `orly-ship` runs the reviewer's instructions inline.

- **Dimension 3.1** — each skill's `name` equals its directory and its description names its trigger → Test `skill front matter names its directory`
- **Dimension 3.2** — `--with language.rust` installs `languages/rust.md` and no other language standard → Test `install writes only selected standards`
- **Dimension 3.3** — updating a 0.25.0 install retires unmodified pages and scripts and stops on an edited one → Test `update retires pages and stops on edits`
- **Dimension 3.4** — on PR #70's diff, the reviewer reports only findings tied to a rule ID → Test `reviewer ties every finding to a rule`
- **Dimension 3.5** — Claude Code and Codex each load the three skills from the installed layout → Test `each runtime loads the three skills`

### §4 — Retire the hand-built delivery and every script

Delete everything under `audits/` and `dispatch/`, the 16 pages and `docs/greptile-learnings/`, the four evaluation suites and the two `evals/test-*.sh` files. `make conform` keeps `bin/orly verify` only; `make audit` adds `bun test src/standards_catalogue.test.ts`; `.githooks/pre-commit` drops its `audits/doc-read.sh` call. `src/doc_rules.ts` treats `standards/` as rule pages in place of `dispatch/` and `audits/` (line 24). `docs/ORLY_ARCHITECTURE.md` gains "Changing a standard".

- **Dimension 4.1** — no tracked file references a deleted path → Test `no reference to a retired file`
- **Dimension 4.2** — `make conform` and `make audit` pass with no `audits/` or `dispatch/` → Test `make audit passes without scripts`

### §5 — The gate checks code and Git only

`orly gate pr` runs `git.branch`, `git.tree`, `git.pushed`, `repo.config`, `docs.language`, `docs.updated` and the declared `verify.*` commands. Every `spec.*` criterion, the spec parser and `orly judge` (which imports the parser, `src/judgments/spec_input.ts:6`) are removed; spec quality is EGM's review at authoring. A repository may declare no `conform`; `orly gate work` then runs `repo.config` alone (today `src/validation.ts:50` requires one). Overrides keep working for every remaining criterion.

- **Dimension 5.1** — `orly gate pr` on a branch with an active spec runs no criterion named `spec.*` → Test `pr gate runs no spec criterion`
- **Dimension 5.2** — a configuration with no `conform` passes `repo.config` and `orly gate work` → Test `work gate passes without conform`
- **Dimension 5.3** — `orly judge` is an unknown command → Test `judge is not a command`

### §6 — Consumer proof on `agentsfleet`

On a copy of `agentsfleet` (orly 0.17.0, `jq -r .orly_version .orly/orly.json`; 62 managed entries), make the change its own Pull Request will make after this release: bump the pin; run this branch's `orly update`; delete `make/harness.mk`'s `harness-verify` targets, its two `Makefile` help lines and the `conform` declaration; add clippy `print_stdout`, `print_stderr` and `dbg_macro` to `[workspace.lints.clippy]`; add oxlint `no-console` where `ui/packages/app` already has it and output is not the program's interface; move still-true lines from `VERIFY_TIERS.md` into `.orly/LOCAL.md`, with the 17 promoted facts and 5 architecture notes from the learnings triage (Discovery); then run `make lint-all` and `make test-unit-all`. `scripts/checks/gitleaks-config.sh` is `agentsfleet`'s own and moves into its pre-commit beside `gitleaks`. The comment at `.github/workflows/governance.yml:37` changes only with the owner's approval.

- **Dimension 6.1** — the copy updates, `.orly/audits/`, `.orly/dispatch/` and `.orly/docs/` are gone, and `make lint-all` and `make test-unit-all` pass → Test `agentsfleet copy updates and stays green`

### §7 — Codex cloud tasks

Codex cloud tasks see repository skills only; "Personal skills from your local computer aren't synced to cloud environments" (`https://learn.chatgpt.com/docs/environments/cloud-environments`), so gstack and EGM are present only if the environment installs them. Each skill names its fallback: `orly-spec` reviews with a fresh-context subagent given `standards/spec.md`; `orly-ship` runs `orly-standards-reviewer` plus an inline adversarial pass and says which review it ran. A cloud container pushes nothing and runs Git hooks only if the environment sets `core.hooksPath`, so `orly-build` and `orly-ship` run `orly gate work` and `orly gate verify` themselves and stop before `orly gate pr`; on the Pull Request, CI runs `orly gate work` (`agentsfleet` `governance.yml`) and the lint, unit and integration lanes (`lint.yml`, `test-unit-rustd.yml`, `test-integration-rustd.yml`). `docs/ORLY_ARCHITECTURE.md` gains "Codex cloud environment": install the pinned orly (`jq -r .orly_version .orly/orly.json`) and gitleaks, set `core.hooksPath`, and a start-skill check that reinstalls orly when the pin changes.

- **Dimension 7.1** — a Codex cloud task on this branch lists the three skills and finishes with `orly gate verify` green → Test `cloud task loads skills and passes gate verify`
- **Dimension 7.2** — with gstack and EGM absent, `orly-ship` names the review it ran instead and the gate result → Test `skills name their fallback when helpers are missing`

## Interfaces

**Two rules in standards:**

```markdown
### ERR-RS — A crate never hand-writes its error type
- **Applies to:** `**/*.rs`
- **Checked by:** review
- **Bad:** `pub enum Error { Io(std::io::Error) }` with a hand-written `Display`
- **Good:** a private `ErrorKind` passed to `error_shell!`, with `error_lifts!` for `From`
- **Why:** one shape gives every error a code, a backtrace and a source chain

### LOG-RS-1 — Runtime Rust never prints to a stream
- **Applies to:** `**/src/**/*.rs`
- **Checked by:** linter: clippy print_stdout, print_stderr, dbg_macro
- **Bad:** `eprintln!("claim failed: {err}")`
- **Good:** `tracing::warn!(event = "claim_failed", error = %err)`
- **Why:** stream writes skip the log pipeline and its fields
```

**Pack shape:** `"language.rust": { "extensions": [".rs"], "standards": ["languages/rust.md"], "managed_files": [] }`.

**Gate criteria after this Workstream:** `work` → `repo.config` + `conform` if declared · `verify` → `repo.config`, `docs.language`, non-test `verify.*` · `pr` → `git.branch`, `git.tree`, `git.pushed`, `repo.config`, `docs.language`, `docs.updated`, every `verify.*`.

**Consumer layout after `orly update`:**

```text
AGENTS.md, CLAUDE.md          pointers, unchanged
.orly/AGENTS.md               ≤16 KiB: always-on rules + index of skills and standards
.orly/LOCAL.md                project facts, owned by the repository
.orly/orly.json               packs, commands, managed files, digests
.orly/standards/              the selected standards
.orly/skills/orly-spec|build|ship/   full skills; stubs in .claude/, .agents/, .opencode/ as today
.claude/agents/orly-standards-reviewer.md
.orly/hooks/                  pre-commit → orly gate work · pre-push → orly gate verify
```

## Failure Modes

| Mode | Kind | Cause | Handling (system response + what the caller observes) | Test |
|------|------|-------|--------------------------------------------------------|------|
| Lost rule | failure | an identifier dropped during the move | the identifier test fails | `every rule identifier has one home` |
| Edited retired file | failure | a consumer changed a page or script orly retires | update stops with `migration conflict: <path>`; nothing is written | `update retires pages and stops on edits` |
| Consumer still calls a script | failure | a consumer's Makefile names a retired script | its pin keeps the old copies until its own Pull Request, which removes the call in the same commit | `agentsfleet copy updates and stays green` |
| Noisy reviewer | degradation | the reviewer reports opinions | its instructions forbid untied findings; the replay measures it | `reviewer ties every finding to a rule` |
| Skill not loaded | degradation | a runtime does not match the trigger | the agent misses the steps; `orly gate` still blocks | `each runtime loads the three skills` |
| Hidden spec check | failure | a spec criterion survives the removal | the gate test fails | `pr gate runs no spec criterion` |
| Helpers missing in a cloud task | degradation | gstack or EGM not installed in the cloud environment | the skill runs its fallback review and says so; CI still runs the lanes on the Pull Request | `skills name their fallback when helpers are missing` |

## Invariants

1. The rendered `AGENTS.md` is at most 16,384 bytes — `rendered agents file fits sixteen kibibytes`.
2. Every rule identifier has exactly one home or a recorded removal — `every rule identifier has one home`.
3. orly tracks no file under `audits/` or `dispatch/` — `no reference to a retired file` asserts both directories are absent.
4. Install never deletes a file whose digest differs from the recorded one — `migrationDeletes` throws; `update retires pages and stops on edits`.

## Metrics & Observability

No product or operator signal changes. §6 records managed files, always-on bytes and `make lint-all` output before and after as evidence.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|-----------|------|------|---------------------------------------------|
| 1.1 | unit | `every rule declares its five fields` | every `### ` block under `standards/` → Applies to, Checked by, Bad, Good, Why present |
| 1.2 | unit | `every rule identifier has one home` | 0.25.0 identifiers (fixture) → each in exactly one standard or the removal list |
| 1.3 | unit | `standards name no retired stack` | all standards → no match for `\b(zig|redis|ufs)\b`, case-insensitive |
| 1.4 | unit | `standards stay short and links resolve` | each standard ≤ 400 lines; each relative link → an existing file |
| 2.1 | unit | `rendered agents file fits sixteen kibibytes` | full pack set → rendered bytes ≤ 16,384 |
| 2.2 | unit | `hard safety survives verbatim` | 0.25.0 Hard Safety bullets (fixture) → each a substring of the new render |
| 2.3 | unit | `always-on file disallows gstack learn` | full render → contains the `/learn` line |
| 3.1 | unit | `skill front matter names its directory` | each `skills/*/SKILL.md` → `name` equals the directory; description 1 to 1,024 characters |
| 3.2 | unit | `install writes only selected standards` | `--with language.rust` → `languages/rust.md` present; `languages/go.md` absent |
| 3.3 | integration | `update retires pages and stops on edits` | 0.25.0 install fixture → pages and scripts deleted; one edited page → exit 1 naming it, tree unchanged |
| 3.4 | manual | `reviewer ties every finding to a rule` | procedure: run the reviewer on PR #70's diff; evidence: findings in Session Notes, each with a rule ID |
| 3.5 | manual | `each runtime loads the three skills` | procedure: in a fixture repository, ask Claude Code and Codex for their skill list; evidence: transcripts in Session Notes |
| 4.1 | unit | `no reference to a retired file` | tracked files → no deleted path cited; `audits/` and `dispatch/` absent |
| 4.2 | integration | `make audit passes without scripts` | `make audit` on the branch → exit 0 |
| 5.1 | integration | `pr gate runs no spec criterion` | repository with an active spec → `orly gate pr` rows contain no `spec.` name |
| 5.2 | unit | `work gate passes without conform` | `.orly/orly.json` with only `verify.unit` → `repo.config` passes; `orly gate work` exits 0 |
| 5.3 | unit | `judge is not a command` | `orly judge spec x.md` → exit 1 with the unknown-command message |
| 6.1 | manual | `agentsfleet copy updates and stays green` | procedure: the §6 steps on a copy; evidence: counts and command output in Session Notes |
| 7.1 | manual | `cloud task loads skills and passes gate verify` | procedure: start a Codex cloud task on the branch; ask for the skill list; run `orly gate verify`; evidence: task transcript in Session Notes |
| 7.2 | manual | `skills name their fallback when helpers are missing` | procedure: the same environment without gstack and EGM runs `orly-ship`; evidence: its review line and gate output in Session Notes |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | Standards are complete and well-formed (§1) | `bun test src/standards_catalogue.test.ts` | exit 0 | P0 | |
| R2 | The always-on file fits with safety intact (§2) | `bun test src/render.test.ts` | exit 0 | P0 | |
| R3 | No audit or dispatch file remains (§4) | `git ls-files audits dispatch \| wc -l` | `0` | P0 | |
| R4 | The gate runs no spec criterion (§5) | `bun test src/gates.test.ts` | exit 0 | P0 | |
| R5 | A real consumer updates and stays green (§6) | manual: Dimension 6.1 evidence | `make lint-all` and `make test-unit-all` exit 0 recorded | P0 | |
| R6 | The reviewer stays on rules (§3) | manual: Dimension 3.4 evidence | every finding names a rule ID | P1 | |
| S1 | Conform gates green | `make conform` | exit 0 | P0 | |
| S2 | Unit tests pass | `bun test src` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect --redact --no-banner` | exit 0 | P0 | |

`dispatch/lifecycle.md` defines grading, the ship rule and transfers to a successor spec (`MOVED` rows) in its "Rubric grading and transfers" section; after §4 that text lives in `standards/spec.md`.

## Dead Code Sweep

**1. Orphaned files — deleted from disk and git.**

| File to delete | Verify |
|----------------|--------|
| `audits/`, `dispatch/`, `packs/language/*/rules.md` | `git ls-files audits dispatch packs \| wc -l` → `0` |
| the 15 `docs/` pages and `docs/greptile-learnings/` | `git ls-files docs/greptile-learnings docs/TEMPLATE.md docs/JUDGMENTS.md` → empty |
| spec criteria, parser callers and `orly judge` | `git ls-files src/criteria_spec.ts src/spec_obligations.ts src/judgments` → empty |
| retired evaluations and the four old skills | `git ls-files evals/dispatch evals/llms evals/judgments skills/orly-spec-new` → empty |

**2. Orphaned references — zero remaining imports/uses.**

| Deleted symbol/import | Grep | Expected |
|-----------------------|------|----------|
| read-logging gate | `git grep -n -w "doc-read" -- . ':!docs/v*'` | no output |
| audit scripts | `git grep -n -E "audits/[a-z-]+\.(sh|ts|awk)" -- . ':!docs/v*'` | no output |
| spec criteria | `git grep -n -E "spec\.(gate|tests|ordering|baseline|deferrals|moved|dimensions)" -- src` | no output |

## Out of Scope

- **M15_002 (the follow-up Pull Request) — telemetry, `orly verify` and pre-push coverage.** `src/telemetry.ts`, `src/telemetry_sync.ts`, `orly skill-event`, the consent text in `orly --help`; `orly verify` becomes catalogue tests; the PR #70 pre-push range tests (a deleted branch, a new branch through `--not --remotes`, several refs, an unreadable range).
- **`agentsfleet`'s migration** — its own Pull Request in its own repository, after 0.26.0 releases, doing exactly §6; `~/Projects/docs` and `cache-kit.rs` migrate when their owners bump their pins.
- **M16 — the gate's language,** TypeScript or Rocq with OCaml, decided on the gate left after this milestone.
- Linter rule files (ast-grep or GritQL): not planned; reviewer judgment covers the regular-expression checks, and a file format is chosen only if the reviewer misses them in practice.
- Security audits: manual only; gstack `/cso` and Cloudflare's `security-audit` run when the owner asks.
- A plugin channel: not planned (D1). Enforcing hooks for Hard Safety or `/learn`: not planned; the always-on text carries both.

---

## Product Clarity (authoring record)

1. **Successful user moment** — an agent in `agentsfleet` edits a Rust handler; `orly-build` reads `languages/rust.md` and `domains/http.md`; clippy rejects a stray `eprintln!` at push; at ship time the reviewer names one rule by ID with its fix.
2. **Preserved user behaviour** — commands other than `judge`, flags, the remaining criteria, override trailers and exit codes; Hard Safety word for word.
3. **Optimal-way check** — a plugin would remove copies from repositories; the owner kept committed copies because the process works (D1).
4. **Rebuild-vs-iterate** — iterate: install, migration and stubs exist; this changes what they carry and removes what no longer pays.
5. **What we build** — 17 standards, 3 skills, 1 reviewer, the slim always-on render, the catalogue tests, the gate change, the consumer proof.
6. **What we do NOT build** — the items under Out of Scope.
7. **Fit with existing features** — gstack `/review` stays the review route (`core/operating-model.md:234`); EGM reviews specs; `orly doctor` reports drift for every managed file.
8. **Surface order** — installed files and the command line only.
9. **Dashboard restraint** — N/A: no user interface.
10. **Confused-user next step** — a stopped update names the edited file; move the local edit into `.orly/LOCAL.md` or the repository's own lint configuration, then rerun `orly update`.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** standards first (§1) so every rule has a home; the always-on file (§2); skills and reviewer (§3); deletion (§4); the gate change, which deleting the parser forces (§5); consumer proof (§6). One Pull Request, as the milestone budget allows; telemetry is the follow-up.
- **Alternatives considered:** (a) 23 flat skills (`32ebffc`): every rule still an order; withdrawn. (b) Five skills and five reviewers: four duplicated gstack `/review`, EGM review, `docs.language` and gstack's synthesis. (c) A plugin: kept out by D1. (d) Port the scripts into the gate or into ast-grep rules: still code to maintain for checks whose value is low; withdrawn after the owner asked why `harness-verify` should stay. (e) Keep the scripts until replacements land: unnecessary, because consumer pins decouple orly's deletion from each consumer's migration.
- **Patch-vs-refactor verdict:** a **refactor** of rule delivery and a reduction of the gate to code and Git.

## Discovery (consult log)

- **Consults** — architecture: `docs/ORLY_ARCHITECTURE.md` at `bbfeecf`. Source facts read Oct 28, 2026: install retires managed files and stops on edited ones (`src/installation/migration.ts:21-30`); `make conform` runs `bin/orly verify`, `audits/ufs.sh --all`, `audits/agents-md.sh` and `audits/rule-ledger.sh --check` (`Makefile:31`); `conform` is required today (`src/validation.ts:50`); `orly judge` imports the spec parser (`src/judgments/spec_input.ts:6`); the release inventory test builds its own fixture (`src/release_inventory.test.ts:19-30`). From `agentsfleet`: Git hooks call only `scripts/check_orly_pin.sh` and `orly gate work` (`.githooks/pre-commit:128-129`); CI installs the pinned version (`governance.yml`); `make harness-verify` calls six orly scripts (`make/harness.mk:90-96`); no consumer calls `error-codes.sh`, `deinit-pairs.sh` or `sql-mod.sh`; oxlint `no-console` is `error` only in `ui/packages/app`. gstack `/review` reads only its own checklist (`review/SKILL.md:474`); EGM routes reviewers to its own standards (`skills/egm_review/SKILL.md:347-376`).
- **Superseded drafts** — the TypeScript audit engine and the Rocq-proved gate core (`.orly/judgments/superseded-m15-drafts/`), and the 23-skill version of this file (`32ebffc`).
- **Learnings triage** — Oct 28, 2026, four read-only subagents over 800 gstack learnings (latest per key, `~/.gstack/projects/agentsfleet-{agentsfleet,orly}/learnings.jsonl`): 236 promoted into 72 rows, merged to 56 rules; 266 one-off; 197 already covered; 69 stale (33 Zig or Redis, 36 dead paths); 32 unverifiable. Into orly standards: `tests.md` 7 (a verdict is the command's own logged exit status; an absence claim needs a known positive; fix a flaky test at its race; prove a branch reachable before testing it; mutate a value for a red run; isolate live tests on every scope; strip `GIT_*` in scratch repositories), `code.md` 5 (`-z` for path lists; `git symbolic-ref --quiet HEAD`; widen an existing resolver before adding a seam; sweep deletes and renames repository-wide; anchor bulk edits and assert their count), `pr.md` 2 (name paths when the index is shared; branch from a fetched `origin/main`), `spec.md` 2 (numbers from a fetched `origin/main`; named tests exist before a Dimension is `DONE`), `languages/shell.md` 4, `languages/rust.md` 2, `languages/typescript.md` 2, `domains/sql.md` 5, `domains/logging.md` 1; always-on 4 (§2, with the reference-checkout fix). Into `agentsfleet` through its migration (§6): 17 facts for `.orly/LOCAL.md` and 5 notes for `docs/architecture/`, listed below. Reported by the triage as defects, not rules, and unverified by the author: an OpenTelemetry cardinality cap that counts runner slots instead of series (`metrics/instrument/view.rs:62`); `docs/development.md:301` saying acceptance runs on pull requests; the REST guide allowing `{gate_id}:approve` at line 88 and refusing it at 572-576; no check that `public/openapi.json` is regenerated.
- **For `agentsfleet`'s `.orly/LOCAL.md`** (each verified by its triage agent against current source; re-check at migration): (1) one Rust lane per machine, only with at least 50 GB free; reclaim with `cargo clean`, never `trash`; (2) cargo results count only from `rustd/` with `--all-features` over a lane's crate set, a `-p` failure is retried workspace-wide, `--no-fail-fast` goes before `--`; (3) a red after `KEEP_TEST_STATE=1` or an ad-hoc run counts only after `make _reset-test-db`, `make _migrate-test-db` and a clean rerun; (4) ad-hoc `#[ignore]` tests need make's exported environment, an "X is unset" panic is an invocation error, `AFD_TEST_LOG=1` shows daemon logs, one ignored suite runs through a layered makefile; (5) a green PR proves neither Playwright (`make dry-app`) nor acceptance (after merge), so rendered-page changes run their specs locally; (6) one lane run per checkout, stop runs by PID never `pkill -f`, a vitest coverage-lock red is not a test failure; (7) a new error code lands as a family const, a `REGISTRY` row and a `problem/` entry in one commit; (8) regenerate `public/openapi.json` from `rustd/` with `--no-banner`; (9) never commit the `next-env.d.ts` that `next dev` rewrites, and local `next dev` calls api-dev on `origin/main`; (10) Dragonfly nodes announce 127.0.0.1, so probe inside the container with `redis-cli -c`, recreate only through `make _ensure-test-infra`, and force-recreate after changing `scripts/dragonfly-cluster.sh`; (11) Linux-only `afr_sandbox` and `afr_executor` code is linted and tested on Linux, which a Codex cloud task provides; (12) docs-repository API pages for a new route commit after the `agentsfleet` PR merges; (13) a new route updates `INVENTORY` in `route_inventory.rs` and the counts in `route_meta_total.rs`; (14) `ui/packages/app/app/icon.svg` is a copy of `brand.svg`, never a symlink; (15) an orly pin mismatch is fixed with an install into a task-owned prefix, never a global change; (16) cargo-mutants runs `--in-place` in a throwaway worktree; (17) pre-commit grades the staged index, so commit whole files. **For `docs/architecture/`:** span fields use `field::Empty` and `Span::record`; a metric cardinality limit caps total series; a multi-write rollback is proven by a `RAISE` trigger on a private database; stored and authored fleet configs share one parse; row locks are the standard exclusive-access tool and advisory locks live only in the migration lock.
- **Codex cloud** — read Oct 28, 2026 (`https://learn.chatgpt.com/docs/environments/cloud-environments`): an environment records an install script and a start skill; repository skills are available, personal skills are not; network is all public or the package-manager preset plus allowed domains; Pro and Business tasks get 4 vCPUs, 16 GiB memory and 32 GiB disk, Plus 2 vCPUs, 8 GiB and 8 GiB. unverified: Docker availability and whether hooks run; Dimensions 7.1 and 7.2 settle what the skills need. A full `rustd` lane wanted at least 50 GB free in the learnings, more than a cloud task's disk.
- **Open blockers** — (0) unverified: whether Codex supports project subagents; Dimension 3.5 settles it, and the inline fallback in §3 covers a no. (1) The owner approves any edit to `agentsfleet`'s `.github/workflows/governance.yml` in its migration.
- **Metrics review** — no signal changes.
- **Skill-chain outcomes** — pending until VERIFY and REVIEW.
- **Deferrals and transfers** — from PR #70, quoted below: the doc-read path coverage dissolves because §4 deletes `audits/doc-read.sh`; the pre-push range coverage moves to M15_002, because `.githooks/pre-push` keeps choosing from the pushed range whether to run `make audit`.

> Owner (Kishore, Oct 28, 2026, time not recorded): "can you be adversarial and think on doing the same thing using skills, obviously we need to get rid of scripts, md files and so on." — context: the direction behind this milestone.

> Owner (Kishore, Oct 28, 2026, time not recorded): "Imperative i mean is like step by step, but doesnt fold the skill functionally like the egm we just have 4-5 skills" — context: steps in a few skills, rules as standards, EGM's split.

> Owner (Kishore, Oct 28, 2026, time not recorded): "remove this, and spec-template.sh (i would depend on the egm review and have it update the spec and be done with it)." — context: RULE UFS and its check are removed; spec structure review moves to EGM.

> Owner (Kishore, Oct 28, 2026, time not recorded): "well if the scripts donot have value then why keep harness-verify?" — context: every audit script and `agentsfleet`'s `harness-verify` go in this milestone (§4, §6).

> Owner (Kishore, Oct 28, 2026, time not recorded): "D1 B (since we have this process setup)" — context: skills, the agent and standards install as committed copies, not a plugin.

> Owner (Kishore, Oct 28, 2026, time not recorded): "D2 B" — context: `orly gate pr` drops every spec criterion (§5).

> Owner (Kishore, Oct 28, 2026, time not recorded): "D3 B" — context: no automatic security pass.

> Owner (Kishore, Oct 28, 2026, time not recorded): "6. Yes cloud flare audit is one of audit when indy triggers manually." — context: Cloudflare's `security-audit` is manual only.

> Owner (Kishore, Oct 28, 2026, time not recorded): "3. yes disallow /learn" — context: the always-on line in §2.

> Owner (Kishore, Oct 28, 2026, time not recorded): "D4 A (just tell what you will add in the learnings)" — context: still-true gstack learnings are promoted into standards in §1.

> Owner (Kishore, Oct 28, 2026, time not recorded): "5. Telemetry - cut the crap" — context: telemetry leaves in M15_002.

> Owner (Kishore, Oct 28, 2026, time not recorded): "we dont use zig and redis" — context: the Zig pack and Redis wording leave in §1 and §4; "its dragonfly and rust".

> Owner (Kishore, Oct 28, 2026, time not recorded): "Also now most cloud sessions are moving to the cloud, i will need the instructions to codex app to say run this in there" — context: §7, and Codex cloud instructions for this Workstream and `agentsfleet`'s migration; "with orlyupdates".

> Owner (Kishore, Oct 27, 2026, time not recorded): "since we are revamping scripts to a different language in the next PR" — context: PR #70's shell audits got minimal tests because this milestone replaces them; they are now deleted instead.

> Owner (Kishore, Oct 27, 2026, time not recorded): "i think limit the test to mnimal" — context: moved the pre-push range and doc-read path coverage gaps from PR #70 to this milestone; doc-read's dissolves in §4, and the pre-push range coverage lands in M15_002.
