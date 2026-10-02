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

# M07_003: Native changed-line coverage proves execution for Rust and other declared lcov producers

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 003
**Date:** Sep 30, 2026: 09:48 AM
**Status:** PENDING
**Priority:** P1 — test success alone does not show that changed runtime lines ran
**Categories:** Command-Line Interface (CLI), Documentation (DOCS), Infrastructure (INFRA), Agent Skills (SKILL)
**Terms:** Continuous Integration (CI); null-byte-delimited paths; KiB = kibibytes; MiB = mebibytes.
**Batch:** B2 — parallel with M07_002 and M07_004 after the B1 interface revision
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report comparison revision, commands, counts, obligations, and environment
**Depends on:** M07_005 §§1–4 only. Jev is an optional consumer of evidence packets at B3, not a dependency of exact coverage.
**Provenance:** Revised from the Sep 23 draft by Codex after the Rust/Jev direction on Sep 30, 2026; source review at `c02f1e02806204811401b01596a04ff4c039d02a`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §M07 target: one native engine with bounded Jev judgments
**Target version:** 0.12.0; only M07_001 publishes the combined result after required approval.

---

## Overview

**Goal (testable):** The Rust gate runs a declared coverage producer once and identifies measurable changed lines with zero hits using correctly bound fresh lcov evidence.

**Problem:** The current gate reads test-command exit status without line coverage (`src/criteria.ts:118–129`). The draft assumes a Bun transpiler to classify files; that would reintroduce an implementation runtime dependency.

**Solution summary:** Parse lcov and Git changes natively. Treat scope, path identity, freshness, zero hits, and missing evidence separately. Prove the path with a Rust producer and a TypeScript consumer fixture; Jev can assess explicit assertion pairs without changing the exact verdict.

