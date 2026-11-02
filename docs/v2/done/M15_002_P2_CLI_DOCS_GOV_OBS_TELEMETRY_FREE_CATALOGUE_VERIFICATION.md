# M15_002: Telemetry-free catalogue verification and a slimmer spec template

**Prototype:** v2.0.0

**Milestone:** M15

**Workstream:** 002

**Date:** Nov 01, 2026

**Status:** DONE

**Priority:** P2, finish the approved standards-model cleanup and remove what nothing calls

**Categories:** CLI, DOCS, GOV, OBS

**Batch:** B1, the recorded M15 follow-up; release target 0.28.0

**Depends on:** M15_001, which supplies the standards catalogue and the three skills

**Provenance:** agent-drafted (Nov 01, 2026) from the owner's 0.28 direction; amended Nov 02, 2026 after an adversarial review and the owner decisions quoted in Discovery; §8 added Nov 02, 2026

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

- **PR title (eventual):** feat(orly)!: drop telemetry, verify the catalogue, slim specs (0.28.0)
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
| `docs/v2/active/M15_001_P1_GOV_SKILL_RULES_BECOME_STANDARDS.md` | EDIT | links this spec as the recorded follow-up; its `orly-build` row matches the new opening step |
| `src/telemetry.ts`; `src/telemetry_sync.ts`; `src/telemetry.test.ts` | DELETE | collection, spool and upload |
| `src/cli.ts`; `src/cli_help.ts`; `src/cli.test.ts` | EDIT | no telemetry wrapper, `skill-event` or `lifecycle`; `verify` takes no arguments |
| `src/installation/hooks.ts`; `src/installation/migration.ts`; `src/git_env.ts`; `standards/languages/shell.md` | EDIT | generated hooks drop the invocation marker and the unused index hand-off; legacy bytes stay recognisable; SH-HOOKINDEX covers hooks that read the staged tree |
| `src/installation/migration.test.ts`; `src/install_loaders.test.ts`; `src/setup.test.ts` | EDIT | hook ownership proof; telemetry assertions and variables retired |
| `src/standards.ts`; `src/standards_catalogue.test.ts` | EDIT | one catalogue validator, proven valid and invalid |
| `src/verify.ts`; `src/verify.test.ts`; `src/render.test.ts` | EDIT | verify checks the catalogue and currency; render determinism becomes a unit test |
| `schemas/evidence.schema.json` | DELETE | the evidence file has no writer |
| `.githooks/pre-push`; `.githooks/pre-commit`; `Makefile` | EDIT | push runs gitleaks; commit runs the work gate |
| `src/required_scanner.test.ts`; `src/commit_hook.test.ts` | EDIT / CREATE | push and commit hook proofs |
| `.orly/orly.json`; `AGENTS.md`; `SOUL.md` | EDIT | `verify.typecheck` declared; the owner's decision-brief rule; the render records both |
| `src/execution/plan.ts`; `src/execution/plan.test.ts`; `src/execution/config.ts` | DELETE | lifecycle inspector and disabled remote adapter |
| `src/criteria.ts`; `src/criteria.test.ts` | EDIT | owns gate tiers and command selection |
| `src/config.ts`; `src/config.test.ts`; `src/config_validation.ts`; `src/config_validation.test.ts`; `schemas/profile.schema.json` | EDIT | the `execution` and `digests` keys are removed and refused |
| `src/install.ts`; `src/layout.test.ts` | EDIT | update proves ownership through git |
| `docs/architecture/remote-execution.md` | DELETE | describes the removed adapter |
| `evals/release/` (279 files); `src/release_inventory.test.ts` | DELETE | 0.11 and 0.12 release records |
| `evals/install/release_cases.sh`; `evals/install/cases.sh` | EDIT | receipt exclusion and its case removed; update cases commit first and doctor stops checking edits |
| `standards/spec-template.md`; `standards/spec.md`; `fixtures/standards-rule-ids.json` | EDIT | slim template; rules absorb its guidance; SPEC-BASELINE recorded as removed |
| `skills/orly-build/SKILL.md`; `skills/orly-ship/SKILL.md` | EDIT | no baseline headers; baselines from CI |
| `src/spec_fill.ts`; `src/spec_fill.test.ts`; `src/doc_changes.ts`; `src/doc_changes.integration.test.ts` | CREATE / CREATE / EDIT / EDIT | leftover template slots in changed, committed spec lines |
| `src/gates_test_support.ts` | EDIT | the fixture spec takes the template's current shape; helpers nothing calls are removed |
| `package.json`; `README.md`; `docs/ORLY_ARCHITECTURE.md`; `docs/architecture/installation.md`; `llms.txt`; `docs/CHANGELOG.md` | EDIT | the 0.28 surface |

