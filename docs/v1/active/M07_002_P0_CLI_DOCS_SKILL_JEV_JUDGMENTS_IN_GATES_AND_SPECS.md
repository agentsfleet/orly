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

# M07_002: Jev Choice, Noul, and Score compile bounded repository decisions in Rust

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 002
**Date:** Sep 30, 2026: 09:48 AM
**Status:** IN_PROGRESS
**Priority:** P0 — Jev is a required built-in capability of the single release
**Categories:** Command-Line Interface (CLI), Documentation (DOCS), Infrastructure (INFRA), Agent Skills (SKILL)
**Terms:** Continuous Integration (CI); null-byte-delimited paths; KiB = kibibytes; MiB = mebibytes.
**Batch:** B2 — parallel with M07_003 and M07_004 after the B1 interface revision
**Branch:** feat/m07-jev-judgments
**Baseline revision:** e804c6c888ff804183d3a4cc0cb4b60a0d9ebb0e
**Test Baseline:** pending — measure unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report comparison revision, commands, counts, obligations, and environment
**Depends on:** M07_005 §§1–4 only. Coverage and rule delivery provide optional evidence at B3 integration, never prerequisites for this lane.
**Provenance:** Revised from the Sep 23 draft by Codex after the Rust/Jev direction on Sep 30, 2026; source review at `c02f1e02806204811401b01596a04ff4c039d02a`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §M07 target: one native engine with bounded Jev judgments
**Target version:** 0.12.0; only M07_001 publishes the combined result after required approval.

---

## Overview

**Goal (testable):** Choice, Noul, and Score turn repository evidence into constrained, inspectable, replayable decisions that Rust composes into useful project-specific plans.

**Problem:** The dispatch library prints judgment prompts without a recorded decision (`dispatch/lib.sh:236–239`). Spec validation proves structure (`audits/spec-template.ts:67–95`), while the old draft limits Jev to a small bank and leaves broad judgment promises unevaluated.

**Solution summary:** Treat Jev primitives as typed programming values throughout the engine: classify intended work with Choice, assess independent semantic conditions with Noul, and rank evidence or rule relevance with Score. Rust constructs candidate sets, validates distributions, composes results, and records an executable plan; inference is never parsed from prose.

