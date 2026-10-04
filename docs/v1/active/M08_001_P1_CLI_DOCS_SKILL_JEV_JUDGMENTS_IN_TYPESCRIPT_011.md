<!--
SPEC AUTHORING RULES (load-bearing — the one comment that survives):
- Body order = the executing agent's read order. Fill via the orly-spec-new
  skill (authoring order lives there); after filling, DELETE every "tpl:"
  guidance comment — the SPEC TEMPLATE GATE blocks tpl residue, unfilled
  {slots}, and missing required sections (audits/spec-template.sh --staged).
- No time/effort/hour/day estimates anywhere. No effort columns, complexity
  ratings, percentage-complete, implementation dates, assigned owners.
- Priority (P0/P1/P2/P3) is the only sizing signal; Dependencies are the only
  sequencing signal. A section that contradicts these rules loses — delete it.
-->

# M08_001: Test bounded Jev advice in the TypeScript command line

**Prototype:** v1.0.0
**Milestone:** M08
**Workstream:** 001
**Date:** Oct 04, 2026
**Status:** IN_PROGRESS
**Priority:** P1 — prove useful review guidance before choosing another runtime
**Categories:** CLI DOCS SKILL
**Batch:** B1 — one workstream
**Branch:** feat/m08-jev-typescript-011
**Baseline revision:** bc3e62f14c5ad420c6986bda4155f11c1470b8c3
**Test Baseline:** unit 268 passed, 0 failed; no separate integration command is declared
**Baseline evidence:** `/private/tmp/orly-ts-011-Oct_04_13_50/baseline-unit.log` — `bun test src`, Bun on macOS; 268 tests across 23 files
**Depends on:** none
**Provenance:** agent-generated from Indy's explicit TypeScript experiment request, Oct 04, 2026
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Gates, Evidence, TypeScript judgment experiment

## Overview

**Goal (testable):** An explicit Jev review finds a weak assertion before it is accepted, and the suggested stronger test catches a seeded bug.
**Problem:** Passing tests can exercise incorrect behavior without asserting the required result.
**Solution summary:** Keep Bun, the installed layout, and deterministic gates. Add explicit, bounded Jev advice at planning, verification, review, and documentation. Remove the native Rust implementation and its superseded specs through forward changes. Prepare an unpublished 0.11.0 package and test it in a fresh `agentsfleet` worktree.

## PR Intent & comprehension handshake

- **Pull Request (PR) title:** Add explicit Jev advice to the Bun command line
- **Intent:** Prove that earlier, bounded judgment improves a developer's next action without a runtime rewrite.
- **Handshake:** Prepare the TypeScript experiment, remove the canceled native engine, and compare controlled cases in `agentsfleet`.
- **ASSUMPTIONS I'M MAKING:** Removal covers the native engine and Milestone 07 plans, while consumer Rust authoring rules remain. This prepares a local package; publication is outside scope.

## Implementing agent — read these first

1. `src/cli.ts` — the installed production entrypoint and error handling.
2. `dispatch/write_ts_adhere_bun.md` — file shape, parse boundaries and owned timeouts.
3. `docs/ORLY_ARCHITECTURE.md` — deterministic gates and materialised rules.
4. https://docs.typesafe.ai/api — typed provider questions and answers.

- **Grounding rule:** Model answers select only cataloged advice. They cannot run commands, waive rules, approve work, or clear a gate.
- **Golden set:** Sibling tests in `src/judgments/` cover exact and weak assertions, missing context, malformed replies, source escape, stale replay, and secret upload refusal.
- **Ship threshold:** Every deterministic safety case passes. The live experiment reports all observations, including misses and uncertainty.
- **Fallback:** Missing context, credentials, scanner, or exact replay produces an explicit incomplete result before dependent work.
- **Read:** `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`, `dispatch/edit_rules.md`, `docs/DOCUMENTATION_RULES.md`, and the canonical architecture.
- **Provider:** TypeSafe's official System One API; Jev model pinned to `jev-1.13.0`. `TYPESAFE_API_KEY` comes from the runtime environment, never repository data.