Discovery searched `git grep -n -w` for each removed name: `beginTelemetry`, `recordTelemetry`, `telemetry_sync`, `skill-event`, `ORLY_TELEMETRY`, `ORLY_INVOCATION`, `lifecyclePlan`, `readExecution`, `writeEvidence`, `evals/release`. Production callers are `src/cli.ts`, `src/cli_help.ts`, `src/installation/hooks.ts`, `src/installation/migration.ts`, `src/config.ts` and `.githooks/pre-push`. Test callers are the test files above. Finished specs and released changelog entries name the retired items as history.

## Applicable Rules

- **`code.md`** — NDC, NLG, NLR, NRC, ORP, HLP, FLL, CODE-MSID
- **`tests.md`** — TNM, TST-NAM, TCF, TEST-OUTCOME, TEST-NEG, TEST-GITENV, TEST-ABSENT, TEST-DELTA
- **`languages/typescript.md`** — TS-ORDER, TS-TYPEIMPORT, TS-NONNULL, TS-SPAWN, PTK
- **`languages/shell.md`** — SH-QUOTE, SH-HOOKINDEX
- **`changelog.md`** — CL-USER, CL-BUDGET, CL-UPGRADE, CL-NOREF, CL-BUMP
- **`docs.md`** — DOC-02, DOC-03, DOC-10, DOC-S7
- **`domains/architecture.md`** — ARCH-HOMES, ARCH-PUBLISHED
- **`pr.md`** — PR-BUDGET, PR-UNIT, CHR
- **`spec.md`** — SPEC-AMEND, SPEC-BLAST, SPEC-DIM, SPEC-FILES, SPEC-FILL, SPEC-INVARIANT, SPEC-MODEL

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

Every command stops collecting, spooling and sending usage events. `src/telemetry.ts` and `src/telemetry_sync.ts` are deleted with their tests, and `src/cli.ts` runs the command with no telemetry wrapper. `orly skill-event` and the help's telemetry block go; the removed command falls through to `unknown command`. orly 0.28 never reads, writes or deletes the old state under `~/.config/agentsfleet/orly/` (or `$AGENTSFLEET_STATE_DIR/orly/`): `.orly.json`, `.telemetry-prompted`, `installation-id` and `analytics/`. Hooks still pinned to an earlier version keep reading it until their repository updates, which the changelog says.

Generated hooks drop the `export ORLY_INVOCATION=hook` line. A 0.27 hook under `.orly/hooks/` migrates through its recorded digest, which `src/install.ts` checks before any write. A legacy hook under `.githooks/` has no digest and migrates through byte recognition in `src/installation/migration.ts`; that template keeps the historical marker line as a local literal. A one-byte edit to either refuses before any write.

- **Dimension 1.1** — DONE — The removed telemetry command is refused → Test `retired telemetry command is refused` (e2e): `orly skill-event orly-build` exits 1 and prints `unknown command: skill-event`.
- **Dimension 1.2** — DONE — Untouched old hooks migrate and edited ones stay protected → Test `hook cleanup preserves ownership conflicts` (integration): an untouched 0.27 `.orly/hooks/pre-commit` and an untouched legacy `.githooks/pre-commit` both end as the 0.28 bytes; a one-byte edit to either fails the update and leaves the file unchanged.

### §2 — Verify the standards catalogue

`src/standards.ts` exports one validator that `orly verify` and the catalogue tests both call. It reads `standards/` and `fixtures/standards-rule-ids.json` from the engine checkout. It keeps every current predicate: standards exist, each rule carries its five fields, each identifier has one home and matches the inventory, no retired-stack term appears, each page holds at most 400 lines, and relative links resolve. It adds one: every `SPEC-` identifier the spec template cites exists in `standards/spec.md`. Each finding names the file and what broke.

`orly verify` reports `standards.catalogue`, `generated.root.current` and `packs.sources.current`, and exits non-zero when any fails. The render-twice determinism check leaves the command and becomes a unit test in `src/render.test.ts`. `writeEvidence`, `--write-evidence`, `--llm-result` and `schemas/evidence.schema.json` go; `verify` takes no arguments and refuses any with its usage line. It still refuses to run from a published package.