**Determinism boundary:** Rust owns exact facts, validation, execution, and gate status. Jev supplies probabilistic typed semantic answers. Identical validated recorded answers replay reproducibly; fresh inference can vary.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: ship native orly with bounded Jev review`
- **Intent:** Make Jev useful across the important semantic gaps without handing it approvals, gate authority, filesystem paths, or command construction.
- **Authoring handshake:** This is a spec/design revision, not implementation or permission to publish.
- **ASSUMPTIONS I'M MAKING:** Jev means the TypeSafe System One model, not a Rust interpreter or reasoning agent. Fresh inference is probabilistic. Exact validated recorded answers make replay reproducible. Live upload is explicit; offline gates read matching records only.
- **Implementer handshake:** Typed Jev answers support bounded semantic plans; Rust retains exact checks, approval, execution, and exit authority. The approved shared prerequisite changes and lane implementation land in one Pull Request.

## Implementing agent — read these first

1. `dispatch/lib.sh` — existing judgment routing and glosses.
2. `audits/spec-template.ts` — structural spec checks that stay deterministic.
3. `docs/RULE_ENFORCEMENT.md` — current classification limits.
4. `docs/ORLY_ARCHITECTURE.md` — M07 interfaces, privacy, and execution boundary.
5. https://docs.typesafe.ai/api — current question and answer wire shapes.
6. https://docs.typesafe.ai/models — pinning and limits.
7. https://docs.typesafe.ai/cookbooks/citation_check — claim/evidence decomposition.

## Files Changed (blast radius)

Paths name approved roles. B1 freezes an expanded per-file inventory before implementation; B2 cannot mutate shared files. This document revision touches only pending specs and the canonical architecture.

| File | Action | Why |
|---|---|---|
| src/judge/ | EDIT / CREATE | Exclusive runner, HTTP client, builders, scan boundary, replay, and evaluation policy |
| questions/, fixtures/questions/, evals/judge/ | CREATE | Question definitions, bounded examples, labeled splits, and reports |
| tests/judge.rs, tests/judge_replay.rs, tests/judge_evals.rs | CREATE | Provider-boundary, replay, and calibration proofs |
| tools/xtask/src/judge.rs | CREATE | Offline corpus validation and explicit live evaluation |
| docs/fragments/judge.md | CREATE | Lane-owned setup/reference fragment merged by M07_001 |
| Cargo.toml, Cargo.lock, src/error.rs, tools/xtask/src/main.rs | EDIT | Approved prerequisite: syntax parsers, preserved causes, judge-check registration |

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

TypeSafe provides Choice, Noul, and Score answers. Use the HTTP API directly from Rust; no JavaScript or Python client runtime. The citation-check cookbook supplies a bounded evidence pattern. Same-state questions are independent; Rust combines results after validation. Read the current primitives and all three primitive pages, not only the generic endpoint: [Choice](https://docs.typesafe.ai/primitives/choice), [Noul](https://docs.typesafe.ai/primitives/noul), and [Score](https://docs.typesafe.ai/primitives/score).

## Sections (implementation slices)

### §1 — A mapped question bank covers real semantic gaps

Ship the question families below as compiled resources with Identifier (ID), version, input-builder version, evidence requirements, criterion options, finding polarity, source clause, consumer, and tuning/held-out examples. Every Choice includes `insufficient_evidence` and a quiet outcome. Noul returns only its yes probability; no invented confidence field. Score ships only with ordered levels and an actual consumer. Choose the primitive by the decision semantics; every primitive has a real plan/review consumer.

The bank covers: concrete spec preconditions; observable expected results; assertion-to-Dimension relevance; exclusions contradicting required scope; one behavior per Dimension; touched-code error-path completeness; resource ownership/cleanup consistency; added compatibility indirection; documentation claim support; repository architecture consistency; and additional rule-section relevance. Rust handles structural facts and exact lookup before Jev sees the bounded semantic pair.

For test relevance, supply an explicitly linked test declaration and full assertion body plus the required behavior and changed function; do not infer that lcov proves per-test attribution. For architecture, include the selected canonical sections and full touched declaration; missing scope means insufficient evidence. Builders preserve syntax/relationship boundaries. Unsupported language extraction, missing test links, absent reference docs, oversized context, or incomplete source produces an item-level incomplete result, never a quiet finding. Implement initial syntax-aware code/test builders for Rust and TypeScript, using pinned Rust-native parser crates rather than an external compiler subprocess; other consumer languages retain deterministic checking and explicit semantic-builder availability.

Every old judgment code has an owner: exact Rust predicate, evaluated Jev question, human authority, or broad review. A routing entry never asserts all clauses sharing a code are judged. Rule applicability is computed in Rust; Jev may add candidate sections only.

Primitive composition is a shipped requirement:

| Primitive | Repository decision | Rust consumer |
|---|---|---|
| Choice | Work intent among owner-declared categories; scope contradiction; evidence-supported handling choice | Select a known recipe or record no-match/insufficient evidence; never generate a command |
| Noul | Independent predicates: semantic security impact, public behavior change, missing failure handling, additional test need | Add named review/check requirements using any-serious-condition logic; probability near 0.5 becomes uncertain, never medium severity |
| Score | Relevance of candidate rule sections and strength of an explicitly paired test assertion | Rank existing candidates against ordered descriptive levels; preserve raw distributions and calibrated thresholds |

For Choice include all known relevant categories plus no-match and insufficient outcomes. When several labels may apply, ask independent Nouls rather than force one exclusive Choice. Score levels describe one dimension only; missing input is handled before scoring. Do not ask Jev to compute a Git diff, detect a known file extension, or parse coverage counts. State contains named facts, references, and candidate identities; each instruction names its evidence fields. Independent questions sharing that state run in one mixed-primitive batch. Use a second request only when the first answer determines evidence that must be fetched; otherwise speculative fan-out supplies the possible branches together.

Bounded decision effects make Jev central rather than a decorative report. Valid calibrated answers may choose an existing owner-declared recipe, add checks/review routes, prioritize candidate rule delivery, and classify semantic scope. They cannot remove mandatory exact checks. Rust ignores uncertain speculative answers on unused branches and records uncertainty on consumed branches. Weighted preferences are allowed for ranking; security/authority requirements use separate conditions and cannot be averaged away. All plans expose which raw answers and policy rules caused each node.

- **Dimension 1.1** — Each family → valid options, builder, consumer, source clause, and labeled positive/negative/missing cases; incomplete entries fail → Test `test_question_bank_covers_declared_semantic_families`
- **Dimension 1.2** — Rust/TypeScript function/test pairs and missing/oversized/unsupported cases → complete syntax-aware evidence or item-level incomplete; no fabricated attribution → Test `test_builders_preserve_complete_bounded_evidence`
- **Dimension 1.3** — Shared code with one mapped clause → only that clause listed; approval/override requests remain human-owned → Test `test_judgment_routing_does_not_inflate_coverage`
- **Dimension 1.4** — Mixed Choice/Noul/Score batch → known recipe, independent review additions, and ordered candidate ranking; no-match/uncertainty do not fabricate facts → Test `test_all_three_primitives_have_real_plan_consumers`
- **Dimension 1.5** — High relevance plus serious security signal → security route retained; unused speculative uncertainty ignored; no weighted safety cancellation → Test `test_primitive_composition_preserves_serious_conditions`

### §2 — Authorized requests have fixed budgets and validated answers

The client calls `POST https://api.typesafe.ai/v1/systemone` with `model`, `state`, and a map of `questions`; bearer authentication comes from `TYPESAFE_API_KEY`. Pin `jev-1.13.0` and reject a mismatching returned model. No moving alias is used for release evidence. Pinning controls version identity, not answer reproducibility. Before implementation recheck the cited API and fail explicitly if the pinned model is unavailable.