**Determinism boundary:** Rust owns exact facts, validation, execution, and gate status. Jev supplies probabilistic typed semantic answers. Identical validated recorded answers replay reproducibly; fresh inference can vary.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: ship native orly with bounded Jev review`
- **Intent:** Make uncovered changed code visible locally and in the same native CI engine, with no upload required.
- **Authoring handshake:** This is a spec/design revision, not implementation or permission to publish.
- **ASSUMPTIONS I'M MAKING:** lcov is the interchange format. Coverage producers are repository tools, not orly runtimes. A hit proves execution, not assertion quality. No per-test relationship is invented. Missing records cannot silently prove that code is non-runtime.
- **Implementer handshake:** pending until PLAN; restate intent, scope, and source authority before code.

## Implementing agent — read these first

1. `src/criteria.ts` — existing command criteria.
2. `src/surfaces.ts` — branch diff and merge base.
3. `.github/workflows/test.yml` — existing coverage producer usage.
4. `docs/ORLY_ARCHITECTURE.md` — snapshot and producer-evidence identity.
5. https://github.com/taiki-e/cargo-llvm-cov — Rust lcov producer and toolchain requirements.
6. https://github.com/Bachmann1234/diff_cover — changed-line coverage prior art.

## Files Changed (blast radius)

Paths name approved roles. B1 freezes an expanded per-file inventory before implementation; B2 cannot mutate shared files. This document revision touches only pending specs and the canonical architecture.

| File | Action | Why |
|---|---|---|
| src/coverage/ | EDIT / CREATE | Exclusive lcov reader, diff mapper, producer wrapper, and result handler |
| tests/coverage.rs, tests/coverage_journey.rs | CREATE | Exact mapping, provenance, and subprocess journey proofs |
| fixtures/coverage/ | CREATE | Rust and TypeScript consumer projects; malformed/path/missing-line cases |
| docs/fragments/coverage.md | CREATE | Lane-owned coverage setup/reference merged by M07_001 |

## Applicable Rules

- `dispatch/write_rust.md`: ownership, preserved error causes, bounded concurrency, and explicit resource cleanup for the implementation.
- `dispatch/write_any.md` §Porting a codebase between languages: preserve observable guarantees; replace interpreter workarounds with Rust mechanisms.
- `docs/greptile-learnings/RULES.md`: No Dead Code (NDC), Use Standard Parsers (PSR), Prompt-injection Resistance (PRI), Orphan Sweep (ORP), and Tagged Unions (TGU).
- `dispatch/edit_rules.md`: preserve every existing gate obligation; run invariance checks and the comprehension questionnaire when rule semantics change.
- `dispatch/write_spec.md`, `docs/TEMPLATE.md`, and `dispatch/name_architecture.md`: pending metadata, test mappings, and one canonical target design.
- `dispatch/write_documentation.md` and `docs/DOCUMENTATION_RULES.md`: distinguish proposed behavior from observed results; preserve completed historical records.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec template | Yes | Required sections, exact declared commands, mapped Dimensions, and at most 320 lines |
| Rust; file and function length | At implementation | Idiomatic modules; existing caps remain; no unsafe code without a justified reviewed need |
| Governance invariance | At implementation | Golden obligations, negative fixtures, questionnaire, and generated evidence; no weakening to obtain green |
| Named constants; logging; milestone labels | At implementation | Stable reason codes and limits; source/test names describe behavior rather than milestone numbers |
| Architecture and documentation | Yes | Target design in docs/ORLY_ARCHITECTURE.md; user guides land with behavior |
| Workflow or release edits | Only M07_001 | Explicit implementation-session approval before changing automation or publishing |
| Database removal; Zig source; interface tokens | No | No database migration, Zig implementation, or rendered interface |

## Prior-Art / Reference Implementations

Use Git rename-aware null-byte-delimited path discovery plus parsed patch hunks; do not split quoted names by whitespace. The cargo-llvm-cov documentation defines Rust lcov production. Port the observable measure from diff-cover using Rust, rather than adding its Python executable.

## Sections (implementation slices)

### §1 — Exact changed lines and coverage identity

Measure added/modified destination lines from the recorded merge base and evaluated head. Deletions and pure renames contribute no lines. An edited rename uses the destination path; old-path coverage never transfers implicitly. Use the foundation snapshot, preserve filename bytes/case, and refuse unresolved path encodings instead of guessing.

The lcov parser accepts valid non-line records and validates required source-file and line-data records, counts, delimiters, and integers. Resolve relative source paths against the producer's recorded working directory; absolute paths must remain beneath the repository. Reject ambiguous identities and symlink escapes; never match by basename or suffix. Repeated records may merge only for one canonical source identity. Bound report parsing at 64 MiB and one million line records; excess or overflow is a named incomplete failure.

Each changed line is covered when its line-data hit count is positive, uncovered at zero, and unknown when the report has no line record. Report unknown separately. An in-scope file absent from the report fails missing evidence unless a declared verified non-runtime classification explains it. No whole-file non-runtime classification comes from empty transpiler output or Jev. Explicit scope exclusions are configuration decisions shown in evidence, not covered lines. A file with line records and only unknown changed lines is reported incomplete, never passed. Lines outside the declared measurement scope are listed as such.

- **Dimension 1.1** — Edits, deletion, pure/edited rename, Unicode and newline filenames → exact destination lines; old-path hits do not transfer → Test `test_diff_mapping_uses_destination_lines`
- **Dimension 1.2** — Nested working directory, duplicate names/records, symlinks, malformed counts, overflow, and oversized report → exact canonical mapping or named refusal → Test `test_lcov_identity_and_limits_are_strict`
- **Dimension 1.3** — Positive/zero/missing hits, absent file, excluded file, and unknown-only change → distinct counts/states; no guessed non-runtime pass → Test `test_missing_records_never_become_execution_proof`

### §2 — One fresh producer run with bounded provenance

Coverage configuration declares argument vectors, output path, include/exclude globs, and producer identity. Use a unique ignored output directory per run; do not delete an arbitrary configured file. Preflight report destinations: refuse tracked paths, directories used as files, or symlink escapes. Project producers may write declared build outputs inside the scratch execution tree; report-path containment does not claim arbitrary executable write isolation. The wrapper records the configured command digest, engine/payload version, runner identity, source snapshot, configuration, working directory, exit, and exact report digest. Missing fresh output or failed command fails coverage.

Command scheduling deduplicates identical declared invocations. A coverage command that is also the unit command executes once and supplies both records when its evidence requirements agree; otherwise commands remain distinct. Run the producer against the foundation scratch snapshot, not divergent live working-tree bytes. Capture output through that runner, including timeout and cleanup behavior. Read the report only after producer completion and a valid unchanged source check.

External `--lcov` without a producer manifest is reported as unverified. A locally captured matching manifest allows run-identity proof, but is not a signed attestation. CI trusts only a manifest produced by its installed secretless wrapper during that job; checkout-supplied manifests cannot grant passed. Wrong head, source/configuration/runner/report digest, failed exit, merge-ref checkout, or stale outputs cannot satisfy the result. The manifest proves which run produced bytes, not honesty of repository-owned tests.

- **Dimension 2.1** — Duplicate unit/coverage vector, stale report, no output, failing/timeout producer → one eligible invocation and named freshness/failure result → Test `test_coverage_producer_is_fresh_and_runs_once`
- **Dimension 2.2** — Tracked report destination, symlink, foreign directory, and out-of-area report → pre-execution refusal; producer operates on captured scratch source → Test `test_coverage_wrapper_preserves_user_paths`
- **Dimension 2.3** — Bare/matching/wrong head/configuration/runner/report/failed manifest → reported, accepted run identity, or refused identity; repository CI forgery rejected → Test `test_external_manifest_binds_the_evaluated_run`

### §3 — Gate policy and language-independent consumer use

The `diff.covered` handler emits failed for zero-hit measurable changes, missing required file evidence, malformed report, or failed producer. It emits reported/incomplete when changed runtime scope cannot be measured and failed if configured required coverage demands completeness. No coverage configuration, no relevant code change, or explicitly disabled command execution is skipped with its reason. Complete valid measurement with every measurable changed line hit is passed; unknown-line totals remain visible.

Output merges uncovered lines into contiguous ranges. Limit human details to 200 ranges and 64 KiB while retaining totals and full bounded structured evidence. Evidence includes changed, measurable, zero-hit, unknown, excluded, and missing-file counts, run identity, and report digest; no source text. CLI flags expose external evidence without executing the producer in `--no-commands` mode.

Provide explicit producer presets for Rust with `cargo llvm-cov --lcov --output-path <run-output>` and Bun with its lcov reporter, seeded only when the tool and matching manifest are detected. Detecting Cargo.toml does not prove cargo-llvm-cov is installed. Never install a producer from a gate. Other ecosystems declare any native tool writing lcov. Preserve a declared coverage block. Prove the feature with a Rust fixture whose new function is initially uncalled, then called by a test; a separate TypeScript fixture demonstrates consumer support without any TypeScript in orly's runtime.

- **Dimension 3.1** — Uncovered, missing, unknown, fully hit, absent config, no code, and no-command inputs → exact states, caps, and unsuppressed totals → Test `test_diff_covered_states_and_complete_counts`
- **Dimension 3.2** — Detected Rust/Bun producer, missing executable, foreign runner, and existing block → eligible preset or setup diagnostic; no install/overwrite → Test `test_coverage_presets_are_explicit_and_non_destructive`
- **Dimension 3.3** — Real Rust and TypeScript coverage producers → uncalled changed function fails; called function passes with correct head and report identity → Test `test_rust_and_typescript_untested_changes_fail_then_pass`

### §4 — Supply evidence without inventing semantic proof

Emit optional immutable evidence packets containing exact coverage facts and explicitly linked test declarations. M07_002 consumes these at B3 for assertion relevance; missing links stay insufficient rather than inventing attribution. This lane tests the packet schema with static fixtures and builds independently of the provider client.

Do not ask Jev whether a line ran or whether a coverage file is fresh: those are exact facts. Any semantic assessment is a separately labeled reported result. In CI the installed wrapper runs in the secretless event-head job; the optional isolated judge job receives only validated bounded text packets. M07_001 wires both handlers and their evidence into the same binary after the B2 lanes pass.

- **Dimension 4.1** — Line hits with no linked test body → exact facts plus missing semantic evidence; replayed semantic answer cannot alter diff.covered → Test `test_coverage_packets_do_not_claim_test_attribution`

## Interfaces

```text
orly coverage run [--manifest <path>] [--json]
orly gate pr [--lcov <path> --coverage-manifest <path>] [--no-commands] [--json]
coverage config: commands (argument vectors), report, include, exclude, required, producer.
Report states: hit | zero_hit | unknown | excluded | missing_file.
Producer manifest: engine, source, tested_head, tree/config/command/runner/report digests, cwd, exit.
Coverage bytes stay local; optional Jev packets require separate upload authorization.
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Malformed/large report | Invalid record, count overflow, or parser budget | Named failed/incomplete result; test_lcov_identity_and_limits_are_strict |
| Wrong path | Ambiguity, escaping symlink, or old rename path | Refuse inference; test_diff_mapping_uses_destination_lines and test_lcov_identity_and_limits_are_strict |
| Missing evidence | Unloaded file or unknown-only change | Explicit incomplete/failed state; test_missing_records_never_become_execution_proof |
| Producer failure | Nonzero exit, deadline, missing fresh report | Failed with one invocation; test_coverage_producer_is_fresh_and_runs_once |
| Unsafe output | Tracked file or outside output directory | Preserve files and refuse; test_coverage_wrapper_preserves_user_paths |
| Forged/stale external result | Wrong source/report or checkout-supplied CI manifest | Never passed; test_external_manifest_binds_the_evaluated_run |

