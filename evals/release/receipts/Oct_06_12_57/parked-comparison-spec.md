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

# M10_001: Evaluate bounded judgment and prepare orly 0.12.0

**Prototype:** v2.0.0
**Milestone:** M10
**Workstream:** 001
**Date:** Oct 06, 2026
**Status:** IN_PROGRESS
**Priority:** P1 — prove useful judgments and honest completion evidence
**Categories:** CLI DOCS (command-line interface, documentation)
**Batch:** B1 — one implementation stream
**Branch:** feat/m10-judgment-evaluation
**Baseline revision:** 153a3816b0713f1b0e5a7e363bad7d5b1bd5052d
**Test Baseline:** pending — measure the declared unit lane before the Pull Request
**Baseline evidence:** pending — record revision, environment, command and complete counts
**Depends on:** M09_001 merged implementation; M08 historical observations only, not its unfinished checks
**Provenance:** agent-generated through orly-spec-new from Indy's 0.12.0 request and parking instruction
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Gates, Evidence, TypeScript judgment experiment; `docs/architecture/installation.md`; `docs/architecture/remote-execution.md`

## Overview

**Goal (testable):** Prepare an orly 0.12.0 Pull Request whose offline evaluation detects unsupported completion, compares five judgment candidates against the unchanged six-question baseline, and refuses runtime adoption without independent measured benefit.
**Problem:** A passing selected test can miss an obligation, an uncalled implementation, a failure path or an unresolved finding. Historical Jev observations do not measure those gaps across complete tasks (`evals/release/evaluation-plan.md`, Evaluation set and measurement).
**Solution summary:** Add a bounded offline evaluation suite with independent expectations, separated development and held-out families, hidden task assertions, complete outcome accounting and an adoption report. Retain the TypeScript/Bun runtime, installed ownership/recovery guarantees and deterministic gates. Produce the 0.12.0 source package and ready Pull Request; Indy deploys it into `agentsfleet` separately.

## PR Intent & comprehension handshake

- **Pull Request (PR) title:** Evaluate bounded judgments and prepare orly 0.12.0
- **Intent:** Give the commander reproducible evidence about missing work and preserve an honest boundary between evaluated behavior and unavailable model evidence.
- **Handshake:** Authoring understands the deliverable as one verified orly change, with the candidate experiment separate from runtime question registration. Implementation restates this before its first edit.
- **ASSUMPTIONS I'M MAKING:** Prototype v2 follows the requested `docs/v2/` organization; package version is 0.12.0. Live calls stay excluded. In the absence of eligible independent model observations, all five candidates remain evaluation-only and the six runtime questions remain unchanged.

## Implementing agent — read these first

1. `evals/release/evaluation-plan.md` — evaluation families, independence and task evidence.
2. `evals/release/release-report.md` — observed 0.11.0 behavior and retained exclusions.
3. `docs/v1/done/M09_001_P1_CLI_DOCS_INFRA_SKILL_VERIFIED_COMMANDER_RELEASE.md` — inherited preservation requirements and proof limits.
4. `docs/JUDGMENTS.md` and `src/judgments/questions.ts` — shipped six-question catalog, evidence roles and fixed advice.
5. `src/spec_rehearsal.test.ts`, `src/installation_preservation.test.ts` and `src/execution/plan.test.ts` — real local evaluation boundaries and refusal controls.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| `docs/v1/active/M08_001_P1_CLI_DOCS_SKILL_JEV_JUDGMENTS_IN_TYPESCRIPT_011.md` | MOVE | Archive the owner-parked historical work at the destination below |
| `docs/v2/done/M08_001_P1_CLI_DOCS_SKILL_JEV_JUDGMENTS_IN_TYPESCRIPT_011.md` | EDIT | Preserve results, open checks, parking quote and reactivation condition |
| `docs/v2/pending/M10_001_P1_CLI_DOCS_JUDGMENT_EVALUATION_012.md` | CREATE/MOVE | This spec; move through active and done under the same prototype |
| `evals/judgments/comparison/{catalog,cases,labels,tasks}.json` | CREATE | Frozen baseline, five candidates, evidence, independent labels and task definitions |
| `evals/judgments/comparison/{types,validate,labels,score,run,corpus,tasks,execution,recovery,package}.ts` | CREATE | Split validation, scoring, corpus grounding, process ownership and package controls by concern within source bounds |
| `evals/judgments/comparison/hidden/assertions.ts` | CREATE | Evaluator-only task expectations, withheld from each task workspace |
| `src/judgment_{comparison,labels,score,tasks,package}.test.ts` | CREATE | Split independent negative controls and real process/package proofs by concern within test bounds |
| `docs/architecture/judgment-evaluation.md` | CREATE | Evidence authority, split rules, task isolation and adoption mechanism |
| `docs/JUDGMENTS.md`, `README.md`, `llms.txt` | EDIT | 0.12.0 behavior, offline evaluation use and proof limits |
| `docs/CHANGELOG.md` | CREATE | Repository-local 0.12.0 user-visible changes; preserve any existing history |
| `package.json`, `.orly/orly.json`, `bun.lock` | EDIT | Synchronize package/configuration version and lock metadata where present |
| `evals/release/evaluation-plan.md`, `evals/release/release-report.md` | EDIT | Current scope, reproducible results, adoption decisions and owner deployment |
| `evals/release/inventory.json`, `evals/release/reviewed.json` | REGENERATE/EDIT | Refresh final source/package identities; never carry changed-byte review credit |
| `evals/release/receipts/Oct_06_12_57/` | CREATE | Measured baseline, final commands, comparisons, review and candidate source binding |

