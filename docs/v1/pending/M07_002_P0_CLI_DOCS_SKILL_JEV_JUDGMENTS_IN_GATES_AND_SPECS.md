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

# M07_002: Gate scripts and the spec template ask Jev typed questions, advisory, authorized, and replayed only for identical requests

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 002
**Date:** Sep 23, 2026: 10:10 AM
**Status:** PENDING
**Priority:** P0 — Indy made fitting the templates and scripts to Jev the priority of release 0.12
**Categories:** CLI (Command-Line Interface), DOCS, SKILL (agent workflow skills)
**Batch:** B1 — release 0.12: after M07_001 §1, before M07_003, M07_004, M07_005, and M07_001 §§2–5
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report revision, commands, counts, and environment
**Depends on:** M07_001 §1 for local criterion states and evidence. GitHub-mode judging is built and verified in M07_001 §4; this workstream completes locally without it.
**Provenance:** Large Language Model (LLM)-drafted; Claude Opus 5.5; Sep 23, 2026; revised after Codex's review as Chief Technology Officer (CTO) of `58fedbc`
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Gates, Evidence, and a new §Judge

---

## Overview

**Goal (testable):** With the judge enabled in the repository configuration, `TYPESAFE_API_KEY` set, and upload authorized outside the evaluated tree, `orly judge` answers each applicable question for a staged diff or a spec with a typed answer from a pinned Jev version and reports it as a `reported` criterion; an identical request replays its stored answer, and without all three conditions nothing leaves the machine and every gate behaves as before.

**Problem:**
- The gate scripts ask eleven judgment questions, one per rule code in the gloss table of `dispatch/lib.sh`. `dispatch_judgment` prints each as "🤔 DECIDE" and never fails (`dispatch/lib.sh:236-239`), so nothing records whether anyone decided.
- The spec gate checks structure only (`audits/spec-template.ts`). A vague precondition, an unobservable expected result, a test row that proves something else, and an Out of Scope bullet that removes required work all pass it.
- The rule-enforcement ledger lists `[JUDGMENT → CODE]` clauses as work an agent must weigh (`docs/RULE_ENFORCEMENT.md`), and no check stands behind them.
- The only judge of these questions today is the coding agent that wrote the diff, answering in its own context, with no typed answer and no record.

**Solution summary:** A judged predicate is a registry rule with decision kind `judged`, a question file, and evaluation cases. `orly judge` builds versioned inputs, scans the whole serialized request, asks a pinned Jev model, keeps one result per question and input, and records the raw typed answer under the complete request. Every answer is advisory in release 0.12. Gates, dispatch prompts, the spec template, and the authoring skill read the answers. A frozen pilot compares Jev with the coding agent on labels Indy sets before seeing either.

