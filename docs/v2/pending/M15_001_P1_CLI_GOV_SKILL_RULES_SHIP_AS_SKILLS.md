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

# M15_001: orly's rules ship as skills, and orly itself is the gate

**Prototype:** v2.0.0

**Milestone:** M15

**Workstream:** 001

**Date:** Oct 28, 2026

**Status:** PENDING

**Priority:** P1, every consumer's agent reads its rules through what this Workstream ships

**Categories:** CLI, GOV, SKILL

**Batch:** B1; M15_002 to M15_004 follow in order (Out of Scope)

**Branch:** pending, set at CHORE(open)

**Baseline revision:** pending, set to the full comparison commit at CHORE(open)

**Test Baseline:** pending, measured before the Pull Request

**Baseline evidence:** pending, set to a report path or run URL before the Pull Request

**Depends on:** none

**Provenance:** LLM-drafted (large language model Claude Opus 5.5, Oct 28, 2026) from the owner's direction this session and source read at `bbfeecf`; replaces two unmerged M15_001 drafts (Discovery)

**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`, which this spec amends: rule prose lives in skills, and orly's programs are the gate and the installer

---

## Overview

**Goal (testable):** after `orly update`, a consumer repository's agent rules exist only as skills plus one always-on `AGENTS.md` of at most 16 KiB, and no `dispatch/*.md`, rule page under `docs/`, or read-logging gate remains in orly or in the consumer.

**Problem:** orly does two jobs with one mechanism. It *tells* the agent the rules and it *checks* the agent's work.

1. The telling half is a skill system built by hand. A dispatch table maps a trigger to a page (`AGENTS.md` dispatch index), 16 dispatch pages and 13 rule documents hold the prose (`wc -l dispatch/*.md docs/*.md`), and because nothing loads a page automatically, `audits/doc-read.sh` (292 lines) logs reads that pre-commit compares to the staged diff (`.githooks/pre-commit`). Skills do this natively: the runtime matches a trigger description and loads the page.
2. The always-on file is large. `agentsfleet`'s rendered `.orly/AGENTS.md` is 382 lines and 36,763 bytes (`wc -lc .orly/AGENTS.md` in `agentsfleet`), loaded into every turn whether the edit is Rust, SQL or a typo.
3. Keeping the hand-built system consistent costs its own audits: `audits/agents-md.sh`, `data.sh`, `parity-dispatch.sh`, `lifecycle-anchors.sh`, `rule-paths.sh`, `rule-ledger.sh` and `evals/dispatch/` (36 files) exist to prove the dispatch table, the pages and the rendered file agree (`Makefile:31-37`).

The checking half stays a program. A skill is a request to a model; it cannot refuse a commit. `orly gate`, the hooks and the Continuous Integration (CI) re-run in `agentsfleet`'s `.github/workflows/governance.yml` keep that job.

**Solution summary:** move every rule page into a skill under `skills/`, render a slim `AGENTS.md` holding only what must be in force on every turn (owner, hard safety, evidence, the gate, the skill index), make packs select skills instead of files, let `orly init` and `orly update` write skills and retire the old pages through the existing migration (`src/installation/migration.ts:21-30`), and delete the read-logging gate and the audits that kept the hand-built system consistent. Mechanical audits, `orly judge` and the gate's language are later Workstreams.

**Design flow:**

```text
                 BEFORE                                   AFTER
agent edits a .rs file                      agent edits a .rs file
  │                                           │
AGENTS.md (36 KB, always loaded)            AGENTS.md (≤16 KB: safety, evidence, gate, skill list)
  │ dispatch table says "read write_rust"     │
agent may or may not open the page          runtime matches orly-write-rust's description
  │                                           │ and loads the skill
doc-read.sh logs the read; pre-commit       (nothing to log)
  compares the log to the diff               │
  │                                           │
orly gate work / verify / pr  ─────────────  orly gate work / verify / pr   (unchanged)
```

## PR Intent & comprehension handshake

- **PR title (eventual):** feat: ship orly's rules as skills and retire dispatch pages
- **Intent (one sentence):** An agent gets each rule when the runtime sees it is relevant, the always-on file shrinks to what must always apply, and the machinery that faked skill loading is gone.
- **Authoring handshake:** Restatement: convert every dispatch page and rule document into a named skill with a precise trigger; rewrite the operating model into a short always-on file; packs select skills; install writes skills and removes retired files; delete the read-logging gate and the consistency audits for the old system; leave the gate, the mechanical audits and `orly judge` working as today. ASSUMPTIONS I'M MAKING: (1) skills stay committed inside each consumer repository, keeping the recorded rule "a fresh clone reads its own rules" (`agentsfleet` `.orly/LOCAL.md:3-8`); the owner may choose plugin distribution instead (Discovery, blocker 0). (2) No rule changes meaning: text moves and is cut for length, and every hard-safety line keeps its wording. (3) `orly gate` criteria, names and exit codes do not change. (4) Mechanical audits keep running from `harness-verify` until M15_002 replaces them.
- **Implementer handshake:** recorded in the Pull Request Session Notes at PLAN, before any edit. A restatement that differs from the Intent stops the work until the two are reconciled.

## Implementing agent — read these first

1. `registry.json` — every pack and the files it materialises; the shape §3 changes.
2. `core/operating-model.md` and `SOUL.md` — the always-on source §2 rewrites.
3. `skills/orly-spec-new/SKILL.md` — the house skill format: front matter `name` and `description`, then the body.
4. `src/installation/migration.ts` — retiring managed files: unmodified files are deleted, edited ones stop the update (lines 21-30).
5. `src/install.ts` — planning and writing managed files, including skill stubs (line 120).
6. `Makefile` — `CONFORM_STEPS` and `AUDIT_STEPS` (lines 31-37) that call the audits §4 deletes.

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `skills/orly-lifecycle/SKILL.md`, `skills/orly-verify/SKILL.md`, `skills/orly-write-pr/SKILL.md`, `skills/orly-name-architecture/SKILL.md` | CREATE | process skills (catalogue under Interfaces) |
| `skills/orly-write-code/SKILL.md`, `skills/orly-write-code/reference/rules.md`, `skills/orly-logging/SKILL.md` | CREATE | cross-language authoring skills; `reference/rules.md` is the greptile rule list by ID |
| `skills/orly-write-typescript/SKILL.md`, `skills/orly-write-rust/SKILL.md`, `skills/orly-write-zig/SKILL.md`, `skills/orly-write-zig/reference/lifecycle-patterns.md`, `skills/orly-write-go/SKILL.md`, `skills/orly-write-python/SKILL.md`, `skills/orly-write-shell/SKILL.md`, `skills/orly-write-mdx/SKILL.md` | CREATE | language skills |
| `skills/orly-write-sql/SKILL.md`, `skills/orly-write-http/SKILL.md`, `skills/orly-write-http/reference/rest-api.md`, `skills/orly-write-auth/SKILL.md`, `skills/orly-write-docs/SKILL.md`, `skills/orly-write-changelog/SKILL.md` | CREATE | domain skills |
| `skills/orly-edit-skills/SKILL.md` | CREATE | orly-only: how to change a skill; replaces `dispatch/edit_rules.md` and the questionnaire |
| `skills/orly-spec-new/SKILL.md`, `skills/orly-spec-new/template.md` | EDIT, MOVE | absorbs `dispatch/write_spec.md`; the template moves from `docs/TEMPLATE.md` |
| `skills/orly-verify/reference/agentsfleet.md` | CREATE | the `product.agentsfleet` verification block from `docs/VERIFY_TIERS.md` and `docs/HARNESS_VERIFY_OUTPUT.md` |
| `core/operating-model.md`, `SOUL.md`, `AGENTS.md` | EDIT | always-on text only; `AGENTS.md` regenerated |
| `registry.json`, `schemas/` | EDIT | packs list skills, not files |
| `src/install.ts`, `src/installation/plan.ts`, `src/loaders.ts`, `src/render.ts`, `src/references.ts`, `src/spec_obligations.ts`, `src/model.ts` | EDIT | plan and write skills; render the skill index; new template path |
| `src/skills_catalogue.test.ts` | CREATE | catalogue rules (§1) |
| `src/install.test.ts`, `src/install_packs.test.ts`, `src/render.test.ts`, `src/references.test.ts`, `src/gates_test_support.ts` | EDIT | skills instead of pages; template path |
| `dispatch/*.md` (16 files), `packs/language/*/rules.md` (5 files) | DELETE | content now in skills |
| `docs/CHANGELOG_VOICE.md`, `docs/DOCUMENTATION_RULES.md`, `docs/EXECUTE_DOC_READS.md`, `docs/HARNESS_VERIFY_OUTPUT.md`, `docs/LIFECYCLE_PATTERNS.md`, `docs/LOGGING_STANDARD.md`, `docs/RELEASE_TEMPLATE.md`, `docs/REST_API_DESIGN_GUIDELINES.md`, `docs/SCHEMA_CONVENTIONS.md`, `docs/VERIFY_TIERS.md`, `docs/TEMPLATE.md`, `docs/greptile-learnings/` | DELETE | content now in skills |
| `docs/DISPATCH_ARCHITECTURE.md`, `docs/DISPATCH_REVIEW_DISPOSITION.md`, `docs/RULE_ENFORCEMENT.md` | DELETE | describe the retired dispatch system; `docs/ORLY_ARCHITECTURE.md` carries the replacement |
| `audits/doc-read.sh`, `audits/doc-reads.ts`, `audits/agents-md.sh`, `audits/agents-md.md`, `audits/data.sh`, `audits/parity-dispatch.sh`, `audits/lifecycle-anchors.sh`, `audits/rule-paths.sh`, `audits/rule-ledger.sh` | DELETE | the read-logging gate and the old system's consistency audits |
| `evals/dispatch/`, `evals/ledger/`, `evals/test-agents-md.sh`, `evals/test-dispatch-parity.sh` | DELETE | evaluations of the retired dispatch and ledger |
| `Makefile`, `.githooks/pre-commit` | EDIT | drop the deleted steps and the doc-read check |
| `docs/ORLY_ARCHITECTURE.md`, `README.md`, `docs/CHANGELOG.md`, `package.json` | EDIT | skills architecture; version 0.26.0 |
| `docs/v2/pending/M15_001_P1_CLI_GOV_SKILL_RULES_SHIP_AS_SKILLS.md` | CREATE | this spec |

`dispatch/*.sh`, `dispatch/lib.sh` and the remaining `audits/` scripts stay until M15_002. `dispatch/` therefore keeps only scripts after this Workstream.

## Applicable Rules

- **`docs/greptile-learnings/RULES.md`** (moving to `skills/orly-write-code/reference/rules.md` in §1) — NDC and ORP (every retired page, audit and Makefile step leaves in the same diff), NLG (no alias paths from old page names to skills, no fallback reader for `dispatch/`), NLR (a touched page is cut to what fires, not copied whole), UFS (skill names and pack keys are named constants in `src/`), TST-NAM and MSID (no milestone identifiers in skill, source or test names).
- `dispatch/edit_rules.md` — every file here is governance; its replacement `orly-edit-skills` binds from §1 on.
- `dispatch/write_ts_adhere_bun.md` — every `src/` edit; the TS FILE SHAPE DECISION is due at PLAN.
- `dispatch/write_any.md` — length, logging, milestone-identifier and UFS gates on every source edit.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| `edit_rules` | yes | `make audit` before push; the questionnaire it names is retired in this diff, so §4 replaces it with `src/skills_catalogue.test.ts`; the owner decides a paid comprehension run because rule text moves |
| `write_ts_adhere_bun` | yes, `src/` edits | PLAN records the file shape for the catalogue test and the install changes |
| `write_any` | yes | constants for skill names; functions within the length caps |
| `name_architecture` | yes, the rule-delivery flow changes | `docs/ORLY_ARCHITECTURE.md` changes in the same Pull Request (PR) |
| `verify` | yes | `make conform` and `bun test src` before any done claim |

## Prior-Art / Reference Implementations

- **Reference:** `skills/orly-spec-new/SKILL.md` and its three runtime copies written by `workflow.skills` (`registry.json`) — the house format and the existing install path. Every new skill copies it; §3 generalises the install path from four skills to the catalogue.
- **Reference:** gstack's installed skills (`~/.claude/skills/review/SKILL.md` and its `docs/askuserquestion-split.md`) — a short `SKILL.md` that loads a reference page on demand. The large rule documents follow that split instead of one long `SKILL.md`.

## Sections (implementation slices)

### §1 — The skill catalogue

Each row of the catalogue (Interfaces) becomes `skills/<name>/SKILL.md`: front matter `name` equal to the directory, and a `description` that names its trigger in the words an agent sees ("editing a `.rs` file", "about to run `gh pr create`"). The body is cut to rules that fire; rationale stays only where a rule is otherwise unclear. A body over 300 lines moves detail into `reference/<topic>.md`, linked from the body by relative path. Rule identifiers (UFS, NDC, DOC-05 and the rest) keep their names, because `docs.language` findings and greptile comments cite them.

- **Dimension 1.1** — every skill's `name` equals its directory and its `description` is non-empty and at most 1,024 characters → Test `skill front matter names its directory`
- **Dimension 1.2** — every `SKILL.md` is at most 300 lines and every relative link inside a skill resolves → Test `skill bodies stay short and links resolve`
- **Dimension 1.3** — no skill cites `dispatch/` or a deleted `docs/` page → Test `skills cite no retired page`
- **Dimension 1.4** — every rule identifier defined in the retired pages appears in exactly one skill → Test `every rule identifier has one home`

### §2 — The always-on file

`core/operating-model.md` and `SOUL.md` keep only what must apply on every turn: owner and agent names, banned vocabulary, acronym expansion, the evidence invariant, the self-repair boundary, Hard Safety word for word, auto-mode authorisation, the gate's anchor invariant and the reply-shape notes. Lifecycle runbooks, stage checklists and per-file rules move to skills. The renderer appends a skill index generated from the selected skills' front matter: one line per skill, name and trigger.

- **Dimension 2.1** — the rendered `AGENTS.md` for the full pack set is at most 16,384 bytes → Test `rendered agents file fits sixteen kibibytes`
- **Dimension 2.2** — every Hard Safety bullet in the 0.25.0 render appears unchanged in the new render → Test `hard safety survives verbatim`
- **Dimension 2.3** — the skill index lists exactly the selected packs' skills → Test `skill index matches selected skills`

### §3 — Packs select skills; install writes them

A pack in `registry.json` lists `skills` and keeps `extensions`. `orly init` and `orly update` write each selected skill once to `.agents/skills/<name>/`, and write a stub `SKILL.md` (front matter plus a pointer to the full copy) under `.claude/skills/` and `.opencode/skills/`, the way `workflow.skills` does today. Files the 0.25.0 install wrote and the new plan does not list are retired by `migrationDeletes`: unmodified files are deleted, and an edited one stops the update naming the file (`src/installation/migration.ts:27-28`). **Implementation default:** before writing stubs, test which runtimes load `.agents/skills/` directly; a runtime that does gets no stub (Dimension 3.4).

- **Dimension 3.1** — a pack set selecting `language.rust` installs `orly-write-rust` and no unselected language skill → Test `install writes only selected skills`
- **Dimension 3.2** — updating a 0.25.0 install deletes its unmodified `.orly/dispatch/*.md` and `.orly/docs/*.md` → Test `update retires unmodified rule pages`
- **Dimension 3.3** — an edited retired page stops the update and names the file → Test `update stops on an edited retired page`
- **Dimension 3.4** — Claude Code, Codex and opencode each load an `orly-*` skill from the installed layout → Test `each runtime loads an installed skill`

### §4 — Retire the hand-built skill system

Delete the pages, read-logging gate, consistency audits and evaluations listed in Files Changed. `make conform` keeps `bin/orly verify` and `audits/ufs.sh --all`; `make audit` adds `bun test src/skills_catalogue.test.ts` in place of the questionnaire. `.githooks/pre-commit` drops its `audits/doc-read.sh` call. `src/references.ts` and `src/spec_obligations.ts` read the template from `skills/orly-spec-new/template.md`.

- **Dimension 4.1** — no tracked file references a deleted path → Test `no reference to a retired file`
- **Dimension 4.2** — `make conform` and `make audit` pass without the deleted scripts → Test `make audit passes without dispatch pages`
- **Dimension 4.3** — `orly gate pr` on a spec branch reads the moved template and passes `spec.gate` → Test `spec gate reads the moved template`

### §5 — Consumer proof

Run the branch's `orly update` on a copy of `agentsfleet` at a recorded revision. Record before and after: managed file count (`jq '.managed | length' .orly/orly.json`, 62 at the time of writing), `AGENTS.md` bytes, and `make harness-verify`'s result, which must stay green because the mechanical audits remain.

- **Dimension 5.1** — the copy's update succeeds, `.orly/dispatch/*.md` and `.orly/docs/` are gone, and `make harness-verify` passes → Test `agentsfleet copy updates and stays green`
- **Dimension 5.2** — in that copy, five trigger prompts each load the expected skill in Claude Code and in Codex → Test `trigger prompts load the expected skill`

## Interfaces

**Skill catalogue.** Shipped means `orly init` writes the skill into consumers when a pack selects it.

| Skill | Trigger (description says) | Built from | Pack |
|---|---|---|---|
| `orly-lifecycle` | starting, opening, closing or landing a stream; CHORE(open), CHORE(close), LAND | `dispatch/lifecycle.md`, lifecycle sections of `core/operating-model.md` | `universal.authoring` |
| `orly-verify` | about to say tests pass, ready or shipping | `dispatch/verify.md` | `universal.authoring` (`product.agentsfleet` adds `reference/agentsfleet.md`) |
| `orly-write-pr` | creating or editing a pull or merge request body or its Session Notes | `dispatch/write_pr_description.md` | `universal.authoring` |
| `orly-name-architecture` | naming a stream, channel, queue, schema or describing a flow | `dispatch/name_architecture.md` | `universal.authoring` |
| `orly-write-code` | editing any source file | `dispatch/write_any.md`, `docs/greptile-learnings/RULES.md` → `reference/rules.md` | `universal.authoring` |
| `orly-logging` | adding or changing a log statement | `docs/LOGGING_STANDARD.md` | `universal.authoring` |
| `orly-spec-new` | create a spec, new milestone, any `TODO.md` | existing skill, `dispatch/write_spec.md`, `docs/TEMPLATE.md` → `template.md` | `workflow.specifications` |
| `orly-write-unit-test`, `orly-write-integration-test`, `orly-babysit-prs` | unchanged | unchanged | `workflow.skills` |
| `orly-write-typescript` | editing `.ts`, `.tsx`, `.js`, `.jsx` | `dispatch/write_ts_adhere_bun.md` | `language.typescript`, `language.javascript` |
| `orly-write-rust` | editing `.rs` | `dispatch/write_rust.md` | `language.rust` |
| `orly-write-zig` | editing `.zig` | `dispatch/write_zig.md`, `docs/LIFECYCLE_PATTERNS.md` → `reference/lifecycle-patterns.md` | `language.zig` |
| `orly-write-go`, `orly-write-python`, `orly-write-shell`, `orly-write-mdx` | editing that extension | the matching `dispatch/write_*.md` | the matching `language.*` |
| `orly-write-sql` | editing SQL or registering a migration | `dispatch/write_sql.md`, `docs/SCHEMA_CONVENTIONS.md` | `domain.sql` |
| `orly-write-http` | editing an HTTP handler or OpenAPI | `dispatch/write_http.md`, `docs/REST_API_DESIGN_GUIDELINES.md` → `reference/rest-api.md` | `domain.http` |
| `orly-write-auth` | editing a token-minting or auth-flow file | `dispatch/write_auth.md` | `domain.auth` |
| `orly-write-docs` | editing a published page or OpenAPI prose | `dispatch/write_documentation.md`, `docs/DOCUMENTATION_RULES.md` | `domain.documentation` |
| `orly-write-changelog` | writing a changelog entry or release notes | `dispatch/write_changelog.md`, `docs/CHANGELOG_VOICE.md`, `docs/RELEASE_TEMPLATE.md` | `domain.changelog` |
| `orly-edit-skills` | editing orly's skills, packs, `core/` or the renderer | `dispatch/edit_rules.md`, `audits/agents-md.md` | orly only, not shipped |

**Registry pack shape.**

```json
"language.rust": { "extensions": [".rs"], "skills": ["orly-write-rust"], "managed_files": [] }
```

`managed_files` keeps only the scripts M15_002 retires; it is empty for every pack after M15_002.

**Consumer layout after `orly update`** (`agentsfleet`'s pack selection):

```text
AGENTS.md, CLAUDE.md            pointers, unchanged
.orly/AGENTS.md                 ≤16 KiB always-on rules + skill index
.orly/LOCAL.md                  project facts, owned by the repository
.orly/orly.json                 packs, commands, managed files, digests
.agents/skills/orly-*/          19 skills, full text (+ reference/ pages)
.claude/skills/orly-*/SKILL.md  stubs, only for runtimes that need them (Dimension 3.4)
.opencode/skills/orly-*/SKILL.md
.orly/audits/, .orly/dispatch/*.sh   mechanical checks until M15_002
```

Commands keep their names, flags and exit codes: `orly init`, `orly update`, `orly doctor`, `orly gate`, `orly override`, `orly judge`, `orly lifecycle`.

## Failure Modes

| Mode | Kind | Cause | Handling (system response + what the caller observes) | Test |
|------|------|-------|--------------------------------------------------------|------|
| Edited retired page | failure | a consumer changed a 0.25.0 page orly now retires | update stops with `migration conflict: <path>`; nothing is written | `update stops on an edited retired page` |
| Skill not loaded | degradation | the runtime does not match the trigger | the agent misses that rule; gate criteria and mechanical audits still block; Dimension 5.2 measures it | `trigger prompts load the expected skill` |
| Dangling link | failure | a skill links a moved reference page | the catalogue test fails before release | `skill bodies stay short and links resolve` |
| Lost rule | failure | a rule identifier dropped during the move | the identifier test fails | `every rule identifier has one home` |
| Oversized always-on file | failure | a rule moved back into `core/` | the size test fails | `rendered agents file fits sixteen kibibytes` |
| Stale reference | failure | code or a hook still reads a deleted path | the reference test fails | `no reference to a retired file` |

## Invariants

1. The rendered `AGENTS.md` is at most 16,384 bytes — `rendered agents file fits sixteen kibibytes` runs in `bun test src`.
2. Rule prose lives only in `skills/` and `core/`: no `dispatch/*.md` and no deleted `docs/` page exists — `no reference to a retired file` also asserts the paths are absent.
3. Every rule identifier has exactly one skill — `every rule identifier has one home`.
4. Install never deletes a file whose digest differs from the recorded one — `migrationDeletes` throws, covered by `update stops on an edited retired page`.

## Metrics & Observability

No product or operator signal changes. §5 records three measurements as evidence: managed files per consumer, always-on bytes and trigger hits out of ten.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|-----------|------|------|---------------------------------------------|
| 1.1 | unit | `skill front matter names its directory` | every `skills/*/SKILL.md` → `name` equals the directory; `description` has 1 to 1,024 characters |
| 1.2 | unit | `skill bodies stay short and links resolve` | every `SKILL.md` → at most 300 lines; each relative link → an existing file |
| 1.3 | unit | `skills cite no retired page` | every skill file → no match for `dispatch/` or a deleted `docs/` name |
| 1.4 | unit | `every rule identifier has one home` | identifiers from 0.25.0's pages (fixture) → each found in exactly one skill |
| 2.1 | unit | `rendered agents file fits sixteen kibibytes` | full pack set → rendered bytes ≤ 16,384 |
| 2.2 | unit | `hard safety survives verbatim` | 0.25.0 Hard Safety bullets (fixture) → each a substring of the new render |
| 2.3 | unit | `skill index matches selected skills` | `language.rust` + `universal.authoring` → index names exactly their skills |
| 3.1 | unit | `install writes only selected skills` | `--with language.rust` → `orly-write-rust` present; `orly-write-zig` absent |
| 3.2 | integration | `update retires unmodified rule pages` | 0.25.0 install fixture → `.orly/dispatch/*.md` and `.orly/docs/*.md` deleted |
| 3.3 | integration | `update stops on an edited retired page` | same fixture with one edited page → exit 1 naming it; tree unchanged |
| 3.4 | manual | `each runtime loads an installed skill` | procedure: in a fixture repository, ask each runtime for its skill list; evidence: transcripts in Session Notes |
| 4.1 | unit | `no reference to a retired file` | `git ls-files` contents → no deleted path cited; deleted paths absent |
| 4.2 | integration | `make audit passes without dispatch pages` | `make audit` on the branch → exit 0 |
| 4.3 | integration | `spec gate reads the moved template` | spec fixture branch → `spec.gate` passes reading `skills/orly-spec-new/template.md` |
| 5.1 | manual | `agentsfleet copy updates and stays green` | procedure: copy `agentsfleet` at a recorded revision, run the branch's `orly update`, run `make harness-verify`; evidence: counts and output in Session Notes |
| 5.2 | manual | `trigger prompts load the expected skill` | procedure: five prompts (edit `.rs`, edit `.sql`, open a PR, claim tests pass, create a spec) in Claude Code and Codex; evidence: which skill loaded, per prompt |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | The catalogue is complete and well-formed (§1) | `bun test src/skills_catalogue.test.ts` | exit 0 | P0 | |
| R2 | The always-on file is at most 16 KiB with safety intact (§2) | `bun test src/render.test.ts` | exit 0 | P0 | |
| R3 | No retired page, audit or reference remains (§4) | `git ls-files dispatch \| grep -c '\.md$'` | `0` | P0 | |
| R4 | A real consumer updates and stays green (§5) | manual: Dimension 5.1 evidence | `make harness-verify` exit 0 recorded | P0 | |
| R5 | Skills load on their triggers (§3, §5) | manual: Dimension 5.2 evidence | at least 9 of 10 prompts load the expected skill | P1 | |
| S1 | Conform gates green | `make conform` | exit 0 | P0 | |
| S2 | Unit tests pass | `bun test src` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect --redact --no-banner` | exit 0 | P0 | |

`dispatch/lifecycle.md` defines grading, the ship rule and transfers to a successor spec (`MOVED` rows) in its "Rubric grading and transfers" section; after §4 that text lives in `orly-lifecycle`.

## Dead Code Sweep

**1. Orphaned files — deleted from disk and git.**

| File to delete | Verify |
|----------------|--------|
| `dispatch/*.md`, `packs/language/*/rules.md` | `git ls-files dispatch packs \| grep -c '\.md$'` → `0` |
| the 15 `docs/` pages and `docs/greptile-learnings/` in Files Changed | `git ls-files docs/greptile-learnings docs/TEMPLATE.md docs/DISPATCH_ARCHITECTURE.md` → empty |
| the 9 audits in Files Changed, `evals/dispatch/`, `evals/ledger/`, `evals/test-agents-md.sh`, `evals/test-dispatch-parity.sh` | `git ls-files audits/doc-read.sh audits/agents-md.sh evals/dispatch evals/ledger` → empty |

**2. Orphaned references — zero remaining imports/uses.**

| Deleted symbol/import | Grep | Expected |
|-----------------------|------|----------|
| read-logging gate | `git grep -n -w "doc-read" -- . ':!docs/v*'` | no output |
| dispatch pages | `git grep -n -E "dispatch/[a-z_]+\.md" -- . ':!docs/v*'` | no output |
| retired Makefile targets | `git grep -n -E "dispatch-(coverage\|evals\|parity)\|ledger-evals" -- Makefile` | no output |

## Out of Scope

- **M15_002 — mechanical audits.** `ufs`, `logging`, `msid-ui`, `rust-error`, `error-codes`, `design-tokens`, `deinit-pairs`, `sql-mod`, `scope`, `rule-ledger-lib`, `spec-template`, every `dispatch/*.sh` and `dispatch/lib.sh` become `orly gate work` criteria or the consumer's own linter rules, and the scripts are deleted. The PR #70 pre-push range coverage transfer (Discovery) lands there.
- **M15_003 — advice and installer.** `orly judge` becomes a skill (`orly-spec-review`), `evals/judgments/` and `docs/JUDGMENTS.md` follow it, and `init`, `update` and `doctor` shrink to hooks, configuration and skills.
- **M15_004 — the gate's language.** TypeScript or Rocq with OCaml, decided on the gate left after M15_003. The two superseded drafts are its inputs.
- Plugin distribution through a runtime marketplace: only if the owner picks it over committed skills (Discovery, blocker 0).
- Rewriting what a rule says: this Workstream moves and cuts text; a rule change gets its own spec.

---

## Product Clarity (authoring record)

1. **Successful user moment** — an agent in `agentsfleet` edits a `.rs` file; the runtime loads `orly-write-rust`; the always-on file it carried all along is under half today's size.
2. **Preserved user behaviour** — every command, flag, gate criterion, override trailer and exit code; every hard-safety rule word for word.
3. **Optimal-way check** — the unconstrained shape ships skills as a runtime plugin and leaves consumers with two files; that reverses the recorded "fresh clone reads its own rules" decision, so it waits for the owner (blocker 0).
4. **Rebuild-vs-iterate** — iterate: the installer, migration and stub writer exist; this changes what they carry.
5. **What we build** — 23 skills, the slim always-on render, skill-selecting packs, the catalogue tests, the consumer proof.
6. **What we do NOT build** — the items under Out of Scope.
7. **Fit with existing features** — `workflow.skills` already installs four skills this way; `orly doctor` already reports drift for every managed file, skills included.
8. **Surface order** — command line and installed files only.
9. **Dashboard restraint** — N/A: no user interface.
10. **Confused-user next step** — a stopped update names the edited page; the fix is to move the local edit into `.orly/LOCAL.md` or delete it, then rerun `orly update`.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** catalogue (§1), always-on file (§2), install (§3), deletion (§4), consumer proof (§5); rule text first, so deletion happens only after every identifier has a home.
- **Alternatives considered:** (a) skills only, with no gate: rejected, a skill cannot block a commit; (b) keep dispatch and add skills beside it: two homes per rule, the drift the deleted audits existed to catch; (c) one large `orly-rules` skill: its trigger would fire on every edit and load everything, which is today's always-on file under another name; (d) plugin distribution: blocker 0; (e) do the language rewrite first: rewrites code this milestone deletes.
- **Patch-vs-refactor verdict:** a **refactor** of rule delivery with no behaviour change to the gate.

## Discovery (consult log)

- **Consults** — architecture: `docs/ORLY_ARCHITECTURE.md` read at `bbfeecf`. Source facts read Oct 28, 2026: install retires managed files and stops on edited ones (`src/installation/migration.ts:21-30`); skill stubs are planned beside full copies (`src/install.ts:120`); `make conform` runs `bin/orly verify`, `audits/ufs.sh --all`, `audits/agents-md.sh` and `audits/rule-ledger.sh --check` (`Makefile:31`); code reads `docs/TEMPLATE.md` in `src/references.ts` and `src/spec_obligations.ts`, and `docs/JUDGMENTS.md` in `src/judgments/`. Consumer facts from `agentsfleet`: 62 managed entries (`jq '.managed | length' .orly/orly.json`), `.orly/AGENTS.md` 382 lines and 36,763 bytes, mechanical audits run from `make/harness.mk`.
- **Superseded drafts** — two unmerged M15_001 drafts (a TypeScript audit engine; a Rocq-proved gate core) moved to `.orly/judgments/superseded-m15-drafts/` on Oct 28, 2026; they feed M15_004.
- **Open blockers** — (0) the owner chooses committed skills (this spec's default, keeping `agentsfleet` `.orly/LOCAL.md:3-8`) or plugin distribution; (1) the owner decides whether rule-text moves need a paid comprehension run under `edit_rules`. unverified: which runtimes load `.agents/skills/` without a stub; Dimension 3.4 settles it.
- **Metrics review** — no signal changes.
- **Skill-chain outcomes** — pending until VERIFY and REVIEW.
- **Deferrals and transfers** — two transfers from PR #70 into this milestone, quoted below. The pre-push range coverage moves to M15_002. The doc-read path coverage dissolves: §4 deletes `audits/doc-read.sh`.

> Owner (Kishore, Oct 28, 2026, time not recorded): "can you be adversarial and think on doing the same thing using skills, obviously we need to get rid of scripts, md files and so on." — context: the direction behind this milestone.

> Owner (Kishore, Oct 28, 2026, time not recorded): "Okay giver me a revised proposal in detail on the skills and what i can see in the realization of the plan, file names, skill names and so on. okay go" — context: approves writing this spec in place of the two drafts.

> Owner (Kishore, Oct 27, 2026, time not recorded): "since we are revamping scripts to a different language in the next PR" — context: the shell audits got minimal tests in PR #70 because this milestone replaces them (M15_002).

> Owner (Kishore, Oct 27, 2026, time not recorded): "i think limit the test to mnimal" — context: moves the pre-push range and doc-read path coverage gaps from PR #70 to this milestone.
