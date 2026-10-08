# Release verification record

Recorded Oct 07, 2026. Active stream: M11_001, `feat/m11-judgment-comparison`.
The comparison revision is `a09ae05042b66cde67c91c1f326fa1b7e3f5b94e`.
Owner authorizations are recorded in the M11 specification; this report records evidence only.

## Required-test ledger

The `orly-write-unit-test` and `orly-write-integration-test` skills were applied to the changed behavior.
Integration here means real Git, filesystem, installer and process-supervisor boundaries; no datastore is part of this evaluator.
The repository declares `bun test src` as its combined unit lane and no separate integration lane (`.orly/orly.json`).

| Changed unit and failure branches | Proof | Status |
|---|---|---|
| Catalog: runtime digest/model, candidate inventory, schemas and role completeness | `src/judgment_comparison.test.ts` rejects drift, duplicates, missing roles and malformed fields | Verified |
| Cases: source digest, duplicate identity/payload, cross-split origins and missing corpus | `src/judgment_comparison.test.ts` provenance mutations | Verified |
| Labels: independent source, author/reviewer distinction, expected native type, resolved minimum, pending/disputed extras | `src/judgment_labels.test.ts` and `src/judgment_score.test.ts` | Verified |
| Native oracle: evidence controls classification, exact assertion may fail against wrong implementation, missing dependency inventory differs from a demonstrated source gap | `src/judgment_comparison_controls.test.ts` | Verified |
| Historical provenance in shallow checkouts | `frozen_reference_bytes_validate_without_git_history_and_reject_modified_sources` | Verified |
| Metrics: unavailable/invalid attempts, native answer formats, applicability, abstention, empty denominators and conservative false concerns | `src/judgment_score.test.ts` | Verified |
| Adoption: missing independent model/paired evidence, editable provenance, inadequate held-out sample and no runtime registration | `src/judgment_score.test.ts`; no adoption-enabled path exists | Verified |
| Task orchestration: actual installed discovery, exact command receipts, six false completions, five completed controls, one honest block, repeatable outcome report | `hidden_assertions_reject_false_completion_and_preserve_honest_blocks` runs the full offline command twice | Verified |
| Hidden checks: required helper reached; invalid-only mutation rejected by a relevant test; unrelated negative/circular tests fail | `src/judgment_tasks_findings.test.ts` and full offline controls | Verified |
| Missing task execution: every scheduled attempt retained and later attempts continue | `missing_task_attempts_are_retained_without_preventing_later_attempts` injects all twelve failures | Verified |
| Owner allocation, partial allocation, source/receipt tampering, concurrent calls, cancellation-before-start, success/nonzero/deadline/output/interruption cleanup | `src/judgment_tasks.test.ts`, `src/judgment_tasks_recovery.test.ts` | Verified |
| Stale recovery: live owner, unverifiable inspection, foreign path, altered marker and live descendant after group leader exits | `src/judgment_tasks.test.ts`, `src/judgment_tasks_recovery.test.ts` | Verified |
| Consumer: same-version package source changes change identity; malformed/unrelated check output refuses; prior report cannot be overwritten | `src/judgment_tasks_findings.test.ts` | Verified |
| Actual consumer source mutations and restoration | `consumer-fresh-main.json`: 26 attempts, no failures, preservation true, fixed full Make suite completed | Verified |
| Existing installer/layout/owner recovery behavior | `make install-evals`: 25 passed, 0 failed, in `install-corrected.txt` | Verified |

No new runtime provider, hook, gate, installer or native-code behavior is introduced.
No new helper is justified only by a test: evaluator functions are reached through `run.ts` or `consumer.ts`; negative tests exercise their failure boundaries.
Resource evidence concerns owned processes and temporary directories. It is not a native heap-leak measurement.

## Measured baseline

An isolated checkout at the exact comparison revision ran `bun test src`:
536 passed, 0 failed, 2,343 assertions across 53 files (`baseline-unit.txt`).
The source checkout's pre-boundary audit subsequently measured 598 passed, 0 failed,
2,613 assertions across 60 files (`audit-final.txt`). Later targeted review regressions are recorded separately;
the subsequent complete audit measured 601 passed, 0 failed and 2,620 assertions across 60 files (`audit-current.txt`), a test-count increase of 65 over the comparison revision. The Pull Request gate will run the declared suite again.