## Invariants

1. Coverage maps exact canonical destination paths; no basename matching or implicit renamed-file reuse.
2. A positive hit is execution evidence only; no hit or missing record is never invented coverage.
3. Each eligible identical command executes once through the shared scheduler.
4. Producer output is unique and contained; coverage never deletes a user file to establish freshness.
5. Jev cannot change coverage counts, provenance, or the exact verdict.
6. Coverage setup is runner-neutral, local, and explicit when the producer is unavailable.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Local command evidence | operator | Explicit command completes | States, counts, digests, bounded durations | No source, key, environment, or raw output; stays local | `test_diff_mapping_uses_destination_lines` |

Existing anonymous telemetry remains opt-in. Feature review adds no source-bearing event or new analytics funnel. Source-bearing evaluation inputs are private local state or explicitly authorized judge transport.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | unit | `test_diff_mapping_uses_destination_lines` | Edits, deletion, pure/edited rename, Unicode and newline filenames → exact destination lines; old-path hits do not transfer |
| 1.2 | unit | `test_lcov_identity_and_limits_are_strict` | Nested working directory, duplicate names/records, symlinks, malformed counts, overflow, and oversized report → exact canonical mapping or named refusal |
| 1.3 | unit | `test_missing_records_never_become_execution_proof` | Positive/zero/missing hits, absent file, excluded file, and unknown-only change → distinct counts/states; no guessed non-runtime pass |
| 2.1 | integration | `test_coverage_producer_is_fresh_and_runs_once` | Duplicate unit/coverage vector, stale report, no output, failing/timeout producer → one eligible invocation and named freshness/failure result |
| 2.2 | integration | `test_coverage_wrapper_preserves_user_paths` | Tracked report destination, symlink, foreign directory, and out-of-area report → pre-execution refusal; producer operates on captured scratch source |
| 2.3 | integration | `test_external_manifest_binds_the_evaluated_run` | Bare/matching/wrong head/configuration/runner/report/failed manifest → reported, accepted run identity, or refused identity; repository CI forgery rejected |
| 3.1 | integration | `test_diff_covered_states_and_complete_counts` | Uncovered, missing, unknown, fully hit, absent config, no code, and no-command inputs → exact states, caps, and unsuppressed totals |
| 3.2 | unit | `test_coverage_presets_are_explicit_and_non_destructive` | Detected Rust/Bun producer, missing executable, foreign runner, and existing block → eligible preset or setup diagnostic; no install/overwrite |
| 3.3 | e2e | `test_rust_and_typescript_untested_changes_fail_then_pass` | Real Rust and TypeScript coverage producers → uncalled changed function fails; called function passes with correct head and report identity |
| 4.1 | integration | `test_coverage_packets_do_not_claim_test_attribution` | Line hits with no linked test body → exact facts plus missing semantic evidence; replayed semantic answer cannot alter diff.covered |

