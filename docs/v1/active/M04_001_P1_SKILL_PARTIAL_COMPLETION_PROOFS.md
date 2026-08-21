# M04_001: Partial-completion failure proofs

**Prototype:** v1.0.0
**Milestone:** M04
**Workstream:** 001
**Date:** Aug 21, 2026
**Status:** IN_PROGRESS
**Priority:** P1 — a missed later interaction can leave durable user state present while its external work has already been cancelled
**Categories:** SKILL
**Batch:** B1 — one focused rules change
**Branch:** `feat/m04-partial-completion-proofs`
**Test Baseline:** `unit=108 integration=0` (`bun test orly/src`: 108 pass, 0 fail; no integration command is declared in `.oracle/orly.json`)
**Depends on:** none
**Provenance:** Agent-drafted from Indy's DELETE-fleet failure case and the current `write-unit-test` allocation-failure ladder
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §Why it's materialised — these skills are distributed as selected-pack files

---

## Overview

**Goal (testable):** When an operation touches more than one system or acquires the same resource more than once, both test skills require an ordered failure-point matrix, deterministic failure selected by workflow and boundary-call ordinals, residual-state assertions, retry assertions, and a design finding when an external mutation can complete before any durable record makes it observable and repairable.

**Problem:** The integration skill currently maps dependencies and requires one injected test per downstream branch. Its PostgreSQL pool-exhaustion example drains the pool, so the first acquisition fails and every later acquisition is unreachable. Its state assertions sit under the success-path tier. A handler can therefore release a connection, change QStash state, fail its second connection acquisition, return an expected error, and leave the fleet visible but permanently idle while the test stays green.

**Solution summary:** Extend Tier 4 (T4) without renumbering. Make ordered interaction enumeration and selected-interaction injection mandatory, distinguish workflow order from boundary-call order, apply state assertions after every injected failure, rank release-then-reacquire windows first, and report unrecorded external mutation as a design defect. Mirror the exhaustive-failure shape in the unit skill so deterministic seams prove each interaction just as Zig allocation tests prove each allocation site.

The eventual Pull Request (PR) carries only this method correction.

## PR Intent & comprehension handshake

- **PR title (eventual):** `docs(skills): require partial-completion failure proofs`
- **Intent:** A test cannot claim multi-step failure coverage until it has failed every interaction in order and proved what the user is left with after each failure.
- **Handshake:** Before editing, restate the intent and list assumptions. Any mismatch stops execution.

## Implementing agent — read these first

1. `skills/write-integration-test/SKILL.md` §T3, §T4, §Hard rules, §Anti-patterns, §Spec integration, and §Definition of Done.
2. `skills/write-unit-test/SKILL.md` §Step 0, §Failure, §Hard rules, §Anti-patterns, §Spec integration, and §Definition of Done.
3. `docs/ORLY_ARCHITECTURE.md` §Why it's materialised — skill edits ship through repository materialisation.
4. `dispatch/edit_rules.md` — governance verification and generated evidence are mandatory for this workstream.

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `docs/v1/pending/M04_001_P1_SKILL_PARTIAL_COMPLETION_PROOFS.md` | CREATE, then MOVE to `active/` and `done/` | Record intent, tests, and graded evidence |
| `skills/write-integration-test/SKILL.md` | EDIT | Extend T4 with ordered interaction failure proofs and residual-state requirements |
| `skills/write-unit-test/SKILL.md` | EDIT | Carry the same exhaustive interaction model into unit-test planning and completion |
| `evals/llms/agents.sh` | EDIT | Recognize Amp's current credit-exhaustion response as unavailable |
| `evals/llms/run.sh` | EDIT | Run the availability-classifier regression check before live calls |

## Applicable Rules