Configuration enables the capability; a runtime key and explicit out-of-tree `--allow-upload` authorize live use. Configuration alone never grants upload. A judge invocation runs no repository commands or repository-provided plugins. It reads a bounded immutable snapshot; remote CI judging uses M07_001's separate secret-bearing job. Removing the key from subprocess environments is defense in depth, not process isolation. A machine already executing arbitrary code under the same account is outside this local trust boundary.

Scan the complete canonical request, including question text, with engine-owned credential patterns and a native gitleaks executable using engine-owned configuration. Scanner absence, findings, or errors prevent upload. Scan results reduce accidental disclosure; they do not certify source secrecy. Never let repository suppressions control this upload scan. Print destination and source categories before the call; store no raw request in evidence or telemetry.

Default local limits: 16 KiB state, 24 KiB serialized request, 128 question/input pairs per invocation, 16 pairs per same-state batch, two concurrent requests, three attempts per request, and 30 seconds total including scan and retries. Byte budgets and provider token budgets are distinct. Reserve prompt overhead; provider context rejection is incomplete, never silent truncation or a proof the byte limit guarantees token fit. Never split a semantic pair to fit. Excess pairs remain incomplete. Respect Retry-After for 429 and retry 529/transport failures with bounded 250 ms and 1 second backoff; no retry for 401/403/422 or schema errors. A response body cap of 1 MiB and strict typed validation reject missing, extra, non-finite, out-of-range, wrong-type, wrong-model, or invalid-distribution answers. No redirects carrying credentials; fixed provider endpoint only.

- **Dimension 2.1** — Each missing authorization, dirty request, missing/erroring scanner, and repository suppression → zero provider requests and named reason → Test `test_judge_authorization_and_scan_are_required`
- **Dimension 2.2** — Stub failures, Retry-After beyond deadline, flood, incomplete maps, wrong type/model, and invalid probabilities → bounded incomplete result; valid answer accepted → Test `test_client_limits_retries_and_validates_answers`
- **Dimension 2.3** — Hostile project command/plugin and key sentinels → no execution, no key in records/diagnostics, and no redirect upload → Test `test_judge_never_runs_repository_code_or_leaks_key`

### §3 — Exact replay supplies reproducible advisory policy

Canonicalize with a versioned stable encoding and ordered keys; identity covers the whole request batch, model, every instruction/criterion, builder revision, evidence snapshot, question/input identity, and inference-affecting candidate membership. Reducer thresholds, weights, and check-routing policy are excluded from inference identity and included in the plan digest, so policy changes can reuse raw answers. Store validated typed results under worktree-local Git state. Each item points to its batch digest and own question/input pair. Concurrent writes use an exclusive per-key lock and atomic replacement. Broken records are rejected; default retention is 30 days and 32 MiB, evicting oldest records deterministically. Explicit refresh creates a new run record without overwriting the original response chosen for an existing replay identity; show which run was selected.

`orly judge --replay-only` performs no network call and needs no key. Changed request membership, evidence, model, question, or builder invalidates replay. `gate`, native hooks, and runtime adapters always use replay-only behavior. Records prove reproducibility of a local decision, never remote provenance or truth. CI ignores repository-supplied records. Lower-confidence or incomplete inputs stay visible individually; aggregation cannot average away a finding.

