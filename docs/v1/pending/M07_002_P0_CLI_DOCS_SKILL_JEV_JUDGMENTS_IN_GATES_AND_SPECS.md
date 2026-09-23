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

# M07_002: Gate scripts and the spec template ask Jev typed questions, recorded by input and advisory by default

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 002
**Date:** Sep 23, 2026: 10:10 AM
**Status:** PENDING
**Priority:** P0 — Indy made fitting the templates and scripts to Jev the priority of orly 0.11
**Categories:** CLI (Command-Line Interface), DOCS, SKILL (agent workflow skills)
**Batch:** B1 — lands after M07_001 §1, before M07_001 §§2–5
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report revision, commands, counts, and environment
**Depends on:** M07_001 §1 — criterion states, the `reported` state, and the gate evidence document
**Provenance:** Large Language Model (LLM)-drafted; Claude Opus 5.5; Sep 23, 2026
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Gates, Evidence, and a new §Judge

---

## Overview

**Goal (testable):** With the judge enabled in the repository configuration and `TYPESAFE_API_KEY` set, `orly judge` answers each applicable question for a diff or a spec with a typed Jev answer, reports it as a `reported` criterion unless the repository made that question blocking, and returns the recorded answer without a network call when the input is unchanged; without the setting or the key, every gate behaves as before.

**Problem:**
- The gate scripts ask eleven judgment questions, one per rule code in the gloss table of `dispatch/lib.sh`. `dispatch_judgment` prints each as "🤔 DECIDE" and never fails (`dispatch/lib.sh:236-239`), so nothing records whether anyone decided.
- The spec gate checks structure only (`audits/spec-template.ts`). A Goal no test could decide, a Dimension that bundles three behaviors, an Asserts cell with no inputs, and an Out of Scope bullet that removes required work all pass it.
- The rule-enforcement ledger lists clauses tagged `[JUDGMENT → CODE]` as work an agent must weigh (`docs/RULE_ENFORCEMENT.md`), and no check stands behind any of them.
- The only judge of those questions today is the coding agent that wrote the diff, answering in its own context, with no typed answer and no record.

**Solution summary:** A judged rule becomes a registry rule with decision kind `judged`, a question file, and `pass` and `fail` fixtures, the shape registry rules already use. `orly judge` selects applicable questions, builds each input from the diff or the spec, withholds anything that looks like a credential, asks TypeSafe's Jev, and records the answer by input key. Gates report answers through M07_001's states; dispatch prompts print recorded answers; the spec template and authoring skill gain a judge step; `orly judge --calibrate` measures each question against its fixtures.