- `dispatch/edit_rules.md` — run `make audit`, answer every `audits/agents-md.md` question, run a live comprehension evaluation because skill semantics change, and generate evidence.
- `dispatch/write_spec.md` — this file follows `docs/TEMPLATE.md`, carries one test per Dimension, and leaves no unresolved slot.
- `docs/greptile-learnings/RULES.md` — RULE No Dead Code (NDC) forbids inert prose, RULE No Legacy Retained (NLR) fixes touched ambiguity, RULE No Legacy Compatibility Shims (NLG) forbids new legacy framing, and RULE Test Naming (TST-NAM) keeps scenario names behavior-shaped.
- `skill-creator` — keep a narrow existing-skill edit, preserve progressive disclosure, validate metadata, and forward-test realistic usage.
- `dispatch/write_shell.md` and `dispatch/write_any.md` — the approved evaluator correction keeps quoted expansions, temporary-file cleanup, file length, and touched-file cleanup rules.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| SPEC TEMPLATE GATE | yes | `bash audits/spec-template.sh --staged` passes before each spec commit |
| Invariance Suite Gate | yes | `make audit`, every questionnaire answer matching its expected verdict, live evaluation, and generated evidence before push |
| Skill validation | yes | run `quick_validate.py` against both edited skill directories |
| Shell gate | yes | `bash -n`, classifier regression checks, and evaluator check mode pass for both edited shell files |
| User-surface documentation | no | this changes agent test method, with no product behavior or public API change |

## Prior-Art / Reference Implementations