At implementation, apply the unit-test and integration-test skills to every changed Section. Include negative paths and boundary injection; stubs prove local behavior only. Manual proof names the responsible person and durable release Session Notes. Nothing above is marked run.

## Acceptance Rubric (single scoring surface)

A1/A2 quote the current configuration verbatim and remain required through private B1/B2 development. M07_001 switches configuration/Make recipes to Rust atomically with complete native check registration and old-path deletion at B3; update the five rubric declarations in that same change. Future native commands below are lane acceptance requirements, not commands available in this checkout yet.

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Exact coverage mapping and freshness | `cargo test --locked --test coverage` | exit 0 | P0 |  |
| R2 | Real Rust and TypeScript consumer journey | `cargo test --locked --test coverage_journey` | exit 0 | P0 |  |
| R3 | Bounded coverage packet validation | `cargo xtask coverage-check` | exit 0 | P0 |  |
| A1 | Current declared conformance; Rust implementation replaces internals | `make conform` | exit 0 | P0 |  |
| A2 | Current declared unit lane; atomically replaced at B3 | `bun test src` | exit 0 | P0 |  |
| S1 | Native full unit boundary | `cargo test --workspace --locked` | exit 0 | P0 |  |
| S2 | Governance obligations remain enforced | `make audit` | exit 0 | P0 |  |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 |  |
| S4 | Expanded inventory mapping and exclusive scope | `cargo xtask port-check --map` | exit 0; zero unassigned obligations | P0 |  |