- **Dimension 2.1** — DONE — The shipped catalogue passes → Test `verify accepts the shared valid catalogue` (e2e): the validator returns no findings for this checkout or for a 400-line page, and `orly verify` prints all three checks green and exits 0.
- **Dimension 2.2** — DONE — Each broken property is named → Test `verify names catalogue failures` (unit): scratch catalogues with an empty directory, a missing field, a duplicated identifier, an identifier named like an object property, a missing or malformed inventory, a broken link, a 401-line page, a retired-stack term and a template citing an absent SPEC rule each yield a finding naming the file.
- **Dimension 2.3** — DONE — Retired flags cannot pass silently → Test `verify refuses retired and unknown flags` (e2e): `orly verify --write-evidence` and `orly verify --all` exit 1 with `usage: orly verify`.

### §3 — Commits run the work gate, pushes run gitleaks

`.githooks/pre-push` keeps its gitleaks block and loses the pushed-range selector, `make audit` and the evidence write. CI's `make audit` in `.github/workflows/harness.yml` stays the full proof. `.githooks/pre-commit` runs `bin/orly gate work`, which runs `make conform`; the gate took 0.22 s on this checkout. `.orly/orly.json` declares `verify.typecheck` as `bun run typecheck`, so `orly gate verify` and `orly gate pr` type-check locally, and `AGENTS.md` re-renders with it.

- **Dimension 3.1** — DONE — A governance push needs nothing but gitleaks → Test `a push needs only gitleaks` (integration): a ref line touching `src/` on stdin, with only `git` and a passing `gitleaks` on `PATH`, exits 0.
- **Dimension 3.2** — DONE — A commit runs the work gate → Test `a commit runs the work gate` (integration): a scratch checkout whose `bin/orly` exits 1 fails the hook, and one that records its arguments receives `gate work`.

### §4 — Remove the lifecycle inspector and the disabled remote adapter

`orly lifecycle`, `lifecyclePlan` and the `execution.remote` adapter are deleted; the adapter never launched anything. `docs/architecture/remote-execution.md` goes with them. Gate tiers and `selectedCommands` move into `src/criteria.ts`, their only remaining caller. The configuration schema is strict and drops `execution`, so a configuration that still carries the key is refused by name. None of the four local configurations carries it: orly, agentsfleet, docs and cache-kit.rs.

- **Dimension 4.1** — DONE — The inspector is gone → Test `lifecycle is not a command` (e2e): `orly lifecycle` exits 1 and prints `unknown command: lifecycle`.
- **Dimension 4.2** — DONE — A stale configuration is refused → Test `a configuration with execution is refused` (unit): parsing a configuration with `execution` throws an error naming the key.
- **Dimension 4.3** — DONE — Tiers select what they selected before the move → Test `gate tiers select their declared commands` (integration): over a scratch repository's declared lanes, `criteriaFor` names `cmd.conform` for work, `cmd.verify.lint` for verify, and every `verify.*` lane for pr.

### §5 — Retire the 0.11 and 0.12 release archive

`evals/release/` holds 279 files: audit records, 267 receipts and hand-run packaging scripts for 0.11 and 0.12. Only `src/release_inventory.test.ts` and an install-eval exclusion keep them alive, and all three go. The retired-verb scan in `evals/install/release_cases.sh` loses its receipt exclusion and the case that proved it. The active-call case still proves that live calls are reported.

- **Dimension 5.1** — DONE — The retired-verb scan still reports active calls → Test `install_retired_reference_scope_rejects_active_calls` (integration, `make install-evals`): three planted calls to retired verbs are each reported once.

### §6 — Slim the spec template

`standards/spec-template.md` becomes a skeleton whose `tpl:` comments cite the governing rule instead of restating it. The Test Specification table goes, because each Dimension line now carries its tier and observable result. The four pending header fields go: the Pull Request Session Notes carry the branch and the baselines, taken from the base commit's CI run. Product Clarity is required only for the API, CLI and UI Categories, and Discovery keeps four bullets.

`standards/spec.md` absorbs the guidance the comments carried. It amends SPEC-DIM, SPEC-FAIL, SPEC-DECIDE, SPEC-CLARITY and SPEC-FILL, and drops SPEC-BASELINE, which the inventory records as removed. `orly-build` stops writing baseline headers, and `orly-ship` takes baselines from CI. Changed spec lines get one mechanical check: an unfilled `{{fill:` slot or an opening `tpl:` comment is a `DOCFILL` finding under `docs.language`, while specs stay outside the prose rules. An untracked draft waits until it is added, so drafting a spec never blocks a push.