**Verdict and reason:** Jev returns typed answers with probabilities and cannot choose outside the options a question defines, so it cannot invent a file, function, or mechanism. Code owns applicability, input, thresholds, and records. TypeSafe documents no reproducibility guarantee and `jev-latest` moves, so the record is what repeats; fixtures and calibration measure whether answers are right. Authority never moves: overrides, deferrals, and owner consults stay human.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(judge): gate scripts and the spec template ask Jev typed questions`
- **Intent:** A repository that opts in gets typed, recorded answers to the judgment questions its rules already ask; a repository that does not opt in sees no change.
- **Authoring handshake:** Indy: "ideally i want to use them since Jev provides unique ability", then: "how about revisiting templates, scripts as part of this to fit JEV and so on. That must be the priority."
- **ASSUMPTIONS I'M MAKING:** 1. TypeSafe's HTTP API with model `jev-latest`, per its published reference. 2. The key comes only from `TYPESAFE_API_KEY`; orly never stores or prints it. 3. Answers are advisory unless a repository promotes a question. 4. A human-only consult is detected, never decided. 5. Question files install like other managed files, under `.orly/` once M07_001 §2 lands.
- **Implementer handshake:** pending until PLAN.

## Implementing agent — read these first

1. `dispatch/lib.sh` and `dispatch/write_any.sh` — `dispatch_judgment`, the gloss table, and the prompts the questions replace.
2. `registry.json` and `schemas/registry.schema.json` — the `rules` entries with `decision`, `checker`, and `pass`/`fail` fixtures that judged rules extend.
3. `audits/rule-ledger.sh` and `docs/RULE_ENFORCEMENT.md` — how `[JUDGMENT → CODE]` clauses are counted.
4. `audits/spec-template.ts` — the parsed spec sections the spec questions read.
5. `src/telemetry_sync.ts` — the existing HTTP call with an abort timeout.
6. `evals/llms/run.sh` — golden-set fixtures with a no-network `--check` mode and live grading.
7. https://docs.typesafe.ai/api.md — endpoint, request and answer shapes, error codes.
8. https://docs.typesafe.ai/confidence.md — confidence zones and routing below a threshold.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| `docs/v1/pending/M07_002_P0_CLI_DOCS_SKILL_JEV_JUDGMENTS_IN_GATES_AND_SPECS.md` | CREATE, then lifecycle MOVE | Intent and proof ledger |
| `questions/` | CREATE | One question file per judged rule in §1 |
| `fixtures/questions/` | CREATE | Firing and quiet examples per question |
| `schemas/question.schema.json` | CREATE | Question file shape |
| `schemas/registry.schema.json`, `registry.json`, `src/model.ts`, `src/validation.ts` | EDIT | Decision kind `judged` with a question path; questions installed as managed files |
| `schemas/gate-evidence.schema.json` | EDIT | Judgment entries in the evidence document |
| `src/judge.ts`, `src/judge_client.ts`, `src/judge_state.ts`, `src/judge_record.ts` | CREATE | Runner, TypeSafe client, input builders with credential withholding, answer records |
| `src/judge.test.ts`, `src/judge_client.test.ts`, `src/judge_state.test.ts`, `src/judge_record.test.ts`, `src/judge_support.ts` | CREATE | Tests against a local stub server |
| `src/cli.ts`, `src/cli_gate.ts`, `src/cli.test.ts` | EDIT | `judge` command; judge criteria in gate output |
| `src/criteria.ts`, `src/criteria.test.ts` | EDIT | `judge.*` criteria in the `pr` gate when enabled |
| `src/config.ts`, `src/config.test.ts`, `src/validation.test.ts` | EDIT | `judge` block in the repository configuration |
| `src/telemetry.ts`, `src/telemetry.test.ts` | EDIT | `judge` in the observed command set; no question or input content |
| `dispatch/lib.sh`, `dispatch/write_any.sh`, `dispatch/write_zig.sh`, `dispatch/write_ts_adhere_bun.sh`, `dispatch/write_sql.sh` | EDIT | Each prompt names its owner; recorded answers print beside it |
| `audits/parity-dispatch.sh`, `audits/rule-ledger.sh`, `docs/RULE_ENFORCEMENT.md` | EDIT | Every judgment code has an owner; the ledger counts question-backed clauses |
| `docs/TEMPLATE.md`, `dispatch/write_spec.md`, `skills/orly-spec-new/SKILL.md` | EDIT | Judge step in authoring and readiness review |
| `README.md`, `llms.txt`, `docs/ORLY_ARCHITECTURE.md` | EDIT | Optional judge setup; §Judge |

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: NDC (No Dead Code), UFS (Unified Form for Symbols), FLL (File and Function Length Limits), TST-NAM (milestone-free test names), MSID (milestone identifiers banned in source), TGU (tagged unions over optional-field results), TSC and TSJ (TypeScript and Bun conventions), LOG (logging discipline), PRI (prompt-injection resistance for text sent to a model).
- `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`, `dispatch/write_shell.md` — TypeScript and shell changes.
- `dispatch/edit_rules.md` — `src/**`, `schemas/**`, `registry.json`, `audits/**`, and `dispatch/**` change; the questionnaire and generated evidence run.
- `dispatch/write_spec.md` and `docs/TEMPLATE.md` — the authoring rules this spec extends.
- `dispatch/write_documentation.md` with `docs/DOCUMENTATION_RULES.md` — README, `llms.txt`, architecture.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec Template | Yes | Pending metadata, Dimension-to-Test mapping, declared commands verbatim, at most 320 lines |
| TypeScript file shape; File & Function Length (≤350/≤50/≤70) | Yes | Runner, client, input builders, and records in separate modules |
| Unified Form for Symbols; Logging; Milestone Identifier | Yes | Endpoint, model, thresholds, reason codes, and limits as named constants; no key or input in logs |
| Governance invariance | Yes | `make audit`, the questionnaire, and generated evidence; the ledger regenerates |
| Rendered rules size | Yes | No change to `core/operating-model.md`; `make conform` reported 37,872 of 37,888 bytes |
| Greptile review; Architecture consult | Yes | End-of-turn rule read; new §Judge in `docs/ORLY_ARCHITECTURE.md` |
| Schema removal; Zig; interface design tokens; workflow file edit | No | No database schema, Zig, rendered interface, or workflow file |

## Prior-Art / Reference Implementations

- **Registry rules:** entries already carry `decision`, `checker`, and `pass`/`fail` fixtures (`registry.json`); a judged rule adds one decision kind and a question path.
- **Rule ledger:** `audits/rule-ledger.sh` already counts `[JUDGMENT → CODE]` clauses; it gains a question-backed count.
- **Record location:** `audits/doc-read.sh` keeps its record under the git directory, never in the tree; answer records follow it.
- **Live evaluation:** `evals/llms/run.sh` separates fixture validation from live grading; calibration mirrors that split.
- **HTTP call:** `src/telemetry_sync.ts` aborts on a named timeout; the TypeSafe client adds bounded backoff for 429 and 529, as TypeSafe's reference directs.
- **TypeSafe guidance:** one narrow judgment per question, criteria that define every answer, and code-owned thresholds with routing below them.

## Sections (implementation slices)

### §1 — Questions are registry rules with fixtures

A judged rule is a registry `rules` entry with decision kind `judged`, the question file's path, and `pass` fixtures that must stay quiet and `fail` fixtures that must fire. A question file carries identifier, version, TypeSafe type (`noul`, `choice`, or `score`), instructions, criteria, the answers that count as a finding, a default threshold, the input it reads (a diff hunk or a named spec item), and the paths it applies to. Diff questions: NLG (No Legacy compat shims) for legacy twins and compatibility shims; NLR (No Legacy Retained) for legacy framing left in touched code; TGU (Tagged-Union over optional-field structs) for distinct failures carried in optional fields; FSD (File Shape Decision) for the shape of a new TypeScript file; ARCH (Architecture consult before naming) for a newly named stream, queue, channel, or schema; TSJ (TypeScript and Bun judgment conventions) for a Node compatibility call where Bun has a native one; DIDEM (Deinit IDEMpotency) for a new type with a cleanup method; LDC (Legacy-Design Consult) for a patched, kept, or tested legacy path. Spec questions: the Goal is decidable by one test; each Dimension states one observable behavior; each Asserts cell names concrete inputs and expected output; each Test Specification row proves its Dimension; each Out of Scope bullet removes no work the Goal or a Dimension requires; Product Clarity's first item describes a scene. ITF (Integration Test Fixtures) and SCH (SCHema teardown) stay script checks, GRP (Greptile rule audit) is covered by the per-rule questions, and LDC is human-only: its question detects the trigger and offers no remove, patch, or keep answer. `audits/parity-dispatch.sh` fails when a judgment code has no owner.

- **Dimension 1.1** — Every question file validates; a missing fixture, unknown type, or Choice without options fails with the file named → Test `test_question_files_validate`
- **Dimension 1.2** — Every judgment code in the gate scripts maps to a question, a script check, or a human-only mark, and an unmapped new code fails the audit → Test `test_judgment_codes_have_owners`
- **Dimension 1.3** — The human-only consult question detects its trigger and carries no decision options → Test `test_human_only_question_decides_nothing`

### §2 — `orly judge` asks, withholds, and records

`orly judge [--staged | --base <commit>] [--spec <path>] [--refresh] [--json]` selects the questions whose paths match the diff, plus the spec questions when a spec is active or named. It builds each input from one diff hunk with its file path and surrounding lines, or from one parsed spec item with the Goal and Dimensions it relates to, and tells Jev that the input is data, never instructions. An input over the named size limit is skipped with a reason, never truncated. Before any request, an input matching a built-in credential pattern, or flagged by `gitleaks stdin` when gitleaks is installed, is withheld and skipped with the reason. The client posts to `https://api.typesafe.ai/v1/systemone` with `model: "jev-latest"`, reads the key from `TYPESAFE_API_KEY`, aborts on a named timeout, and backs off on 429 and 529 up to a named attempt limit. Each answer is recorded under the git directory at a key hashed from question identifier, question version, criteria, canonical input, and requested model, with the returned model string, answer, probabilities, confidence, and token usage. An unchanged input replays its record without a request; `--refresh` asks again. Answers become `reported` criteria showing probability or confidence. A question the repository lists as blocking with a threshold becomes `failed` when its finding fires at or above that threshold; a finding below the threshold stays `reported` as uncertain. No `judge` setting or no key means no request and every judge criterion skipped with its reason. **Implementation default:** records stay out of the tree, because a committed record is an answer the author could write.

- **Dimension 2.1** — Questions are selected from the diff's paths and the active spec, and no applicable question means no request → Test `test_judge_selects_applicable_questions`
- **Dimension 2.2** — Stub answers become `reported` criteria with probability or confidence, a blocking finding at threshold becomes `failed`, and a finding below it stays `reported` as uncertain → Test `test_judge_answers_become_states`
- **Dimension 2.3** — A rerun on unchanged input makes zero requests and returns the recorded answer; `--refresh` makes one request per question → Test `test_judge_replays_recorded_answers`
- **Dimension 2.4** — An input carrying a credential pattern is withheld, reported skipped, and never reaches the stub server → Test `test_judge_withholds_secrets`
- **Dimension 2.5** — Without the setting or the key there are zero requests, every judge criterion is skipped with its reason, and other gate output is unchanged → Test `test_judge_off_changes_nothing`
- **Dimension 2.6** — Responses 401, 422, 429, and 529, a timeout, and an oversized input each yield their named reason, and 429 and 529 back off to the attempt limit → Test `test_judge_failures_name_their_reason`

### §3 — Gates, scripts, and the spec template use the answers

With the judge enabled, the `pr` gate carries one `judge.<question>` criterion per applicable question, and the evidence document carries each judgment's question, input key, answer, confidence, and returned model, never the input. `dispatch_judgment` prints the recorded answer beside its prompt when one exists and otherwise names `orly judge`; scripts never call the network, so commits stay offline. In GitHub mode from M07_001, blocking questions are asked fresh and local records are ignored. `orly judge --spec <path>` reports per item. `docs/TEMPLATE.md`'s readiness review, `dispatch/write_spec.md`, and the orly-spec-new skill's final checklist add the step: with the judge enabled, a spec leaves pending only when each contradicted or uncertain item is fixed or its disposition is recorded in Discovery. The ledger adds a column counting judgment clauses whose code has a calibrated question.

- **Dimension 3.1** — With the judge enabled, the `pr` gate carries `judge.*` criteria, and the evidence records question, key, answer, confidence, and model but never the input → Test `test_pr_gate_carries_judgments`
- **Dimension 3.2** — A dispatch prompt prints the recorded answer when one exists, names `orly judge` otherwise, and makes no network call → Test `test_dispatch_prompt_prints_recorded_answer`
- **Dimension 3.3** — `orly judge --spec` evaluates the Goal, each Dimension, each Test row, each Out of Scope bullet, and the first Product Clarity item → Test `test_spec_questions_cover_each_item`
- **Dimension 3.4** — In GitHub mode, blocking questions are asked fresh and local records are ignored → Test `test_ci_mode_ignores_local_records`
- **Dimension 3.5** — The ledger counts question-backed judgment clauses per rule document → Test `test_ledger_counts_question_backed_clauses`

### §4 — Calibration measures each question

`orly judge --calibrate --check` validates every question and fixture without a network call. `orly judge --calibrate [--ids <list>]` asks every fixture live and prints, per question, how many firing fixtures fired, how many quiet fixtures stayed quiet, and the tokens used. A question whose fixtures disagree with their labels ships as a draft: it reports, and it cannot be made blocking until a calibration run agrees. The spec questions also replay over orly's six done specs, and Indy reads the flagged items.

- **Dimension 4.1** — `--calibrate --check` validates every fixture with no network call → Test `test_calibrate_check_runs_offline`
- **Dimension 4.2** — A draft question refuses promotion to blocking, naming its last calibration result → Test `test_draft_question_refuses_blocking`
- **Dimension 4.3** — A live calibration run over every question records per-question agreement and tokens in Session Notes → Test `manual_live_calibration`
- **Dimension 4.4** — Indy reviews the flags from the spec questions replayed over orly's six done specs; his dispositions are recorded in Discovery → Test `manual_done_spec_replay`

## Interfaces

```
orly judge [--staged | --base <commit>] [--spec <path>] [--refresh] [--json]
orly judge --calibrate [--check] [--ids <list>]

Repository configuration (.orly/orly.json after M07_001 §2):
  "judge": { "provider": "typesafe", "model": "jev-latest",
             "blocking": { "spec.out_of_scope_removes_required_work": 0.8 } }
Key: TYPESAFE_API_KEY from the environment only.

Question file (schemas/question.schema.json):
{ "id": "nlg.legacy_twin", "version": 1, "rule": "NLG", "type": "noul",
  "reads": "diff_hunk", "applies_to": ["**/*.ts", "**/*.rs", "**/*.zig"],
  "instructions": "Does this change add a legacy-named symbol, a V2 twin, or a compatibility shim?",
  "criteria": { "true": "It adds one.", "false": "It adds none." },
  "finding": "true", "threshold": 0.8, "status": "draft" }

