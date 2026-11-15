# M16: Verification evidence and honest gate outcomes

**Prototype:** v2.0.0
**Milestone:** M16
**Workstream:** 001
**Date:** Nov 15, 2026
**Status:** DONE
**Priority:** P1, repeated verification and contradictory guidance
**Categories:** CLI, DOCS, GOV, SKILL
**Batch:** B1, one isolated Orly branch
**Depends on:** M15's existing command supervisor and catalogue verification
**Provenance:** Agent-generated from Indy's request and agentsfleet PR 844
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`, Gates

## Overview

**Goal (testable):** A failed prerequisite prevents later commands, and only unchanged, explicitly eligible verification can be reused.

**Problem:** PR 844 repeated expensive completed suites after another lane failed. The runner reports boolean outcomes, removes successful captures, and evaluates every criterion in a gate.
Source guidance also disagrees about parked specs and explicitly authorized cloud publishing.

**Solution summary:** Separate prerequisite inspection from command execution, report distinct outcomes, and retain private append-only evidence. Add explicit, conservative reuse for repository-declared hermetic verification.
Align source standards and skills with the owner's authorization and evidence requirements.

**Design flow:** CLI → structural criteria → declared command groups → private completion evidence → reported outcomes. An explicit reuse request checks a reviewed policy and exact input binding before substituting a prior successful command group.

## PR Intent & comprehension handshake

- **PR title (eventual):** Preserve verification evidence and stop blocked gate commands
- **Intent:** Reduce repeated work while preserving truthful, current-revision proof.
- **Authoring handshake:** Implement the seven requested priorities. ASSUMPTIONS I'M MAKING: reuse is off by default; non-hermetic commands always execute; existing overrides remain owner-controlled.
- **Implementer handshake:** Record the base and implementation decisions before code, then append final evidence to the PR.

## Implementing agent — read these first

1. `src/gates.ts` — gate sequencing and owner overrides.
2. `src/criteria.ts` — structural checks and native command groups.
3. `src/command_runner.ts` — existing bounded supervisor and captured output.
4. `standards/spec.md` — authoritative DEFERRED record policy.
5. https://github.com/agentsfleet/agentsfleet/pull/844 — source evidence and final review results.

## Evidence-to-change map

| Observed problem | Evidence | Owning source | Change and regression |
|---|---|---|---|
| Commands run after failed prerequisites | `src/gates.ts`, `runGate` maps all criteria | Gate runner | Inspect prerequisites first; marker commands must remain unstarted after refusal |
| Successful native work cannot be reused | `src/command_runner.ts` removes completed capture | Verification evidence | Explicit policy and input-bound completion; changed, expired or tampered evidence executes fresh |
| Outcomes collapse into one boolean | `src/criteria_support.ts` | Results and CLI | Report passed, failed, blocked, cancelled, skipped and not_run distinctly |
| Parked-spec descriptions conflict | `standards/pr.md` PR-SPEC vs `standards/spec.md` SPEC-STATUS | Standards | One DEFERRED record policy; rendered guidance regression |
| Cloud sections override explicit authorization | Build/ship skill cloud sections | Skills | Honor user-authorized branch push/PR; retain all checks |
| Baseline/review claims need context | PR 844 Session notes 1–3 | PR/tests/ship guidance | Exact-base comparisons, actual reviewer completion and two current-head quiet polls |
| Visual and timing evidence differ | PR 844 controlled four-fleet profile and protected live URL | Evidence guidance | Label fixtures, injected delays and live observations; preserve one approved reference |

Already present: between-gate stopping, bounded command execution, owner overrides, exact-base baseline guidance, and two quiet review polls. Extend these; do not replace them.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| This spec, pending → active → done | CREATE/MOVE | Scope, review and final evidence |
| `src/gates.ts`, `src/criteria.ts`, `src/criteria_support.ts` | EDIT | Prerequisites, explicit outcomes and command orchestration |
| `src/command_runner.ts`, `src/command_process.ts` | EDIT | Preserve invocation and cancellation outcomes |
| `src/verification_identity.ts`, `src/verification_store.ts`, `src/verification.ts` | CREATE | Exact bindings, one evidence/lock owner and explicit reuse |
| `src/config.ts`, `src/config_validation.ts`, `schemas/profile.schema.json` | EDIT | Strict reuse policy, existing digest ownership and round-trip preservation |
| `src/cli.ts`, `src/cli_help.ts` | EDIT | Explicit reuse flag and outcome labels |
| `src/gates.test.ts`, `src/command_runner.test.ts`, `src/cli.test.ts`, `src/config.test.ts`, `src/criteria.test.ts`, `src/setup.test.ts`, `src/gates_test_support.ts` | EDIT | Existing behavior, valid prerequisite fixtures and refusal regressions |
| `src/verification.integration.test.ts`, `src/verification_identity.integration.test.ts`, `src/verification_store.integration.test.ts`, `src/verification_policy.test.ts`, `src/gate_outcomes.integration.test.ts`, `src/verification_test_support.ts`, `src/learning_guidance.integration.test.ts` | CREATE | Real commands, Git state, evidence integrity and guidance |
| `core/operating-model.md`, `SOUL.md` | EDIT | One verification policy, evidence and authorization boundaries |
| `standards/pr.md`, `standards/tests.md` | EDIT | Parking, exact-base triage and honest review/evidence |
| `skills/orly-build/SKILL.md`, `skills/orly-ship/SKILL.md` | EDIT | Authorized cloud work and final verification workflow |
| `AGENTS.md` | REGENERATE | Source-owned operating model; never hand-edit |
| `README.md`, `docs/ORLY_ARCHITECTURE.md`, `docs/CHANGELOG.md`, `llms.txt` | EDIT | User-facing configuration and evidence semantics |
| `package.json`, `.orly/orly.json` | EDIT | Feature version and generated self-install record |

Resolve any additional helper split in this table before editing it. No consuming repository pin changes.

## Applicable Rules

- `standards/code.md`: NDC, NLG, HLP, CODE-SEAM, ECL, EMS, OWN, FLL and CODE-GITZ.
- `standards/languages/typescript.md`: TS-SHAPE, TS-ORDER, TS-TYPEIMPORT, TS-SCHEMA, TS-TIMEOUT, TS-BOUNDED, TS-FINALLY and TS-TESTFILE.
- `standards/tests.md`: TCF, TEST-REDGREEN, TEST-OUTCOME, TEST-ERROR, TEST-NEG, TEST-DIFF, TEST-INJECT, TEST-PARTIAL, TEST-RESIDUAL, TEST-GITENV, TEST-CLAIM and TEST-ABSENT.
- `standards/spec.md`: SPEC-STATUS, SPEC-FILES, SPEC-TESTS and SPEC-MOVE.
- `standards/pr.md`: PR-PUSHED, PR-UNIT, PR-CLAIMS and PR-BABYSIT.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| `orly doctor` | Yes | Check installed helpers and repository setup |
| `make conform` | Yes | Catalogue and generated file parity |
| `bun run typecheck` | Yes | Existing declared type lane |
| `bun test src` | Yes | Existing declared unit/integration fixtures |
| `make install-evals` | Yes | Packed payload and scratch installation |
| `orly gate pr` | Yes | One final pushed-revision combined verification |
| Secret scan | Yes | Native scanner; no suppressions |
| File ≤350 lines, function ≤50, method ≤70 | Yes | Separate policy, identity, persistence and orchestration |

## Prior-Art / Reference Implementations

- `src/command_process.ts` already owns time/output limits and termination of its child group.
- `src/installation/transaction.ts` and its tests establish private staging and refusal on changed inputs.
- Git tree identifiers, strict Zod decoding and Node crypto supply identity and integrity without a new dependency.
- CLI practices: gate/criteria modules return data without printing or exiting, the CLI owns rendering and registered flag errors, and direct/in-process/subprocess tests cover the changed behavior.
- Existing CLI divergences retained: command parsing and rendering share `src/cli.ts`; command handlers there can print. Human text remains the non-terminal default, and errors do not gain JSON suggestion/retry fields. A new output protocol is outside this change.

## Sections (implementation slices)

### §1 — Prerequisites and explicit outcomes

Inspect all structural criteria before running any declared command. Apply owner overrides before deciding whether a prerequisite or command satisfies the boundary.
A prerequisite with `ok: false` blocks all command groups; an executed group with `ok: false` leaves later groups not_run. Overrides retain the underlying outcome with `override: <owner reason>` and `ok: true`, permitting later execution.
Conditional integration/memory skips have `status: skipped, ok: true`; blocked/not_run groups have `ok: false` and cannot receive an override without execution. `--accept-dirty` preserves existing fresh execution but disables reusable evidence.
If configuration cannot produce the required command plan, expose an unavailable-plan result that cannot be overridden. Waiving `repo.config` never invents or removes required commands.

- **Dimension 1.1** — DONE; Test `failed_prerequisites_never_start_commands` (integration): dirty/unpushed/invalid-config branches leave marker files absent.
- **Dimension 1.2** — DONE; Test `failed_command_leaves_later_groups_not_run` (integration): a real failing command stops a later marker command.
- **Dimension 1.3** — DONE; Test `command_outcomes_remain_distinct` (integration): missing executables are blocked; signals are cancelled; nonzero/limits fail; successful empty output passes; conditional skips remain skipped.
- **Dimension 1.4** — DONE; Test `owner_override_does_not_turn_failure_into_pass` (integration): preserve outcome and mark its owner disposition; no automatic override of unrun commands.

### §2 — Private completion evidence and explicit reuse

The repository may declare `reuse.<verify-lane>` with `hermetic: true`, `max_age_ms`, nonempty `toolchain` identity probes, and optional extra `inputs` under its root.
Reuse is requested explicitly with `orly gate pr --reuse-verification`. Other lanes remain fresh; non-hermetic reuse is unsupported.

Bind each eligible attempt to the real worktree root, clean tracked tree and HEAD, `defaultMergeBase` result, native argv/limits, complete parsed repository configuration and effective `UNSCOPED_ENVIRONMENT` digest.
Bind Orly's source/schema/rule files, package version, Bun/runtime versions and platform. Toolchain identities include resolved executable bytes and successful bounded probe output; native command executables are identified too.
Extra inputs are regular files/directories beneath the root, including explicitly declared ignored inputs. Refuse path traversal in configuration; missing paths, symlinks and special files disable reuse and run fresh.
Recheck identity after execution and before accepting reuse. Dirty, unpushed, persistently changed, missing or unresolvable inputs cannot yield reusable evidence.

Eligibility requires exclusive ownership of verification inputs for the whole attempt, and commands/probes that do not modify them. Before/after hashes cannot detect every transient edit-and-restore; no immutable-snapshot guarantee is claimed.
Installed dependencies or other ignored inputs must be covered by declared inputs/toolchain identity before a repository asserts hermeticity. Network, live datastore and mutable external observations always run fresh.

Eligible lane attempts are serialized by an atomic per-worktree lock carrying the owner's process identifier and a unique token. Every existing lock blocks a second attempt; there is no automatic process recovery.
After confirming the old workload has stopped, the caller may clear the entire private evidence directory and execute fresh. This conservative Git-style cleanup replaces the earlier automatic lock-recovery design at the owner's request for smaller code.
Before any probe or workload, persist a monotonically numbered lane attempt directory as the start marker, including directory `fsync`. This marker becomes authoritative immediately, even when the gate is invoked without the reuse flag.
Capture the preceding candidate before creating this marker. An accepted reuse publishes a new completion with the original execution time and origin, so replay never extends freshness.
The highest numbered attempt in that lane is the only candidate; missing or invalid completion prevents selecting older evidence. Both normal and explicit-reuse invocations record fresh eligible execution; only the explicit flag permits reading a prior pass.

Append private records beneath the worktree's Git metadata. Persist complete output before publishing completion with an atomic rename and directory `fsync`; sign the manifest using a private per-worktree key and cover its output digest.
Never store raw environment values in a manifest or claim protection against a malicious process with the same operating-system identity.

Only a complete, unexpired, unchanged, signed successful command group is reusable. A newer failed attempt, malformed record, changed output, missing key/log, interruption or unsupported input forces fresh execution.
Keep earlier attempts immutable and report the originating record when reusing a pass. Reuse is not a waiver and must retain the original test counts/output.

Failure to establish the start marker blocks eligible execution. A completion-write failure preserves the native result with an explicit storage warning; its unfinished marker prevents future reuse.
Evidence is caller-managed local data: after confirming no gate is active, removing the private evidence directory discards reuse and forces fresh execution. There is no automatic retention service or silent cleanup of history.

- **Dimension 2.1** — DONE; Test `explicit_reuse_executes_a_hermetic_group_once` (end-to-end): create a committed/pushed fixture repository with a hermetic marker lane; invoke CLI `gate pr` twice, then `gate pr --reuse-verification`; all exit 0, count rises to two then stays two, and reuse references the second execution with its original counts.
- **Dimension 2.2** — DONE; Test `changed_verification_inputs_invalidate_reuse` (integration): change revision/base/config/argv/limits/environment/toolchain/declared bytes and require execution.
- **Dimension 2.3** — DONE; Test `invalid_completion_never_satisfies_a_gate` (integration): tamper manifest/output; remove key/log; expire or interrupt completion; require execution.
- **Dimension 2.4** — DONE; Test `failed_retry_preserves_prior_attempts` (integration): a failed latest attempt cannot select an older successful receipt; history remains unchanged.
- **Dimension 2.5** — DONE; Test `verification_input_changes_during_execution_are_refused` (integration): a command changing tracked inputs cannot produce valid current-revision proof.
- **Dimension 2.6** — DONE; Test `reuse_policy_is_strict_and_round_trips` (integration): malformed, unknown, non-hermetic or undeclared lane policy is refused; install preserves valid settings.
- **Dimension 2.7** — DONE; Test `interrupted_and_concurrent_attempts_never_select_an_old_pass` (end-to-end): concurrent and interrupted gates stay blocked; confirm workload cleanup, discard private evidence, then require fresh execution rather than an older pass.
- **Dimension 2.8** — DONE; Test `evidence_write_failure_preserves_execution_truth` (integration): start-marker persistence failure prevents launch; completion-write failure retains the native result with a storage warning and disables subsequent reuse.

### §3 — Consistent guidance and delivery

Use SPEC-STATUS's DEFERRED record policy in PR-SPEC. Cloud skills honor explicit authorization and run the same required boundary checks.
Seven guidance cases: (1) invocation/environment errors name their missing prerequisite, (2) baseline claims cite the exact base, (3) retries target the failed job without disguising a race as repaired, (4) unavailable reviews remain incomplete, (5) review completion requires the current head and two quiet polls, (6) expected skips stay distinct from passed checks, and (7) fixtures/injected delays never claim live measurements.
PR/test standards and ship guidance own these requirements. Keep one canonical approved visual reference and obtain design approval before implementing a requested visual redesign.

- **Dimension 3.1** — DONE; Test `learning_guidance_preserves_owner_boundaries` (integration): installed skills preserve authorization, override and parked-spec rules.
- **Dimension 3.2** — DONE; Test `learning_guidance_distinguishes_evidence` (integration): source guidance requires explicit measurement/review provenance without product-specific infrastructure instructions.
- **Dimension 3.3** — DONE; Test `generated_learning_guidance_matches_sources` (integration): current render and scratch installation agree with updated source standards and skills.

## Interfaces

Example repository opt-in:

```json
{"reuse":{"verify.unit":{"hermetic":true,"max_age_ms":3600000,"toolchain":[["bun","--version"]],"inputs":[]}}}
```

This policy is a repository-reviewed assertion that the command reads only bound source, declared extra inputs and identified toolchain/environment. Network, live datastores and undeclared mutable inputs remain ineligible.
The gate's result adds a distinct status while retaining `ok` for boundary satisfaction. An owner override records a separate disposition.

## Failure Modes

| Mode | Kind | Cause | Handling | Test |
|---|---|---|---|---|
| Blocked prerequisite | failure | Dirty/unpushed branch | No suite starts; blocked rows visible | `failed_prerequisites_never_start_commands` |
| Native failure | failure | Nonzero exit or termination | Preserve outcome; later groups not_run | `command_outcomes_remain_distinct` |
| Stale/tampered evidence | security | Changed identity, manifest or log | Execute fresh; never accept the record | `invalid_completion_never_satisfies_a_gate` |
| New failure after old pass | failure | Hermeticity assumption violated | Latest attempt invalidates old pass selection | `failed_retry_preserves_prior_attempts` |
| Concurrent source edit | failure | Source changes during verification | Refuse the binding and gate result | `verification_input_changes_during_execution_are_refused` |
| Invalid policy | failure | Unknown lane or non-hermetic declaration | Structural configuration refusal | `reuse_policy_is_strict_and_round_trips` |

## Invariants

1. `src/gates.ts` refuses required unrun checks through `ok: false` and refuses blocked/not_run overrides. Counterexample: an old owner override plus a held lock must leave the lane blocked; conditional skips remain neutral.
2. `src/verification_store.ts` accepts only the immediately preceding signed, complete, unexpired passed record with matching binding/output. Counterexample: a newer failed/unfinished attempt must prevent selecting an older pass. Local signing does not resist a malicious process with the same operating-system identity.
3. `src/verification_identity.ts` hashes environment values with a private-key digest before persistence. Counterexample: changing a secret changes identity without exposing its value. Native command output remains the command owner's responsibility.
4. `src/command_process.ts` retains its child-group owner, deadline and output budget; `src/gates.ts` retains owner-controlled dispositions for executed failures. Counterexamples: a timed-out workload fails, and an overridden assertion failure retains its failed status. Exclusive source ownership remains a prerequisite, not a runtime snapshot guarantee.

## Metrics & Observability

N/A: no product or operator signal changes. Private command evidence and CLI statuses are local verification output, with no telemetry upload.

## Acceptance Rubric (single scoring surface)

| # | Criterion | Verify | Expected | Priority | Graded |
|---|---|---|---|---|---|
| R1 | Prerequisites, reuse integrity and source guidance | `bun test src/gate_outcomes.integration.test.ts src/command_runner.test.ts src/verification.integration.test.ts src/verification_identity.integration.test.ts src/verification_store.integration.test.ts src/verification_policy.test.ts src/learning_guidance.integration.test.ts` | All pass | P0 | ✅ `76 pass, 0 fail; Ran 76 tests across 7 files.` |
| S1 | Type lane | `bun run typecheck` | Exit 0 | P0 | Final gate receipt: PR Session notes 1 |
| S2 | Complete declared unit lane | `bun test src` | Exit 0 | P0 | Final gate receipt: PR Session notes 1 |
| S3 | Isolated installation | `make install-evals` | Exit 0 | P0 | Final installation receipt: PR Session notes 1 |
| S4 | Secrets | `gitleaks detect --redact --no-banner` | Exit 0 | P0 | ✅ `666 commits scanned; no leaks found` |
| S6 | Catalogue and generated parity | `make conform` | Exit 0 | P0 | ✅ `standards.catalogue; generated.root.current; packs.sources.current` |
| S5 | Final boundary | `orly gate pr` | Exit 0 at exact pushed head | P0 | Final gate receipt: PR Session notes 1 |

S rows reference the exact pushed-head receipts in PR Session notes 1 under SPEC-GRADE. The PR opens only after those required checks succeed.

### Behaviour evals

- **Grounding rule:** Guidance must never equate an unavailable, skipped, unrun or fixture-only observation with an executed current-head pass.
- **Golden set:** Seven lessons in `src/learning_guidance.integration.test.ts`, including parked records, cloud authorization, reviewer availability and injected timings.
- **Ship threshold:** All deterministic guidance cases pass alongside rendered installation tests.
- **Fallback:** Fix the source guidance; no invented completion or silent waiver.

## Dead Code Sweep

Replace exhaustive command evaluation and boolean-only reporting. Remove contradictory cloud and parked-spec prose in the same edits; retain owner overrides and bounded execution.

## Out of Scope

- Non-hermetic reuse policies, remote attestation, telemetry, new dependencies and distributed caches.
- Changes to agentsfleet, other consumers' pins, production deployment or release automation.

## Product Clarity (authoring record)

1. Successful user moment: a corrected gate reruns necessary work and shows exactly what ran or was reused.
2. Preserved behavior: native commands, scopes, limits and owner overrides still decide the boundary.
3. Optimal-way check: extend existing criteria and supervisor instead of introducing another verifier.
4. Rebuild-vs-iterate: split identity/storage helpers while retaining the runner.
5. What we build: prerequisites, distinct statuses, opt-in evidence and coherent guidance.
6. What we do NOT build: a policy for reusing live datastore observations.
7. Fit: keep existing install/config ownership and scratch isolation.
8. Surface order: CLI and repository policy together.
9. Dashboard restraint: no UI.
10. Confused-user next step: inspect the named criterion and evidence path, then rerun fresh without the reuse flag.

## Decomposition & alternatives (patch vs refactor)

- Chosen shape: three Sections keep execution, evidence and guidance reviewable.
- Alternatives: prose-only guidance cannot stop commands; automatic reuse hides policy; forced reruns discard useful exact-revision proof. Explicit hermetic opt-in is the conservative default.
- Patch-vs-refactor verdict: focused refactor of orchestration with separate evidence owners.

## Discovery (consult log)

- Base: fetched `origin/main` at `3be34bd`, Orly 0.28.1.
- Source evidence: merged PR 844 final head `566710c151d3d09c395d94c5b8315a450af039af`, plus its committed implementation validation.
- The owner supplied all seven priorities and authorized Orly orchestration/source-standard changes. Routine defaults above implement that request without another permission loop.
- One isolated branch and one implementation PR follow the explicit delivery request; a separate spec PR would need a merge the owner prohibited.
- Model reviews: initial zoom-out (two major/two minor), comprehension (four major/one minor), design (two major/one nit), readiness (two major/one nit) completed. Resolved findings define lifecycle ordering, persistence, overrides, input identity, retention, fresh-default CLI proof and explicit exclusivity assumptions.
  The owner-requested simplification replaces automatic process recovery with a lock that remains blocked after interruption until the caller confirms cleanup and discards private evidence.
- Review provenance: fresh-context reviewers used the session's inherited model. The tool does not disclose its exact model/version; that provenance is unavailable and no model approval is claimed. Review outputs are completed static reviews, not executed verification.
- Implementation review found four defects: unexecuted overrides, unavailable-identity source drift, lost output whitespace and filesystem errors escaping status reporting. Targeted review confirms all resolved. A follow-up tracked-symlink fallback defect is also fixed and reviewed; the combined regression run passes.
- Standards review reported 26 findings across 12 files. Targeted resolution review confirms 25 resolved, including inventory, bounded inputs, statuses, module order, integration filenames, structured configuration errors and spec accuracy. Exact model/version provenance remains unavailable and explicitly incomplete.
- Final zoom-out reported one major finding (unexecuted overrides) and one minor (accept-dirty evidence publication); both are fixed and covered by the passing combined regression run.
- Verification receipts: regression command in R1 printed `76 pass`, `0 fail`, `Ran 76 tests across 7 files. [14.98s]`; `bun run typecheck` exited 0. Final pushed-head receipts belong in PR Session notes 1. The first installation run had 23 passes and one README example failure; the corrected example passed its targeted retry. Preserve both observations beside the final installation result.
- Deferrals and transfers: none. Non-hermetic reuse is excluded by design and stays fresh.
- Owner refinement: keep verification code and README smaller. Consolidate evidence/locking, put policy decoding in the existing configuration owner, and remove duplicate receipt fields while retaining negative tests.

> Owner: "I authorize changes to Orly’s verification orchestration and source standards to reduce repeated work and resolve contradictory guidance while preserving existing engineering guarantees."

> Owner: "Complete implementation before the final combined checks, then open an Orly PR with the evidence-to-change mapping. Do not merge, release or update other repositories’ Orly pins automatically."

> Owner: "The code changes are very narrow, and verbose, can they be made to be more smaller?"

> Owner: "the verification*ts code"

> Owner: "also reduce the README.md"
