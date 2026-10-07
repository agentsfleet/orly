---
type: explanation
audience: contributor
verified: 2026-10-07
product_version: 0.12.0
executable: false
---

# Migration verification for 0.12.0

## What it is

This document retains the historical 0.11.0 findings below. Published 0.11.0 already contains the runtime used by the 0.12.0 candidate.

The 0.12.0 release scope is package verification, consumer migration and documentation. The owner parked the comparison evaluator for proposed 0.13 work.
The authorized `agentsfleet` migration is committed locally as `4fd67c465`; publication and merge remain separate owner actions.

The initial packed comparison found identical runtime bytes: only the package version and four unfinished comparison tests differed.
Those tests are now parked with the evaluator, outside the release tree.
Package installation evaluations passed 25 checks; consumer hooks, owner bytes and declared commands survived the update.
The repeat update wrote no files. Offline judgment returned incomplete with zero requests because no exact replay existed.

The deterministic audit passed 519 tests with zero failures. Real generated hooks passed both successful-check and failing-check controls.
The proof refused altered package bytes, incomplete inventories and missing resolution; it cleaned its temporary root and local registry.
See the [current verification record](receipts/Oct_06_12_57/verification.md) and [package proof](receipts/Oct_06_12_57/package-hooks.json).
The final branch gate and hosted checks remain separate release boundaries. No live model accuracy or new candidate benefit is claimed.
See the current M10 specification and the receipts under `receipts/Oct_06_12_57/`.

Historical 0.11.0 evidence and the original follow-up proposal continue below; they do not establish completion of the current release.

## Why it exists

Consumer checks must prove behavior, preserve owner content and report missing evidence honestly.
A model answer cannot approve a change or turn a failed check green.

## How it behaves

### Changes prepared for review

| Change | Behavior | Source |
|---|---|---|
| Installation | Managed content moves under `.orly/`; repository instructions and unknown files keep their owner | `src/install.ts`, `src/loaders.ts` |
| Migration | Recorded digests gate deletion; the journal retains ordered writes, hook settings and cleanup for retry | `src/installation/transaction.ts` |
| Concurrent edits | Original input digests survive staging; a later owner save refuses the update before replacement | `src/install.ts` |
| Hooks | Pinned bunx calls remove the global executable requirement; executable owner hooks require explicit integration | `src/installation/hooks.ts` |
| Supervision | Deadlines and output budgets stop owned process groups; gate cancellation and supervisor signals stop their workloads | `src/command_process.ts` |
| Configuration | Unknown settings refuse at the boundary; command arrays, selected packs and owner choices survive updates | `src/config_validation.ts` |
| Lifecycle | Inspection shares command selection with gates; disabled remote work launches no process and supplies no pass | `src/execution/plan.ts` |
| Completion | Specification items require exact completion markers and item-bound owner acknowledgement for scope cuts | `src/spec_obligations.ts` |
| Audits | Staged-source selection, quoted paths, scanner availability and read records receive filesystem and process checks | `audits/scope.sh`, `src/scanner_scope.test.ts` |
| Evidence | Changed bytes invalidate cached reviews; incomplete forge results cannot establish green reviewer follow-up | `evals/release/inventory.ts`, `src/review_poll.test.ts` |
| Resources | Evaluation runners clean their own roots; package reuse avoids rebuilding the same payload for each request | `evals/install/run.sh`, `evals/llms/cache.ts` |
| Guidance | Rule paths, generated instructions, templates and setup match the source package | `core/operating-model.md`, `dispatch/` |
| Personal log | The requested removal preserves the owner's existing edit privately and removes live references | Finding A18 in `repairs.json` |

The complete finding ledger is [repairs.json](repairs.json); the original findings remain in [audit.md](audit.md).
Named owner exclusions remain recorded there. No scanner suppression or gate weakening is introduced.

### Small shared abstractions

`selectedCommands` supplies both lifecycle inspection and real gate commands.
`contentDigest` supplies installer ownership and recovery checks.
`COMMAND_FILES` supplies the runner and supervisor's receipt filenames from one existing module.

Scanner source selection shares `audit_scope_paths` rather than separate working-tree and index implementations.

No new user setting is needed for the review repairs. The existing remote adapter remains disabled.

### Review repairs and independent regression evidence

| Defect | Repaired behavior | Before and after proof |
|---|---|---|
| Owner save during staging was accepted as the prior content | Original digests stay attached to the planned write; conflicting bytes survive refusal | [Owner regressions before repair](receipts/Oct_05_23_39/review-owner-red.txt); current preservation checks |
| An owner hook stopped running after automatic retargeting | Default and previous hook directories refuse retargeting when an executable owner hook exists | Same red receipt; migration tests assert unchanged hook setting and exact owner bytes |
| Killing the gate left its detached workload running | Supervisor watches its owner and handles stop signals; listeners and timers are released | [Cancellation before repair](receipts/Oct_05_23_39/review-cancellation-red.txt); current supervision checks |
| A failed process receipt write left its already started workload running | Cleanup owns the child immediately after spawning, including setup failures | [Receipt failure before repair](receipts/Oct_05_23_39/review-receipt-red.txt); [nine current runner and supervisor checks](receipts/Oct_05_23_39/review-receipt-green-final.txt) |
| Dotted-version specs escaped user-doc filtering and staged validation | Both selectors follow spec discovery; index contents remain authoritative | [Three failing cases before repair](receipts/Oct_05_23_39/dotted-version-red.txt); nineteen current passing selector cases |

