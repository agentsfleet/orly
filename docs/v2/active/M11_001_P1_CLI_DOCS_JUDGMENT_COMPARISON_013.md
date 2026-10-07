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

# M11_001: Evaluate bounded judgment and prepare orly 0.13.0

**Prototype:** v2.0.0
**Milestone:** M11
**Workstream:** 001
**Date:** Oct 07, 2026
**Status:** IN_PROGRESS
**Priority:** P1 — prove useful judgments and honest completion evidence
**Categories:** CLI DOCS (command-line interface, documentation)
**Batch:** B1 — one implementation stream
**Branch:** feat/m11-judgment-comparison
**Baseline revision:** a09ae05042b66cde67c91c1f326fa1b7e3f5b94e
**Test Baseline:** unit=536; integration included in unit lane; no separate integration command declared
**Baseline evidence:** evals/judgments/comparison/receipts/baseline-unit.txt
**Depends on:** M09_001 merged implementation; M08 historical observations only, not its unfinished checks
**Provenance:** agent-generated through orly-spec-new from Indy's 0.13.0 request and parking instruction
**Canonical architecture:** `docs/architecture/judgment-evaluation.md`; `docs/architecture/installation.md`

## Overview

**Goal (testable):** Prepare an orly 0.13.0 Pull Request whose offline evaluation detects unsupported completion, compares five judgment candidates against the unchanged six-question baseline, and refuses runtime adoption without independent measured benefit.
**Problem:** A passing selected test can miss an obligation, an uncalled implementation, a failure path or an unresolved finding. Historical TypeSafe Jev model observations do not measure those gaps across complete tasks (`evals/release/evaluation-plan.md`, Evaluation set and measurement).
**Solution summary:** Add a bounded offline evaluation suite with independent expectations, separated development and held-out families, hidden task assertions, complete outcome accounting and an adoption report. Retain the TypeScript/Bun runtime, installed ownership/recovery guarantees and deterministic gates. Produce the 0.13.0 source package and ready Pull Request; Merge, publication and live upgrades require subsequent owner instruction.

## PR Intent & comprehension handshake

- **Pull Request (PR) title:** Evaluate bounded judgments and prepare orly 0.13.0
- **Intent:** Give the commander reproducible evidence about missing work and preserve an honest boundary between evaluated behavior and unavailable model evidence.
- **Handshake:** Authoring understands the deliverable as one verified orly change, with the candidate experiment separate from runtime question registration. Implementation restates this before its first edit.
- **ASSUMPTIONS I'M MAKING:** Prototype v2 follows the requested `docs/v2/` organization; package version is 0.13.0. Live calls stay excluded. In the absence of eligible independent model observations, all five candidates remain evaluation-only and the six runtime questions remain unchanged.

## Implementing agent — read these first

1. `evals/release/evaluation-plan.md` — evaluation families, independence and task evidence.
2. `evals/release/release-report.md` — observed 0.11.0 behavior and retained exclusions.
3. `docs/v1/done/M09_001_P1_CLI_DOCS_INFRA_SKILL_VERIFIED_COMMANDER_RELEASE.md` — inherited preservation requirements and proof limits.
4. `docs/JUDGMENTS.md` and `src/judgments/questions.ts` — shipped six-question catalog, evidence roles and fixed advice.
5. `src/spec_rehearsal.test.ts`, `src/installation_preservation.test.ts` and `src/execution/plan.test.ts` — real local evaluation boundaries and refusal controls.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| `docs/v2/pending/M11_001_P1_CLI_DOCS_JUDGMENT_COMPARISON_013.md` and active/done destinations | CREATE/MOVE | Fresh scope, proofs and lifecycle |
| `evals/judgments/comparison/` | CREATE | Selectively recover and complete frozen catalog, cases, independently grounded labels, bounded task exercises and reports |
| `src/judgment_comparison*.test.ts`, `src/judgment_labels*.test.ts`, `src/judgment_score*.test.ts`, `src/judgment_tasks*.test.ts` | CREATE | Validation, scoring, task and cleanup regression proofs |
| `docs/architecture/judgment-evaluation.md`, `evals/release/evaluation-plan.md` | EDIT | Reconcile parked design with completed offline examiner |
| `README.md`, `docs/JUDGMENTS.md`, `llms.txt`, `docs/CHANGELOG.md` | EDIT | Contributor usage, evidence limits and release notes |
| `package.json`, `.orly/orly.json` | EDIT | Synchronize 0.13.0; preserve installed layout |
| `evals/judgments/comparison/receipts/` | CREATE | Baseline, final, review and adoption evidence |
| Isolated `agentsfleet` rehearsal worktree: `.orly/` managed update and `ui/packages/design-system/src/design-system/time-utils.ts` | REHEARSE/RESTORE | User-requested packed 0.13.0 installation and bounded mutations of actual consumer behavior; preserve source and owner files |