Request: POST https://api.typesafe.ai/v1/systemone
  { "model": "jev-latest", "state": { ... }, "questions": { "<id>": { "type", "instructions", "criteria" } } }
Record (<git dir>/orly/judgments/<key>.json):
  { "key", "question", "version", "requested_model", "returned_model", "answer", "confidence", "usage", "recorded_at" }
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Judge off | No `judge` setting or no key | Zero requests; judge criteria skipped with reason; `test_judge_off_changes_nothing` |
| Key rejected | 401 | Advisory questions skipped with `key_rejected`; blocking ones fail; `test_judge_failures_name_their_reason` |
| Bad question | 422 | That question fails naming its file; `test_judge_failures_name_their_reason` |
| Rate limit or overload | 429 or 529 | Backoff to the attempt limit, then skipped, or failed when blocking; `test_judge_failures_name_their_reason` |
| Timeout or network loss | No response in time | Same as overload; `test_judge_failures_name_their_reason` |
| Credential in input | Diff carries a token or key | Input withheld and skipped; nothing sent; `test_judge_withholds_secrets` |
| Oversized input | Hunk or item over the limit | Skipped with reason, never truncated; `test_judge_failures_name_their_reason` |
| Uncertain answer | Confidence under threshold | Reported as uncertain, never failed; `test_judge_answers_become_states` |
| Model moved | `jev-latest` changed | Records replay; evidence shows the returned model; `--refresh` re-asks; `test_judge_replays_recorded_answers` |
| Corrupt record | Unreadable record file | Ignored and asked again; `test_judge_replays_recorded_answers` |
| Forged record | An author writes a favorable record | GitHub mode ignores records for blocking questions; `test_ci_mode_ignores_local_records` |
| Injected input | Diff text tries to instruct the model | Input is framed as data and answers stay within defined criteria; `test_judge_answers_become_states` |