## Retained unsuccessful attempts

- `initial-offline-failure.json`: invalid extracted fixture text; corrected fixture generation.
- `invalid-git-limits.json`: Git command requested more output than the evaluator permits; corrected the request to the existing bound.
- `initial-conform-failure.txt`: unnamed constants; replaced with named constants.
- `install-initial-environment-failure.txt`: scratch environment resolved tool-manager shims without their home state. `install-corrected.txt` uses actual Bun and Node executable directories in PATH.
- `consumer-initial-timeout.json`: final design-system lane reached the unchanged fifteen-second deadline; source and owner preservation succeeded.
- `consumer-second-incomplete.json`: locale suite reached the same deadline; a later cleanup attempt called kill after supervisor exit. The evaluator now tracks supervisor exit before cleanup.

Failed and missing attempts are evidence, not successful controls. The initial consumer reports remain incomplete; the later successful run is recorded separately.

## Review findings and disposition

Native adversarial review found three original defects: correct inline code could hide an unused helper,
a positive-only test could receive failure-coverage credit, and stale recovery checked only the group leader.
Targeted regression failures were reproduced before the repairs. All three now have discriminating regression tests.

Consumer review required durable reporting through cleanup failure, a complete installed-package identity,
and complete named assertion output rather than crediting an exit code alone. Those source changes are present.
A final native source pass reported no further actionable consumer findings; it did not claim a successful full rehearsal.
The generated-rules questionnaire is preserved in `questionnaire.md`: 186/186 source-supported answers, no live comprehension measurement.

## Final measured candidate

Recorded Oct 08, 2026: 08:21 AM.

- `make audit`: 619 passed, 0 failed, 3,709 assertions across 63 files (`audit-shipping.txt`). Baseline 536; delta +83. Dispatch fixtures: 46/46; parity: 10/10; ledger: 25/25. Generated instructions: 37,414 bytes against a 37,888-byte cap.
- Earlier `bun test src --coverage`: 618 passed, 0 failed; function coverage 97.03%, line coverage 96.48% (`coverage-boundary.txt`). After the guide-scope regression, a contended run recorded 618 passed and one existing cleanup deadline failure (`coverage-contended.txt`); its focused rerun passed 4/4 (`cleanup-recheck.txt`). Final coverage output belongs to the Pull Request Make section.
- Fresh `agentsfleet` worktree at `0c52c2f421c5ad706e0c831831461201dc1828ea`: packed 0.13 rehearsal recorded 26 attempts, no failures and preserved owner/source bytes (`consumer-shipping-package.json`).
- Latest TypeSafe Jev measurement: 188 requests, 68 matching grades, 118 disagreements, 2 unavailable; 129,209 input and 7,209 output tokens (`jev-live.json`). All five candidates remain evaluation-only.
- Source-bound replay: identical attempts, grades and source inventories; 0 new requests (`jev-replay.json`). Earlier observations remain in `jev-initial-live.json` and `jev-provenance-live.json`; no result was dropped or replaced to improve a score.
- Native review found replay ignored saved evaluator digests. `replayJev` now requires exact source inventory; `jev_replay_rejects_missing_changed_or_reordered_source_inventory` rejects missing, changed, duplicated and reordered sources.
- Final-package review also found the rehearsal expected only the config. `validConsumerDiff` now requires exactly the guide plus config and rejects missing or additional files. `consumer-guide-scope-failure.json` preserves the original 26-attempt refusal; `consumer-shipping-package.json` preserves the successful corrected run. Both moved-spec links now resolve to `done/`.
- Required functional probes: corpus check, offline execution, wrong-root rejection, correct-root replay and Jev regression/integration tests. Initial replay evidence: `/private/tmp/orly-013-review-probes/report.md`; final unchanged-source probes: `/private/tmp/orly-013-ship-probes/report.md`.
- Updated consumer branch from `225db4e90d6a7f3fa10bde65433c4b9706b9e92d`: packed `orly update --no-hooks` reports 2 written, 69 current; doctor green. Diff contains only the OpenAPI guide and its managed hash plus version pin. This branch is separate from the measured fixture revision.

Final review, Pull Request boundary and hosted checks are recorded in Pull Request Session Notes when completed. No native heap measurement or autonomous task-improvement result is claimed.