Runtime catalog, installer, supervisor, hooks and audit rules remain read-only.
Recover only the evaluator and tests from stash `656ec6b94cdead8e5d18d0e72af6315e79946679`; never pop or drop it.
Preserve 0.12.1 audit preflight and diagnostic fixes from current upstream.

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: No Dead Code (NDC), Orphan sweep (ORP), File and Function Length (FLL), Unified Form for Symbols (UFS), Prompt-injection Resistance (PRI), TypeScript conventions (TSC) and TypeScript judgment (TSJ).
- `dispatch/write_spec.md`, `docs/TEMPLATE.md`: complete mappings, pending baselines, bounded scope and honest lifecycle status.
- `dispatch/write_any.md`, `dispatch/write_ts_adhere_bun.md`: named bounds, parsing at boundaries, passive helpers and concern-based file shape.
- `dispatch/edit_rules.md`: source edits trigger audit, questionnaire and evidence; live comprehension remains explicitly excluded.
- `dispatch/write_documentation.md`, `docs/DOCUMENTATION_RULES.md`, `dispatch/write_changelog.md`, `docs/CHANGELOG_VOICE.md`: source-grounded docs and append-only changelog.
- `dispatch/lifecycle.md`, `dispatch/verify.md`, `dispatch/write_pr_description.md`: baseline, verification, review and final evidence ownership.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Specification and document reads | yes | Record applied sections; validate both edited specs and all declared commands |
| TypeScript file shape, length and named symbols | yes | Operations over parsed values; pure scoring separate from bounded task side effects; source ≤350 lines, functions ≤50 |
| Governance, review and secret scan | yes | Unchanged gates; current questionnaire/evidence; real Gitleaks before commit and push |
| Architecture consultation | yes | Evaluation design lands with its first implementation; installation/remote behavior retained |
| Work, verification and PR boundary | yes | `make conform`, configured unit command, final `bin/orly gate pr` |
| Native, database and graphical interface | no | No native builds, schema changes or graphical interface |

## Prior-Art / Reference Implementations

- `src/spec_rehearsal.test.ts`: disposable repositories with actual gate refusals and observable behavior.
- `src/judgments/questions.ts`, `src/judgments/replay.ts`: fixed questions and exact identity; editable replay is not independent measurement.
- `src/command_process.ts`: reuse its supervisor from an evaluator-owned adapter in `comparison/tasks.ts`. `src/command_runner.ts` retains failure receipts and returns prose; leave both production files unchanged. The adapter owns structured result capture and temporary-directory cleanup.
- `evals/release/inventory.ts`: changed source invalidates prior evidence; bind final results similarly.
- `docs/TEMPLATE.md` command-line guidance: separate parsing, pure decisions and rendering. The evaluation is a contributor command, so no new public verb or configuration setting is needed.

## Sections (implementation slices)

### §1 — Freeze the comparison and evidence boundaries

Prerequisite: opening metadata committed from current main. No provider credential is needed for offline work. A later live request would require renewed owner authorization, `TYPESAFE_API_KEY` from the environment, a passing real secret scan and available provider capacity; no credential is read during this scope.

