---
type: explanation
audience: contributor
verified: 2026-10-06
product_version: 0.11.0
executable: false
---

# Repair review and current verification

## What it is

The approved native reviewer inspected the current repairs and recorded individual dispositions.
Final candidate binding and Pull Request follow-up are recorded in the Pull Request's **Review** and **Make** sections.
This page retains local behavior evidence and the limits of each proof.

## Why it exists

A passing suite cannot close unrelated findings. Historical receipts cannot certify changed bytes.
The [finding dispositions](receipts/Oct_05_23_39/native-inspection/finding-dispositions.json) record each of the 53 findings separately.

The [questionnaire map](receipts/Oct_05_23_39/native-inspection/questionnaire-review.json) records 186 YES answers, zero NO answers and prior disagreement history.
This is source comprehension inspection. It is not a live model-comprehension result.

## How it behaves

### Findings repaired during this session

| Severity | Defect and source | Repair and evidence |
|---|---|---|
| P1 | Late staging digests accepted an owner save: `src/install.ts:40` | Original digests retained; exact-byte regression refused conflicting configuration and both instruction destinations |
| P1 | Automatic retargeting disconnected executable owner hooks: `src/installation/hooks.ts:21` | Inspect default and previous directories; refuse retargeting; retain hook setting and owner bytes |
| P2 | Gate cancellation left detached work running: `src/command_process.ts:48` | Owner liveness and stop signals stop the group; cleanup releases timer and listeners |
| P2 | Receipt setup could orphan an already spawned child: `src/command_process.ts:44` | Cleanup begins immediately after spawn; a real receipt-write failure leaves no surviving workload |
| P2 | Dotted-version specifications escaped filtering and staged validation: `src/surfaces.ts:10`, `audits/spec-template.sh:54` | Match discovery grammar; retain three failing cases before repair and nineteen current passing selector cases |
| P2 | Installed hook path disagreed with implementation: `README.md:141` | Name `.orly/hooks/`; source and packed setup agree |
| P2 | Migration and cleanup guidance contradicted canonical rules: `dispatch/write_sql.md`, `dispatch/write_zig.md:298` | Preserve canonical registration and drain-before-release, including wrapper cleanup |
| P2 | Spec authoring named `main` while its skill detected the default branch: `core/operating-model.md:172` | Use the detected default branch and regenerate instructions |
| P3 | Consumer ownership and recovery claims were stale: `README.md:133` | Describe managed paths, refreshed owned imports, link refusal and journaled interruption accurately |
| P3 | Integration guidance rejected wrapper-owned draining: `skills/orly-write-integration-test/SKILL.md:396` | Keep drain-before-release on every exit and require only actually declared checks |
| P3 | Reviewer completion selected a configurable bot while triage selected Greptile: `skills/orly-babysit-prs/SKILL.md:184` | Remove the completion-only override; completion, threads and summaries consistently select Greptile |

The parent read the new regression assertions and repair collaborators directly.
The native reviewer inspected production and governance source; remaining fixture payloads received summary review.
The [individual disposition report](receipts/Oct_05_23_39/native-inspection/finding-dispositions.md) preserves that coverage boundary.
The [bounded attempt](receipts/Oct_05_23_39/review-cycle-limit.json) stopped after three editing cycles with completion false.
Its [native findings](receipts/Oct_05_23_39/native-inspection/final-attempt-nonconverged.json) do not certify the repaired bytes.
The Pull Request must carry a separate completed review of the finished candidate.

## Exploratory QA and Verification Results

Quality Assurance (QA) uses existing native tests with owned disposable fixtures.

| Field | Value |
|---|---|
| Date / branch / revision | 2026-10-06 / `feat/m09-verified-012` / `4be34f70a14ffdffa6b26bbdaac4111379771817` plus current candidate bytes |
| Caller / authority / depth | Parent gstack review; report-only discovery, approved implementation repairs |
| Surfaces / scope | Installation, migration, command supervision, source and index selection |
| Runtime / native tools | Bun 1.4.2, Git, actual filesystem and process effects |
| Fixture ownership / destinations | Test helpers own temporary repositories and children; no live consumer or publication |
| Probe budget / stop reason | Original smoke: five minutes, at most twelve probes; expired without reset; required revalidation uses finite command limits |

### Behavior outcomes

| Required behavior | Exact current probe | Observed effects and output | Outcome |
|---|---|---|---|
| Preserve owner saves during staging | `bun test src/installation_preservation.test.ts`; capture 006 | Exact owner bytes retained on refusal; no journal; 4 passed, 0 failed, 23 assertions | pass |
| Stop owned work on setup failure, cancellation, signals and limits | `bun test src/command_process.test.ts src/command_runner.test.ts`; final-review capture 001 | Failed receipt writes and all stop paths leave no surviving workload; 9 passed, 0 failed, 50 assertions | pass |
| Preserve hooks and recover ordered migration | `bun test src/installation/migration.test.ts`; capture 008 | Hook setting and exact owner bytes retained; declared interruption points recover; 36 passed, 0 failed, 812 assertions | pass |
| Use dotted spec paths and indexed bytes | `bun test src/surfaces.test.ts src/spec_template_io.test.ts`; capture 009 | Invalid staged content refuses despite working-copy repair; valid index survives unstaged damage; 19 passed, 0 failed, 52 assertions | pass |
| Bind completion and every feedback surface to Greptile | `bun test src/review_poll.test.ts`; final-review capture 005 | Real extracted shell snippets refuse an unsupported completion override and incomplete evidence; 19 passed, 0 failed, 64 assertions | pass |