## Files Changed (blast radius)

| Files | Role |
|---|---|
| `src/judgments/*.ts` | Typed questions, selected evidence, bounded transport, exact replay, advice, tests |
| `src/cli.ts`, `src/cli_help.ts` | Production command routing and help with source length headroom |
| `src/cli.test.ts` | Public command behavior and unchanged gate behavior |
| `package.json`, `bun.lock` | Unpublished 0.11.0 version and schema/parser dependencies |
| `.gitignore` | Ignore local judgment replay data; remove native cache paths |
| `README.md`, `docs/ORLY_ARCHITECTURE.md`, `docs/JUDGMENTS.md` | Installation, timing, atomic criteria, limits and evidence |
| `skills/orly-spec-new/SKILL.md`, `skills/orly-write-unit-test/SKILL.md` | Optional explicit advice during planning and test review |
| `.oracle/orly.json`, `AGENTS.md` | Normal regeneration from retained source rules |
| `Cargo.*`, `build.rs`, `rust-toolchain.toml`, `.cargo/`, `crates/`, `tools/xtask/` | Remove canceled native implementation and build files |
| `src/**/*.rs`, `src/judge/scanner.toml`, `tests/**/*.rs` | Remove native production code and its tests |
| `fixtures/layout-0.10/`, `fixtures/port/`, `fixtures/projects/`, `fixtures/questions/`, `questions/` | Remove native migration and judgment fixtures |
| Native-only schema files added by `e804c6c` | Remove native configuration, decision, delivery and evidence schemas |
| `.github/workflows/native-foundation.yml` | Remove the canceled engine's workflow as part of explicit Rust removal |
| `evals/judge/`, `docs/fragments/judge.md`, `docs/v1/{pending,active,done}/M07_*` | Archive then remove superseded native work and plans |
| `evals/judgments/*.md` | New TypeScript experiment report and questionnaire |
| `docs/v1/{pending,active,done}/M08_001_*` | This workstream and measured results |
| Fresh private `agentsfleet` worktree | Controlled consumer edits and local installation; no original checkout edits |

`SOUL_LOG.md` contains unrelated pending work and remains untouched. Native teardown paths are listed in the private backup manifest before removal.

## Applicable Rules

| Rule | Application |
|---|---|
| No Dead Code (NDC), Orphan sweep (ORP) | Remove native callers and stale documentation together |
| File and Function Length (FLL) | Source files at most 350 lines; functions at most 50 lines |
| TypeScript conventions (TSC), TypeScript judgment (TSJ) | Bun primitives, passive functions, strict types and owned timeouts |
| Tagged Union (TGU) | Evidence selectors and provider answer variants |
| Unified Form for Symbols (UFS) | Named limits, question identifiers and repeated literals |
| Prompt-injection Resistance (PRI) | Source bytes are evidence, never instructions or authority |
| `dispatch/edit_rules.md` | Render, audit, questionnaire and comprehension evidence |
| Documentation (DOC) rules S1, S5, S6, F1, F2, P1, 01–14b | Source-checked reference and explanatory docs |

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Specification template | yes | Filled template with complete test mapping |
| Documentation read | yes | Log applied sections before edits |
| Length and symbol checks | yes | Split concerns and name budgets |
| Governance invariance | yes | `make audit`, questionnaire, comprehension check |
| Secret scanning | yes | `gitleaks` before commits and every live upload |
| Work and verification | yes | Declared `make conform` and `bun test src` |
| PR boundary | only if a PR is requested | No publication or merge in this experiment |

## Prior-Art / Reference Implementations

