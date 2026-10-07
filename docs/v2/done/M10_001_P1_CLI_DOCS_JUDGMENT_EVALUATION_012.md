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

# M10_001: Verify migration and prepare orly 0.12.0

**Prototype:** v2.0.0
**Milestone:** M10
**Workstream:** 001
**Date:** Oct 07, 2026
**Status:** DONE
**Priority:** P1 — prove package installation and consumer migration
**Categories:** CLI DOCS (command-line interface, documentation)
**Batch:** B1 — one release stream
**Branch:** feat/m10-judgment-evaluation
**Baseline revision:** 153a3816b0713f1b0e5a7e363bad7d5b1bd5052d
**Test Baseline:** unit=519 integration=n/a — no separate integration lane declared; zero failures
**Baseline evidence:** evals/release/receipts/Oct_06_12_57/baseline-unit.txt
**Depends on:** Published 0.11.0 runtime; no new judgment candidate
**Provenance:** Existing specification amended after Indy's explicit scope decision
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`; `docs/architecture/installation.md`; `docs/architecture/remote-execution.md`

## Overview

**Goal (testable):** Prepare 0.12.0 with real packaged-hook proof, verified `agentsfleet` migration and accurate documentation. Preserve published 0.11.0 runtime behavior.
**Problem:** A local source check does not prove generated hooks resolve the intended package. Consumer callers can still reference moved managed files.
**Solution summary:** Bind a packed candidate and its dependencies, run real hooks against an isolated loopback registry, and retain actual consumer migration receipts. Keep the six existing judgment questions. Park the unfinished comparison evaluator for a proposed 0.13 release.

## PR Intent & comprehension handshake

- **Pull Request (PR) title:** Verify package hooks and document the orly 0.12 migration
- **Intent:** Ship verified installation guidance and package proofs without claiming a new runtime feature or measured model improvement.
- **Handshake:** Published 0.11.0 and the initial 0.12 candidate have identical runtime files. Only the version and unfinished comparison test files differed in the packed comparison.
- **Assumptions:** Publication and merge remain owner actions. Live model calls, new labeling and remote execution stay excluded. The consumer migration stays on its dedicated branch.

## Implementing agent — read these first

1. `src/installation/hooks.ts` — pinned generated hooks and owner-hook refusal.
2. `src/install.ts` — ownership, migration and recovery.
3. `evals/install/run.sh` — existing packed installation checks.
4. `src/setup.test.ts` — existing hook routing coverage and substitute-launcher limit.
5. `evals/release/evaluation-plan.md` — parked comparison design and proof limits.
6. `dispatch/lifecycle.md` — release checks and source-bound evidence.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| This active specification and its eventual `docs/v2/done/` destination | EDIT/MOVE | Record the narrowed release scope and exact owner decision |
| `evals/release/receipts/Oct_06_12_57/` | CREATE | Preserve original comparison requirements, parking identity and measured release receipts |
| `evals/release/package-hooks.ts`, `evals/release/package-registry.ts` | CREATE | Isolated real package and generated-hook checks |
| `README.md`, `llms.txt`, `docs/JUDGMENTS.md`, `docs/architecture/judgment-evaluation.md` | EDIT | Current release scope, migration paths and unchanged judgment catalog |
| `docs/CHANGELOG.md` | CREATE | Documentation changes and explicit runtime limits |
| `evals/release/evaluation-plan.md`, `evals/release/release-report.md` | EDIT | Separate the 0.12 release proof from parked comparison work |
| `evals/release/inventory.json`, `evals/release/reviewed.json` | REGENERATE/EDIT | Bind current source and review coverage |
| `package.json`, `.orly/orly.json` | EDIT | Synchronized 0.12.0 version; lockfile has no version field |

The comparison source and tests are preserved in local Git stash `656ec6b94cdead8e5d18d0e72af6315e79946679`. They are outside this release's working tree, tests and package. The original requirements remain in `evals/release/receipts/Oct_06_12_57/parked-comparison-spec.md`.

## Applicable Rules

- `dispatch/write_ts_adhere_bun.md`: bounded Bun resources and explicit parse validation.
- `dispatch/write_any.md`: file/function bounds, named constants and child cleanup.
- `dispatch/edit_rules.md`: deterministic audit and honest comprehension evidence.
- `dispatch/write_documentation.md`: claims follow observed source and command results.
- `dispatch/verify.md`: declared checks and exact comparison revision.

## Applicable Gates

| Surface | Applies | Proof |
|---|---|---|
| Runtime API or judgment catalog | no | Byte comparison against published 0.11.0 |
| Contributor command | yes | Real package-hook evaluation with negative controls |
| User documentation | yes | README, agent guide, judgment reference and changelog |
| Release version | yes | Package and configuration both report 0.12.0 |
| Schema or remote execution | no | Unchanged; no remote launches credited |
| Spec conflict | resolved | Owner-approved narrowing recorded in Discovery |

## Prior-Art / Reference Implementations

Reuse `evals/install/run.sh` for package preparation and `src/command_process.ts` for owned, bounded subprocess execution. `src/setup.test.ts` demonstrates repository setup but its substitute launcher cannot establish real package resolution. No new runtime abstraction is needed.

## Sections (implementation slices)

### §5 — DONE — Preserve package behavior and deliver 0.12.0 for review

Prerequisites: exact candidate tarball, pinned dependency closure, Bun, Node, Python 3, Git, secret scanner and a disposable local registry. Dependency download needs network access; hook probes serve only locally. No provider credential is needed.

- **Dimension 5.1** — DONE — Prove packaged setup and real generated hooks. Preserve owner bytes, installed references, hook choices and recovery through existing suites. Record actual successful and failing checks, distinguish resolution failure, reject wrong package bytes and incomplete file inventories, and clean owned resources. → Test `package_preserves_ownership_recovery_and_gates`
- **Dimension 5.2** — DONE — Synchronize 0.12.0 metadata and documentation. Record published 0.11.0 equivalence, consumer migration evidence, six unchanged runtime questions and parked comparison work. → Test `release_report_matches_verified_source`
- **Dimension 5.3** — DONE — Measure baseline, run canonical checks, complete review and bind source evidence. Final branch gating and opening the ready Pull Request follow under CHORE(close). → Test `release_evidence_matches_final_source`

## Interfaces

The production command interface remains unchanged. Managed consumer rules live under `.orly/`; root discovery files retain thin pointers. Repository-owned documents and hooks remain with their repository.

The package proof takes an explicit local manifest naming the candidate and exact dependency tarballs with expected digests. It binds a server only on loopback, isolates home/cache/configuration, and runs real `bunx` and generated hooks. It must compare resolved package bytes before crediting a result. Missing package resolution gets no failing-check credit. The evaluation owns temporary files, server and child cleanup.

A consumer using owner hooks updates with `--no-hooks`; caller path changes need repository review. An empty old directory is not a managed file or a duplicate rule source. No broad directory deletion is authorized.

## Failure Modes

| Mode | Handling and negative proof |
|---|---|
| Incomplete file inventory | Independently derive archive metadata and every regular file digest; empty and partial inventories refuse before execution; same proof |
| Wrong package bytes, including the same version | Digest mismatch refuses before hook credit; `package_preserves_ownership_recovery_and_gates` |
| Package cannot resolve | Setup failure; no check marker means no gate-refusal credit; same proof |
| Declared check fails | Hook exits nonzero after the check writes its marker; same proof |
| Edited owner file or interrupted install | Existing refusal and recovery tests preserve bytes; `make install-evals` and `bun test src` |
| Candidate publication unavailable | Consumer pin remains local; release report states the ordering |
| Missing model observations | No accuracy or adoption claim; six questions retained |

## Invariants

- No runtime question or advice threshold changes.
- No gate suppression, synthetic passing receipt or invented model measurement.
- Runtime proof uses the actual candidate and real package runner.
- Publication and merge remain separate owner decisions.
- Parked comparison code is recoverable and receives no completion credit.

## Metrics & Observability

Record package and dependency digests, hook commands, exits, check markers, resolved source identity and cleanup. Record complete repository suite counts and the baseline revision. Keep model quality unavailable; no live calls occur.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts |
|---|---|---|---|
| 5.1 | integration | `package_preserves_ownership_recovery_and_gates` | Correct tarballs reach real checks; wrong bytes and resolution failure get no success credit; resources cleaned |
| 5.2 | manual | `release_report_matches_verified_source` | Compare package metadata, published-package byte diff, consumer receipt and six-question source against all release claims |
| 5.3 | integration | `release_evidence_matches_final_source` | Full declared checks, baseline and review match final source; release gate passes |

## Acceptance Rubric (single scoring surface)

| Outcome | Verify | Expected | Priority | Graded |
|---|---|---|---|---|
| Conformity | `make conform` | Exit 0 | P0 | PASS |
| Declared unit suite | `bun test src` | Zero failed tests; measured baseline delta | P0 | 519 passed; delta zero, runtime unchanged |
| Full deterministic audit | `make audit` | All audit groups pass | P0 | PASS |
| Installation | `make install-evals` | All installation evaluations pass | P0 | 25 passed |
| Real generated hooks | `bun evals/release/package-hooks.ts <MANIFEST>` | Exact bytes; positive and negative check markers; cleanup | P0 | PASS; `package-hooks.json` |
| Offline comprehension | `make llmevals CHECK=1` | Fixtures valid; no live comprehension claim | P0 | 73 valid |
| Secrets and version | `gitleaks detect --redact`; `bin/orly --version` | No leaks; version 0.12.0 | P0 | |
| Final release boundary | `bin/orly gate pr` | Every required criterion green; owner-authorized scope recorded | P0 | CHORE(close); result recorded in Pull Request |

### Behaviour evals

Actual `agentsfleet` migration uses its dedicated worktree and local candidate. Existing owner hooks and commands remain intact; repeat installation writes nothing. This evidence does not establish full application test results or live model accuracy.

## Dead Code Sweep

No production code is added or removed. Parked evaluator sources leave the active test discovery and package inputs. Check README and agent guide for stale publication and path claims.

## Out of Scope

Comparison corpus, independent-label adjudication, candidate scoring and whole-task commander evaluation are parked for proposed 0.13. Native builds, live model requests, remote activation, separate docs-repository edits, merge and publication remain excluded.

## Product Clarity (authoring record)

0.12 is a migration-verification and documentation release. Published 0.11.0 already contains the `.orly/` layout and explicit judgment commands. Upgrading `agentsfleet` from 0.10.14 obtains that behavior; this release claims no new model capability.

## Decomposition & alternatives (patch vs refactor)

Keep the runtime unchanged and add a bounded package proof. A larger evaluator would improve future evidence, but the owner chose to park it. Quality ceiling: reliable real-package checks and accurate migration guidance matter more for this release than new questions without measured benefit.

## Discovery (consult log)

> Indy (Oct 07, 2026; time not recorded): "Okay keep going, just focus on the must have open items to do a migration and evaluate in agentsfleet repo" — context: prioritize package and consumer migration proof.

> Indy (Oct 07, 2026; time not recorded): "Also migrate and evaluate the live agentsfleet checkout" and "you can create your own worktree of agentsfleet" — context: authorize the dedicated consumer migration worktree; no publication or merge.

> Indy (Oct 07, 2026; time not recorded): "Ship migration; park comparison evaluator" — context: remove original comparison Sections 1–4 and their code from 0.12 acceptance; preserve them for proposed 0.13. Original Section 5 package and release proofs remain required.

> Indy (Oct 07, 2026; time not recorded): "Can you ensure the README.md of the the orly is updated?" — context: update user guidance and publication status with the narrowed scope.

> Indy (Oct 07, 2026; time not recorded): "Also you find the changes in the specs as well." — context: keep the specification aligned with the accepted release changes.
