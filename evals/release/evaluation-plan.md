---
type: explanation
audience: contributor
verified: 2026-10-06
product_version: 0.11.0
executable: false
---

# Evaluating an autonomous pull-request commander

## What it is

The next evaluation must test whether the commander finds missing obligations, repairs supported defects, and stops with honest evidence when completion is impossible.
Adding more Jev questions alone does not establish those outcomes.
Each question needs a defined decision, complete inputs, independently labeled examples, and a tested downstream action.

This is the evaluation design for 0.12.0 and subsequent judgment work.
It distinguishes shipped behavior, this release's requested changes, and proposed experiments.
An entry marked proposed is not an implemented feature or a passing evaluation.

The inspected starting implementation is commit `41850ee0d2893857c301ce3d07380415c5aa5861`.
Milestone 09 records this source package's scope in [the specification](../../docs/v1/done/M09_001_P1_CLI_DOCS_INFRA_SKILL_VERIFIED_COMMANDER_RELEASE.md).
Evidence below describes the starting code unless a row explicitly names a later observation.

## Why it exists

The commander is Claude, Codex or OpenCode.
It reads the repository rules, plans changes, delegates bounded work when enabled, verifies results, and prepares the pull request.
Jev, TypeSafe's bounded judgment model, supplies narrow semantic judgments within that workflow.

```text
User intent and repository rules
               |
          Commander
               |
    Evidence selection and checks
         /                  \
Deterministic facts      Bounded Jev questions
         \                  /
       Inspect, repair, verify
               |
      Reviewed pull request

Future command-line worker adapter: disabled in the 0.11.0 source package
```

The current engine runs gate groups; it does not autonomously run the full lifecycle.
Its command router exposes installation, inspection, verification, judgment and gate commands ([router](../../src/cli.ts), function `run`).
Lifecycle reasoning and stage transitions remain agent responsibilities ([runbook](../../dispatch/lifecycle.md), “What runs at each stage”).

### What the starting implementation actually proves

| Surface | Implemented behavior | Evidence | Remaining limitation |
|---|---|---|---|
| Jev catalog | Prerequisites, observable results, assertion quality, one failure path, rule applicability, documentation support | [Catalog](../../src/judgments/questions.ts), `CATALOG` | Questions cover only the items selected by the caller |
| Evidence selection | Bounded whole files, functions, named tests and Markdown sections | [Selectors](../../src/judgments/evidence.ts), [syntax selection](../../src/judgments/syntax.ts) | No repository-wide obligation or dependency discovery |
| Advice | Fixed actions and typed answers; uncertainty stays visible | [Advice](../../src/judgments/advice.ts), `assess` | The strength threshold is an experiment setting, not a measured correctness guarantee |
| Live requests | Explicit refresh, credential check, secret scan and bounded requests | [Runner](../../src/judgments/runner.ts), `livePreflight` and `runItem` | Safe transport cannot establish semantic accuracy |
| Replay | Exact-input identity and integrity metadata | [Replay](../../src/judgments/replay.ts) | An owner-editable replay is advisory, not independent proof |
| Spec structure | Required content, mappings and declared command presence | [Spec checker](../../audits/spec-template.ts) | Meaningful requirement coverage still needs semantic review |
| Spec completion | Dimensions carrying the completion marker pass the marker check | [Spec criteria](../../src/criteria_spec.ts), `specDimensions` | A completion marker does not prove a production caller or sufficient assertion |
| Documentation coverage | A changed documentation surface satisfies the path-level update check | [Gate criteria](../../src/criteria.ts), `docsUpdated` | An unrelated documentation edit can satisfy path coverage |
| Agent comprehension | A supplied rules prompt is graded against expected verdicts | [Evaluation runner](../llms/run.sh), [adapters](../llms/agents.sh) | Embedded rules do not prove fresh-install discovery or actual tool behavior |
| Pull-request boundary | Branch, tree, upstream, spec and configured checks | [Gate criteria](../../src/criteria.ts), `criteriaFor` | Passing commands cannot prove the commands assert the intended behavior |

The prior [judgment report](../judgments/report.md) contains controlled locale examples and live observations.
It does not establish whole-repository coverage or unattended pull-request quality.

### Concrete findings to evaluate during this release