| Source | Use |
|---|---|
| `src/cli.ts`, `src/model.ts`, `src/git_env.ts` | Existing entrypoint, errors, bounded inputs and child Git environment |
| Inspected `agentsfleet` `cli/src/services/http-client.ts` | Timeouts, structured failures, opt-in authorization and redaction |
| TypeSafe official API, `https://docs.typesafe.ai/api` | Choice and Noul formats; state as data; response validation |
| TypeScript compiler API documentation | Complete function and test selection without text-based syntax guesses |
| Bun package documentation | Existing package command and local package trial |

Canonical Supabase and command-line reference checkouts are absent locally. The existing consumer implementation supplies language prior art; no repository is cloned.

## Sections (implementation slices)

### §1 — Remove the canceled engine

- [ ] **Dimension 1.1** — Preserve dirty native work in a private backup before deletion. → Test `backup_preserves_native_changes`
- [ ] **Dimension 1.2** — Remove native implementation, fixtures, workflow and superseded Milestone 07 plans, while retaining independent rules. → Test `native_files_are_removed`
- [ ] **Dimension 1.3** — Keep the Bun package executable and deterministic gates usable. → Test `existing_commands_remain_usable`

### §2 — Select bounded, atomic evidence

- [ ] **Dimension 2.1** — Validate a manifest containing a stage and named question items with required behavior and source references. → Test `manifest_rejects_invalid_items`
- [ ] **Dimension 2.2** — Select complete TypeScript functions, named tests, Markdown sections or bounded whole files from inside the project root. → Test `evidence_selects_complete_units`
- [ ] **Dimension 2.3** — Reject missing required evidence, duplicates, excessive inputs, path escape and ambiguous symbols before network access. → Test `evidence_refuses_unsafe_context`

### §3 — Request typed advice safely

- [ ] **Dimension 3.1** — Require explicit `--refresh`, runtime credentials and a passing secret scan for a live request. → Test `unsafe_upload_never_calls_provider`
- [ ] **Dimension 3.2** — Bound request count, bytes and duration; abort fetch and body reading together without automatic retries. → Test `transport_bounds_and_cancels_work`
- [ ] **Dimension 3.3** — Validate complete provider answers and distributions before choosing cataloged advice. → Test `provider_answers_are_validated`
- [ ] **Dimension 3.4** — Replay only exact model, question, requirement and selected-source identities; changed inputs remain incomplete. → Test `replay_rejects_stale_and_tampered_data`

### §4 — Expose advice at the right stage

- [ ] **Dimension 4.1** — Route `orly judge <plan|verify|review|document> --input <path>` through the shipped entrypoint. → Test `installed_command_reads_manifest`
- [ ] **Dimension 4.2** — Print fixed next actions, uncertainty, references, timing and usage; never claim model approval. → Test `advice_stays_in_catalog`
- [ ] **Dimension 4.3** — Document atomic inputs and criteria, and optional invocation before implementation and accepting test evidence. → Test `help_matches_question_catalog`
- [ ] **Dimension 4.4** — Keep hooks offline and keep all deterministic gate outcomes independent of model answers. → Test `gate_commands_remain_offline`

### §5 — Test the unpublished package in the consumer

- [ ] **Dimension 5.1** — Install the local 0.11.0 package in a new `agentsfleet` worktree and verify normal setup. → Test `consumer_installs_local_package`
- [ ] **Dimension 5.2** — Compare a healthy exact assertion, a seeded wrong locale with a weak assertion, and the strengthened assertion on identical code. → Test `stronger_assertion_catches_seeded_bug`
- [ ] **Dimension 5.3** — Repeat live advice on the controlled cases, record every response, and report useful actions, misses, variability, cost inputs and limits. → Test `live_controls_have_complete_receipts`

## Interfaces