Brace groups enumerate the only planned files in each group. Production catalog files are read-only in this scope. If eligible measurements justify adoption, amend this table with the exact runtime, help, documentation and regression files before integration. No gate/hook/workflow repair is pre-authorized.

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

- **Dimension 1.1** — Pin all six current question definitions, answer types, fixed actions and `jev-1.13.0`; reject baseline drift. → Test `comparison_preserves_runtime_baseline`
- **Dimension 1.2** — Define exactly five evaluation-only candidates with complete evidence roles and bounded answers; reject unknown questions and missing roles. → Test `candidate_inputs_are_complete`
- **Dimension 1.3** — Validate source digests, disjoint origin families, provenance and all attempted outcomes; refuse stale, duplicate or cross-split evidence. → Test `comparison_rejects_invalid_provenance`

### §2 — Establish independent labels and discriminating controls

Depends on §1. Cover healthy, defective, ambiguous and insufficient-evidence cases for each baseline and candidate question, with at least two independently resolved development and two independently resolved held-out cases per class. Pending/disputed cases do not satisfy these minimums. Split by originating defect family before prompt tuning; copied mutations stay in one split. These are minimum corpus requirements, not an accuracy claim.

- **Dimension 2.1** — Each label records task class, expected native answer, rationale, source/revision, fixture author and independent oracle or reviewer, plus adjudication status. A reviewer must differ from the fixture author; an oracle must ground the expected answer outside the evaluated implementation/reply. An independence flag alone is insufficient. Freeze before observing answers; absent support or insufficient resolved counts makes `--check` fail. → Test `labels_require_independent_evidence`
- **Dimension 2.2** — Pair weak-pass, exact-fail and repair-pass controls on one fixed requirement; cover circular expectations, omitted obligations, uncalled helpers, unrelated negative tests and superficial repairs. → Test `controls_discriminate_wrong_implementations`
- **Dimension 2.3** — Freeze the per-question mappings and denominator rules in Interfaces before reading observations. Score native-answer correctness separately from task health; retain invalid/unavailable attempts. Empty denominators and distinctions the answer format cannot express are unavailable, not perfect scores. → Test `metrics_preserve_missing_outcomes`

### §3 — Evaluate complete tasks with hidden assertions

Depends on §1–§2. Build at least five task families: missing obligation, missing production caller, missing failure proof, unresolved finding and a legitimate permission block. Each has a healthy control and a plausible false completion. Use fresh disposable Git repositories and real installed discovery files. The evaluator retains its expected results outside task workspaces and excludes them from supplied evidence and task logs. This is input separation, not a security sandbox against a hostile local user.

- **Dimension 3.1** — Record initial/final source, installed package identity, allowed actions, command arguments, exits and cleanup; stale or incomplete task receipts refuse scoring. → Test `task_receipts_bind_actual_execution`
- **Dimension 3.2** — Hidden behavioral assertions reject each false completion even when submitted tests pass; labels and hidden assertions cannot enter the actor payload. → Test `hidden_assertions_reject_false_completion`
- **Dimension 3.3** — Distinguish completed, failed and truthfully blocked tasks; a missing permission cannot count as completed, and blocked prose cannot conceal a failed required assertion. → Test `task_outcomes_preserve_authority`
- **Dimension 3.4** — The evaluator owns workspace, receipts and processes. Capture source/command identity, actual exit or explicit unavailable exit, failure kind, elapsed time and output counts before cleanup. For success, nonzero exit, timeout, excessive output and handled interruption, stop/reap owned processes and remove both temporary directories; preserve an unrelated sentinel. Missing results remain incomplete. Scripted controls make zero provider requests. → Test `offline_tasks_bound_and_clean_owned_work`