All semantic review criteria remain `reported` in 0.12.0; the gate exit status is determined by Rust's exact checks. Explicit judge commands return exit 2 for an incomplete authorized evaluation, so a user cannot confuse an outage with successful judgment. No configuration enables model-only blocking. Rule-selection additions require the calibrated question's documented threshold and valid candidate identifiers; questions without a calibrated threshold remain reported suggestions. Owner approval, suppressions, overrides, deferrals, migration edits, and command vectors never come from Jev.

- **Dimension 3.1** — Identical canonical batch → zero calls; each changed field or corrupt record → stale; refresh preserves prior answer and records selected run → Test `test_replay_identity_is_complete_and_offline`
- **Dimension 3.2** — Finding, quiet, uncertain, missing, and replayed pairs in varied order → all retained; deterministic failure and exit authority unchanged → Test `test_advisory_policy_preserves_all_constituents`
- **Dimension 3.3** — Concurrent writers, interrupted rename, expired and full cache → valid records or explicit miss; no partial accepted record → Test `test_replay_store_handles_concurrency_and_retention`

### §4 — Freeze labels and measure usefulness before release

Validate the bank and evaluation corpus offline with `cargo xtask judge-check`. For each shipped family commit at least 20 tuning and 20 held-out examples with labels and required evidence before evaluator output. The repository owner validates labels; label author and reviewed commit are recorded without inventing sign-off. Include quiet cases, incomplete evidence, contradictory scope, benign lookalikes, and injected instructions requesting an allowed quiet answer.

Run Jev and the coding agent independently on identical frozen evidence. Freeze each question's metric and ground truth with its consumer: Choice uses the reviewed category including no-match; Noul uses positive/quiet labels; Score uses ordered levels and, for ranking, reviewed candidate pairs. Repeat every held-out request three times with refresh; each repeat must pass independently, and report cross-repeat disagreement separately. Abstention includes insufficient evidence, unresolved confidence, and provider incompleteness; quiet/no-match is a substantive answer. Report raw numerators/denominators, coverage, false findings, missed findings, unique useful findings, tokens, requests, and end-to-end latency.

For every Choice question require at least 90% correct labels among substantive answers and 80% substantive answers among complete labeled examples. For every Noul question require at least 90% actionable precision (true positives / all predicted positives), 80% recall (true positives / all labeled positives, including abstentions), and 80% substantive answers. For every Score question require at least 90% substantive answers within one ordered level and 80% substantive coverage; ranking consumers additionally require 90% pairwise ordering agreement on reviewed unequal-level pairs, with predicted ties counted wrong. A Score threshold driving a binary addition also meets the Noul precision/recall criteria. Every applicable denominator must be nonzero; absent labels, predicted positives, or unequal ranking pairs fail release. Include both positive and quiet cases per binary question. Release requires all consumed questions' complete reports and zero forbidden-authority decisions. These are chosen thresholds, not measured accuracy claims; failure returns to tuning and a new uncontaminated held-out set.

Rule additions use a per-question threshold selected on tuning data and validated on the held-out split. Human review of false positives and negatives remains required. Stub-based tests prove client and policy behavior; a live report proves the provider integration and observed usefulness. Missing credentials or label review can block release while offline implementation continues. M07_001 assembles the skill/template commands and the native binary entry point; this lane exposes typed handlers without editing shared routing.

- **Dimension 4.1** — Bank, splits, label history, and injected/quiet cases → complete corpus validated with no network → Test `test_judge_evaluation_corpus_and_offline_validation`
- **Dimension 4.2** — Owner validates label commit; implementer records independent live runs and repeats → thresholds, raw counts, and disagreements in release Session Notes → Test `manual_judge_labels_and_held_out_report`

## Interfaces