- `orly judge <plan|verify|review|document> --input <manifest> [--project <root>] [--refresh] [--json]`.
- `orly judge --help` lists the manifest and upload behavior. Default mode is offline replay.
- Manifest: stage plus at most 12 uniquely named items; each names a cataloged question, requirement and role-labeled evidence selectors.
- A selected function or test includes its complete syntax body. A section ends at the next peer or ancestor heading.
- Reports name exact source references and distinguish live, replay and incomplete results. Advice and uncertainty return zero; unavailable required evidence returns two.
- No endpoint override is accepted by the public command. Test injection remains a typed internal dependency.

## Failure Modes

| Failure | Required behavior | Negative test |
|---|---|---|
| Invalid manifest, stage or question | Refuse before reading unrelated files | rejects unknown question and mismatched stage |
| Missing, ambiguous or escaping source | Incomplete before network | rejects path escape and ambiguous symbol |
| Too many items or oversized state | Refuse without truncation | rejects excessive input |
| Missing credential or scanner; detected secret | No outbound request | refuses unsafe upload |
| Provider status, timeout or oversized body | Incomplete; cancel owned work | bounds transport and cancels body |
| Invalid answer kind, missing answer or invalid probabilities | Incomplete, no fabricated advice | rejects malformed provider evidence |
| Changed source or corrupted replay | Incomplete, no stale success | rejects stale and tampered replay |
| Instructions embedded in source | Remain data; cannot authorize commands | keeps advice within fixed catalog |

## Invariants

1. Live source upload is an explicit action and uses only selected, scanned evidence.
2. Commit, push and gate commands do not call Jev.
3. Model output cannot change execution, suppressions, approval or gate status.
4. No source, credential or provider error body appears in diagnostics or replay metadata.
5. All request and reply bytes, item counts and asynchronous lifetimes have declared bounds.
6. Exact replay identity covers model, question definition, requirement, project identity and selected source bytes.
7. Existing project-owned hooks and loaders are preserved in the consumer trial.

## Metrics & Observability

- Record mode, question, outcome, confidence or probability, exact source references, elapsed milliseconds and provider token usage.
- Reports record all live observations and command exit statuses; no missing response counts as a useful finding.
- The private experiment receipts bind commands to revisions, source identities and controlled inputs.
- No speed, cost or quality superiority claim follows from an uncontrolled comparison.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts |
|---|---|---|---|
| 1.1 | manual | `backup_preserves_native_changes` | removed paths and dirty patches are saved |
| 1.2 | integration | `native_files_are_removed` | no native build files, source or M07 plans remain |
| 1.3 | integration | `existing_commands_remain_usable` | install, update, doctor and gates work |
| 2.1 | unit | `manifest_rejects_invalid_items` | unknown question and mismatched stage refused |
| 2.2 | unit | `evidence_selects_complete_units` | complete functions, tests and sections selected |
| 2.3 | unit | `evidence_refuses_unsafe_context` | escape, ambiguity and oversized input refused |
| 3.1 | unit | `unsafe_upload_never_calls_provider` | unsafe uploads and missing credentials send nothing |
| 3.2 | integration | `transport_bounds_and_cancels_work` | timeout and response bound cancel owned work |
| 3.3 | unit | `provider_answers_are_validated` | missing answers and bad distributions refused |
| 3.4 | unit | `replay_rejects_stale_and_tampered_data` | changed source and corrupted replay refused |
| 4.1 | integration | `installed_command_reads_manifest` | shipped command returns a typed report |
| 4.2 | unit | `advice_stays_in_catalog` | only fixed advice and typed probabilities returned |
| 4.3 | integration | `help_matches_question_catalog` | help lists implemented questions and timing |
| 4.4 | integration | `gate_commands_remain_offline` | hooks and gates make no provider requests |
| 5.1 | integration | `consumer_installs_local_package` | local version 0.11.0 and doctor pass |
| 5.2 | integration | `stronger_assertion_catches_seeded_bug` | weak test passes and exact test fails on same bug |
| 5.3 | integration | `live_controls_have_complete_receipts` | all three repetitions per control recorded |

Unit and integration audit skills run over changed source. Adversarial review follows verification. Consumer checks prove this experiment's slice only.