Cleanup runs under an outer evaluation owner so stopping a task or its supervisor cannot bypass it. Abrupt loss of that owner cannot promise immediate cleanup: record ownership at creation, refuse a clean receipt, and recover only its verified stale resources on restart. No cleanup scans or removes another run's paths/processes. The durable bounded report survives cleanup outside temporary directories; hidden expectations never enter it.

Actual fresh commander sessions and new live Jev responses remain excluded. Scripted task runs verify the evaluator and deterministic behavior; reports must identify them as scripted and leave autonomous model completion unmeasured. Stored observations are eligible only when their source, question, split and independent-label provenance match exactly.

### §4 — Make an evidence-backed adoption decision

Depends on §2–§3. Evaluate each candidate against the same held-out task families under baseline-only and candidate-assisted conditions. Register scoring before reading results. A candidate can be recommended only with at least twenty independently labeled held-out examples per class, observed defect recall ≥0.90, false-concern rate ≤0.05, insufficient-evidence detection ≥0.90, zero unsupported completions, and a paired improvement in correctly resolved tasks with no new authority violations. Report sample uncertainty and all attempts; these are proposed acceptance thresholds, not calibrated guarantees.

- **Dimension 4.1** — Synthetic replies, owner-editable replay, missing independent labels, insufficient samples and unmatched comparison inputs cannot qualify for adoption; emit one reasoned retain/reject/eligible decision per candidate. → Test `adoption_requires_independent_measured_benefit`
- **Dimension 4.2** — Default 0.12.0 decision retains all six runtime questions when live evidence is unavailable; no new question is registered merely because an offline suite passes. → Test `unmeasured_candidates_remain_evaluation_only`

Independently reviewed historical observations may be imported; unresolved label disagreements require a separate reviewer or Indy to adjudicate. Missing observations block accuracy claims and adoption, but do not block an independently grounded offline corpus. Unresolved labels cannot satisfy §2 or release acceptance. Any new model-assisted labeling or live comparison requires renewed approval. The existing `0.8` advice threshold remains uncalibrated and unchanged.

### §5 — Preserve package behavior and deliver 0.12.0 for review

Depends on §1–§4. Keep actual measurements distinct from missing live evidence. Current package/runtime sources, not M08 completion markers, govern this work.

- **Dimension 5.1** — Exercise packaged 0.12.0 setup/update in disposable repositories: preserve the inherited `.orly/` layout/references, owner bytes, hook choices, conflict refusal and interrupted recovery. Real generated hooks must run the digest-bound candidate through real `bunx`, observe successful checks and actually run failing checks; package-resolution failure is not gate-refusal proof. Remote sentinel calls remain zero. Dedicated 0.11-to-0.12 migration proof is owner-excluded. → Test `package_preserves_ownership_recovery_and_gates`
- **Dimension 5.2** — Synchronize version, help/reference claims, changelog and evaluation report; package output identifies 0.12.0 and the actual six-question catalog. → Test `test_e2e_package_reports_evaluated_scope`
- **Dimension 5.3** — Complete canonical checks, baseline delta, unit/integration audits, adversarial review and source-bound inventory; prepare one ready PR with all exclusions and exact receipts. → Test `release_evidence_matches_final_source`

## Interfaces

**Inherited installed layout:** `src/installation/plan.ts` already maps managed audits, dispatch, standards, skills and hooks into `.orly/` and rewrites their Markdown references. Root instruction files and host skill directories retain thin discovery entries. Repository-owned specs and architecture stay under the consumer's `docs/`; this authoring repository retains root source paths. Test fresh and upgraded package contents and reference resolution, including skill instructions, with no duplicated root managed payload. This preserves 0.11.0 behavior; it is not a new migration.