The producer's [unchanged checks](receipts/Oct_05_23_39/review-qa/required-checks/evidence.json) retain preservation, migration and selector results.
Capture 007 is historical after the setup-cleanup repair; [capture 010](receipts/Oct_05_23_39/review-qa/receipt-revalidation/evidence.json) revalidated supervision and runner limits.
The separate [finished-candidate checks](receipts/Oct_05_23_39/review-qa/final-review/evidence.json) repeat all four commands: 68 passed, zero failed, 937 assertions.
Their charter binds current source hashes. The earlier review remains nonconverged; its smoke clock was never reset.
[Bot-selection revalidation](receipts/Oct_05_23_39/review-qa/final-review/bot-selection-revalidation/evidence.json) covers the subsequent guide repair.
The complete current selection is 87 passed, zero failed and 1,001 assertions across five commands.
The original [smoke evidence](receipts/Oct_05_23_39/review-qa/evidence.json) remains historical after affected input changes.
Its captures 001 and 002 were already superseded by 003 and 004; current checks are 006, 008, 009 and 010.

### Discoveries and checkpoints

Every checkpoint was produced before its named next probe.
Original smoke history remains intact:

- [Checkpoint 002](receipts/Oct_05_23_39/review-qa/exploration-002.json): after preservation, examine command cleanup.
- [Checkpoint 003](receipts/Oct_05_23_39/review-qa/exploration-003.json): repeat preservation after the repair.
- [Checkpoint 004](receipts/Oct_05_23_39/review-qa/exploration-004.json): repeat command cleanup after the repair.
- [Checkpoint 005](receipts/Oct_05_23_39/review-qa/exploration-005.json): examine adjacent migration behavior.

Current required revalidation:

- [Checkpoint 007](receipts/Oct_05_23_39/review-qa/required-checks/exploration-007.json): preserved owner bytes lead to cancellation and signal assertions.
- [Checkpoint 008](receipts/Oct_05_23_39/review-qa/required-checks/exploration-008.json): successful supervision leads to migration and hook preservation.
- [Checkpoint 009](receipts/Oct_05_23_39/review-qa/required-checks/exploration-009.json): successful migration leads to corrected dotted-spec selectors.

Separate finished-candidate review:

- [Checkpoint 002](receipts/Oct_05_23_39/review-qa/final-review/exploration-002.json): process setup cleanup leads to exact owner-byte preservation.
- [Checkpoint 003](receipts/Oct_05_23_39/review-qa/final-review/exploration-003.json): preserved owner saves lead to hooks and migration recovery.
- [Checkpoint 004](receipts/Oct_05_23_39/review-qa/final-review/exploration-004.json): migration results lead to authoritative dotted-spec and index checks.

### Independent failure evidence

[Owner preservation before repair](receipts/Oct_05_23_39/review-owner-red.txt) records the initial five failed regressions.
[Cancellation before repair](receipts/Oct_05_23_39/review-cancellation-red.txt) records the surviving-workload failure.
[Dotted selectors before repair](receipts/Oct_05_23_39/dotted-version-red.txt) records three failures; the matching corrected checks pass in capture 009.
[Receipt setup before repair](receipts/Oct_05_23_39/review-receipt-red.txt) records the surviving workload; capture 010 passes after the cleanup repair.
[Bot selection before repair](receipts/Oct_05_23_39/bot-selection-red.txt) fails the independent override assertion; capture 005 passes the corrected guide.

The [earlier test-quality audit](test-quality-Oct_05_21_14.md) retains six separate incorrect-implementation controls and the exact comparison revision.
Those controls retain their historical source identity. Current repairs receive the fresh regression and source inspection evidence above.

## Limits

Required fixture tests clean their own temporary state and stop their owned children.
Review reports and private comparison copies remain retained for replay. No user cache, worktree or installed runtime is removed.

Live model calls, native builds and the live consuming-repository trial remain excluded by recorded owner instructions.
Publication, both-platform published hook invocation and arbitrary failures inside atomic writes remain unobserved.
Outside model review was excluded; the one approved native reviewer supplies the required in-host pass.

Two local instrumented suite attempts hit the unchanged twenty-second ledger cleanup limit.
They remain failed runs, even though their measured line coverage exceeds the unchanged ninety-percent floor.
The subsequent canonical audit also hit that cleanup limit: 509 passed and one failed, with all 510 cases retained in its receipt.
Actual hosted checks and complete reviewer polling must be reported before declaring the Pull Request ready to merge.

## Related pages

- [Release changes and proposed 0.12.0 work](release-report.md)
- [Repair ledger](repairs.json)
- [Earlier test-quality audit](test-quality-Oct_05_21_14.md)