Installed hook paths, migration registration, query cleanup and spec-authoring branch guidance now agree with their canonical sources.
The consumer guide now describes managed paths, refreshed owned imports, refused unresolved links and interrupted-write recovery accurately.
Reviewer completion, threads and summaries now select Greptile consistently, without another setting.
The [individual reviewer dispositions](receipts/Oct_05_23_39/native-inspection/finding-dispositions.md) identify the repaired rows and retain every proof limit.

[The test-quality audit](test-quality-Oct_05_21_14.md) retains the comparison run and earlier independent incorrect-implementation controls.
The original receipt remains historical; current results are recorded in this session's verification report.

### Verification evidence

The exact comparison revision is `41850ee0d2893857c301ce3d07380415c5aa5861`.
Its declared unit command reported 339 passing cases, zero failures and 910 assertions across 35 files.
[Baseline evidence](receipts/Oct_05_21_14/baseline-unit.json) binds the complete output to that revision.

The unit command includes real filesystem, Git, process and local HTTP integration checks; no separate integration lane is declared.

The [audit before the final receipt repair](receipts/Oct_05_23_39/audit-current.txt) reports 509 passed, zero failed and 2,272 assertions across 52 files.
The passing-case increase over the exact comparison revision is 170.
The [package checks](receipts/Oct_05_23_39/install-runtime-path.txt) report 23 passed and zero failed with the installed runtimes on the command path.

The [conformity receipt](receipts/Oct_05_23_39/conform-current.txt) reports zero unnamed-string violations across 104 sources and 37,414 rule bytes against 37,888 allowed bytes.
[Fixture validation](receipts/Oct_05_23_39/fixture-final.txt) reports 73 valid fixtures and no live calls.
The [source questionnaire](receipts/Oct_05_23_39/native-inspection/questionnaire-review.json) records 186 YES answers and zero NO answers.

[Current functional revalidation](review-Oct_06_00_30.md) covers 87 passing cases and 1,001 assertions through real files, Git and processes.
The [working-content secret scan](receipts/Oct_05_23_39/gitleaks-candidate.txt) reports no leaks found.
The final Pull Request **Make** section records candidate review binding, hosted checks and completed reviewer follow-up.
The [bounded review](receipts/Oct_05_23_39/review-cycle-limit.json) stopped after three editing cycles with completion false.
A separate review must certify the finished candidate; that earlier record remains nonconverged.

The unchanged Continuous Integration (CI) coverage floor is 90 percent (`.github/workflows/test.yml`).

[The first current audit](receipts/Oct_05_23_39/audit.txt) reported 498 passed, zero failed and 2,219 assertions before the new review regressions.

[The coverage attempt](receipts/Oct_05_23_39/coverage.txt) reported 497 passed and one cleanup timeout at the existing 20-second deadline.
That attempt measured 95.40 percent line coverage. It is retained as a failed run, not a passing verification result.

[The second instrumented attempt](receipts/Oct_05_23_39/coverage-isolated.txt) reported 506 passed, one cleanup timeout and 95.37 percent line coverage.
No test deadline was increased. The [first package attempt](receipts/Oct_05_23_39/install-current.txt) retains five passed and eighteen failures from a broken scratch-home runtime shim.

The [post-repair audit attempt](receipts/Oct_05_23_39/audit-third-repair-failed.txt) reported 509 passed and one failure at the same cleanup deadline.
Its 510 cases and 2,273 assertions remain failed-run evidence; final boundary results belong in the Pull Request.

### Historical Jev observations and the original 0.12.0 proposal

Jev is TypeSafe's bounded judgment model. The existing six typed questions remain the fixed starting catalog.
[The judgment report](../judgments/report.md) records nineteen historical requests and their failures, uncertainty, duration and token usage.

The real weak assertion passed incorrect behavior; the exact assertion failed that behavior and passed the repair.
These observations demonstrate a useful repair. They do not establish universal model accuracy or calibrated confidence.

1. Trial the published 0.11.0 package in `agentsfleet`, preserving its declared checks and owner files.
2. Observe actual pinned hooks on macOS and Linux after publication; retain package identity and complete outcomes.
3. Evaluate five candidate questions: obligation coverage, evidence sufficiency, production wiring, failure coverage and finding resolution.
4. Use independently labeled healthy, defective, ambiguous and insufficient-evidence cases before adding any question to the runtime.
5. Run complete-task evaluations with hidden independent assertions; report completion and truthful blocking separately.
6. Keep remote work disabled until a real worker proves source binding, limits, cancellation and cleanup.

[The evaluation plan](evaluation-plan.md) supplies detailed candidate questions and the independent evaluation design.
Begin with useful assertion and evidence repairs. Avoid another configuration surface, a combined readiness score or a wider judgment catalog without measured benefit.

## Limits

Further live model calls and native builds remain owner-excluded. No new live Jev request ran in this session.
The dedicated `agentsfleet` checkout was migrated with owner approval; its application suites and live model accuracy are not claimed here.

Local package fixtures do not prove published hooks on both operating systems, hosted publication or arbitrary failures inside each atomic filesystem operation.

Changed tests and fixtures receive summary review by the native reviewer; the parent checks the new regression assertions directly.

The owner excluded telemetry privacy and publication lookup/recovery findings A40, A20 and A21.
Recorded A17 and A18 scope decisions remain intact. No repair or successful publication is claimed for these items.

## Related pages

- [Installation ownership](../../docs/architecture/installation.md)
- [Commander work](../../docs/architecture/remote-execution.md)
- [Repair ledger](repairs.json)
- [Current review and verification evidence](review-Oct_06_00_30.md)
- [Evaluation proposals](evaluation-plan.md)