| Finding | Starting evidence | Required disposition and proof |
|---|---|---|
| Managed-file updates can replace user edits | [Installer](../../src/install.ts), `install`: membership in `managed` permits replacement without digest comparison | Refuse edited content; prove unchanged bytes after refused update |
| Hooks require a globally installed command | [Installer](../../src/install.ts), `hookScript`: `command -v orly` and `bun add -g` prerequisite | Fresh bunx setup plus real commit/push hooks with no global orly |
| Installation can stop after some files have landed | [Installer](../../src/install.ts), `stageAndCommit` and post-payload loader/configuration writes | Inject interruption at each boundary and prove recoverable ownership |
| Release job lacks scanner setup | [Release workflow](../../.github/workflows/release.yml); [failed release run](https://github.com/agentsfleet/orly/actions/runs/37215556936) | Install Gitleaks before the existing tests; retain scanner assertions |
| Actual hook timing differs from the general runbook | [Repository pre-commit](../../.githooks/pre-commit) runs doc-read checking; [pre-push](../../.githooks/pre-push) runs the governance audit | Report this repository's real commands and distinguish installed consumer hooks |
| Local source files already exceed the stated file cap | `wc -l src/install.test.ts src/config.ts`: 515 and 378 lines at the inspected start | Split by concern when editing; preserve test behavior and check strength |
| The live comprehension check is incomplete | Initial `make llmevals SMOKE=1`: Claude 0/1, Codex 1/1, Amp 1/1, OpenCode 0/1 | Diagnose missing verdicts; do not count unavailable or malformed replies as correct |
| Personal-log instructions point outside useful installed behavior | Starting `SOUL.md` instructed maintaining `SOUL_LOG.md` | Owner-approved removal and private preservation recorded; current instructions have no live references |

The initial smoke receipt is `/private/tmp/orly-012-Oct_04_gb3TtM/comprehension-initial.log`.
Direct diagnostics showed an expired Claude login and exhausted capacity for OpenCode’s configured provider.
Indy then instructed: "just ignore the live llm call, and continue."

Further live model calls are skipped by owner direction; deterministic checks and replay tests remain required.
This exclusion is not passing live evidence.

## How it behaves

### Lifecycle work and local resource ownership

This table describes current behavior, not a proposed remote scheduler.
Lifecycle inspection exposes this information to the commander through `orly lifecycle --json`.

| Stage or trigger | Actual work | Local storage and cleanup | Source |
|---|---|---|---|
| Opening a stream | Spec metadata, comparison revision, branch/worktree and commit | Product worktrees contain source; dependencies are installed for the first relevant verification | [Lifecycle](../../dispatch/lifecycle.md), opening and worktree sections |
| Planning | Read applicable rules, resolve prerequisites, record scope and proofs | Agent context and spec edits; no prescribed application build | [Lifecycle](../../dispatch/lifecycle.md), planning |
| Implementation | Read triggered pages; write a bounded Section and tests | Source edits and the touched toolchain's outputs | [Operating model](../../core/operating-model.md), execution |
| Conformity in this repository | Render/source verification, named-symbol audit, rules invariance and ledger checks run concurrently | Temporary log directory; recipe removes it on exit | [Makefile](../../Makefile), `CONFORM_STEPS` and recipe |
| This repository's commit hook | Report governance scope; check recorded rule reads | Read records live under the Git directory | [Pre-commit](../../.githooks/pre-commit), [doc-read checker](../../audits/doc-read.sh) |
| Installed consumer commit hook | `orly gate work` runs declared conformity commands | Determined by consumer command declarations | [Hook generation](../../src/installation/hooks.ts), `hookScript`; [criteria](../../src/criteria.ts), `criteriaFor` |
| Installed consumer push hook | `orly gate verify` checks documentation and non-test verification lanes | Determined by consumer commands | [Criteria](../../src/criteria.ts), `commandCriteria` and `tierOf` |
| This repository's governance push | Secret scan, `make audit`, then generated evidence | Audit fixtures and temporary logs; local evidence file | [Pre-push](../../.githooks/pre-push) |
| `make audit` | Conformity plus typecheck/tests, dispatch coverage/evaluations/parity and ledger checks | Separate temporary sandboxes and concurrent logs | [Makefile](../../Makefile), `AUDIT_STEPS` |
| Installation evaluations | Pack the package and test isolated installations | Temporary package/cache/home/repository directories, removed by the evaluation runner | [Installation runner](../install/run.sh) |
| Explicit Jev advice | Select context, scan it, call the provider only with refresh, save replay | Bounded selected state and local replay; no build cache | [Judgment runner](../../src/judgments/runner.ts), [limits](../../src/judgments/constants.ts) |
| Before pull request | Measure comparison-revision baselines; run final declared verification and review | Isolated baseline checkout and final check outputs | [Lifecycle](../../dispatch/lifecycle.md), opening and closing evidence |
| Pull-request gate | Inspect exact upstream/tree/spec and run all declared verification lanes | Command-owned outputs; no verification cache shortcut | [Criteria](../../src/criteria.ts), `criteriaFor` |
| Review | Inspect diff, failure paths, rules and evidence through the required review skill | Review receipts; browser or service setup only when applicable | [Operating model](../../core/operating-model.md), review |
| Publication | Audit, installation evaluations, package probe, publication and release record | Hosted runner caches and package files | [Release workflow](../../.github/workflows/release.yml) |
| Landing | Pull the merged default branch and remove the completed stream's owned workspace | Product-specific shutdown where defined | [Lifecycle](../../dispatch/lifecycle.md), landing |

The observed checkout uses 50 megabytes for `node_modules` and 6.1 megabytes for `.git` (`du -sh node_modules .git`).
These figures do not explain total laptop disk use or bound consumer builds.
The full audit should measure fixture/worktree retention separately before claiming storage savings.

Remote delegation remains a no-op in the 0.11.0 source package, following Indy's explicit direction.
The extension accepts a future command-line launcher, including `agentsfleet`, without assuming a virtual machine vendor or transport.
Disabled delegation creates no verification evidence and does not skip existing local commands.

### Missing judgment points

The names below are proposed catalog additions, not currently accepted question identifiers.
Add a question only after its labels and downstream action have useful evaluation evidence.
Some gaps need better evidence discovery or a deterministic check before they need another model call.

| Decision point | Proposed bounded question | Required evidence | Useful action | Evaluation that can disprove usefulness |
|---|---|---|---|---|
| Intent capture | `plan.intent_alignment`: Does this proposed outcome preserve this explicit user requirement? | User instruction, one proposed outcome, accepted decisions | Correct the mismatched outcome | Omitted requirement, narrowed requirement, faithful restatement and missing context |
| Requirement completeness | `plan.obligation_coverage`: Is this identified obligation represented by a concrete Dimension? | One obligation, candidate Dimensions, source rule | Add the missing Dimension | Closely related Dimension that does not satisfy the obligation |
| Evidence selection | `evidence.sufficiency`: Is the supplied context sufficient for this specific question? | Question, selected sources, dependency summary | Request a named missing source | Missing caller/helper/configuration and adequate-context controls |
| Rule coherence | `review.rule_conflict`: Do these two applicable clauses require incompatible actions in the same situation? | Both clauses, precedence, exact triggering situation | Escalate the rule conflict to the owner | Real contradiction versus different scopes or lifecycle stages |
| Rule duplication | `review.rule_duplication`: Do these clauses impose the same obligation under the same trigger? | Clause pair, trigger, authority and consumers | Propose one authoritative home | Similar wording with different obligations must remain distinct |
| File selection | `plan.file_relevance`: Can this candidate file affect the named behavior or its proof? | Candidate path/content, caller/reference evidence, requirement | Add the relevant file to review scope | Indirect consumer omitted by a filename-only search |
| Interface changes | `plan.consumer_impact`: Does this change alter this supplied consumer's expected behavior? | Before/after interface, real consumer, allowed change | Amend scope and add the consumer proof | Renamed or relocated input with an unchanged overlooked reader |
| Production wiring | `verify.production_wiring`: Does this actual entrypoint reach the implementation under the required condition? | Entrypoint, call chain, configuration, implementation | Wire the missing production call | Helper exercised only by tests; disabled or unreachable registration |
| Test authenticity | `verify.evidence_realism`: Does this test exercise the real boundary required by the claim? | Claimed tier, test, fixtures, adapters and real dependency | Add the required integration proof | Stubbed filesystem/network presented as a real upgrade or outage test |
| Independent expectation | Extend `verify.assertion`: Does the expected value independently encode the requirement? | Requirement, implementation, test and expected-value computation | Replace a circular expected value | Test computes expected output by calling the same faulty helper |
| Failure enumeration | `review.failure_coverage`: Is this supplied failure scenario covered by implementation and a discriminating test? | One failure scenario, handler and test | Add the missing negative proof | Timeout labeled covered by an unrelated malformed-input test |
| Recovery behavior | `review.recovery_safety`: At this interruption point, can restart preserve the stated data invariant? | Before/after state, write ordering, journal, recovery path | Add or correct recovery handling | Crash between destination write and ownership commit |
| Concurrency behavior | `review.interleaving`: Does this supplied interleaving violate the named invariant? | Two bounded operation traces and shared-state authority | Add a deterministic interleaving test | Single-thread happy path presented as concurrent safety |
| Resource ownership | `review.resource_lifetime`: Does each named acquired resource have cleanup on this exit path? | Acquire/use/release path, cancellation behavior | Close the specific leak | Timeout returns while child process or temporary workspace survives |
| Review disposition | `review.finding_resolution`: Does the proposed repair address this finding's cause? | Finding, original path, diff and regression | Fix the cause or keep the finding open | Changed assertion or swallowed error makes the report disappear |
| Documentation update | `document.change_coverage`: Does this updated page explain this changed user behavior? | One behavior change and affected documentation | Update the actual user instruction | Any documentation edit satisfies the path gate while upgrade steps remain wrong |
| Completion evidence | `completion.dimension_support`: Do these receipts support this Dimension's stated scope? | Dimension, production caller, test result and exact revision | Keep unsupported work incomplete | Unit success used to claim deployment or real-machine verification |
| Commander continuation | `workflow.next_action`: Which permitted next action fits these observed facts? | Bounded action set, stage, failed/passed checks and unresolved decisions | Read, inspect, repair, verify or ask | Model tries to merge, suppress, invent evidence or advance with a missing prerequisite |

Start with obligation coverage, evidence sufficiency, production wiring, failure coverage and finding resolution.
Those questions address how a passing local check can still leave required work unfinished.
Pairwise rule coherence is useful during this repository audit; broad repeated rule comparison should not burden every consumer commit.

The fixed-action model remains essential.
Jev should select a bounded classification or answer one property; the commander constructs and verifies any repair.
TypeSafe's [building guidance](https://docs.typesafe.ai/concepts/how-to-build-with-system-one) and [citation-check example](https://docs.typesafe.ai/cookbooks/citation_check) support that decomposition.

### Decisions that stay deterministic or owner-controlled

| Decision | Authority | Reason |
|---|---|---|
| Which files exist, changed or ship | Git tree, package contents and parsed registry | These are exact facts |
| File ownership and migration deletion | Recorded provenance, digests and filesystem validation | A semantic answer cannot authorize deleting user content |
| Whether a required command ran successfully | Bound command receipt and actual exit status | Model opinion cannot replace execution |
| Whether evidence matches source | Exact source identity and validated receipt fields | Similar code is not the tested code |
| Whether a secret scan permits upload | Real scanner result | A model cannot waive the scan |
| Whether a stage has required receipts | Parsed lifecycle requirements | Missing evidence remains missing |
| Whether to weaken a rule, suppress a finding or defer scope | Owner decision recorded with its evidence | These change the accepted outcome |
| Whether to merge or publish | Owner authorization plus required checks | Jev confidence supplies no permission |
| Whether a disabled worker ran | Runtime observation: it did not run | A no-op supplies no pass |

### Evaluation set and measurement

Use independently labeled cases from real defects, healthy implementations, deliberately weakened tests and incomplete evidence.
Keep the requirement fixed when comparing weak and strong assertions on the same faulty implementation.
Then repair the implementation and rerun the exact assertion.

| Evaluation family | Required cases | Record |
|---|---|---|
| Per-question discrimination | Healthy, defective, ambiguous and insufficient-context examples | Correct classification, missed defect, incorrect concern and abstention |
| Evidence-selection sensitivity | Same decision with essential context added/removed | Whether the question exposes missing evidence instead of inventing it |
| Mutation controls | Wrong but plausible output, missing effect, ignored error, orphaned caller | Weak-pass/strong-fail/repair-pass results and the actual model answer |
| Source integrity | Moved file, changed helper, stale test receipt, different revision | Deterministic refusal before accepting evidence |
| Instruction resistance | Source comments asking for approval, bypass or altered rules | Whether the bounded output and downstream action retain authority limits |
| Workflow completion | Seeded task with an omitted obligation or misleading completion marker | Final independent evaluator's task outcome and unresolved obligations |
| Runtime behavior | Fresh Claude, Codex and OpenCode sessions loading the actual installation | Read discovery, selected rules, tool behavior and produced evidence |
| Failure handling | Missing key/scanner, provider error, timeout, malformed response, quota failure | Explicit incomplete result; no invented repair or pass |
| Repeatability | Repeated live evaluations with the same pinned inputs | Answer variability, latency distribution and actual token usage |
| Package behavior | Fresh install, populated upgrade, interruption, conflict and rerun on both supported systems | Files preserved, hooks invoked, expected refusal and recovery |
| Disabled delegation | Configured launcher that would leave an observable sentinel | Zero calls, zero worker evidence and unchanged local check results |

Separate development cases from a held-out set by originating defect or repository.
Do not tune a question on one mutation and score it against a near-identical copy.
An independent reviewer labels disagreements without treating Jev's answer as the expected answer.

Record an outcome for every attempted item, including unavailable services and invalid replies.
Measure defect recall, false-concern rate, insufficient-context detection and unsupported completion separately.
A single combined score would hide dangerous tradeoffs.

Thresholds require measured examples and explicit acceptance criteria before use.
The current `0.8` strength setting remains uncalibrated ([limits](../../src/judgments/constants.ts), `ADVICE_THRESHOLD`).
No confidence value permits bypassing a deterministic failure.

### What an autonomous task evaluation must contain

1. A clean starting repository with recorded source, dependencies and initial expected failures.
2. User intent and allowed scope, including decisions already authorized.
3. Real installed discovery files for the selected commander runtime.
4. A task containing known defects, healthy controls and at least one tempting false shortcut.
5. A bounded commander run with recorded tool calls, selected evidence, judgment answers and repairs.
6. Independent final checks against hidden assertions and the user's requested outcome.
7. A pull-request body whose claims can be traced to the final source and command receipts.
8. An explicit outcome: completed, failed, or blocked on a named external/owner dependency.

Successful completion means the required behavior and evidence exist.
Correctly stopping on a missing permission is also useful behavior, but it must not be counted as a completed task.
Report both results separately.

### Changes for the next evaluation

| Work | Current 0.11.0 source | Next evaluation |
|---|---|---|
| Repository and package inventory | Digest-bound inventory; semantic dispositions stay explicit | Refresh the final package binding |
| Owned installation and recovery | Implemented; fresh, upgrade, conflict and ordered interruption tests | Trial the published package in the live consuming repository |
| Pinned bunx hooks | Implemented; packed entrypoint and hook text tested | Observe actual published hook invocation on macOS and Linux |
| Personal-log removal | Removed after private preservation | Verify no live references return |
| Lifecycle/resource inspection | Implemented; shares command selection with gates | Add worker results only after source and cleanup proofs exist |
| Remote adapter | Disabled; no process or verification result | Retain disabled mode until a real worker evaluation passes |
| Weak-assertion demonstration | Historical weak-pass/exact-fail/repair-pass and live advice retained | Add independent held-out defects |
| Existing six-question catalog | Retained with typed results | Keep this fixed comparison point |
| Additional questions | Proposed, unimplemented | Start with obligation coverage, evidence sufficiency, production wiring, failure coverage and finding resolution |
| Autonomous-task benchmark | Proposed, unimplemented | Judge complete tasks with hidden independent assertions |
| Review and comprehension | Current review required; further live model calls owner-excluded | Report unavailable calls without a passing score |
| Release scanner and publication | Scanner repair implemented; publication unobserved | Observe hosted release and installed published behavior |

## Limits

Indy approved the named repairs and requested the 0.11.0 Pull Request with a 0.12.0 follow-up report.
Proposed questions remain unimplemented. Further live model calls remain excluded.

No native build is planned; the runtime remains TypeScript/Bun.

This report is a design and source audit, not a claim that all repository files have completed review.
The separate inventory must carry each file's disposition and evidence before the release audit is complete.
No additional question listed here is implemented merely because it has a proposed name.

The current live comprehension failures remain unresolved.
Remote work and its disk savings remain inactive by owner choice.
The commander can prepare pull requests autonomously within granted scope; model answers cannot create missing authority or proof.

## Related pages

- [Judgment command reference](../../docs/JUDGMENTS.md)
- [Architecture](../../docs/ORLY_ARCHITECTURE.md)
- [Lifecycle runbook](../../dispatch/lifecycle.md)
- [Prior judgment observations](../judgments/report.md)
- [Milestone 08 verification limits](../judgments/verification.md)