- **Dimension 1.1** — DONE — Pin all six current question definitions, answer types, fixed actions and `jev-1.13.0`; reject baseline drift. → Test `comparison_preserves_runtime_baseline`
- **Dimension 1.2** — DONE — Define exactly five evaluation-only candidates with complete evidence roles and bounded answers; reject unknown questions and missing roles. → Test `candidate_inputs_are_complete`
- **Dimension 1.3** — DONE — Validate source digests, disjoint origin families, provenance and all attempted outcomes; refuse stale, duplicate or cross-split evidence. → Test `comparison_rejects_invalid_provenance`

### §2 — Establish independent labels and discriminating controls

Depends on §1. Cover healthy, defective, ambiguous and insufficient-evidence cases for each baseline and candidate question, with at least two independently resolved development and two independently resolved held-out cases per class. Pending/disputed cases do not satisfy these minimums. Split by originating defect family before prompt tuning; copied mutations stay in one split. These are minimum corpus requirements, not an accuracy claim.

- **Dimension 2.1** — DONE — Each label records task class, expected native answer, rationale, source/revision, fixture author and independent oracle or reviewer, plus adjudication status. A reviewer must differ from the fixture author; an oracle must ground the expected answer outside the evaluated implementation/reply. An independence flag alone is insufficient. Freeze before observing answers; absent support or insufficient resolved counts makes `--check` fail. → Test `labels_require_independent_evidence`
- **Dimension 2.2** — DONE — Pair weak-pass, exact-fail and repair-pass controls on one fixed requirement; cover circular expectations, omitted obligations, uncalled helpers, unrelated negative tests and superficial repairs. → Test `hidden_assertions_reject_false_completion_and_preserve_honest_blocks`
- **Dimension 2.3** — DONE — Freeze the per-question mappings and denominator rules in Interfaces before reading observations. Score native-answer correctness separately from task health; retain invalid/unavailable attempts. Empty denominators and distinctions the answer format cannot express are unavailable, not perfect scores. → Test `metrics_preserve_missing_outcomes`

### §3 — Evaluate complete tasks with hidden assertions

Depends on §1–§2. Build at least five task families: missing obligation, missing production caller, missing failure proof, unresolved finding and a legitimate permission block. Each has a healthy control and a plausible false completion. Use fresh disposable Git repositories and real installed discovery files. The evaluator retains its expected results outside task workspaces and excludes them from supplied evidence and task logs. This is input separation, not a security sandbox against a hostile local user.

- **Dimension 3.1** — DONE — Record initial/final source, installed package identity, allowed actions, command arguments, exits and cleanup; stale or incomplete task receipts refuse scoring. → Test `task_receipts_bind_actual_execution`
- **Dimension 3.2** — DONE — Hidden behavioral assertions reject each false completion even when submitted tests pass; labels and hidden assertions cannot enter the actor payload. → Test `hidden_assertions_reject_false_completion_and_preserve_honest_blocks`
- **Dimension 3.3** — DONE — Distinguish completed, failed and truthfully blocked tasks; a missing permission cannot count as completed, and blocked prose cannot conceal a failed required assertion. → Test `hidden_assertions_reject_false_completion_and_preserve_honest_blocks`
- **Dimension 3.4** — DONE — The evaluator owns workspace, receipts and processes. Capture source/command identity, actual exit or explicit unavailable exit, failure kind, elapsed time and output counts before cleanup. For success, nonzero exit, timeout, excessive output and handled interruption, stop/reap owned processes and remove both temporary directories; preserve an unrelated sentinel. Missing results remain incomplete. Scripted controls make zero provider requests. → Test `offline_tasks_bound_and_clean_owned_work`