- **Zig exhaustive allocation failure:** `std.testing.checkAllAllocationFailures` already names the desired proof shape in `write-unit-test`: fail allocation one, then two, then three, and verify cleanup after each result.
- **Document-read evidence:** `audits/doc-read.sh` turns a required action into a runtime-neutral record. This work records compliance through the partial-completion matrix in the test plan and PR Session Notes.
- **OpenAI skill structure:** [Build skills](https://learn.chatgpt.com/docs/build-skills) defines `SKILL.md` as the required instruction surface loaded when a skill is selected. A focused edit to each existing file is therefore the smallest complete change.

## Sections (implementation slices)

### §1 — Enumerate ordered interactions before injecting failures

T4 starts from an ordered interaction list, including repeated acquisitions of the same resource. An operation that calls the database, then QStash, then the database again has three distinct workflow points and two database-call ordinals. The matrix names both ordinals, the operation scope, dependency, action already completed, injection seam, residual-state assertion, user-visible result, and retry result.

- **Dimension 1.1** — DONE — T4 triggers when an operation touches multiple systems or acquires the same resource more than once → Test `should_require_matrix_for_repeated_acquisition`
- **Dimension 1.2** — DONE — the integration skill requires deterministic injection at each selected workflow and boundary-call ordinal and states that pool draining proves only the first acquisition → Test `should_fail_each_ordered_interaction`

### §2 — Prove residual state and surface unsafe ordering

Every injected failure asserts durable rows, external state, user-visible state, and whether retry heals the operation. A response code is supporting evidence. A release-network-reacquire window is the highest-risk injection point because the second acquisition competes with work that arrived during the network gap. The test classifies external interactions and reports a design defect when a mutation can complete before any durable record makes it observable and repairable.

- **Dimension 2.1** — DONE — T3 state assertions apply to every T4 failure row and require retry behavior → Test `should_reject_status_only_failure_proof`
- **Dimension 2.2** — DONE — release-then-reacquire is ranked first; valid read-only prerequisites remain allowed; unrecorded external mutation becomes a design finding → Test `should_report_external_before_durable_ordering`

### §3 — Keep unit and integration methods aligned

The unit skill records the same ordered interactions in its diff ledger and requires a seam that selects workflow and boundary-call ordinals. Unit tests may use boundary fakes; integration tests keep real internal dependencies and inject at their system boundary. Both completion lists require one partial-completion row per failure point.

- **Dimension 3.1** — DONE — the unit skill adds workflow-ordinal and boundary-call-ordinal injection to its ledger, hard rules, and anti-patterns → Test `should_require_dual_ordinal_unit_seam`
- **Dimension 3.2** — DONE — both skills require a complete partial-completion matrix in Definition of Done → Test `should_block_incomplete_partial_completion_matrix`

### §4 — Keep live comprehension availability distinct from a wrong answer

The required smoke run exposed Amp's current `Out of Credits` response. The evaluator did not recognize that wording, converted the empty verdict to `?`, and graded an unavailable agent as wrong. The existing unavailable policy remains unchanged; its classifier gains the observed wording and a deterministic positive/negative check in the no-token path.

- **Dimension 4.1** — DONE — credit exhaustion is excluded as unavailable while a real `VERDICT: NO` remains gradeable → Test `should_distinguish_unavailable_from_no_verdict`

## Interfaces

No code API changes. The instruction interface added to both skills is one matrix with these required fields:

```text
workflow ordinal | boundary-call ordinal | dependency/resource | interaction |
prior completed actions | injection seam | operation/request scope | expected response |
durable residual state |
external residual state | user-visible state | retry outcome | design finding
```

The integration skill proves rows against real internal dependencies. The unit skill may use an explicit boundary fake that fails a selected ordinal.

## Failure Modes

| Mode | Cause | Handling |
|------|-------|----------|
| First acquisition only | A pool is drained before the request starts | Reject the coverage claim; require a seam that fails acquisition two independently |
| Response-only assertion | The test checks `503` and stops | Reject the test; require durable, external, user-visible, and retry-state assertions |
| Missing repeated acquisition | The request map lists dependencies but collapses two database acquisitions into one | Require ordered interactions, not unique dependency names |
| Silent unsafe ordering | An external cancellation completes before any durable intent or repair record | Report a design defect; prefer durable intent first, or require idempotency, compensation, and reconciliation |
| Unit-only proof | A fake proves the branch but real resource behavior differs | Keep the unit proof and add the integration row against real internal dependencies |
| Amp credit response graded wrong | `Out of Credits` is absent from the unavailable matcher | Recognize the observed wording and prove a real `VERDICT: NO` is not excluded |

## Invariants

1. Existing integration tier numbering remains T1 through T9.
2. Every multi-system or repeated-resource operation has one matrix row per ordered failure point.
3. Every row names deterministic injection, residual state, user-visible state, and retry behavior.
4. Pool draining can satisfy only a first-acquisition row.
5. External mutation without durable intent or a repair record is reported as a design defect; read-only prerequisites remain valid.
6. Integration tests retain real internal dependencies; unit tests inject through explicit boundaries.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|----------------|-------|------------|--------------------|---------------|------------|
| not applicable — internal skill method only | not applicable | no runtime event | none | no data leaves the repository | acceptance rows R1 through R7 |

**Metrics review:** No product metric changes. The durable record is the partial-completion matrix carried by the implementation plan and PR Session Notes.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts |
|-----------|------|------|---------|
| 1.1 | behavior evaluation | `should_require_matrix_for_repeated_acquisition` | Given database acquire → release → QStash cancel → database reacquire, the skill emits three ordered rows |
| 1.2 | behavior evaluation | `should_fail_each_ordered_interaction` | The second database acquisition gets workflow and boundary-call ordinals plus an operation-scoped failpoint; whole-pool exhaustion is rejected as proof of that row |
| 2.1 | behavior evaluation | `should_reject_status_only_failure_proof` | A proposal asserting only `503` is incomplete until rows, schedules, visible fleet state, and retry outcome are asserted |
| 2.2 | behavior evaluation | `should_report_external_before_durable_ordering` | The release-network-reacquire window is highest risk; read-only prerequisites are valid; cancel-before-recording durable intent is reported as a design defect |
| 3.1 | content validation | `should_require_dual_ordinal_unit_seam` | Unit hard rules and anti-patterns name workflow-ordinal and boundary-call-ordinal injection and reject whole-pool exhaustion as exhaustive proof |
| 3.2 | content validation | `should_block_incomplete_partial_completion_matrix` | Both Definition of Done lists require one row per failure point with a residual-state assertion |
| 4.1 | regression | `should_distinguish_unavailable_from_no_verdict` | `Out of Credits` matches unavailable; `VERDICT: NO` does not |

**Behavior evaluation method:** Give an independent agent the DELETE-fleet case once with the parent skill files and once with the edited files. The parent run must omit or under-specify the second acquisition or residual state. The edited run must produce the complete matrix and design finding. Record both verdicts in Discovery.

## Acceptance Rubric (single scoring surface)

| # | Criterion | Verify | Expected | Priority | Graded (VERIFY) |
|---|-----------|--------|----------|----------|-----------------|
| R1 | Integration T4 requires ordered interaction enumeration and dual-ordinal selection | `rg -n "ordered interaction" skills/write-integration-test/SKILL.md && rg -n "workflow ordinal.*boundary-call ordinal|workflow-ordinal.*boundary-call-ordinal" skills/write-integration-test/SKILL.md` | enumeration and both ordinals present | P0 | ✅ PASS — enumeration and both ordinal names matched |
| R2 | Pool draining is rejected as later-acquisition proof | `rg -ni "drain.*pool|pool.*drain" skills/write-integration-test/SKILL.md skills/write-unit-test/SKILL.md` | explicit rejection in both skills | P0 | ✅ PASS — both skills reject the claim |
| R3 | Every injected failure requires residual-state and retry assertions | `rg -n "residual state|retry" skills/write-integration-test/SKILL.md skills/write-unit-test/SKILL.md` | requirements present in both skills | P0 | ✅ PASS — both skills require all residual-state fields and retry outcome |
| R4 | Unsafe ordering produces a design finding | `rg -n "design defect|external.*durable" skills/write-integration-test/SKILL.md` | explicit rule present | P0 | ✅ PASS — unrecorded external mutation is a design defect |
| R5 | Existing tier numbering is unchanged | `rg -n '^### T[0-9]' skills/write-integration-test/SKILL.md` | exactly T1 through T9 | P0 | ✅ PASS — T1 through T9 appear once each |
| R6 | Parent/new behavior evaluation proves the change bites | Discovery transcript | parent incomplete; edited complete | P0 | ✅ PASS — parent omitted required proof; edited skill passed all six behaviors |
| R7 | Availability matching recognizes the observed Amp response without swallowing a verdict | `make llmevals CHECK=1` | classifier validation and 53 fixtures pass | P0 | ✅ PASS — 53 fixtures; live smoke passed with Amp correctly unavailable |
| S1 | Both skill files validate | `quick_validate.py skills/write-integration-test && quick_validate.py skills/write-unit-test` | both valid | P0 | ✅ PASS — both validators reported `Skill is valid!` |
| S2 | Governance audit passes | `make audit` | `ALL CHECKS PASSED` | P0 | ✅ PASS — Bun 1.3.14: 108 unit, 12 dispatch, 23 ledger, and 22 install checks passed |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 | ✅ PASS — 497 commits scanned; no leaks found |
| S4 | Diff stays inside Files Changed | `git diff --name-only "$(git merge-base origin/main HEAD)"` | only the five listed paths | P0 | ✅ PASS — exactly the five listed paths |

**Grading protocol:** Run each command from the repository root. Every row must carry a decisive output line before CHORE(close). Any failure returns to EXECUTE.

## Dead Code Sweep

| Candidate | Verify | Expected |
|-----------|--------|----------|
| New tier name or renumbered tier | `rg -n '^### T[0-9]' skills/write-integration-test/SKILL.md` | T1 through T9, once each |
| Status-only failure advice left unqualified | review T3, T4, hard rules, and anti-patterns | no path permits a response-only proof |
| First-acquisition-only pool example left unqualified | review the pool-exhaustion row and partial-completion rule | example is scoped to acquisition one |

## Out of Scope

- Changing the `agentsfleet` DELETE handler or sweeping its other partial-completion sites.
- Adding a repository checker, dispatch entry, or generated `AGENTS.md` rule.
- Changing Bun, workflows, product documentation, release metadata, API behavior, or schema.
- Renumbering or reorganizing the existing integration tiers.

## Product Clarity (authoring record)

1. **Successful user moment:** An engineer injects failure at the second database acquisition and sees the test expose a fleet that remains visible after its schedules were cancelled.
2. **Preserved behavior:** Existing single-dependency failure tests and T1 through T9 keep their current meaning.
3. **Optimal-way check:** A reusable ordered-interaction injector could mechanize the method in `agentsfleet`; that belongs to the product repository because resource seams are stack-specific. This milestone makes the method mandatory first.
4. **Rebuild-vs-iterate:** Iterate. T4 already owns deterministic downstream failure injection and T3 already owns state assertions. The missing rule connects them across every ordered interaction.
5. **What we build:** Focused instruction edits, one forward evaluation, an availability-classifier correction, validators, and governance evidence.
6. **What we do not build:** Product tests, shared injectors, a new tier, or a new gate.
7. **Fit with existing features:** The change ports the unit skill's exhaustive allocation ladder to connections, transactions, and external calls.
8. **Surface order:** Skill instructions first. Product-specific seams follow when a product implementation invokes the skill.
9. **Dashboard restraint:** No percentage claims. Completion is row-based: every interaction has a proof or the operation is incomplete.
10. **Confused-user next step:** The matrix names the missing ordinal and the assertion fields required to close it.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Extend T4 and the existing unit ledger. Add one hard rule, two anti-patterns, the matrix fields, and matching completion rows. Correct the live evaluator's observed Amp credit wording and exercise it in the existing no-token path. This preserves both reading paths.
- **Rejected alternative:** A new integration tier would split one failure method across two places and force tier renumbering without adding a distinct test boundary.
- **Rejected alternative:** Widen T3 alone would require state assertions but still would not reach the second acquisition.
- **Rejected alternative:** Drain the whole pool at different times. That couples the test to timing and cannot choose one acquisition deterministically.
- **Refactor verdict:** This is a focused method correction. The tier structure and test ownership remain sound.

## Discovery (consult log)

- Aug 21, 2026 — Indy directed partial-completion rules to land before the Bun 1.4 migration. The Bun diff was isolated in a named stash.
- Aug 21, 2026 — Scope call: one spec plus the two existing skill files; no dispatch entry, checker, helper, generated rules file, or product change.
- Aug 21, 2026 — Live smoke found Amp's `Out of Credits` response was scored as a wrong answer. Indy approved the narrow matcher and regression-check expansion.
- Aug 21, 2026 — Parent-skill evaluation omitted or under-specified the later database acquisition and residual-state proof. The edited-skill evaluation passed all six required behaviors.
- Aug 21, 2026 — Final independent DELETE-fleet evaluation produced three ordered rows, both database-call ordinals, operation-scoped injection, complete residual-state assertions, pool-drain rejection, and the unsafe-ordering finding.
- Aug 21, 2026 — Final live smoke passed Claude, Codex, and OpenCode at 1/1. Amp's exact zero-exit credit diagnostic was classified unavailable. Classifier checks reject timeouts, crashed answers, trailing diagnostics, and ordinary prose containing authentication terms.
- Aug 21, 2026 — Adversarial, red-team, and maintainability reviews returned clean after fixes to stream ordering, exit-status grading, error-shape matching, dual-ordinal naming, and matrix eligibility.
- Aug 21, 2026 — The final Bun 1.3.14 audit passed 108 unit tests, 12 dispatch checks, 23 ledger checks, and 22 install checks. Gitleaks scanned 497 commits and found no leaks.
