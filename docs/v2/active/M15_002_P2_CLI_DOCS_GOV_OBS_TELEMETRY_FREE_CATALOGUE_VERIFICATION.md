# M15_002: Telemetry-free catalogue verification and a slimmer spec template

**Prototype:** v2.0.0

**Milestone:** M15

**Workstream:** 002

**Date:** Nov 01, 2026

**Status:** IN_PROGRESS

**Priority:** P2, finish the approved standards-model cleanup and remove what nothing calls

**Categories:** CLI, DOCS, GOV, OBS

**Batch:** B1, the recorded M15 follow-up; release target 0.28.0

**Depends on:** M15_001, which supplies the standards catalogue and the three skills

**Provenance:** agent-drafted (Nov 01, 2026) from the owner's 0.28 direction; amended Nov 02, 2026 after an adversarial review and three owner decisions quoted in Discovery

**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`, its verification, hooks and telemetry sections

---

## Overview

**Goal (testable):** Orly 0.28 runs without usage telemetry, verifies its standards catalogue through one shared validator, pushes through gitleaks alone, and ships a spec template whose rules live only in the spec standard.

**Problem:** Telemetry and its consent prompt remain after the owner asked for their removal. `orly verify` renders twice instead of checking the catalogue, and a pre-push range selector decides whether to repeat an audit that CI already runs on every pull request. The spec template writes each test name three or four times and restates the spec standard in its comments. `orly lifecycle`, a disabled remote adapter, an evidence file nothing reads and 279 files of 0.11 and 0.12 release records stay in the tree with no caller.

**Solution summary:** Delete telemetry from the command and the generated hooks. `orly verify` becomes catalogue, render-currency and pack-drift checks behind one validator. Pre-push runs gitleaks only, and pre-commit runs `orly gate work`. The lifecycle inspector, remote adapter, evidence writer and release archive are deleted. The spec template becomes a skeleton whose comments cite rule identifiers, and `docs.language` reports a leftover template slot in a changed spec.

**Design flow:**

```
commit ─► .githooks/pre-commit ─► bin/orly gate work ─► make conform ─► orly verify
                                                         ├─ standards.catalogue  (shared validator)
                                                         ├─ generated.root.current
                                                         └─ packs.sources.current