Cleanup runs under an outer evaluation owner so stopping a task or its supervisor cannot bypass it. Abrupt loss of that owner cannot promise immediate cleanup: record ownership at creation, refuse a clean receipt, and recover only its verified stale resources on restart. No cleanup scans or removes another run's paths/processes. The durable bounded report survives cleanup outside temporary directories; hidden expectations never enter it.

Actual fresh commander sessions and new live Jev responses remain excluded. Scripted task runs verify the evaluator and deterministic behavior; reports must identify them as scripted and leave autonomous model completion unmeasured. Stored observations are eligible only when their source, question, split and independent-label provenance match exactly.

### §4 — Make an evidence-backed adoption decision

Depends on §2–§3. Register the comparison criteria before reading results. A future authorized measurement compares each candidate against the same held-out task families under baseline-only and candidate-assisted conditions. The offline command emits missing measurements and a retain decision; it does not implement a live importer or certify editable provenance. A candidate can be recommended only with at least twenty independently labeled held-out examples per class, observed defect recall ≥0.90, false-concern rate ≤0.05, insufficient-evidence detection ≥0.90, zero unsupported completions, and a paired improvement in correctly resolved tasks with no new authority violations. Report sample uncertainty and all attempts; these are proposed acceptance thresholds, not calibrated guarantees.

- **Dimension 4.1** — DONE — Synthetic replies, owner-editable replay, missing independent labels, insufficient samples and unmatched comparison inputs cannot qualify for adoption; emit one reasoned retain/reject/eligible decision per candidate. → Test `adoption_requires_independent_measured_benefit`
- **Dimension 4.2** — DONE — Default 0.13.0 decision retains all six runtime questions when live evidence is unavailable; no new question is registered merely because an offline suite passes. → Test `unmeasured_candidates_remain_evaluation_only`

No eligible historical observations were supplied for this corpus; unresolved label disagreements require a separate reviewer or Indy to adjudicate. Missing observations block accuracy claims and adoption, but do not block an independently grounded offline corpus. Unresolved labels cannot satisfy §2 or release acceptance. Any new model-assisted labeling or live comparison requires renewed approval. The existing `0.8` advice threshold remains uncalibrated and unchanged.

### §5 — Preserve shipped behavior and deliver 0.13.0 for review

Depends on §1–§4. Reuse completed 0.12 installation controls and 0.12.1 fixes without reimplementing them.

- **Dimension 5.1** — DONE — Run existing package-preservation evaluations and process tests, retaining `.orly/` layout, owner bytes, refusal and recovery behavior. → Test `make install-evals`
- **Dimension 5.4** — IN_PROGRESS — Rehearse the packed 0.13.0 version in a separate `agentsfleet` worktree. Exercise actual time-formatting source, production caller, precise expectations, invalid inputs and unresolved-finding controls; restore every mutation and retain source hashes, attempts and owner-preservation evidence. → Test `consumer.ts submitted-hidden-repaired checks`
- **Dimension 5.2** — DONE — Synchronize version, reference claims, changelog and evaluation report; package output identifies 0.13.0 and six runtime questions. → Test `consumer.ts packed-version and packed-doctor`
- **Dimension 5.3** — IN_PROGRESS — Complete declared checks, baseline delta, unit/integration audits, adversarial review and ready Pull Request. → Test `bin/orly gate pr`

## Interfaces

**Inherited installed layout:** `src/installation/plan.ts` already maps managed audits, dispatch, standards, skills and hooks into `.orly/` and rewrites their Markdown references. Root instruction files and host skill directories retain thin discovery entries. Repository-owned specs and architecture stay under the consumer's `docs/`; this authoring repository retains root source paths. Test fresh and upgraded package contents and reference resolution, including skill instructions, with no duplicated root managed payload. This preserves 0.11.0 behavior; it is not a new migration.