**Hook package binding:** Serve the packed candidate and pinned dependency closure from a disposable loopback registry with an isolated package cache/configuration. Use real generated hooks and real `bunx`; no resolver or gate-success stub. Record candidate tarball digest and the resolved entrypoint/dependency-tree digests, check them against the packed sources, and reject same-version/different-byte packages. Require a check-specific side effect before crediting a refusal. Missing package resolution is a separate failed setup result; registry/cache cleanup belongs to the evaluation owner. No live publication or public-registry fallback is allowed.

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
| Truthy/circular assertion or test-only caller | Wrong implementation must fail independent oracle; `controls_discriminate_wrong_implementations` |
| No observations, malformed reply, unavailable provider or missing repetition | Retain attempted outcome; no invented denominator or success; `metrics_preserve_missing_outcomes` |
| Hidden assertion/label appears in actor inputs | Reject run as contaminated; `hidden_assertions_reject_false_completion` |
| Edited receipt, different source or fake successful command | Refuse task result; `task_receipts_bind_actual_execution` |
| Unsupported completion or instruction to waive a rule | Fail task, preserve owner boundary; `task_outcomes_preserve_authority` |
| Timeout, oversized output, interrupted child or lost evaluation owner | Capture incomplete/failed result, stop owned work, clean both directories; lost-owner restart verifies ownership before recovery; `offline_tasks_bound_and_clean_owned_work` |
| Same-version wrong package or missing package masquerades as failed check | Refuse mismatched digests; resolution failure gets no gate-refusal credit; `package_preserves_ownership_recovery_and_gates` |
| Favorable synthetic score or inadequate sample | Refuse adoption; `adoption_requires_independent_measured_benefit` |
| Edited owner file, unowned destination, interrupted install or enabled remote mode | Existing refusal/recovery guarantees hold; `package_preserves_ownership_recovery_and_gates` |
| Version mismatch or unsupported published claim | Fail package/report proof; `test_e2e_package_reports_evaluated_scope` |

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
| 2.2 | integration | `controls_discriminate_wrong_implementations` | Same defect weak-pass/exact-fail; repaired exact-pass across five candidate families |
| 2.3 | unit | `metrics_preserve_missing_outcomes` | Healthy/applicable/yes is correct; missing-prerequisite/no detects; 0.5 abstains without inventing insufficiency; zero responses unavailable; removing failures cannot improve scores |
| 3.1 | integration | `task_receipts_bind_actual_execution` | Real Git/process receipts accepted; stale source and fabricated exits refuse |
| 3.2 | integration | `hidden_assertions_reject_false_completion` | Every tempting false completion fails; actor inputs contain no hidden expectations |
| 3.3 | integration | `task_outcomes_preserve_authority` | Healthy completes, defect fails, required permission blocks without completion credit |
| 3.4 | integration | `offline_tasks_bound_and_clean_owned_work` | All five exit paths capture results, leave no owned child/workspace/receipt directory, preserve unrelated sentinel; abrupt-owner-loss recovery refuses unverified ownership; provider/remote calls zero |
| 4.1 | unit | `adoption_requires_independent_measured_benefit` | Each missing measurement/threshold/provenance requirement independently refuses adoption |
| 4.2 | unit | `unmeasured_candidates_remain_evaluation_only` | Offline success produces retain decisions and unchanged six-question runtime |
| 5.1 | integration | `package_preserves_ownership_recovery_and_gates` | Fresh/update preserve layout/owner bytes/recovery; real hooks run digest-matched candidate checks; wrong bytes refuse; missing package cannot satisfy failed-check proof; no dedicated 0.11 migration claim |
| 5.2 | e2e | `test_e2e_package_reports_evaluated_scope` | Packed subprocess reports 0.12.0 and six questions; rejects unsupported inputs |
| 5.3 | integration | `release_evidence_matches_final_source` | Required receipts match final inputs; changed source invalidates old review claims |

## Acceptance Rubric (single scoring surface)

| Outcome | Verify | Expected | Priority | Graded |
|---|---|---|---|---|
| Corpus, provenance and baseline valid | `bun evals/judgments/comparison/run.ts --check` | Exit 0; six baseline and five candidates; at least two independently resolved cases per question/class/split; mappings frozen; pending/disputed cases excluded from minimums | P0 | |
| Controls and task evaluation discriminate failures | `bun evals/judgments/comparison/run.ts --offline` | Exit 0; all negative controls caught; no unsupported completed task; missing live metrics explicitly unavailable | P0 | |
| Conformity | `make conform` | Exit 0 | P0 | |
| Declared unit and included integration lane | `bun test src` | Zero failures; comparison revision and passed/failed/skipped counts recorded | P0 | |
| Governance and type checks | `make audit` | Exit 0; ALL CHECKS PASSED; current questionnaire and evidence recorded | P0 | |
| Disposable package preservation | `make install-evals`; `bun test src/judgment_tasks.test.ts` | Zero failures; digest-bound 0.12.0 hook success/failure observed; wrong-package and resolution controls rejected; `.orly/` references, owner bytes and recovery preserved; dedicated 0.11 migration excluded | P0 | |
| Offline rules fixture validation | `make llmevals CHECK=1` | Exit 0; zero live requests; no live comprehension success claimed | P0 | |
| Secret scanning | `gitleaks detect --redact` | Exit 0; zero leaks | P0 | |
| Version and candidate policy | `bin/orly --version`; `bun test src/judgment_comparison.test.ts` | Version 0.12.0; no candidate adopted without eligible independent measurements | P0 | |
| Source scope and final boundary | `git diff --name-only origin/main...HEAD`; `bin/orly gate pr` | Only scoped paths; every required criterion green; exact upstream source and current review receipts | P0 | |