- **Dimension 6.1** — DONE — A leftover slot fails, and an opener alone does not → Test `docs language flags unfilled template slots` (unit): a changed spec line holding a slot yields one DOCFILL finding; an unchanged line and an opener with no closing braces yield none; only spec records get the check.

### §7 — Publish the coherent 0.28 surface

`package.json` moves to 0.28.0. Help, `README.md`, `docs/ORLY_ARCHITECTURE.md`, `docs/architecture/installation.md`, `llms.txt` and the changelog describe 0.28 together. Finished specs and released changelog entries keep their wording (DOC-S7).

- **Dimension 7.1** — DONE — Help lists only live commands → Test `help lists only live commands` (e2e): help names `orly verify` and its three checks, and no `lifecycle`, `skill-event` or consent file.

### §8 — Update proves ownership through git

`.orly/orly.json` drops per-file `digests`. `orly update` replaces a managed file, or deletes an obsolete one, only while `git status` reports it clean; an uncommitted change stops the update and names the path. A committed hand edit is replaced and shows in the update's diff. Migration from 0.10 `.oracle/orly.json` and `.githooks/` is removed: every consumer is on 0.27.

- **Dimension 8.1** — DONE — An uncommitted edit stops the update, and a committed stale file is replaced → Test `a committed stale hook is replaced; an uncommitted edit stops the update` (integration); `migration_preserves_owned_content refuses uncommitted or unowned` (integration).
- **Dimension 8.2** — DONE — A 0.27 configuration with digests updates cleanly, and every reader drops the key until then → Test `interrupted_install_recovers` (integration) starts from a committed 0.27 configuration; `a 0.27 configuration's digests are dropped, not refused` (unit).

## Interfaces

- `orly verify` takes no arguments and prints one line per check: `standards.catalogue`, `generated.root.current`, `packs.sources.current`. It exits 0 only when all pass; any argument exits 1 with `orly: usage: orly verify`.
- Removed with no alias: `orly skill-event`, `orly lifecycle`, `orly verify --write-evidence`, `--llm-result`, the configuration key `execution`, `.orly/evidence.json` and `schemas/evidence.schema.json`.
- Generated `.orly/hooks/*` files lose `export ORLY_INVOCATION=hook` and the `ORLY_INDEX_FILE` hand-off, which nothing read. The commit gate checks the working tree; `orly gate pr` checks the committed tree.
- `docs.language` reports `DOCFILL` for a leftover template slot on a changed, committed spec line.
- This repository declares `verify.typecheck`.
- `.orly/orly.json` has no `digests` key; every reader drops a leftover one, and `orly update` rewrites the file without it.

## Failure Modes

| Mode | Cause | Handling (what the caller observes) | Test |
|------|-------|-------------------------------------|------|
| Retired command | `orly skill-event` or `orly lifecycle` | exit 1, `unknown command: <verb>` | `retired telemetry command is refused`; `lifecycle is not a command` |
| Retired flag | `orly verify --write-evidence` | exit 1, usage line | `verify refuses retired and unknown flags` |
| Broken catalogue | missing field, duplicate identifier, broken link, long page, retired term, dead SPEC citation | finding names the file; `verify` exits 1 | `verify names catalogue failures`; `verify exits 1 when the catalogue breaks` |
| Invalid registry | registry fails validation | `verify` stops before any check | `verify refuses an invalid registry before any check` |
| Uncommitted managed edit | an edit git reports as changed | update refuses before any write, naming the path | `a committed stale hook is replaced; an uncommitted edit stops the update` |
| Stale configuration | `execution` key | configuration refused, naming the key | `a configuration with execution is refused` |
| Leftover template slot | a slot on a changed, committed spec line | DOCFILL finding; `docs.language` red | `docs language flags unfilled template slots` |
| Failing conform at commit | `make conform` red | commit blocked | `a commit runs the work gate` |
| Secret at push | gitleaks finding or missing gitleaks | push blocked | `a scanner finding blocks the push` |

## Invariants

1. No command path reaches telemetry — the modules are deleted, so an import fails `bun run typecheck`.
2. An update never discards an uncommitted change — `src/install.ts` and `src/installation/migration.ts` check `git status` before any write or delete.

## Metrics & Observability