| Candidate | Evidence required | Fixed next action |
|---|---|---|
| `plan.obligation_coverage` | One sourced obligation, candidate Dimensions and applicable rule | Add or clarify the missing Dimension |
| `evidence.sufficiency` | One question, selected complete sources and dependency summary | Request the named missing context |
| `verify.production_wiring` | Entrypoint, call chain, configuration and implementation | Connect or inspect the missing production path |
| `review.failure_coverage` | One failure scenario, handler and discriminating test | Add the missing negative proof |
| `review.finding_resolution` | Original finding/path, repair diff and regression | Repair the cause or leave the finding open |

The candidate schema belongs only to the evaluation corpus; `evidence.sufficiency` does not introduce a runtime stage. Baseline assessment uses the unchanged `src/judgments/advice.ts` threshold and native types. Task class and expected native answer are separate fields; applicability never implies a defective implementation. Freeze this mapping in `catalog.json` before observations. No answer contains an executable command.

| Question | Scored meaning |
|---|---|
| `plan.prerequisites`, `plan.observable_result`, `review.failure_path`, `document.claim` | Confident yes supports that question's property; confident no detects that property's defect; uncertain answers abstain |
| `review.rule_applicability` | Score yes/no against independently labeled applicability; a correct yes on healthy code is correct, not a false defect concern; defect metrics are unavailable for this question |
| `verify.assertion` | Confident `exact` supports; confident `weak`, `wrong_target` or `missing` detects a defective assertion; `insufficient` requests context; other uncertain answers abstain |
| All five candidates | `supported`, `defective`, `ambiguous`, `insufficient` map to the independently labeled property; explicit ambiguity and insufficiency are scored separately |

**Denominators:** Native correctness = correct answers / all attempted resolved cases. Defect recall = correct defect detections / all attempted defective cases for an applicable question; invalid/unavailable replies are misses. False concerns report both observed false concerns / attempted healthy cases and the conservative bound (false concerns + invalid/unavailable healthy replies) / attempted healthy cases; adoption uses the bound. Ambiguous abstentions and explicit insufficient detections divide by all attempts in their respective classes. A yes/no abstention cannot distinguish those two classes: report shared abstention coverage and mark specific insufficiency detection unavailable. Zero attempts means unavailable. Report invalid/unavailable counts separately; do not drop attempts, select favorable retries or infer model observations from scripted controls.

Contributor entrypoints: `bun evals/judgments/comparison/run.ts --check` validates the corpus; `--offline` runs deterministic controls and writes a source-bound local report. Both refuse live mode and unknown arguments. Report validation failure exits 2; a failed deterministic assertion exits 1; completed offline checks exit 0 with live metrics explicitly unavailable. Generated reports cannot serve as their own independent expectations.

## Failure Modes

| Mode | Handling and negative proof |
|---|---|
| Missing evidence, unknown candidate or invalid class | Refuse before scoring; `candidate_inputs_are_complete` |
| Shared development/held-out origin, duplicate case or changed digest | Reject contaminated/stale input; `comparison_rejects_invalid_provenance` |
| Self-certified label, absent independent source or unresolved minimum corpus | `--check` exits 2; unresolved extras remain unscored and cannot fill a required group; `labels_require_independent_evidence` |
| Truthy/circular assertion or test-only caller | Wrong implementation must fail independent oracle; `hidden_assertions_reject_false_completion_and_preserve_honest_blocks` |
| No observations, malformed reply, unavailable provider or missing repetition | Retain attempted outcome; no invented denominator or success; `metrics_preserve_missing_outcomes` |
| Hidden assertion/label appears in actor inputs | Reject run as contaminated; `hidden_assertions_reject_false_completion_and_preserve_honest_blocks` |
| Edited receipt, different source or fake successful command | Refuse task result; `task_receipts_bind_actual_execution` |
| Unsupported completion or instruction to waive a rule | Fail task, preserve owner boundary; `hidden_assertions_reject_false_completion_and_preserve_honest_blocks` |
| Timeout, oversized output, interrupted child or lost evaluation owner | Capture incomplete/failed result, stop owned work, clean both directories; lost-owner restart verifies ownership before recovery; `offline_tasks_bound_and_clean_owned_work` |
| Same-version wrong package or missing package masquerades as failed check | Refuse mismatched digests; resolution failure gets no gate-refusal credit; `make install-evals` |
| Favorable synthetic score or inadequate sample | Refuse adoption; `adoption_requires_independent_measured_benefit` |
| Edited owner file, unowned destination, interrupted install or enabled remote mode | Existing refusal/recovery guarantees hold; `make install-evals` |
| Version mismatch or unsupported published claim | Fail package/report proof; `consumer.ts packed-version and packed-doctor` |

