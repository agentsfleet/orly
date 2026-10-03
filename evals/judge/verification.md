# M07_002 implementation evidence

The native judge lane is implemented and its changed behavior is verified.
Owner-reviewed labels and measured live provider quality remain pending.
This report records local runs; it does not claim a green remote pipeline.
Jev is TypeSafe's System One decision model.

## Comparison and baseline

Comparison revision: `e804c6c888ff804183d3a4cc0cb4b60a0d9ebb0e`.
Implementation branch: `feat/m07-jev-judgments`.
Environment: macOS; Linux runtime journeys were not run here.

The comparison tree was exported from that revision into an isolated archive.
Its path is recorded in `/tmp/orly-jev-baseline.path`.
The declared baseline command was `bun test src`.
`/tmp/orly-jev-baseline.log:317` records:

```text
268 pass
0 fail
700 expect() calls
Ran 268 tests across 23 files. [48.23s]
```

`.oracle/orly.json` declares `verify.unit`, with no integration or memory lane.
Those undeclared baseline lanes are not applicable.
Native cross-module proofs are additional evidence, not replacements for the declared boundary.

The supplementary archive command was `cargo test --workspace --locked`.
`/tmp/orly-jev-rust-baseline.log` records 128 passed and three xtask failures.
The archive lacked the frozen comparison Git object required by those tests.
That environmental result is not a passing Rust baseline or a final-branch exemption.
`git ls-tree -r --name-only e804c6c888ff804183d3a4cc0cb4b60a0d9ebb0e tests`
lists foundation and migration tests, with no judge test targets.

## Actual verification runs

| Command | Result | Evidence |
|---|---|---|
| `cargo test --workspace --locked` | Exit 0; 172 passed, zero failed, before review fixes | `/tmp/orly-jev-final-workspace.log`; includes 45 migration tests |
| `cargo test --locked --test judge --test judge_replay --test judge_evals --features judge-transport` | Exit 0; 30 + 10 + 7 = 47 passed, zero failed, after all review fixes | `/tmp/orly-jev-final-changed-tests.log:37`, `:50`, `:66` |
| `cargo clippy --workspace --all-targets --locked --features judge-transport -- -D warnings` | Exit 0 | `/tmp/orly-jev-post-review-clippy.log` |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Exit 0 | `/tmp/orly-jev-post-review-default-clippy.log` |
| `cargo fmt --all -- --check` | Exit 0 | Local command after the final test simplification |
| `git diff --check` and `git diff --cached --check` | Exit 0 | Local commands after source and fragment edits |
| `cargo xtask judge-check` | Exit 0; 12 families, 504 cases, 480 complete labels; owner_reviewed=false | `/private/tmp/orly-jev-review-probes/.qa-evidence/001` |
| `cargo xtask port-check --map` | Exit 0; 220 tracked paths, 110 assigned obligations, zero unassigned paths | `/tmp/orly-jev-port-map.log` |
| `bin/orly gate work` | Exit 0; declared `make conform` passed; all 20 governance checks; no named-constant violations across 198 files | `/tmp/orly-jev-final-work-gate.log`; final staged source |
| `make audit` | Exit 0; 268 passed, zero failed; dispatch 46/0, parity 10/0, ledger 25/0 | `/tmp/orly-jev-audit.log`; before review fixes |
| `make llmevals CHECK=1` | Exit 0; 57 valid fixtures | `/tmp/orly-jev-comprehension-fixtures.log`; dry validation, no live comprehension claim |

The full pre-review workspace run is retained as such.
Post-review changes affect the judge lane, whose complete three targets were rerun.
Untouched migration journeys were not repeated after those fixes.
The final Pull Request gate still owns the declared full verification commands.

Test delta: declared Bun lane 268 to 268, growth zero; native judge targets add 47 tests.
The lane adds Rust code while M07_001 retains ownership of switching declared release verification.
This explains the unchanged Bun count without weakening a gate.

## Unit and integration skill outcomes

Applied `skills/orly-write-unit-test/SKILL.md` by Section and at the boundary.
Applied `skills/orly-write-integration-test/SKILL.md` to the real cross-module paths below.
Stubs prove local provider-boundary behavior; they do not establish Jev accuracy.

| Section and production path | Behavior proof |
|---|---|
| Bank definitions and clause routing; `Bank`, `Definition`, `Handler` | `test_question_bank_covers_declared_semantic_families`; `test_judgment_routing_does_not_inflate_coverage`; handler missing-link regression |
| Native evidence extraction; `EvidenceBuilder`, `SyntaxBuilder`, `SyntaxLink` | `test_builders_preserve_complete_bounded_evidence`; partial, missing, unsupported and oversized inputs |
| Typed wire values; `Question`, `Answer`, `Response` | Mixed primitive consumers; duplicate maps, wrong types/models, incomplete maps and invalid distributions |
| Upload authority; `Authorization`, `UploadPermission`, `AuthorizedRequest`, `CredentialScanner` | `test_judge_authorization_and_scan_are_required`; runtime-key sentinel; actual native scanner ignores repository suppressions |
| Provider boundary; `Transport`, `Client`, `DecisionEngine`, `JevEngine` | Retry/Retry-After/deadline tests; wrong-engine and wrong-model tests; alternate test engine uses the same interface |
| Invocation; `Judger`, `LiveJudger`, `ReplayJudger`, `Invoker`, `Observation` | Pair budget and two concurrent requests; stalled engine expires and keeps request count; scan cannot extend the deadline |
| Replay; `JudgmentStore`, `ReplayStore`, `StoreInput`, `Record` | Exact identity, corrupted/future records, refresh history, eight real competing writers, interrupted atomic write, contended read/write deadlines |
| Retention | Individual expired-run trimming; fresh refresh survives; oldest-run eviction satisfies actual byte budget |
| Foundation adapter; `ReplayJudge::evaluate` | Real Git repository and `GitSnapshotSource` prove the same ignore-local-records policy as the batch judger |
| Composition; `Decider`, `DeclaredPolicy`, `PlanComposer`, `Assessment` | All primitives have consumers; exact mandatory nodes and raw constituents survive; unknown routes and stale records fail |
| Calibration; `TuningCandidate`, `Calibration`, `Calibrator`, `Evaluator`, `Metrics` | Tuning-only threshold selection; incomplete/failed repeats cannot activate policy; question/builder/polarity/provider/model changes reject stale calibration |
| Evaluation inputs; `Corpus`, `ReviewedCorpus`, `AgentReport`, `LiveEvaluator` | Invalid labels, exact frozen Git inputs, independent prediction identity, missing predictions and repeat disagreements |