## Acceptance Rubric (single scoring surface)

| Outcome | Verify | Expected | Graded |
|---|---|---|---|
| Canceled native implementation removed | `git ls-files '*.rs' Cargo.toml rust-toolchain.toml` | zero retained engine paths in final commit | pending |
| Source conforms | `make conform` | exit 0 | pending |
| Declared unit lane holds | `bun test src` | zero failures; count and baseline recorded | pending |
| Governance remains invariant | `make audit` | ALL CHECKS PASSED | pending |
| Evaluation fixtures valid | `make llmevals CHECK=1` | exit 0 | pending |
| Unsafe upload and stale replay refused | `bun test src/judgments` | zero failures | pending |
| Consumer installation works | named local package trial | version 0.11.0 and doctor pass | pending |
| Useful advice demonstrated | controlled consumer trial | weak assertion found; stronger test fails on seeded bug | pending |
| Limitations reported | experiment report | all controls, misses and uncertainty recorded | pending |

## Dead Code Sweep

**Orphaned files:** Native paths from the backup manifest are removed from disk and Git. Retained `language.rust` rules describe consumer authoring.
**Orphaned references:** Search the whole repository for `native-foundation`, `rust-toolchain`, `cargo xtask`, `rehearsal_judge`, `.orly/bin`, and old M07 spec filenames. Update every active reference; historical records retain their wording.

## Out of Scope

- Rust runtime, native migration, automatic planning or command execution.
- Package publication, release tags, merges, or modifying other active worktrees.
- Universal review coverage or a claim that Jev catches every defect.
- Changing deterministic gate rules or treating model confidence as calibrated readiness.

## Product Clarity (authoring record)

1. **Successful user moment:** A reviewer sees why a passing linked test misses the required result and writes the assertion that catches the seeded bug.
2. **Preserved user behaviour:** Bun installation, repository layout, command declarations, hooks and owner decisions continue through existing code.
3. **Optimal-way check:** Explicit selected evidence and bounded questions give a directly testable result without migrating the execution runtime.
4. **Rebuild-vs-iterate:** Iterate on the TypeScript entrypoint; the native rewrite adds a separate proof burden before usefulness is established.
5. **What we build:** One advice command, a small atomic question catalog, exact offline replay, meaningful tests and a consumer report.
6. **What we do NOT build:** Automatic approvals, model-written commands, a dashboard or a new installation layout.
7. **Fit with existing features:** Advice accompanies deterministic gate evidence and strengthens the existing test-writing skill.
8. **Surface order:** Command line first because the consumer's lifecycle already uses command-line evidence.
9. **Dashboard restraint:** No overall quality score; show the specific decision, uncertainty and next action.
10. **Confused-user next step:** `orly judge --help` and `docs/JUDGMENTS.md` explain selectors, exact replay and explicit refresh.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Teardown, bounded evidence, typed advice, lifecycle timing, then consumer proof.
- **Alternative:** Continue the Rust rewrite. Rejected by Indy in favor of proving useful advice in the existing runtime.
- **Quality ceiling:** A language rewrite cannot strengthen an assertion by itself; the controlled trial tests that exact gap.
- **Verdict:** A focused TypeScript feature plus removal of the canceled runtime. No new gate or planner is needed.
- **Surface-area checklist:** OpenAPI no; command line yes; user docs yes; version yes; SQL schema no; native-only JSON schemas removed; rules conflict none.

## Discovery (consult log)

- **Oct 04, 2026: 01:50 PM:** Indy requested a 0.11 experiment, a new `agentsfleet` worktree, and removal of Rust work and pending Jev/native specs.
- Native work was archived at `/private/tmp/orly-ts-011-Oct_04_13_50/removed-rust-backup` before removal. The original unrelated `SOUL_LOG.md` remains unchanged.
- User decisions govern teardown. Jev advice remains explicit and cannot dispose of a gate finding.