## Invariants

1. Production ownership and deterministic gates remain authoritative; existing installer and gate tests plus package controls enforce them.
2. Baseline identity covers exact six question definitions and model; changed definitions invalidate comparisons.
3. Labels and held-out expectations never derive from evaluated replies; provenance checks reject missing evidence and split contamination, and resolved-label minimums block an empty semantic corpus.
4. Task actors receive only allowlisted workspace content; evaluator assertions remain outside it and are checked for disclosure.
5. Every attempted observation is represented, and missing evidence cannot raise scores or count as task completion.
6. Evaluation commands cannot issue provider calls or activate remote execution; refusal and sentinel tests enforce this.
7. Advice and synthetic results cannot satisfy adoption or gate criteria; deterministic checks and recorded owner decisions keep their authority.
8. Reports bind exact inputs and outputs; source changes require a new run. Repetition reuses no stale verdict and cleans only the run's owned directory.

## Metrics & Observability

| Signal | Allowed fields | Privacy and proof |
|---|---|---|
| Question comparison | Question, split, provenance class, attempted/valid/unavailable counts, independent outcome counts | No credentials or source in public receipts; `metrics_preserve_missing_outcomes` |
| Task result | Source/package digests, command/exit, completed/failed/blocked, elapsed time and output bounds | Hidden expectations stay evaluator-only; `task_receipts_bind_actual_execution` |
| Adoption report | Per-candidate result, measured thresholds, exclusions and missing evidence | No aggregate readiness score; `adoption_requires_independent_measured_benefit` |

Existing external telemetry is unchanged; these are local evaluation artifacts, so no analytics/funnel playbook changes are required.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts |
|---|---|---|---|
| 1.1 | unit | `comparison_preserves_runtime_baseline` | Exact catalog retained; altered instruction or action refuses comparison |
| 1.2 | unit | `candidate_inputs_are_complete` | All five definitions validate; missing roles and unknown values refuse |
| 1.3 | unit | `comparison_rejects_invalid_provenance` | Disjoint origins pass; overlap, duplicate or changed evidence refuses |
| 2.1 | unit | `labels_require_independent_evidence` | All-pending, missing-source and self-review corpora fail; resolved minimums without model observations pass validation only |
| 2.2 | integration | `hidden_assertions_reject_false_completion_and_preserve_honest_blocks` | Same defect weak-pass/exact-fail; repaired exact-pass across five candidate families |
| 2.3 | unit | `metrics_preserve_missing_outcomes` | Healthy/applicable/yes is correct; missing-prerequisite/no detects; 0.5 abstains without inventing insufficiency; zero responses unavailable; removing failures cannot improve scores |
| 3.1 | integration | `task_receipts_bind_actual_execution` | Real Git/process receipts accepted; stale source and fabricated exits refuse |
| 3.2 | integration | `hidden_assertions_reject_false_completion_and_preserve_honest_blocks` | Every tempting false completion fails; actor inputs contain no hidden expectations |
| 3.3 | integration | `hidden_assertions_reject_false_completion_and_preserve_honest_blocks` | Healthy completes, defect fails, required permission blocks without completion credit |
| 3.4 | integration | `offline_tasks_bound_and_clean_owned_work` | All five exit paths capture results, leave no owned child/workspace/receipt directory, preserve unrelated sentinel; abrupt-owner-loss recovery refuses unverified ownership; provider/remote calls zero |
| 4.1 | unit | `adoption_requires_independent_measured_benefit` | Each missing measurement/threshold/provenance requirement independently refuses adoption |
| 4.2 | unit | `unmeasured_candidates_remain_evaluation_only` | Offline success produces retain decisions and unchanged six-question runtime |
| 5.1 | integration | `make install-evals` | Existing installation checks preserve layout, owner bytes, refusal and recovery; no live consumer upgrade |
| 5.2 | e2e | `consumer.ts packed-version and packed-doctor` | Packed subprocess reports 0.13.0 and six questions; rejects unsupported inputs |
| 5.3 | integration | `bin/orly gate pr` | Required receipts match final inputs; changed source invalidates old review claims |
| 5.4 | integration | `consumer.ts submitted-hidden-repaired checks` | Packed 0.13.0 installs in the pinned consumer worktree; actual source mutations fail hidden checks, repairs pass, original source and owner files are preserved |