Usage telemetry is removed: the PostHog command, gate and skill events stop. No signal replaces them.

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | Telemetry retired; old hooks migrate (§1) | `bun test src/cli.test.ts src/installation/migration.test.ts` | exit 0 | P0 | ✅ `Ran 46 tests across 2 files`, 0 fail |
| R2 | Catalogue verification (§2) | `bun test src/standards_catalogue.test.ts src/verify.test.ts` | exit 0 | P0 | ✅ `Ran 21 tests across 2 files`, 0 fail |
| R3 | Commit and push hooks (§3) | `bun test src/required_scanner.test.ts src/commit_hook.test.ts` | exit 0 | P0 | ✅ `Ran 5 tests across 2 files`, 0 fail |
| R4 | Inspector and adapter gone (§4) | `bun test src/criteria.test.ts src/config_validation.test.ts` | exit 0 | P0 | ✅ `Ran 37 tests across 2 files`, 0 fail |
| R5 | Distribution still installs (§5) | `make install-evals` | exit 0 | P0 | ✅ `24 passed / 0 failed` |
| R6 | Leftover template slots reported (§6) | `bun test src/spec_fill.test.ts` | exit 0 | P1 | ✅ `Ran 1 test across 1 file`, 0 fail |
| R7 | Public version (§7) | `bin/orly --version` | `0.28.0` | P1 | ✅ `0.28.0` |
| R8 | Ownership through git (§8) | `bun test src/installation/migration.test.ts src/layout.test.ts src/config_validation.test.ts` | exit 0 | P0 | ✅ `Ran 58 tests across 3 files`, 0 fail |
| S1 | Declared conform | `make conform` | exit 0 | P0 | ✅ exit 0; final `orly gate pr` run in the PR Session Notes |
| S2 | Declared unit lane | `bun test src` | exit 0 | P0 | ✅ `Ran 322 tests across 32 files`, 0 fail |
| S3 | Declared typecheck lane | `bun run typecheck` | exit 0 | P0 | ✅ exit 0 |
| S4 | No secrets | `gitleaks detect --redact --no-banner` | exit 0 | P0 | ✅ exit 0, no leaks found |

## Dead Code Sweep

| Deleted file or symbol | Verify | Expected |
|------------------------|--------|----------|
| telemetry modules and command | `git grep -n -F -e beginTelemetry -e recordTelemetry -e telemetry_sync -e skill-event -e ORLY_TELEMETRY -- src bin evals skills core agents standards ":!src/*.test.ts"` | no output; the same search at `700df9c` finds 21 lines |
| hook invocation marker | `git grep -n -F -e ORLY_INVOCATION -- src bin evals ":!src/*.test.ts"` | `src/installation/migration.ts` only, the 0.10.6 to 0.10.14 byte record |
| lifecycle inspector and adapter | `git grep -n -F -e lifecyclePlan -e readExecution -e DISABLED_MODE -e "orly lifecycle" -- src bin evals docs/architecture llms.txt ":!src/*.test.ts"` | no output; 14 lines at `700df9c` |
| evidence writer and schema | `git grep -n -F -e writeEvidence -e evidence.schema -e write-evidence -e llm-result -- src bin evals schemas .githooks Makefile ":!src/*.test.ts"` | no output; 13 lines at `700df9c` |
| release archive | `git grep -n -F -e evals/release -- src evals docs/architecture README.md llms.txt Makefile` | no output; 932 lines at `700df9c` |
| fixture helpers nothing calls | `git grep -n -F -e closedSpecRepository -e writeFixtureTest -- src` | no output; 4 lines at `700df9c` |

Each search runs at `700df9c` by inserting the revision before `--`, so its "no output" counts only beside a known positive.
Negative tests name the retired commands to prove their refusal, and the README's 0.28 notes announce the removals.
`.gitignore` still ignores `.orly/evidence.json`, as it still ignores `.oracle/evidence.json`, so a stale local file never dirties a tree.

## Out of Scope

- M16, the gate's language, stays its own milestone.
- agentsfleet's move to 0.28 is its own chore Pull Request after release.
- Changing `docs.updated` is not planned.
- Merging and the release workflow stay with the owner.
- Adopting openclaw's `oracle` second-model review skill is not planned, by the owner's decision below.

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