External integrations remain at their owned boundaries: scanner subprocess, HTTP transport and private file writes.
Tests use real native parsing, Git snapshots, serialization, file locks, atomic replacement and plan validation.
There is no service to exercise with 100 connections; the specified concurrency is two requests.
The test uses eight simultaneous file writers and controlled two-request overlap instead.
Tests use isolated temporary directories and injected environment sources.
No live randomness, Linux execution or memory-profiler measurement is claimed.

## Failure and recovery evidence

| Failure boundary | Asserted result |
|---|---|
| Disabled capability, forbidden blocking, absent key or absent upload permission | No transport request; named authorization error |
| Missing/erroring scanner, request credential, repository suppression | No upload; native engine-owned scan configuration remains authoritative |
| Provider authentication, malformed schema, wrong model or redirect | No eligible retry and no accepted record |
| Eligible transient failure | Bounded attempts/backoff; deadline stops Retry-After beyond remaining budget |
| Changed inference identity or corrupt record | Explicit replay miss, never a quiet finding |
| Atomic write interrupted before replacement | Prior committed answer remains valid; original error source survives |
| Contended read/write lock or stalled engine | Named deadline result; no partial accepted record; lock release restores ordinary writes |
| Expired/full cache | Trim or evict oldest individual runs; retain valid fresh refreshes |
| Changed calibration binding or incomplete/failed held-out data | No policy activation |
| Source prompt injection | No command, approval or gate authority; real model susceptibility still requires manual evaluation |

## Single review and dispositions

One gstack core review and its required native adversarial pass ran.
The user requested one review; no repeated review was used to claim convergence.
Four findings were fixed and their regressions are included in the 47-test run:

| Severity | Finding | Disposition |
|---|---|---|
| P1 | A stalled engine or contended file lock could exceed the invocation deadline | Fixed: invoker timeout, shared storage deadline, nonblocking standard file locks, invocation-owned observations |
| P1 | A threshold could outlive question/provider changes or be used before held-out proof | Fixed: typed tuning candidate, bound identity, three independently passing held-out repeats |
| P2 | Whole-history eviction could delete a fresh refresh with an expired original | Fixed: individual-run expiry/eviction and monotonic ordinals |
| P1 | Foundation replay adapter bypassed ignore-local-records policy | Fixed: both callers use `ReplayJudger::replay` |

Microsoft reference guidelines applied: `M-SIMPLE-ABSTRACTIONS`, `M-FROM-ERROR`,
`M-STRONG-TYPES-GUARD`, and `M-LOG-STRUCTURED`.
Repository error-shell rules take precedence over a generic application-error wrapper.
The generated-rule questionnaire records 180/180 YES in `evals/judge/questionnaire.md`.
`bin/orly update --no-hooks` reported zero written files and three already current.
Removed during refactoring: `EngineRun`, `Judgment`, duplicated calibration pass forwarding,
and cloned replay records. Their behavior is owned by the engine, outcome, metrics or store.
`FnMut` serves repeated upload announcements and lock attempts.
`FnOnce` serves the atomic-write interruption boundary; no callable exists just to tick a language-feature box.

The two command-line smoke probes passed in `/private/tmp/orly-jev-review-probes/report.md`.
The rejected live command returned `judge_authorization_required`, exit 1,
and created neither state nor report. This is the development runner's failure status.
Public command registration and its specified incomplete exit status belong to M07_001.

## Remaining proof and release ownership

Dimension 4.2 is in progress, with no deferral or owner sign-off recorded.
Its required inputs are an owner-reviewed frozen label commit, authorized runtime key,
and independent coding-agent held-out predictions.
The live evaluator must then record tuning and three fresh held-out repeats per family.
No synthetic metric is presented as observed Jev quality.

The lane exports native behavior and the development runner calls it.
`docs/ORLY_ARCHITECTURE.md:197` assigns final routing, docs assembly and release work to M07_001.
Shared dependency/error/runner prerequisites were explicitly approved for this Pull Request.
No workflow, release, current command routing, shared architecture page or sibling repository was edited.
The contributor fragment documents the engine seam and the pending provider evidence.
Pre-existing local `.agents/` and `skills-lock.json` are excluded from this lane's commit.
They remain in the checkout; no cleanliness override has been recorded.