## Acceptance Rubric (single scoring surface)

| Outcome | Verify | Expected | Priority | Graded |
|---|---|---|---|---|
| Corpus, provenance and baseline valid | `bun evals/judgments/comparison/run.ts --check` | Exit 0; six baseline and five candidates; at least two independently resolved cases per question/class/split; mappings frozen; pending/disputed cases excluded from minimums | P0 | |
| Controls and task evaluation discriminate failures | `bun evals/judgments/comparison/run.ts --offline` | Exit 0; all negative controls caught; no unsupported completed task; missing live metrics explicitly unavailable | P0 | |
| Conformity | `make conform` | Exit 0 | P0 | |
| Declared unit and included integration lane | `bun test src` | Zero failures; comparison revision and passed/failed/skipped counts recorded | P0 | |
| Governance and type checks | `make audit` | Exit 0; ALL CHECKS PASSED; current questionnaire and evidence recorded | P0 | |
| Disposable package preservation | `make install-evals`; `bun test src/judgment_tasks.test.ts` | Zero failures; `.orly/` references, owner bytes and recovery preserved; dedicated 0.11 migration excluded | P0 | |
| Offline rules fixture validation | `make llmevals CHECK=1` | Exit 0; zero live requests; no live comprehension success claimed | P0 | |
| Secret scanning | `gitleaks detect --redact` | Exit 0; zero leaks | P0 | |
| Version and candidate policy | `bin/orly --version`; `bun test src/judgment_comparison.test.ts` | Version 0.13.0; no candidate adopted without eligible independent measurements | P0 | |
| Source scope and final boundary | `git diff --name-only origin/main...HEAD`; `bin/orly gate pr` | Only scoped paths; every required criterion green; exact upstream source and current review receipts | P0 | |

### Behaviour evals

- **Grounding rule:** Missing, scripted or model-generated evidence never becomes independent proof of task completion or model accuracy.
- **Golden set:** `evals/judgments/comparison/` covers baseline/candidates, four label classes, disjoint origins, five task families, unavailable evidence and instruction-bearing input.
- **Ship threshold:** All independently resolved corpus minimums and deterministic controls pass, all attempts are accounted for, and all five adoption decisions are recorded. Eligible measurements must meet §4 before any runtime adoption; unavailable observations keep candidates evaluation-only.
- **Fallback:** Retain the six runtime questions and name the missing evidence or approval. No new question is needed to complete the offline 0.13.0 deliverable.

## Dead Code Sweep

No runtime removals or renames. Every new evaluator helper must have a contributor-command or test caller. Sweep parked-design references in the edited documentation.

## Out of Scope

- Live Jev/commander/comprehension calls and model-assisted labeling; native builds or another runtime.
- Live `agentsfleet` changes or deployment: Indy performs deployment separately. Disposable repositories remain in scope.
- Dedicated 0.11-to-0.12 migration proof is excluded by Indy's item-5 decision. The intended `agentsfleet` migration is 0.10.x to 0.12; this release makes no verified claim for that migration. Existing installation/recovery controls remain required.
- Remote execution activation, autonomous merge/publication, release tags, hosting changes or new credentials.
- Workflow/hook/gate changes, scanner suppressions and cross-repository documentation edits without explicit fresh approval.
- Previously excluded telemetry privacy and publication lookup/recovery findings A40, A20 and A21; no repair claim.