## Dead Code Sweep

No old files are deleted in this feature lane. M07_001 retires the TypeScript implementation inventory. Remove any builder with no coverage/semantic consumer before integration; runtime TypeScript fixtures remain clearly identified consumer test data.

## Out of Scope

- Branch coverage, mutation testing, project-wide percentage targets, or per-test attribution.
- Uploading raw coverage or integrating a hosted coverage service.
- Installing coverage producers, requiring Bun to run orly, or model-classified runtime exemptions.

## Product Clarity (authoring record)

1. **Successful user moment** — A changed Rust function fails coverage until a real test calls it.
2. **Preserved user behaviour** — Repository-native runners remain under the maintainer's control.
3. **Optimal-way check** — A native lcov reader needs no language runtime and supports many producers.
4. **Rebuild-vs-iterate** — Rewrite mapping and producer identity; preserve the observable line-hit guarantee.
5. **What we build** — Parser, changed-line mapper, run wrapper, result handler, presets, and consumer journeys.
6. **What we do NOT build** — No assertion-quality claim from hits, hosted upload, or automatic tooling installation.
7. **Fit with existing features** — Shares snapshot and scheduling with the core; optional evidence can support Jev review.
8. **Surface order** — Command line first; the CI job runs the same binary.
9. **Dashboard restraint** — Ranges and exact counts replace an unexplained percentage.
10. **Confused-user next step** — Use the named setup diagnostic or the reported unexecuted line ranges.

## Decomposition & alternatives (patch vs refactor)

Mapping, producer identity, gate policy, and optional evidence are independent of the Jev client. Keeping a Bun transpiler would contradict the target runtime; Rust exact parsing plus visible unknown states is the chosen replacement.

## Discovery (consult log)

- **Consults** — Verified the current command criteria and diff code. [cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov) documents Rust lcov output. The former Bun-only realization and transpiler-based exemptions are superseded; consumer TypeScript support remains a release proof. Real producer journeys remain pending implementation.
- **Metrics review** — No new analytics funnel. Local diagnostics and the existing consented telemetry retain separate privacy rules.
- **Skill-chain outcomes** — Source/spec adversarial review performed during authoring; native implementation, live calibration, platform journeys, and boundary verification remain pending.
- **Deferrals** — None recorded. The explicit native-command OpenCode guarantee replaces the former executable plugin approach; no missing required release proof is treated as deferred.