- **Consults** — Fetched `origin/main` at `700df9c125530a4d2b0d356ee6f0511c536ca35b`. The Nov 02 adversarial review found these errors in the first draft, each fixed above. §2 would have deleted `packSourceErrors` (`src/verify.ts:59`), the only pack-drift check. `--all` was already gone (`src/cli.test.ts:78`). A telemetry-absence test proves nothing once the code is deleted. The telemetry state path was unnamed. Live docs still described 0.11 to 0.13 (`docs/architecture/installation.md:5`, `llms.txt:15`).
- **Model reviews** — Native authoring review (Nov 01; model and version not recorded): 0 Blockers, 5 Majors, 2 Nits, all accepted. Adversarial spec review by Claude Opus 5.5 (Nov 02): 8 findings, 6 fixed in this spec and 2 settled by owner decisions quoted below; it corrected two of its own claims in session. Implementation reviews (Nov 02, Claude Opus 5.5 subagents):
  - `orly-standards-reviewer`: 19 findings; 18 fixed; 1 dropped, because TS-NAME governs identifier case, not file names.
  - gstack `/review` (gstack 1.91.291.0): 5 core findings, all fixed. Specialists returned 8 findings and 1 advisory, all applied (testing 4, maintainability 4, simplification 1 advisory, security 0). Performance and state machines were not dispatched: the first is a command-line tool with no hot path, the second a detector false positive on a directory name.
  - Adversarial pass: 10 findings. 7 fixed; 2 settled by the owner ("Ignore the make audit then."; option C for the commit gate); 1 accepted, because commits here now need `bun`, already a prerequisite.
  - Red team: 2 findings; 1 fixed, 1 closed at push by retitling PR #75 and appending Session notes 3.
  - The full EGM pipeline did not run, and the Codex outside review is disabled (`codex_reviews`).
- **Open blockers** — none. The commit gate checks the working tree, not the staged snapshot; `orly gate pr` refuses a dirty tree and an unpushed head before rerunning the same checks, so the committed tree is always checked. The two docs that claimed a staged check now say "working tree", and the unused `ORLY_INDEX_FILE` hand-off is removed, by the owner's choice below.
- **Deferrals and transfers** — M15_001 transferred the pre-push range coverage from PR #70 to this spec. It dissolves: §3 deletes the range selector, by the owner's "Gitleaks only" decision below. Telemetry removal traces to the owner's M15_001 quote, repeated below.

> Owner (Kishore, Oct 28, 2026, time not recorded): "5. Telemetry - cut the crap" — context: telemetry leaves in M15_002, as M15_001 records.

> Owner (Indy, Nov 01, 2026, time not recorded): "Orly 028 - Yes M15_002 is what we ship" — context: release scope is this cleanup, not M16.

> Owner (Indy, Nov 02, 2026, time not recorded): "lets use that PR75 to push orly updates for 0.28" — context: the implementation lands on PR #75, beyond PR-BUDGET's one follow-up.

> Owner (Indy, Nov 02, 2026, time not recorded): "Gitleaks only (Recommended)", "Slim it in 0.28 (Recommended)", "orly lifecycle + remote, evals/release (279 files), Evidence file" — context: the three scope decisions, answered through AskUserQuestion.

> Owner (Indy, Nov 02, 2026, time not recorded): "Ignore the make audit then." — context: CI's Harness `audit` stays advisory on `main`; no ruleset change and no push audit.

> Owner (Indy, Nov 02, 2026, time not recorded): "Also i need to mention that any decision that is asked with Indy must be elaborate with with a user experience thinking from the docs/architechture/*.md in ELI20 ascii pictorial with detail on api, files called and so on. So its clear for indy to take a decision" — context: recorded in `SOUL.md`'s "When a call needs his input" rule; the owner added "on ascii pictorial draw" and "explain me with pros and cons on the reasoning for selecting recommended options".

> Owner (Indy, Nov 02, 2026, time not recorded): "so dont add oracle" — context: openclaw's `oracle` skill is not adopted.

> Owner (Indy, Nov 02, 2026, time not recorded): "I PRFER WE DROP THE PER FILE HASH ITS CUMBERSOME", then "GO" to "Yes, git guard, in #75", then "JUST KEEP THE CODE SIMPLE" and "NO CLUTTER", then "Drop it quietly (Recommended)" — context: §8; per-file digests and the 0.10 migration leave, git status guards update, and a leftover `digests` key is dropped so agentsfleet stays green when 0.28 publishes.

> Owner (Indy, Nov 02, 2026, time not recorded): "I select this │ 3 / C: A, plus delete ORLY_INDEX_FILE" — context: the commit gate keeps checking the working tree; the false docs are fixed and the unused index hand-off is removed from generated hooks, the engine hook and `src/git_env.ts`.