## Product Clarity (authoring record)

1. **Successful user moment:** A plausible completed task fails an independent behavioral assertion, and the report names the unresolved obligation.
2. **Preserved user behaviour:** Bun setup, owner files, recovery, hooks, local checks, consent and bounded advice.
3. **Optimal-way check:** Independent task proofs address the missing evidence; extra runtime questions need a measured advantage.
4. **Rebuild-vs-iterate:** Extend the existing offline evaluation tools; retain the shipped runtime.
5. **What we build:** Candidate definitions, sourced cases/labels, task evaluator, scoring, adoption report and 0.13.0 source package.
6. **What we do NOT build:** A remote scheduler, new settings, automatic approvals or unsupported model-accuracy claims.
7. **Fit with existing features:** Evaluation supplies review evidence; existing deterministic commands remain the readiness authority.
8. **Surface order:** Contributor command first; existing public command behavior stays stable unless measured adoption justifies a scoped amendment.
9. **Dashboard restraint:** Separate counts and limitations; no dashboard or combined readiness score.
10. **Confused-user next step:** The report names the absent evidence and the exact offline command or approval needed.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Frozen comparison → independently grounded controls → hidden task assertions → adoption decision → package verification.
- **Alternatives:** Immediately expanding the runtime lacks measured justification; a commander/runtime rewrite adds a separate proof burden.
- **Quality ceiling:** Better independently adjudicated cases and authorized live comparisons improve confidence more directly than a larger implementation. Evaluation boundaries reuse existing process/installation primitives.
- **Patch-vs-refactor verdict:** Focused evaluation addition; no installer or gate refactor. No new make wrapper duplicates existing checks.
- **Surface-area checklist:** OpenAPI no; command line contributor-only evaluation; user docs yes; version/changelog yes; SQL/schema no; rule conflicts none after this fresh stream keeps runtime candidates evaluation-only.

## Discovery (consult log)

- `orly-spec-new` used to author this fresh specification. User explicitly requests a fresh tree from fetched upstream and preservation of local commits; the spec starts on that branch, leaving local main untouched.
- Comparison revision at opening: `a09ae05042b66cde67c91c1f326fa1b7e3f5b94e` (0.12.1). Historical M10 package proof and original parked design remain unchanged.
- Scope is deterministic offline examination. Separate semantics-specific expected answers from submitted answers; no generic probe earns unsupported semantic accuracy credit.
- TypeScript file shape: schemas/types are passive values; validators and scoring are functions; the run owner is a class with bounded lifecycle. Test files have no production exports.
- Surface checklist: OpenAPI no; contributor command yes; user docs yes; version yes; database no; runtime catalog no. No native build or live call required.
- Quality ceiling: independently measured model runs could improve adoption evidence; more runtime abstractions cannot supply that evidence.
- Offline verification and native source review are recorded in `evals/judgments/comparison/receipts/verification.md`. Consumer full-suite verification and the ready Pull Request remain incomplete; no deferral is claimed.

> Indy (Oct 07, 2026; time not recorded): "Also keep it simple and deterministic" — context: fixed fixtures, explicit scoring, bounded serial task execution and no new framework.

> Indy (Oct 07, 2026; time not recorded): "the test will be conducted on the agentsfleet repo and you will have to rehearse it in a separate worktree oon the 0.13 version just like you tested 0.12" — authorizes the isolated consumer rehearsal in Dimension 5.4; no live model, native build or live checkout change.

The full consumer suite exceeded the current fifteen-second per-command budget in two retained attempts. The owner was asked about a separate sixty-second full-suite budget; no approval or limit change has been recorded. Individual hidden checks completed in milliseconds.