```text
orly judge [--staged | --base <commit>] [--spec <path>] [--allow-upload] [--refresh] [--json]
orly judge --replay-only [--staged | --spec <path>] [--json]
orly judge --snapshot <path> --allow-upload --json
orly judge --calibrate [--check]
judge config: provider=typesafe; model=jev-1.13.0; blocking=false (true is rejected).
Question output: typed answer, probabilities where defined, returned model, source digest, replay/run identity.
Incomplete evaluation: named item status; explicit command exit 2; gate criterion reported.
Provider key comes only from the environment in the authorized judge process.
orly assess [--staged | --base <commit>] [--allow-upload] [--replay-only] [--json]
DecisionEnvelope → pure Rust policy reducer → DecisionPlan; selected nodes reference declared identifiers.
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Authorization absent | Configuration, key, or out-of-tree permission missing | Zero requests; test_judge_authorization_and_scan_are_required |
| Unsafe upload | Scanner unavailable/erroring or credential finding | Nothing sent; test_judge_authorization_and_scan_are_required |
| Missing semantic scope | Absent test link, unsupported extraction, or oversized pair | Item incomplete, not quiet; test_builders_preserve_complete_bounded_evidence |
| Provider/schema failure | Authentication, quota, deadline, malformed map, or wrong model | Bounded retry only where allowed; test_client_limits_retries_and_validates_answers |
| Stale/corrupt replay | Changed request or interrupted/concurrent record | Reject and report missing; test_replay_identity_is_complete_and_offline |
| Prompt injection | Source asks for an allowed quiet answer | No authority granted; cases scored; test_judgment_routing_does_not_inflate_coverage and manual_judge_labels_and_held_out_report |

## Invariants

1. Rust owns applicable scope, evidence construction, validation, aggregation, and exit authority.
2. No upload without all authorization and scan conditions; the client accepts only a scanned authorized request value.
3. No model output supplies executable text, paths, credentials, overrides, or owner approval.
4. Replay identity includes the complete canonical batch and source identity; local records are never attestations.
5. Every semantic family has a builder, consumer, clause mapping, and frozen evaluation cases.
6. Offline gates and adapters open no provider connection; live judging runs no repository commands.
7. Every shipped primitive has a typed plan/review consumer; raw judgments and policy decisions remain separately inspectable.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Local command evidence | operator | Explicit command completes | States, counts, digests, bounded durations | No source, key, environment, or raw output; stays local | `test_question_bank_covers_declared_semantic_families` |

Existing anonymous telemetry remains opt-in. Feature review adds no source-bearing event or new analytics funnel. Source-bearing evaluation inputs are private local state or explicitly authorized judge transport.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | unit | `test_question_bank_covers_declared_semantic_families` | Each family → valid options, builder, consumer, source clause, and labeled positive/negative/missing cases; incomplete entries fail |
| 1.2 | integration | `test_builders_preserve_complete_bounded_evidence` | Rust/TypeScript function/test pairs and missing/oversized/unsupported cases → complete syntax-aware evidence or item-level incomplete; no fabricated attribution |
| 1.3 | unit | `test_judgment_routing_does_not_inflate_coverage` | Shared code with one mapped clause → only that clause listed; approval/override requests remain human-owned |
| 1.4 | integration | `test_all_three_primitives_have_real_plan_consumers` | Mixed Choice/Noul/Score batch → known recipe, independent review additions, and ordered candidate ranking; no-match/uncertainty do not fabricate facts |
| 1.5 | unit | `test_primitive_composition_preserves_serious_conditions` | High relevance plus serious security signal → security route retained; unused speculative uncertainty ignored; no weighted safety cancellation |
| 2.1 | integration | `test_judge_authorization_and_scan_are_required` | Each missing authorization, dirty request, missing/erroring scanner, and repository suppression → zero provider requests and named reason |
| 2.2 | integration | `test_client_limits_retries_and_validates_answers` | Stub failures, Retry-After beyond deadline, flood, incomplete maps, wrong type/model, and invalid probabilities → bounded incomplete result; valid answer accepted |
| 2.3 | integration | `test_judge_never_runs_repository_code_or_leaks_key` | Hostile project command/plugin and key sentinels → no execution, no key in records/diagnostics, and no redirect upload |
| 3.1 | integration | `test_replay_identity_is_complete_and_offline` | Identical canonical batch → zero calls; each changed field or corrupt record → stale; refresh preserves prior answer and records selected run |
| 3.2 | unit | `test_advisory_policy_preserves_all_constituents` | Finding, quiet, uncertain, missing, and replayed pairs in varied order → all retained; deterministic failure and exit authority unchanged |
| 3.3 | integration | `test_replay_store_handles_concurrency_and_retention` | Concurrent writers, interrupted rename, expired and full cache → valid records or explicit miss; no partial accepted record |
| 4.1 | integration | `test_judge_evaluation_corpus_and_offline_validation` | Bank, splits, label history, and injected/quiet cases → complete corpus validated with no network |
| 4.2 | manual | `manual_judge_labels_and_held_out_report` | Owner validates label commit; implementer records independent live runs and repeats → thresholds, raw counts, and disagreements in release Session Notes |

At implementation, apply the unit-test and integration-test skills to every changed Section. Include negative paths and boundary injection; stubs prove local behavior only. Manual proof names the responsible person and durable release Session Notes. Nothing above is marked run.

## Acceptance Rubric (single scoring surface)

A1/A2 quote the current configuration verbatim and remain required through private B1/B2 development. M07_001 switches configuration/Make recipes to Rust atomically with complete native check registration and old-path deletion at B3; update the five rubric declarations in that same change. Future native commands below are lane acceptance requirements, not commands available in this checkout yet.

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Typed client, privacy, and bounded requests | `cargo test --locked --test judge` | exit 0 | P0 |  |
| R2 | Exact replay and offline policy | `cargo test --locked --test judge_replay` | exit 0 | P0 |  |
| R3 | Question corpus completeness | `cargo xtask judge-check` | exit 0 | P0 |  |
| R4 | Observed held-out quality and live integration | `manual_judge_labels_and_held_out_report` | Recorded required proof and thresholds met | P0 |  |
| A1 | Current declared conformance; Rust implementation replaces internals | `make conform` | exit 0 | P0 |  |
| A2 | Current declared unit lane; atomically replaced at B3 | `bun test src` | exit 0 | P0 |  |
| S1 | Native full unit boundary | `cargo test --workspace --locked` | exit 0 | P0 |  |
| S2 | Governance obligations remain enforced | `make audit` | exit 0 | P0 |  |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 |  |
| S4 | Expanded inventory mapping and exclusive scope | `cargo xtask port-check --map` | exit 0; zero unassigned obligations | P0 |  |

## Dead Code Sweep

No executable files are deleted in this lane. M07_004 replaces dispatch judgment prompts with native routing, and M07_001 deletes old scripts and assembles the template/skill references. No question or builder may ship without a registered consumer.

## Out of Scope

- Jev as a substitute for exact Rust checks, permissions, credentials, or release authority.
- Per-test runtime attribution and mutation testing; assertion relevance requires explicit evidence links.
- Provider routing, daemon, hidden upload, generated reasoning prose, or moving model aliases.
- Automatic semantic builders for every consumer language; availability is explicit and deterministic checks remain supported.

## Product Clarity (authoring record)

1. **Successful user moment** — A maintainer assesses a mixed change and gets the applicable declared checks, rule sections, and review routes without inventing a workflow.
2. **Preserved user behaviour** — Offline gates remain usable with no account; authorization is separate from capability installation.
3. **Optimal-way check** — Batch narrow independent questions over the same bounded evidence to reduce repeated context.
4. **Rebuild-vs-iterate** — Build a native client and reusable evidence boundary; avoid porting prompt-printing scripts.
5. **What we build** — Choice/Noul/Score decision bank, Rust composition, bounded plans, HTTP client, replay, and project-specific evaluation.
6. **What we do NOT build** — No model-controlled gate, approval, migration, or command execution.
7. **Fit with existing features** — Uses the foundation snapshot and emits evidence consumed by coverage and rule-delivery integration.
8. **Surface order** — Command line first; optional CI judging is a separate isolated job.
9. **Dashboard restraint** — Show answers and uncertainty rather than a synthetic quality score.
10. **Confused-user next step** — Use `orly judge --calibrate --check` offline; errors name the missing authorization or evidence.

## Decomposition & alternatives (patch vs refactor)

The lane implements questions, client, replay, and calibration independently of coverage and delivery. Their optional evidence packets join at B3. A generic ask-the-model wrapper would hide missing context and repeated request cost; bounded builders make both testable.

## Discovery (consult log)

- **Scope approval** — Indy (Oct 03, 2026): "yes approved, i assume all go into the  PR you create for spec  M07_002" — approves the shared prerequisite files listed above in this lane's Pull Request. Release integration remains M07_001's work.
- **Consults** — Verified current HTTP API, Models, Confidence, citation checks, and parallel-question guidance on Sep 30, 2026. [TypeSafe API](https://docs.typesafe.ai/api) defines the wire types; [Models](https://docs.typesafe.ai/models) recommends pinned versions; [Confidence](https://docs.typesafe.ai/confidence) describes uncertainty. No fresh-call identity guarantee is assumed. User direction requires Jev in significant areas; advisory policy and concrete acceptance thresholds are agent design decisions, not measured results.
- **Metrics review** — No new analytics funnel. Local diagnostics and the existing consented telemetry retain separate privacy rules.
- **Skill-chain outcomes** — Source/spec adversarial review performed during authoring; native implementation, live calibration, platform journeys, and boundary verification remain pending.
- **Deferrals** — None recorded. The explicit native-command OpenCode guarantee replaces the former executable plugin approach; no missing required release proof is treated as deferred.