### Behaviour evals

- **Grounding rule:** Missing, scripted or model-generated evidence never becomes independent proof of task completion or model accuracy.
- **Golden set:** `evals/judgments/comparison/` covers baseline/candidates, four label classes, disjoint origins, five task families, unavailable evidence and instruction-bearing input.
- **Ship threshold:** All independently resolved corpus minimums and deterministic controls pass, all attempts are accounted for, and all five adoption decisions are recorded. Eligible measurements must meet §4 before any runtime adoption; unavailable observations keep candidates evaluation-only.
- **Fallback:** Retain the six runtime questions and name the missing evidence or approval. No new question is needed to complete the offline 0.12.0 deliverable.

## Dead Code Sweep

Move only the M08 specification; preserve historical receipts. Discovery command: `git grep -n -w 'M08_001_P1_CLI_DOCS_SKILL_JEV_JUDGMENTS_IN_TYPESCRIPT_011.md'`. Initial hits are the inventory and reviewed-source record; refresh the inventory during final evidence binding and retain prior review provenance as historical. No executable reader references the old path at authoring. No source/runtime removals are planned.

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
5. **What we build:** Candidate definitions, sourced cases/labels, task evaluator, scoring, adoption report and 0.12.0 source package.
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
- **Surface-area checklist:** OpenAPI no; command line contributor-only evaluation; user docs yes; version/changelog yes; SQL/schema no; rule conflicts none after owner-directed parking uses the template's `DEFERRED` status.

## Discovery (consult log)

- **Consults:** Authoring inspected fetched main `153a3816b0713f1b0e5a7e363bad7d5b1bd5052d`, the six definitions in `src/judgments/questions.ts`, required reports and ownership/remote architecture. Candidate scope and thresholds are proposed requirements, not observed results.
- **Metrics review:** Local comparison/task outcomes only; existing telemetry and analytics/funnel guidance unchanged.
- **Skill-chain outcomes:** `orly-spec-new` used for authoring. Structural verification, unit/integration audit skills, adversarial review and post-push monitoring remain pending until their actual execution.
- **Deferrals:** M08 parking and M10 review item 5 are owner-directed exclusions recorded below; neither is passing evidence. Live model evidence, merge and publication retain the original request's exclusions and approval boundaries.
- **Pre-build review disposition:** Items 1–4 amend §2–§5, Interfaces, failures, tests and acceptance: resolved-label minimums, native scoring, owned receipt cleanup and digest-bound real hooks. This records design repairs only; implementation proofs remain pending.

> Indy (2026-10-06, time not recorded): "5 can be skipped as we ill migrate agentsfleet repor fro 0.10.x to 0.12" — context: exclude the proposed dedicated 0.11-to-0.12 upgrade test; retain existing preservation checks, and do not certify the separate live migration.

> Indy (2026-10-06 12:57): "I think move the M08 to parked and docs/v2/done/ and create a M10 new spec with what is needed now and acceptance?" — context: park M08, preserve unfinished evidence and author M10 with current acceptance.

> Indy (2026-10-06 12:57): "I will deploy  0..12 in agentsfleet repo." — context: Indy performs the live consuming-repository deployment of 0.12.0; this work prepares orly's ready Pull Request.

> Indy (Oct 07, 2026; time not recorded): "Okay keep going, just focus on the must have open items to do a migration and evaluate in agentsfleet repo" — context: prioritize package identity, preservation and consuming-repository caller checks. Unfinished comparison requirements remain open; local migration evidence does not close this release specification.

> Indy (Oct 07, 2026; time not recorded): "Also migrate and evaluate the live agentsfleet checkout" and "you can create your own worktree of agentsfleet" — context: supersede the owner-only deployment restriction for a dedicated consuming-repository worktree. Evaluate a locally packed 0.12.0 candidate; publication and merge remain separate owner actions.