**Verdict and reason:** Jev returns typed answers with probabilities and cannot answer outside the options a question defines, so it cannot invent a file, function, or mechanism. Typed options constrain the shape of an answer, not its correctness: text inside the input can still steer which allowed answer comes back. Code owns applicability, evidence, scanning, records, and thresholds; the pilot measures accuracy; authority stays human.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(judge): gate scripts and the spec template ask Jev typed questions`
- **Intent:** A repository that opts in and authorizes upload gets typed, recorded answers to judgment questions its rules already ask; a repository that does not sees no change.
- **Authoring handshake:** Indy: "ideally i want to use them since Jev provides unique ability", then: "how about revisiting templates, scripts as part of this to fit JEV and so on. That must be the priority." The CTO review of `58fedbc` returned rework; this revision applies its findings.
- **ASSUMPTIONS I'M MAKING:** 1. Calibrated runs request `jev-1.13.0`; `jev-latest` is for marked exploration only. 2. The key comes only from `TYPESAFE_API_KEY` and never reaches a repository command. 3. Every answer is advisory in release 0.12. 4. gitleaks is the required secret scanner for upload. 5. Question files ship in the package, and the judge reads them from the installed engine, so consumer repositories carry no copies.
- **Implementer handshake:** pending until PLAN.

## Implementing agent — read these first

1. `dispatch/lib.sh` and `dispatch/write_any.sh` — `dispatch_judgment`, the gloss table, and the prompts.
2. `registry.json` and `schemas/registry.schema.json` — `rules` entries with `decision`, `checker`, and `pass`/`fail` fixtures.
3. `audits/rule-ledger.sh` and `audits/rule-ledger-lib.sh` — how `[JUDGMENT → CODE]` clauses are counted, and the root-relative lookups.
4. `audits/spec-template.ts` — the parsed spec sections the spec questions read.
5. `src/telemetry_sync.ts` — the existing HTTP call with an abort timeout.
6. `evals/llms/run.sh` — golden-set fixtures with a no-network `--check` mode and live grading.
7. https://docs.typesafe.ai/api.md — endpoint, request and answer shapes, error codes.
8. https://docs.typesafe.ai/models.md — versioned model names, pricing, per-request limits, and pinning guidance.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| `docs/v1/pending/M07_002_P0_CLI_DOCS_SKILL_JEV_JUDGMENTS_IN_GATES_AND_SPECS.md` | CREATE, then lifecycle MOVE | Intent and proof ledger |
| `questions/`, `fixtures/questions/`, `schemas/question.schema.json` | CREATE | Five question files, their evaluation cases, and their shape |
| `schemas/registry.schema.json`, `registry.json`, `src/model.ts`, `src/validation.ts` | EDIT | Decision kind `judged` with a question path; ownership entries for every judgment code |
| `schemas/gate-evidence.schema.json` | EDIT | Judgment constituents in the evidence document |
| `src/judge.ts`, `src/judge_client.ts`, `src/judge_state.ts`, `src/judge_record.ts`, `src/judge_scan.ts` | CREATE | Runner, client with budgets, versioned input builders, records, request scanning |
| `src/judge.test.ts`, `src/judge_client.test.ts`, `src/judge_state.test.ts`, `src/judge_record.test.ts`, `src/judge_scan.test.ts`, `src/judge_support.ts` | CREATE | Tests against a local stub server |
| `src/cli.ts`, `src/cli_gate.ts`, `src/cli.test.ts` | EDIT | `judge` command; judge criteria in gate output |
| `src/criteria.ts`, `src/criteria_support.ts`, `src/criteria.test.ts` | EDIT | `judge.*` criteria in the `pr` gate; provider key removed from command environments |
| `src/config.ts`, `src/config.test.ts`, `src/validation.test.ts` | EDIT | `judge` block; blocking configuration rejected |
| `src/telemetry.ts`, `src/telemetry.test.ts` | EDIT | `judge` in the observed command set; no content |
| `dispatch/lib.sh`, `dispatch/write_any.sh`, `dispatch/write_zig.sh`, `dispatch/write_ts_adhere_bun.sh`, `dispatch/write_sql.sh` | EDIT | Each prompt names its owner; exact-input recorded answers print beside it |
| `audits/parity-dispatch.sh`, `audits/rule-ledger.sh`, `audits/rule-ledger-lib.sh`, `docs/RULE_ENFORCEMENT.md` | EDIT | Ownership parity; ledger reports mapped predicates without inferring coverage |
| `docs/TEMPLATE.md`, `dispatch/write_spec.md`, `skills/orly-spec-new/SKILL.md` | EDIT | Judge step in authoring and readiness review |
| `package.json`, `src/pack_hygiene.test.ts` | EDIT | Ship `questions/`; prove packed-package closure |
| `evals/judge/` | CREATE | Frozen pilot set with tuning and held-out splits, labels, and results |
| `README.md`, `llms.txt`, `docs/ORLY_ARCHITECTURE.md` | EDIT | Optional judge setup; §Judge |

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: NDC (No Dead Code), UFS (Unified Form for Symbols), FLL (File and Function Length Limits), TST-NAM (milestone-free test names), MSID (milestone identifiers banned in source), TGU (Tagged-Union over optional-field structs), TSC and TSJ (TypeScript and Bun conventions), LOG (logging discipline), PRI (Prompt-injection Resistance from user Input).
- `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`, `dispatch/write_shell.md` — TypeScript and shell changes.
- `dispatch/edit_rules.md` — `src/**`, `schemas/**`, `registry.json`, `audits/**`, and `dispatch/**` change; the questionnaire and generated evidence run.
- `dispatch/write_spec.md` and `docs/TEMPLATE.md`; `dispatch/write_documentation.md` with `docs/DOCUMENTATION_RULES.md`.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec Template | Yes | Pending metadata, Dimension-to-Test mapping, declared commands verbatim, at most 320 lines |
| TypeScript file shape; File & Function Length (≤350/≤50/≤70) | Yes | Runner, client, builders, records, and scanning in separate modules |
| Unified Form for Symbols; Logging; Milestone Identifier | Yes | Endpoint, model, limits, and reason codes as named constants; no key or input in logs |
| Governance invariance | Yes | `make audit`, the questionnaire, and generated evidence; the ledger regenerates |
| Rendered rules size | Yes | No change to `core/operating-model.md`; `make conform` reported 37,872 of 37,888 bytes |
| Greptile review; Architecture consult | Yes | End-of-turn rule read; new §Judge |
| Schema removal; Zig; interface design tokens; workflow file edit | No | None touched |

## Prior-Art / Reference Implementations

- **Registry rules:** entries carry `decision`, `checker`, and `pass`/`fail` fixtures; a judged predicate adds one decision kind and a question path.
- **Record location:** `audits/doc-read.sh` keeps its record under the git directory, never in the tree; answer records follow it.
- **Live evaluation:** `evals/llms/run.sh` separates fixture validation from live grading; the pilot mirrors that split.
- **HTTP call:** `src/telemetry_sync.ts` aborts on a named timeout; the TypeSafe client adds backoff for 429 and 529 within a total deadline.
- **TypeSafe guidance:** one narrow judgment per question, criteria defining every answer, code-owned thresholds, and a pinned version for tuned thresholds.

## Sections (implementation slices)

### §1 — Questions are registry predicates with evaluation cases

A judged predicate is a registry `rules` entry with decision kind `judged`, its question file, and `pass` and `fail` evaluation cases; the registry is the ownership index, and ownership parity proves routing only. Each question file defines its required evidence, one predicate, the answer that counts as a finding, insufficient-evidence handling, its input-builder version, and its paths or spec items. The initial bank: an added compatibility shim, read from the added hunk with the repository version and file path; a Test Specification row's concrete preconditions; the same row's observable expected result; whether a Test Specification row's stated assertion entails its Dimension's behavior, read as a complete pair; and whether an Out of Scope bullet contradicts the Goal or a Dimension, read with the Goal and every Dimension. Each is a Choice whose options include `insufficient_evidence`. No Score question ships without ordered descriptive levels and a defined consumer. Every `dispatch_judgment` code has one owner entry: a question, a script check, a human decision, or a broad agent review; the Greptile rule audit stays a broad review, and No Legacy Retained keeps its dead-code clause with the agent. `audits/parity-dispatch.sh` fails on a code without an owner.

- **Dimension 1.1** — Every question file validates; a missing evidence rule, predicate, polarity, insufficient-evidence option, or Score levels fails with the file named → Test `test_question_files_validate`
- **Dimension 1.2** — Every judgment code has one owner entry, an unmapped new code fails the audit, and the report states that ownership proves routing only → Test `test_judgment_codes_have_owners`
- **Dimension 1.3** — The packed package carries every question file and evaluation case → Test `test_packed_package_carries_questions`

### §2 — `orly judge` asks only when authorized, scans the whole request, and replays exactly

`orly judge [--staged | --base <commit>] [--spec <path>] [--allow-upload] [--refresh] [--json]` selects applicable questions; an input missing its required evidence becomes `insufficient_evidence` with no request. Transmission requires repository configuration, a key, and authorization supplied outside the evaluated tree: an explicit local `--allow-upload`, or the maintainer setting from M07_001 §4. Before transmission it prints the destination and the input categories. The complete serialized request, context and question text included, passes built-in credential checks and gitleaks run with the engine's own configuration; an absent scanner, a scanner error, or a finding prevents transmission. Scanning reduces accidental disclosure; it does not certify that source holds no secrets. The provider key is removed from every repository command's environment. Questions sharing a state are batched into one request. Before the live client is built, PLAN records named limits for serialized request size, total question-input pairs, attempts, concurrency, and total run duration, within the Models values in Discovery. Retries honor backoff within the total deadline; exhaustion reports the evaluation incomplete. A record is keyed by the complete canonical request, question identifier and version, input-builder version, and evaluation source; it stores the raw typed answer and the returned model, and thresholds apply after replay. Any changed request field invalidates replay; writes are atomic; a replayed answer is labelled replay; records are replay aids, never attestations. Calibrated runs request `jev-1.13.0` and verify the returned model; an alias run is marked exploration. One result is kept per question-input pair, and aggregation never discards constituents: a finding stays visible regardless of input order, and missing or uncertain inputs are counted. Every answer is a `reported` criterion; configuration requesting blocking is rejected.

- **Dimension 2.1** — Questions are selected from the diff's paths and the spec's items; an input missing required evidence becomes `insufficient_evidence` without a request → Test `test_judge_selects_applicable_questions`
- **Dimension 2.2** — Without configuration, key, or out-of-tree authorization there are zero requests, judge criteria report why, and other gate output is unchanged → Test `test_judge_needs_three_authorizations`
- **Dimension 2.3** — A credential in any request field, an absent scanner, or a scanner error sends nothing; the key is absent from command environments → Test `test_judge_scans_the_whole_request`
- **Dimension 2.4** — An identical request replays with zero requests and is labelled replay; changed instructions, criteria, builder version, source, or model asks again; a corrupt record asks again → Test `test_judge_replays_only_identical_requests`
- **Dimension 2.5** — With three inputs where one fires, the finding survives any input order, missing and uncertain inputs are counted, and evidence keeps every constituent key without source text → Test `test_judge_aggregates_without_loss`
- **Dimension 2.6** — Responses 401, 422, 429, and 529, a timeout, a malformed or missing answer, and an exhausted budget each report incomplete with a named reason; retries stay within the deadline → Test `test_judge_failures_name_their_reason`
- **Dimension 2.7** — Blocking configuration is rejected, a calibrated run with an alias is refused, and a returned-model mismatch is reported → Test `test_judge_is_advisory_and_pinned`

### §3 — Gates, scripts, and the spec template use the answers

With the judge enabled and authorized, the `pr` gate carries one `judge.<question>` criterion per question, and the evidence carries each constituent's key, typed answer, returned model, and replay flag, never the input. `dispatch_judgment` prints a recorded answer only when its key matches the exact staged or selected input; otherwise it reports missing or stale evidence and names `orly judge`. Scripts never call the network, so commits stay offline. `orly judge --spec <path>` reports per Test Specification row and per Out of Scope bullet. `docs/TEMPLATE.md`'s readiness review, `dispatch/write_spec.md`, and the orly-spec-new skill's final checklist add the step: with the judge enabled, each contradicted or insufficient item is fixed or its disposition recorded in Discovery before the spec leaves pending. The ledger reports explicitly mapped predicates, their source sections, and their calibration status; it never counts clauses sharing a code as covered.

- **Dimension 3.1** — The `pr` gate carries `judge.*` criteria, and the evidence records keys, answers, models, and replay flags but no input text → Test `test_pr_gate_carries_judgments`
- **Dimension 3.2** — A dispatch prompt prints an answer only for an exact-input match, reports stale or missing evidence otherwise, and opens no socket → Test `test_dispatch_prompt_matches_exact_input`
- **Dimension 3.3** — `orly judge --spec` yields one judgment per Test Specification row question and per Out of Scope bullet → Test `test_spec_questions_cover_each_item`
- **Dimension 3.4** — The ledger lists mapped predicates with source section and calibration status and never infers coverage from a shared code → Test `test_ledger_reports_mapped_predicates`

### §4 — A frozen pilot compares Jev with the coding agent

`orly judge --calibrate --check` validates every question and evaluation case without a network call. The pilot set in `evals/judge/` holds ordinary findings, quiet cases, missing context, and adversarial text asking for an allowed quiet answer, split into tuning and held-out cases. Indy labels the cases, and the labels are committed before any evaluator output exists. Jev and the coding agent then run independently on identical bounded evidence; an existing review bot joins only where its results are comparable. The report gives, per question and evaluator, false findings, missed findings, abstentions, useful findings unique to each, end-to-end latency, request count, and token usage; unchanged requests are repeated to measure variability; disagreements are recorded one by one. The pilot supports no blocking decision.

- **Dimension 4.1** — `--calibrate --check` validates every question and case with no network call → Test `test_calibrate_check_runs_offline`
- **Dimension 4.2** — Every pilot case carries a split and a label, and the labels' commit precedes the first result file's commit → Test `test_pilot_labels_precede_results`
- **Dimension 4.3** — Indy labels the frozen pilot set before any evaluator output exists → Test `manual_pilot_labels`
- **Dimension 4.4** — The pilot report for Jev and the coding agent, with repeat variability, is recorded in Session Notes → Test `manual_pilot_comparison`

## Interfaces

```
orly judge [--staged | --base <commit>] [--spec <path>] [--allow-upload] [--refresh] [--json]
orly judge --calibrate [--check] [--ids <list>]

Configuration (.orly/orly.json after M07_005); "blocking" is rejected in release 0.12:
  "judge": { "provider": "typesafe", "model": "jev-1.13.0" }
Key: TYPESAFE_API_KEY from the environment; never passed to repository commands.

Question file (schemas/question.schema.json):
{ "id": "spec.exclusion_contradicts_scope", "version": 1, "builder": "spec.goal_dimensions_bullet@1",
  "type": "choice", "evidence": ["goal", "dimensions", "out_of_scope_bullet"],
  "instructions": "Does this exclusion remove work the Goal or a Dimension requires?",
  "criteria": { "contradicts": "...", "consistent": "...", "insufficient_evidence": "..." },
  "finding": "contradicts" }

Request: POST https://api.typesafe.ai/v1/systemone
  { "model": "jev-1.13.0", "state": { ... }, "questions": { "<id>": { "type", "instructions", "criteria" } } }
Record (<git dir>/orly/judgments/<key>.json):
  { "key", "source", "question", "version", "builder", "requested_model", "returned_model",
    "answer", "probabilities", "confidence", "usage", "recorded_at" }
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Not authorized | No configuration, key, or out-of-tree authorization | Zero requests; judge criteria report why; `test_judge_needs_three_authorizations` |
| Scanner unavailable | gitleaks absent or erroring | Nothing sent; evaluation incomplete; `test_judge_scans_the_whole_request` |
| Credential in request | A token anywhere in the serialized request | Nothing sent; `test_judge_scans_the_whole_request` |
| Insufficient evidence | A required input is missing | `insufficient_evidence` without a request; `test_judge_selects_applicable_questions` |
| Provider failure | 401, 422, 429, 529, timeout, malformed answer | Incomplete with a named reason; `test_judge_failures_name_their_reason` |
| Budget exhausted | Pair, attempt, or duration limit reached | Incomplete; remaining pairs counted; `test_judge_failures_name_their_reason` |
| Stale replay | Any request field changed | Asked again; `test_judge_replays_only_identical_requests` |
| Lost finding | Several inputs, one firing | Finding survives aggregation; `test_judge_aggregates_without_loss` |
| Model moved | Returned model differs from requested | Reported; calibrated runs refuse aliases; `test_judge_is_advisory_and_pinned` |
| Injected input | Diff or spec text asks for a quiet answer | Measured by adversarial pilot cases; `manual_pilot_comparison` |
| Blocking requested | Configuration asks to block | Rejected; `test_judge_is_advisory_and_pinned` |

## Invariants

1. No request without configuration, key, and out-of-tree authorization — the client requires an authorization value only the command-line flag or the maintainer setting produces.
2. No request before the complete serialized request passes built-in checks and the scanner — the client accepts only a scanned-request type.
3. The provider key never enters a repository command's environment — the command runner strips it.
4. Every answer is advisory in release 0.12 — the configuration schema rejects blocking.
5. Replay happens only for an identical complete request — the key covers every request field.
6. A judgment never resolves authority — no question targets overrides, deferrals, or owner consults.
7. Every judgment code has an owner entry — `audits/parity-dispatch.sh` runs in `make audit`.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Usage observation for `judge` | product | `orly judge` completes with prior anonymous consent | Existing fields; command value `judge` | No question, input, answer, key, or path | `test_judge_needs_three_authorizations` |

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | unit | `test_question_files_validate` | Valid bank passes; each missing field or Score without levels → failure naming the file |
| 1.2 | integration | `test_judgment_codes_have_owners` | Current scripts → every code owned; a new unmapped code → audit fails |
| 1.3 | integration | `test_packed_package_carries_questions` | `npm pack` output → every question and case present |
| 2.1 | integration | `test_judge_selects_applicable_questions` | TypeScript hunk → shim question only; spec without Goal → `insufficient_evidence`, zero requests |
| 2.2 | integration | `test_judge_needs_three_authorizations` | Each of the three missing → zero stub requests and a named reason |
| 2.3 | integration | `test_judge_scans_the_whole_request` | Token in context or question text, scanner absent, scanner error → nothing sent; command sees no key |
| 2.4 | integration | `test_judge_replays_only_identical_requests` | Rerun → zero requests, replay label; each changed field → one request; corrupt record → one request |
| 2.5 | integration | `test_judge_aggregates_without_loss` | Three inputs, one firing, shuffled → finding kept; counts of missing and uncertain correct |
| 2.6 | integration | `test_judge_failures_name_their_reason` | Stub 401, 422, 429, 529, delay, malformed body, budget → named incomplete reasons; attempts within deadline |
| 2.7 | unit | `test_judge_is_advisory_and_pinned` | Blocking config → rejected; calibrate with alias → refused; mismatched returned model → reported |
| 3.1 | integration | `test_pr_gate_carries_judgments` | Enabled and authorized judge → `judge.*` criteria; evidence has no input text |
| 3.2 | integration | `test_dispatch_prompt_matches_exact_input` | Matching key → answer; edited staged hunk → stale; no socket opened |
| 3.3 | integration | `test_spec_questions_cover_each_item` | Spec with three rows and two exclusions → one judgment per row question and per exclusion |
| 3.4 | unit | `test_ledger_reports_mapped_predicates` | Two clauses sharing a code, one mapped → one listed with calibration status |
| 4.1 | unit | `test_calibrate_check_runs_offline` | Every case validated; no socket opened |
| 4.2 | unit | `test_pilot_labels_precede_results` | Pilot history → every case labelled and split; labels committed before results |
| 4.3 | manual | `manual_pilot_labels` | Indy labels the frozen set; the commit is his |
| 4.4 | manual | `manual_pilot_comparison` | Implementer runs Jev and the coding agent on the held-out split; report with repeats in Session Notes |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Questions validate, ship, and every code has an owner (§1) | `bun test src -t "test_question_files\|test_judgment_codes\|test_packed_package_carries"` | exit 0 | P0 | |
| R2 | Nothing leaves the machine without authorization and a clean scan (§2) | `bun test src -t "test_judge_needs_three\|test_judge_scans"` | exit 0 | P0 | |
| R3 | Replay, aggregation, failures, and pinning behave as specified (§2) | `bun test src -t "test_judge_replays\|test_judge_aggregates\|test_judge_failures\|test_judge_is_advisory"` | exit 0 | P0 | |
| R4 | Gates, scripts, specs, and the ledger use the answers (§3) | `bun test src -t "test_pr_gate_carries\|test_dispatch_prompt\|test_spec_questions\|test_ledger_reports"` | exit 0 | P0 | |
| R5 | Pilot validates offline and keeps labels ahead of results (§4) | `bun test src -t "test_calibrate_check\|test_pilot_labels"` | exit 0 | P0 | |
| R6 | Scope holds | `git diff --name-only origin/main...HEAD` | 0 paths missing from Files Changed | P0 | |
| S1 | Declared conformance | `make conform` | exit 0 | P0 | |
| S2 | Declared verification | `bun test src` | exit 0 | P0 | |
| S3 | Governance invariance | `make audit` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S5 | No oversize source file | `git diff --name-only origin/main...HEAD \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | |

## Dead Code Sweep

N/A — no files deleted. Dispatch prompts keep printing; each gains its owner and any exact-input answer.

## Out of Scope

- Blocking enforcement. If proposed later, every selected blocking question must produce a valid, sufficiently certain result for every required input, and missing credentials, withholding, oversized input, exhausted budgets, invalid responses, or an unavailable service fail evaluation as incomplete.
- The broader diff bank, kept as design notes until builders and evaluation cases exist: No Legacy Retained with touched-file context; Tagged-Union with the whole result type; File Shape Decision for TypeScript and Zig; Architecture consult naming; Bun conventions with runtime evidence; Deinit IDEMpotency with lifecycle and tests; Legacy-Design Consult as a trigger only; one-behavior Dimensions.
- Semantic coverage claims in the ledger; judge providers other than TypeSafe; committed answer records.
- Classifying session corrections and review comments; judging test bodies against covered lines; PR descriptions; commit-time requests; changes to `core/operating-model.md`.

## Product Clarity (authoring record)

1. **Successful user moment** — Indy runs `orly judge --spec --allow-upload` on a draft, and an Out of Scope bullet that drops required work comes back as `contradicts` with its probability before PLAN approval.
2. **Preserved user behaviour** — Without configuration, key, and authorization, every gate, prompt, and exit status is unchanged, and every deterministic check keeps running.
3. **Optimal-way check** — The strongest question judges a test body against the production lines it covers, which needs coverage from the next Milestone; the bank, runner, records, and pilot come first because later questions reuse them.
4. **Rebuild-vs-iterate** — Iterate: registry rules, the ledger, dispatch prompts, and M07_001's states already carry the shape.
5. **What we build** — Five questions with evaluation cases, the `judged` decision kind, the authorized runner and scanner, exact-request records, gate, script, and template wiring, and the pilot.
6. **What we do NOT build** — Blocking enforcement, the broader diff bank, other providers, committed records, a dashboard.
7. **Fit with existing features** — Reports through M07_001's states and evidence; the commit hook stays offline.
8. **Surface order** — Command line first; gates and templates call the same command.
9. **Dashboard restraint** — No scores or badges; each judgment shows its question, answer, probability, and whether it is a replay.
10. **Confused-user next step** — `orly judge --calibrate --check` validates the setup offline and names the missing key, setting, authorization, or scanner.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Four Sections: questions, authorized runner, wiring, pilot. The pilot lands last because it measures the bank the earlier Sections build.
- **Alternatives considered:** Asking Jev inside each bash prompt would put network calls in every commit. Keeping blocking in release 0.12 would need the incompleteness rule in Out of Scope plus held-out evidence the pilot has not produced. A reasoning-model judge returns prose without typed probabilities; the provider field keeps it possible.
- **Patch-vs-refactor verdict:** this is an additive **patch** on existing registry, ledger, and gate shapes.

## Discovery (consult log)

- **Consults** — Sep 23, 2026: TypeSafe's Models page lists `jev-1.13.0` with aliases `jev-latest` and `jev-preview`, input at $0.042 per million tokens, free output, 64k tokens per request and 32k for state plus the longest question, rate limits of 250,000 tokens per second and 1,200 requests per minute that change without notice, and advice to pin a version for tuned thresholds. These are published terms, not measured costs; no fresh-call reproducibility guarantee exists. Eleven distinct `dispatch_judgment` codes across `dispatch/lib.sh`, `dispatch/write_any.sh`, `dispatch/write_zig.sh`, `dispatch/write_ts_adhere_bun.sh`, and `dispatch/write_sql.sh`. Codex's CTO review of `58fedbc` returned rework; its findings were verified against source and applied, including advisory-only enforcement and the smaller bank. The fifth question, row entailment, goes beyond its four because it targets tests that prove something other than their Dimension. Indy's direction is quoted in the handshake.
- **Metrics review** — `judge` joins the observed command set; no analytics or funnel change.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand. Implementation proofs, `/review`, the pilot, and post-push monitoring are pending.
- **Deferrals** — None. Out of Scope lists items proposed for the next Milestone, subject to Indy's approval of this spec.