## Invariants

1. No request leaves the machine without both the repository's `judge` setting and `TYPESAFE_API_KEY` — the client cannot be constructed without both.
2. No input is sent before credential withholding — the client accepts only the withheld-checked input type.
3. A judgment never resolves authority — the question schema has no override, deferral, or consult-decision target, and LDC carries no decision options.
4. Advisory by default — only a question the repository lists as blocking can fail a gate, and a draft question cannot be listed.
5. Unchanged input replays its record without a request unless `--refresh` is given.
6. Blocking questions in GitHub mode never read local records.
7. Every judgment code has an owner — `audits/parity-dispatch.sh` runs in `make audit`.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Usage observation for `judge` | product | `orly judge` completes with prior anonymous consent | Existing fields; command value `judge` | No question, input, answer, key, or path | `test_judge_answers_become_states` |

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | unit | `test_question_files_validate` | Valid bank passes; missing fixture, unknown type, empty Choice → failure naming the file |
| 1.2 | integration | `test_judgment_codes_have_owners` | Current scripts → every code owned; a new unmapped `dispatch_judgment` code → audit fails |
| 1.3 | unit | `test_human_only_question_decides_nothing` | LDC question → trigger only; no remove, patch, or keep criteria |
| 2.1 | integration | `test_judge_selects_applicable_questions` | TypeScript hunk → TypeScript questions only; Markdown-only diff and no spec → zero requests |
| 2.2 | integration | `test_judge_answers_become_states` | Stub answers 0.95, 0.55, and a Choice → `reported`, blocking `failed` at 0.8, and `reported` uncertain |
| 2.3 | integration | `test_judge_replays_recorded_answers` | Second run → zero stub requests, same answer; `--refresh` → one request per question; corrupt record → asked again |
| 2.4 | integration | `test_judge_withholds_secrets` | Hunk with a private-key header or a known token prefix → skipped; stub server received nothing |
| 2.5 | integration | `test_judge_off_changes_nothing` | No setting, then setting without key → zero requests; gate output otherwise identical to a run without the judge |
| 2.6 | integration | `test_judge_failures_name_their_reason` | Stub 401, 422, 429, 529, delay past timeout, oversized hunk → named reasons; backoff attempts equal the limit |
| 3.1 | integration | `test_pr_gate_carries_judgments` | Enabled judge on a fixture branch → `judge.*` criteria; evidence has key, answer, confidence, model and no input text |
| 3.2 | integration | `test_dispatch_prompt_prints_recorded_answer` | Record present → prompt shows answer; absent → names `orly judge`; no socket opened |
| 3.3 | integration | `test_spec_questions_cover_each_item` | Fixture spec with three Dimensions and two Out of Scope bullets → one judgment per item and per Test row |
| 3.4 | integration | `test_ci_mode_ignores_local_records` | GitHub mode with a planted favorable record → blocking question asked fresh |
| 3.5 | unit | `test_ledger_counts_question_backed_clauses` | Rule document with two judged codes, one question-backed → count one |
| 4.1 | unit | `test_calibrate_check_runs_offline` | Every fixture validated; no socket opened |
| 4.2 | unit | `test_draft_question_refuses_blocking` | Configuration listing a draft question as blocking → refusal naming its calibration result |
| 4.3 | manual | `manual_live_calibration` | Implementer runs live calibration with a real key; per-question agreement and tokens pasted in Session Notes |
| 4.4 | manual | `manual_done_spec_replay` | Indy reads flags from the replay over orly's six done specs; dispositions recorded in Discovery |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Questions validate and every judgment code has an owner (§1) | `bun test src -t "test_question_files_validate\|test_judgment_codes_have_owners"` | exit 0 | P0 | |
| R2 | The judge asks, withholds, records, and fails by reason (§2) | `bun test src -t test_judge_` | exit 0 | P0 | |
| R3 | Without the setting or key nothing changes (§2) | `bun test src -t test_judge_off_changes_nothing` | exit 0 | P0 | |
| R4 | Gates, scripts, and specs use the answers (§3) | `bun test src -t "test_pr_gate_carries_judgments\|test_dispatch_prompt\|test_spec_questions\|test_ci_mode_ignores\|test_ledger_counts"` | exit 0 | P0 | |
| R5 | Calibration validates offline and blocks draft promotion (§4) | `bun test src -t "test_calibrate_check_runs_offline\|test_draft_question"` | exit 0 | P0 | |
| R6 | Scope holds | `git diff --name-only origin/main...HEAD` | 0 paths missing from Files Changed | P0 | |
| S1 | Declared conformance | `make conform` | exit 0 | P0 | |
| S2 | Declared verification | `bun test src` | exit 0 | P0 | |
| S3 | Governance invariance | `make audit` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S5 | No oversize source file | `git diff --name-only origin/main...HEAD \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | |

## Dead Code Sweep

N/A — no files deleted. Dispatch prompts keep printing; each gains its owner and any recorded answer.

## Out of Scope

- Judge providers other than TypeSafe; the configuration names a provider so another can follow.
- Committing answer records to the repository, which would let an author write their own verdicts.
- Classifying session corrections and review comments into proposed checks; the next Milestone reuses this question format.
- Judging test bodies against the production lines they cover, which needs the coverage proof in the next Milestone.
- Judging PR descriptions and Session Notes.
- Asking Jev at commit time; commits stay offline and read records only.
- Changes to `core/operating-model.md`.
- Cost measurement beyond recorded token usage; TypeSafe's reference does not state pricing.

## Product Clarity (authoring record)

1. **Successful user moment** — Indy runs `orly judge --spec` on a draft, and an Out of Scope bullet that drops required work comes back flagged with its probability before PLAN approval; on the PR, the gate shows the NLG question fired on one hunk, and the agent removes the shim before review.
2. **Preserved user behaviour** — Without the setting or key, every gate, prompt, and exit status is unchanged; every deterministic check keeps running.
3. **Optimal-way check** — The strongest question judges a test body against the production lines it covers; that needs coverage from the next Milestone. The question bank, runner, records, and calibration come first because every later question reuses them.
4. **Rebuild-vs-iterate** — Iterate: registry rules, the ledger, dispatch prompts, and M07_001's states already carry the shape.
5. **What we build** — Question files with fixtures, the `judged` decision kind, the runner and client, credential withholding, answer records, gate and script wiring, the template step, and calibration.
6. **What we do NOT build** — Other providers, committed records, the correction classifier, commit-time requests, a dashboard.
7. **Fit with existing features** — Reports through M07_001's states and evidence; must not slow or network the commit hook.
8. **Surface order** — Command line first; gates and templates call the same command.
9. **Dashboard restraint** — No scores or badges; each judgment shows its question, answer, and probability.
10. **Confused-user next step** — `orly judge --calibrate --check` validates the setup offline and names a missing key or setting.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Four Sections in dependency order: questions, runner, wiring, calibration. Calibration lands last because it measures the bank the earlier Sections build.
- **Alternatives considered:** Asking Jev inside each bash prompt would put network calls in every commit. A reasoning-model judge returns prose without a typed probability; the provider field keeps it possible. Embedding questions in rule pages would add bytes to installed pages and mix machine data into prose; question files with a parity audit keep one owner per question.
- **Patch-vs-refactor verdict:** this is an additive **patch** on existing registry, ledger, and gate shapes.

## Discovery (consult log)

- **Consults** — Sep 23, 2026: TypeSafe's published reference read for endpoint, request and answer shapes, error codes, and backoff; its confidence guide for routing below threshold. It states no pricing, request size limit, or reproducibility guarantee. Inventory of `dispatch_judgment` calls: two in `dispatch/lib.sh`, four in `dispatch/write_any.sh`, four in `dispatch/write_zig.sh`, three in `dispatch/write_ts_adhere_bun.sh`, two in `dispatch/write_sql.sh`, eleven distinct codes. Indy's direction is quoted in the PR Intent handshake.
- **Metrics review** — `judge` joins the observed command set; no analytics or funnel change.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand. Implementation proofs, `/review`, calibration, and post-push monitoring are pending.
- **Deferrals** — None.