push   ─► .githooks/pre-push ─► gitleaks detect
PR     ─► orly gate pr ─► verify.unit, verify.typecheck, docs.language (DOCFILL on spec lines)
CI     ─► make audit (verify, typecheck, bun test src) and make install-evals
```

## PR Intent & comprehension handshake

- **PR title (eventual):** feat(orly): drop telemetry, verify the catalogue and slim the spec template (0.28.0)
- **Intent (one sentence):** Ship 0.28 as the M15 cleanup: less code, fewer steps, and a spec template another agent can build from.
- **Authoring handshake:** The owner wants 0.28 to remove what nothing uses and to keep the proofs that matter. ASSUMPTIONS I'M MAKING: 1. Remove orly's own telemetry and leave its local state files untouched. 2. Removed commands, flags and configuration keys get no alias. 3. "Docs on 0.28" means the live pages (`README.md`, `docs/ORLY_ARCHITECTURE.md`, `docs/architecture/`, `llms.txt`, the changelog); finished specs and released changelog entries stay as history. 4. The implementation lands on PR #75's branch, by owner direction.
- **Implementer handshake:** recorded in the Pull Request Session Notes at PLAN, before any edit.

## Implementing agent — read these first

1. `standards/spec.md` — the rules every section below follows
2. `src/cli.ts` — command dispatch, the telemetry wrapper and `verify`
3. `src/verify.ts` and `src/standards_catalogue.test.ts` — today's render checks and catalogue predicates
4. `src/installation/migration.ts` — byte recognition of legacy generated hooks
5. `.githooks/pre-push` and `src/required_scanner.test.ts` — the gitleaks block and its tests

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| this spec, `docs/v2/active/` then `docs/v2/done/` | MOVE / EDIT | scope, decisions and completion evidence |
| `docs/v2/active/M15_001_P1_GOV_SKILL_RULES_BECOME_STANDARDS.md` | EDIT | links this spec as the recorded follow-up |
| `src/telemetry.ts`; `src/telemetry_sync.ts`; `src/telemetry.test.ts` | DELETE | collection, spool and upload |
| `src/cli.ts`; `src/cli_help.ts`; `src/cli.test.ts` | EDIT | no telemetry wrapper, `skill-event` or `lifecycle`; `verify` takes no arguments |
| `src/installation/hooks.ts`; `src/installation/migration.ts` | EDIT | generated hooks drop the invocation marker; legacy bytes stay recognisable |
| `src/installation/migration.test.ts`; `src/install_loaders.test.ts`; `src/setup.test.ts` | EDIT | hook ownership proof; telemetry assertions and variables retired |
| `src/standards.ts`; `src/standards_catalogue.test.ts` | EDIT | one catalogue validator, proven valid and invalid |
| `src/verify.ts`; `src/verify.test.ts`; `src/render.test.ts` | EDIT | verify checks the catalogue and currency; render determinism becomes a unit test |
| `schemas/evidence.schema.json` | DELETE | the evidence file has no writer |
| `.githooks/pre-push`; `.githooks/pre-commit`; `Makefile` | EDIT | push runs gitleaks; commit runs the work gate |
| `src/required_scanner.test.ts`; `src/commit_hook.test.ts` | EDIT / CREATE | push and commit hook proofs |
| `.orly/orly.json`; `AGENTS.md` | EDIT | `verify.typecheck` declared; the render records it |
| `src/execution/plan.ts`; `src/execution/plan.test.ts`; `src/execution/config.ts` | DELETE | lifecycle inspector and disabled remote adapter |
| `src/criteria.ts`; `src/criteria.test.ts` | EDIT | owns gate tiers and command selection |
| `src/config.ts`; `src/config_validation.ts`; `src/config_validation.test.ts`; `schemas/profile.schema.json` | EDIT | the `execution` key is removed and refused |
| `docs/architecture/remote-execution.md` | DELETE | describes the removed adapter |
| `evals/release/` (279 files); `src/release_inventory.test.ts` | DELETE | 0.11 and 0.12 release records |
| `evals/install/release_cases.sh` | EDIT | receipt exclusion and its case removed |
| `standards/spec-template.md`; `standards/spec.md`; `fixtures/standards-rule-ids.json` | EDIT | slim template; rules absorb its guidance; SPEC-BASELINE recorded as removed |
| `skills/orly-build/SKILL.md`; `skills/orly-ship/SKILL.md` | EDIT | no baseline headers; baselines from CI |
| `src/spec_fill.ts`; `src/spec_fill.test.ts`; `src/doc_changes.ts` | CREATE / CREATE / EDIT | leftover template slots in changed spec lines |
| `package.json`; `README.md`; `docs/ORLY_ARCHITECTURE.md`; `docs/architecture/installation.md`; `llms.txt`; `docs/CHANGELOG.md` | EDIT | the 0.28 surface |

Discovery searched `git grep -n -w` for each removed name: `beginTelemetry`, `recordTelemetry`, `telemetry_sync`, `skill-event`, `ORLY_TELEMETRY`, `ORLY_INVOCATION`, `lifecyclePlan`, `readExecution`, `writeEvidence`, `evals/release`. Production callers are `src/cli.ts`, `src/cli_help.ts`, `src/installation/hooks.ts`, `src/installation/migration.ts`, `src/config.ts` and `.githooks/pre-push`. Test callers are the test files above. Finished specs and released changelog entries name the retired items as history.

## Applicable Rules

- **`code.md`** — NDC, NLG, NLR, ORP, HLP, FLL, CODE-MSID
- **`tests.md`** — TNM, TST-NAM, TCF, TEST-OUTCOME, TEST-NEG, TEST-GITENV, TEST-ABSENT, TEST-DELTA
- **`languages/typescript.md`** — TS-ORDER, TS-TYPEIMPORT, TS-SPAWN
- **`languages/shell.md`** — SH-QUOTE, SH-HOOKINDEX
- **`changelog.md`** — CL-USER, CL-BUDGET, CL-UPGRADE, CL-NOREF, CL-BUMP
- **`docs.md`** — DOC-02, DOC-03, DOC-S7
- **`domains/architecture.md`** — ARCH-HOMES, ARCH-PUBLISHED
- **`pr.md`** — PR-BUDGET, PR-UNIT, CHR
- **`spec.md`** — SPEC-AMEND, SPEC-BLAST, SPEC-FILL

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| `orly gate work` | yes, at every commit once §3 lands | `make conform` stays green per commit |
| `orly gate pr` | yes | pushed head; `verify.unit` and `verify.typecheck` green; changed docs clean |
| `docs.updated` | yes, `src/` and `bin/` change | README and architecture pages change in this PR |
| gitleaks | yes | no secret and no new suppression |
| File & Function Length (file ≤350 lines, function ≤50, method ≤70) | yes | `src/cli.ts` shrinks; new modules stay small |
| `make install-evals` in CI | yes | the payload installs, and `verify` still refuses from it |

## Prior-Art / Reference Implementations

- **Reference:** the predicates in `src/standards_catalogue.test.ts` move into `src/standards.ts` unchanged. `src/required_scanner.test.ts` is the shape for hook tests, and the fixture in `src/installation/migration.test.ts` is the shape for migration tests. Command work keeps the handler, error and render split in `src/cli.ts`.

## Sections (implementation slices)

### §1 — Remove telemetry and consent

Every command stops collecting, spooling and sending usage events. `src/telemetry.ts` and `src/telemetry_sync.ts` are deleted with their tests, and `src/cli.ts` runs the command with no telemetry wrapper. `orly skill-event` and the help's telemetry block go; the removed command falls through to `unknown command`. Old state under `~/.config/agentsfleet/orly/` (or `$AGENTSFLEET_STATE_DIR/orly/`) is never read, written or deleted: `.orly.json`, `.telemetry-prompted`, `installation-id` and `analytics/`. The changelog names the directory for manual removal.

Generated hooks drop the `export ORLY_INVOCATION=hook` line. A 0.27 hook under `.orly/hooks/` migrates through its recorded digest, which `src/install.ts` checks before any write. A legacy hook under `.githooks/` has no digest and migrates through byte recognition in `src/installation/migration.ts`; that template keeps the historical marker line as a local literal. A one-byte edit to either refuses before any write.

- **Dimension 1.1** — DONE — The removed telemetry command is refused → Test `retired telemetry command is refused` (subprocess): `orly skill-event orly-build` exits 1 and prints `unknown command: skill-event`.
- **Dimension 1.2** — DONE — Untouched old hooks migrate and edited ones stay protected → Test `hook cleanup preserves ownership conflicts` (integration): an untouched 0.27 `.orly/hooks/pre-commit` and an untouched legacy `.githooks/pre-commit` both end as the 0.28 bytes; a one-byte edit to either fails the update and leaves the file unchanged.

### §2 — Verify the standards catalogue

`src/standards.ts` exports one validator that `orly verify` and the catalogue tests both call. It reads `standards/` and `fixtures/standards-rule-ids.json` from the engine checkout. It keeps every current predicate: standards exist, each rule carries its five fields, each identifier has one home and matches the inventory, no retired-stack term appears, each page holds at most 400 lines, and relative links resolve. It adds one: every `SPEC-` identifier the spec template cites exists in `standards/spec.md`. Each finding names the file and what broke.

`orly verify` reports `standards.catalogue`, `generated.root.current` and `packs.sources.current`, and exits non-zero when any fails. The render-twice determinism check leaves the command and becomes a unit test in `src/render.test.ts`. `writeEvidence`, `--write-evidence`, `--llm-result` and `schemas/evidence.schema.json` go; `verify` takes no arguments and refuses any with its usage line. It still refuses to run from a published package.

- **Dimension 2.1** — The shipped catalogue passes → Test `verify accepts the shared valid catalogue` (unit and subprocess): the validator returns no findings for this checkout, and `orly verify` prints all three checks green and exits 0.
- **Dimension 2.2** — Each broken property is named → Test `verify names catalogue failures` (unit): scratch catalogues with an empty directory, a missing field, a duplicated identifier, a missing inventory, a broken link, a 401-line page, a retired-stack term and a template citing an absent SPEC rule each yield a finding naming the file.
- **Dimension 2.3** — Retired flags cannot pass silently → Test `verify refuses retired and unknown flags` (subprocess): `orly verify --write-evidence` and `orly verify --all` exit 1 with `usage: orly verify`.

### §3 — Commits run the work gate, pushes run gitleaks

`.githooks/pre-push` keeps its gitleaks block and loses the pushed-range selector, `make audit` and the evidence write. CI's `make audit` in `.github/workflows/harness.yml` stays the full proof. `.githooks/pre-commit` runs `bin/orly gate work`, which runs `make conform`; the gate took 0.22 s on this checkout. `.orly/orly.json` declares `verify.typecheck` as `bun run typecheck`, so `orly gate verify` and `orly gate pr` type-check locally, and `AGENTS.md` re-renders with it.

- **Dimension 3.1** — A governance push needs nothing but gitleaks → Test `a push needs only gitleaks` (integration): a ref line touching `src/` on stdin, with only `git` and a passing `gitleaks` on `PATH`, exits 0.
- **Dimension 3.2** — A commit runs the work gate → Test `a commit runs the work gate` (integration): a scratch checkout whose `bin/orly` exits 1 fails the hook, and one that records its arguments receives `gate work`.

### §4 — Remove the lifecycle inspector and the disabled remote adapter

`orly lifecycle`, `lifecyclePlan` and the `execution.remote` adapter are deleted; the adapter never launched anything. `docs/architecture/remote-execution.md` goes with them. Gate tiers and `selectedCommands` move into `src/criteria.ts`, their only remaining caller. The configuration schema is strict and drops `execution`, so a configuration that still carries the key is refused by name. None of the four local configurations carries it: orly, agentsfleet, docs and cache-kit.rs.

- **Dimension 4.1** — The inspector is gone → Test `lifecycle is not a command` (subprocess): `orly lifecycle` exits 1 and prints `unknown command: lifecycle`.
- **Dimension 4.2** — A stale configuration is refused → Test `a configuration with execution is refused` (unit): parsing a configuration with `execution` throws an error naming the key.
- **Dimension 4.3** — Tiers select what they selected before the move → Test `gate tiers select their declared commands` (unit): conform selects `conform`; fast selects `verify.*` without unit and integration; all selects every `verify.*`.

### §5 — Retire the 0.11 and 0.12 release archive

`evals/release/` holds 279 files: audit records, 267 receipts and hand-run packaging scripts for 0.11 and 0.12. Only `src/release_inventory.test.ts` and an install-eval exclusion keep them alive, and all three go. The retired-verb scan in `evals/install/release_cases.sh` loses its receipt exclusion and the case that proved it. The active-call case still proves that live calls are reported.

- **Dimension 5.1** — The retired-verb scan still reports active calls → Test `install_retired_reference_scope_rejects_active_calls` (integration, `make install-evals`): three planted calls to retired verbs are each reported once.

### §6 — Slim the spec template

`standards/spec-template.md` becomes a skeleton whose `tpl:` comments cite the governing rule instead of restating it. The Test Specification table goes, because each Dimension line now carries its tier and observable result. The four pending header fields go: the Pull Request Session Notes carry the branch and the baselines, taken from the base commit's CI run. Product Clarity is required only for the API, CLI and UI Categories, and Discovery keeps four bullets.

`standards/spec.md` absorbs the guidance the comments carried. It amends SPEC-DIM, SPEC-FAIL, SPEC-DECIDE, SPEC-CLARITY and SPEC-FILL, and drops SPEC-BASELINE, which the inventory records as removed. `orly-build` stops writing baseline headers, and `orly-ship` takes baselines from CI. Changed spec lines get one mechanical check: an unfilled `{{fill:` slot or an opening `tpl:` comment is a `DOCFILL` finding under `docs.language`, while specs stay outside the prose rules.

- **Dimension 6.1** — A leftover slot fails, and an opener alone does not → Test `docs language flags unfilled template slots` (unit): a changed spec line holding a slot yields one DOCFILL finding; an unchanged line, a rule page and an opener with no closing braces yield none.

### §7 — Publish the coherent 0.28 surface

`package.json` moves to 0.28.0. Help, `README.md`, `docs/ORLY_ARCHITECTURE.md`, `docs/architecture/installation.md`, `llms.txt` and the changelog describe 0.28 together. Finished specs and released changelog entries keep their wording (DOC-S7).

- **Dimension 7.1** — Help lists only live commands → Test `help lists only live commands` (subprocess): help names `orly verify` and no `lifecycle`, `skill-event` or consent file.

## Interfaces

- `orly verify` takes no arguments and prints one line per check: `standards.catalogue`, `generated.root.current`, `packs.sources.current`. It exits 0 only when all pass; any argument exits 1 with `orly: usage: orly verify`.
- Removed with no alias: `orly skill-event`, `orly lifecycle`, `orly verify --write-evidence`, `--llm-result`, the configuration key `execution`, `.orly/evidence.json` and `schemas/evidence.schema.json`.
- Generated `.orly/hooks/*` files lose `export ORLY_INVOCATION=hook`.
- `docs.language` reports `DOCFILL` for a leftover template slot on a changed spec line.
- This repository declares `verify.typecheck`.

## Failure Modes

| Mode | Cause | Handling (what the caller observes) | Test |
|------|-------|-------------------------------------|------|
| Retired command | `orly skill-event` or `orly lifecycle` | exit 1, `unknown command: <verb>` | `retired telemetry command is refused`; `lifecycle is not a command` |
| Retired flag | `orly verify --write-evidence` | exit 1, usage line | `verify refuses retired and unknown flags` |
| Broken catalogue | missing field, duplicate identifier, broken link, long page, retired term, dead SPEC citation | finding names the file; `verify` exits 1 | `verify names catalogue failures` |
| Edited generated hook | one-byte edit to a 0.27 or legacy hook | update refuses before any write | `hook cleanup preserves ownership conflicts` |
| Stale configuration | `execution` key | configuration refused, naming the key | `a configuration with execution is refused` |
| Leftover template slot | a slot on a changed spec line | DOCFILL finding; `docs.language` red | `docs language flags unfilled template slots` |
| Failing conform at commit | `make conform` red | commit blocked | `a commit runs the work gate` |
| Secret at push | gitleaks finding or missing gitleaks | push blocked | `a scanner finding blocks the push` |

## Invariants

1. One catalogue implementation serves `orly verify` and the tests — the test file imports the validator and defines no predicate of its own.
2. No command path reaches telemetry — the modules are deleted, so an import fails `bun run typecheck`.
3. An edited managed hook never becomes managed by an update — `src/install.ts` compares recorded digests before any write.

## Metrics & Observability

Usage telemetry is removed: the PostHog command, gate and skill events stop. No signal replaces them.

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | Telemetry retired; old hooks migrate (§1) | `bun test src/cli.test.ts src/installation/migration.test.ts` | exit 0 | P0 | |
| R2 | Catalogue verification (§2) | `bun test src/standards_catalogue.test.ts src/verify.test.ts` | exit 0 | P0 | |
| R3 | Commit and push hooks (§3) | `bun test src/required_scanner.test.ts src/commit_hook.test.ts` | exit 0 | P0 | |
| R4 | Inspector and adapter gone (§4) | `bun test src/criteria.test.ts src/config_validation.test.ts` | exit 0 | P0 | |
| R5 | Distribution still installs (§5) | `make install-evals` | exit 0 | P0 | |
| R6 | Leftover template slots reported (§6) | `bun test src/spec_fill.test.ts` | exit 0 | P1 | |
| R7 | Public version (§7) | `bin/orly --version` | `0.28.0` | P1 | |
| S1 | Declared conform | `make conform` | exit 0 | P0 | |
| S2 | Declared unit lane | `bun test src` | exit 0 | P0 | |
| S3 | Declared typecheck lane | `bun run typecheck` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect --redact --no-banner` | exit 0 | P0 | |

## Dead Code Sweep

| Deleted file or symbol | Verify | Expected |
|------------------------|--------|----------|
| telemetry modules and command | `git grep -n -E "beginTelemetry\|recordTelemetry\|telemetry_sync\|skill-event\|ORLY_TELEMETRY" -- src bin evals skills core agents standards` | no output |
| lifecycle inspector and adapter | `git grep -n -E "lifecyclePlan\|readExecution\|DISABLED_MODE\|orly lifecycle" -- src bin evals docs/architecture README.md llms.txt` | no output |
| evidence writer and schema | `git grep -n -E "writeEvidence\|evidence\.schema\|write-evidence\|llm-result" -- src bin evals schemas .githooks Makefile` | no output |
| release archive | `git grep -n "evals/release" -- src evals docs/architecture README.md llms.txt Makefile` | no output |

`.gitignore` still ignores `.orly/evidence.json`, as it still ignores `.oracle/evidence.json`, so a stale local file never dirties a tree.

## Out of Scope

- M16, the gate's language, stays its own milestone.
- agentsfleet's move to 0.28 is its own chore Pull Request after release.
- Changing `docs.updated` is not planned.
- Merging and the release workflow stay with the owner.

---

## Product Clarity (authoring record)

1. **Successful user moment** — A contributor commits with no consent prompt, a malformed standard fails `orly verify` with the file named, and a push finishes after gitleaks.
2. **Preserved user behaviour** — Install, update, ownership refusals, `orly gate` and `orly doctor` behave as in 0.27.
3. **Optimal-way check** — Delete the unused code and reuse the catalogue predicates; no second validator or new gate criterion.
4. **Rebuild-vs-iterate** — Iterate the command, hooks and template in place.
5. **What we build** — Telemetry removal, the shared validator, two hook changes, four deletions and a slimmer template with one slot check.
6. **What we do NOT build** — Replacement analytics, a Dimension-to-test gate, or M16's language change.
7. **Fit with existing features** — Reuses the installation digests and the `docs.language` criterion; must not weaken edited-file protection.
8. **Surface order** — Command-line first, matching the product.
9. **Dashboard restraint** — No dashboard or analytics control is added.
10. **Confused-user next step** — `orly --help` after an unknown-command error, or the named file in a `verify` finding.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** deletions first, then the shared validator, the hooks, the template and the published surface; each Section lands in its own commit.
- **Alternatives considered:** keep the pre-push range selector and test it in six scenarios, rejected because CI already runs the audit it gates. A Dimension-to-test gate, rejected because 0.25's `spec.dimensions` criterion drew 11 overrides in agentsfleet before 0.26 removed it.
- **Patch-vs-refactor verdict:** this is a **patch** because it deletes and moves code while every surviving interface keeps its behaviour.

## Discovery (consult log)

- **Consults** — Fetched `origin/main` at `700df9c125530a4d2b0d356ee6f0511c536ca35b`. The Nov 02 adversarial review found five defects in the first draft, each fixed above. §2 would have deleted `packSourceErrors` (`src/verify.ts:59`), the only pack-drift check. `--all` was already gone (`src/cli.test.ts:78`). A telemetry-absence test proves nothing once the code is deleted. The telemetry state path was unnamed. Live docs still described 0.11 to 0.13 (`docs/architecture/installation.md:5`, `llms.txt:15`).
- **Model reviews** — Native authoring review (Nov 01): 0 Blockers, 5 Majors, 2 Nits, all accepted. Adversarial review by Claude Opus 5.5 (Nov 02): 7 findings, all accepted, two of its own claims corrected in session. The full EGM pipeline did not run.
- **Open blockers** — none.
- **Deferrals and transfers** — M15_001 transferred the pre-push range coverage from PR #70 to this spec. It dissolves: §3 deletes the range selector, by the owner's "Gitleaks only" decision below. Telemetry removal traces to the owner's M15_001 quote, repeated below.

> Owner (Kishore, Oct 28, 2026, time not recorded): "5. Telemetry - cut the crap" — context: telemetry leaves in M15_002, as M15_001 records.

> Owner (Indy, Nov 01, 2026, time not recorded): "Orly 028 - Yes M15_002 is what we ship" — context: release scope is this cleanup, not M16.

> Owner (Indy, Nov 02, 2026, time not recorded): "lets use that PR75 to push orly updates for 0.28" — context: the implementation lands on PR #75, beyond PR-BUDGET's one follow-up.

> Owner (Indy, Nov 02, 2026, time not recorded): "Gitleaks only (Recommended)", "Slim it in 0.28 (Recommended)", "orly lifecycle + remote, evals/release (279 files), Evidence file" — context: the three scope decisions, answered through AskUserQuestion.
