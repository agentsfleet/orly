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

# M09_001: Release auditable installation and remote commander work

**Prototype:** v1.0.0
**Milestone:** M09
**Workstream:** 001
**Date:** Oct 04, 2026
**Status:** DONE
**Priority:** P1 — install and verify the package used in `agentsfleet`
**Categories:** CLI DOCS INFRA SKILL (command-line interface, documentation, infrastructure, skills)
**Batch:** B1 — one release stream; remote delegation stays disabled
**Branch:** feat/m09-verified-012
**Baseline revision:** 41850ee0d2893857c301ce3d07380415c5aa5861
**Test Baseline:** unit=339 integration=n/a — no separate lane is declared; real boundary cases run in the unit command
**Baseline evidence:** evals/release/receipts/Oct_05_21_14/baseline-unit.json
**Depends on:** M08_001 implementation; its missing live comprehension is owner-excluded and reported without a passing result
**Provenance:** agent-generated from Indy's release and commander instructions, Oct 04, 2026
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`; installation and remote execution decisions land with their implementation

## Overview

**Goal (testable):** Prepare the 0.11.0 source package as a reviewed Pull Request, prove consumer preservation and deterministic checks, and report the proposed 0.12.0 changes.
**Problem:** Installed rules occupy repository-owned paths, hooks require a global executable, and expensive local checks compete for laptop storage.
**Solution summary:** Audit the complete repository, move installed orly content into `.orly/`, and make ownership checks recoverable. Keep Claude, Codex or OpenCode as commander. Define a disabled command-line delegation adapter for later activation; deterministic checks continue locally. Reuse Jev's selected-evidence questions and prove a useful assertion repair. Complete local review and package checks, then push a ready Pull Request. Publication and the live consuming-repository trial remain owner work after review.

## PR Intent & comprehension handshake

- **Pull Request (PR) title:** Prepare owned installation and deterministic verification in orly 0.11
- **Intent:** Give the commander reliable rules, useful judgment advice and explicit future delegation points for moving builds off the laptop.
- **Handshake:** Read and audit every tracked file and the packed payload; correct authoritative sources, preserve user content, and prepare the requested Pull Request and follow-up report.
- **ASSUMPTIONS I'M MAKING:** Remote execution is a no-op in this release, per Indy. A later adapter can use `agentsfleet` or another command-line launcher. Existing local checks remain required.

## Implementing agent — read these first

1. `src/install.ts` and `src/config.ts` — installation ownership, current records and configuration readers.
2. `src/loaders.ts` and `registry.json` — host entrypoints and pack destinations.
3. `docs/ORLY_ARCHITECTURE.md` and `docs/JUDGMENTS.md` — gate authority and bounded judgment behavior.
4. `dispatch/lifecycle.md` and `docs/RELEASE_TEMPLATE.md` — stage timing and selected product release rules.
5. https://docs.typesafe.ai/api — current typed judgment API; the installed TypeSafe skill supplies the reading workflow.

## Files Changed (blast radius)

| Files | Action | Role |
|---|---|---|
| `src/install.ts`, `src/config.ts`, `src/loaders.ts`, `src/references.ts`, `src/render.ts`, `src/model.ts`, `src/validation.ts`, `src/verify.ts` | EDIT | Owned layout, migration, discovery and verification |
| `src/installation/*.ts`, `src/execution/*.ts` | CREATE | Focused migration and disabled execution-adapter mechanisms with sibling tests |
| `src/config_discovery.ts`, `src/cli.ts`, `src/cli_help.ts`, `src/criteria.ts`, `src/criteria_support.ts`, `src/criteria_spec.ts`, `src/gates.ts`, `src/doc_rules.ts`, `src/surfaces.ts` | EDIT | Command routing, lifecycle inspection, disabled delegation and path consumers |
| `src/*.test.ts`, `src/gates_test_support.ts`, `src/judgments/*.ts` | EDIT | Existing behavior, migration faults, weak-test control and judgment identity |
| `core/operating-model.md`, `SOUL.md`, `AGENTS.md` | EDIT | Authoritative instructions, commander responsibilities and regenerated rules |
| `SOUL_LOG.md` | DELETE | Remove the requested personal log after saving the pre-existing edit privately |
| `dispatch/*.md`, `dispatch/*.sh`, `packs/language/*/rules.md` | EDIT | Coherent installed references and applied audit findings |
| `audits/*.sh`, `audits/spec-template.ts`, `audits/agents-md.md` | EDIT | Relocated inputs and evidenced rule coherence; preserve check strength |
| `registry.json`, `schemas/*.json` | EDIT | Managed destinations and validated configuration/evidence |
| `.oracle/orly.json`, `.orly/orly.json`, `.orly/AGENTS.md`, `.orly/**` | MOVE/CREATE | Deliberate local installation and recorded ownership |
| `CLAUDE.md`, `opencode.json`, `.claude/skills/orly-*/SKILL.md`, `.agents/skills/orly-*/SKILL.md`, `.opencode/skills/orly-*/SKILL.md` | EDIT/CREATE | Thin host-required entrypoints |
| `skills/orly-*/SKILL.md` | EDIT | Commander handoffs, judgment timing and canonical rule paths |
| `docs/TEMPLATE.md`, `docs/RELEASE_TEMPLATE.md`, `docs/ORLY_ARCHITECTURE.md`, `docs/JUDGMENTS.md`, `docs/VERIFY_TIERS.md`, `docs/DOCUMENTATION_RULES.md` | EDIT | Source-checked lifecycle, release and operator guidance |
| `docs/DISPATCH_ARCHITECTURE.md`, `docs/DISPATCH_REVIEW_DISPOSITION.md`, `docs/EXECUTE_DOC_READS.md`, `docs/HARNESS_VERIFY_OUTPUT.md`, `docs/RULE_ENFORCEMENT.md`, `docs/greptile-learnings/*.md` | EDIT | Audit-supported corrections and duplicate authority removal |
| `docs/architecture/installation.md`, `docs/architecture/remote-execution.md` | CREATE | Ownership, recovery, worker boundaries and release evidence |
| `README.md`, `llms.txt`, `package.json`, `bun.lock`, `.gitignore`, `bin/orly` | EDIT | Bun distribution, version, discovery and ignored state |
| `.github/workflows/*.yml`, `.githooks/pre-commit`, `.githooks/pre-push`, `Makefile` | EDIT | Requested release/runner repairs and exact verification entrypoints |
| `evals/install/*.sh`, `evals/dispatch/*.sh`, `evals/ledger/*.sh`, `evals/llms/*`, `evals/test-*.sh` | EDIT | Installation, references and actual agent comprehension proofs |
| `evals/release/*`, `evals/judgments/*.md`, `fixtures/installation/**`, `fixtures/execution/**` | CREATE/EDIT | File-by-file inventory, defects, evidence, migration and worker fault cases |
| `docs/v1/{pending,active,done}/M09_001_*`, `docs/v1/{active,done}/M08_001_*` | CREATE/EDIT/MOVE | Current specification and honest completion of inherited checks |

Every tracked path is audited, including unchanged fixtures, branding, license and historical specs. Historical records retain their wording. Untracked `.agents/skills/typesafe-ai/` and `skills-lock.json` remain user-owned and excluded from release commits.

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: No Dead Code (NDC), Orphan sweep (ORP), standard parsers (PSR), tests that can fail (TCF), named constants (UFS), tagged unions (TGU), prompt-injection resistance (PRI).
- `dispatch/write_ts_adhere_bun.md`: strict boundary validation, file shape, bounded subprocesses and cancellation ownership.
- `dispatch/write_shell.md`, `dispatch/write_any.md`: portable argument handling, cleanup, lengths and source discipline.
- `dispatch/edit_rules.md`: authoritative regeneration, questionnaire, live comprehension and evidence.
- `dispatch/write_documentation.md`, `docs/DOCUMENTATION_RULES.md`: source-backed prose, resource ownership and historical integrity.
- `dispatch/write_spec.md`, `dispatch/lifecycle.md`: stage-owned evidence and final gate execution.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec template and doc reads | yes | Complete proof mapping and section-specific reading records |
| Governance invariance | yes | Regenerate, audit, questionnaire and live agent comprehension |
| File and function length | yes | Small migration/worker modules; ≤350 source lines and ≤50 function lines |
| Named constants and TypeScript | yes | Explicit budgets, validated types and Bun primitives |
| Secret scanning | yes | Full-history scan before commit/push; selected state scanned before Jev upload |
| Deterministic PR gate | yes | Exact upstream revision and all declared checks; remote failure stays failure |
| Product-specific database and interface gates | no | No database or graphical interface changes |

## Prior-Art / Reference Implementations

- `src/judgments/transport.ts`, `src/judgments/scan.ts`: bounded work, cancellation and explicit failure classification.
- `src/install.ts`, `src/loaders.ts`: existing ownership and delimited host-file edits; strengthen missing content checks.
- `evals/llms/agents.sh`: actual Claude, Codex and OpenCode invocation behavior and unavailable-result classification. This release does not launch those agents remotely.
- Canonical TypeScript reference checkouts are checked before adding production modules; no cloning without approval.

## Sections (implementation slices)

### §1 — Establish the complete audit and inherited evidence — DONE

- **Dimension 1.1** — DONE — Inventory every tracked file and packed path with ownership, purpose, findings and evidence. → Test `inventory_covers_repository_and_package`
- **Dimension 1.2** — DONE — Complete the current review and report inherited live-comprehension exclusions without converting missing evidence into success. → Test `completion_requires_observed_evidence`
- **Dimension 1.3** — DONE — Remove the personal log and its live instructions while preserving the user's pending edit privately. → Test `personal_log_has_no_live_references`

### §2 — Install and migrate owned content — DONE

- **Dimension 2.1** — DONE — Install managed rules, supporting files and skills under `.orly/`; required discovery files contain only entrypoints plus repository-owned content. → Test `fresh_install_uses_owned_layout`
- **Dimension 2.2** — DONE — Migrate recorded owned files only after digest verification; unrecorded, edited or escaping paths refuse before destructive changes. → Test `migration_preserves_owned_content`
- **Dimension 2.3** — DONE — Save an installation journal, commit destinations before obsolete-copy removal, and recover interrupted runs without losing the original content. → Test `interrupted_install_recovers`
- **Dimension 2.4** — DONE — Repeat installs preserve configuration, host instructions and repository hooks byte-for-byte outside managed regions. → Test `repeat_install_preserves_user_files`

### §3 — Expose lifecycle work and a disabled delegation adapter — DONE

- **Dimension 3.1** — DONE — Show each lifecycle stage's commands, execution location, inputs, outputs and cleanup responsibility. → Test `lifecycle_plan_names_actual_commands`
- **Dimension 3.2** — DONE — Define a command-line adapter configuration for future worker launchers, including `agentsfleet`; default and only supported execution mode is disabled. → Test `remote_adapter_is_disabled`
- **Dimension 3.3** — DONE — Report the disabled adapter to the commander without launching subprocesses or replacing any local check. → Test `disabled_adapter_has_no_side_effects`
- **Dimension 3.4** — DONE — Reject unsupported activation and malformed adapter configuration; a no-op supplies no verification evidence. → Test `disabled_adapter_never_becomes_pass`
- **Dimension 3.5** — DONE — Document actual local disk consumers, cleanup ownership and the source/result/resource requirements for later remote activation. → Test `lifecycle_resource_map_matches_code`

### §4 — Demonstrate useful Jev judgment — DONE

- **Dimension 4.1** — DONE — Reuse cataloged planning, assertion, failure, applicability and claim questions with complete selected evidence. → Test `judgment_catalog_remains_bounded`
- **Dimension 4.2** — DONE — Reproduce a real defect passing a weak test, prove the stronger assertion fails, repair it and record the live advice. → Test `strong_assertion_exposes_real_defect`
- **Dimension 4.3** — DONE — Record all live observations, uncertainty and failures; keep hooks free of model uploads and deterministic results independent. → Test `advice_never_overrides_checks`

### §5 — Verify the source package and prepare owner review — DONE

- **Dimension 5.1** — DONE — Prove packed setup and pinned hook generation without a global orly; identify published macOS/Linux hook checks as unobserved. → Test `bunx_hooks_work_without_global_install`
- **Dimension 5.2** — DONE — Verify the release job installs Gitleaks and preserve real local scanner assertions; report hosted publication as unobserved. → Test `release_runs_real_scanner_tests`
- **Dimension 5.3** — DONE — Complete canonical local checks, measured coverage, adversarial review and package-content checks before owner review. → Test `release_readiness_has_complete_receipts`
- **Dimension 5.4** — DONE — Prepare a ready 0.11.0 Pull Request and a source-backed 0.12.0 evaluation report; leave merging and deployment to Indy. → Test `release_report_matches_verified_source`

## Interfaces

- Existing `init`, `update`, `doctor`, `gate` and `judge` command behavior remains explicit; configuration moves to `.orly/orly.json`.
- `.oracle/` is read only by the deliberate migration path; ordinary operation uses the new recorded installation.
- Optional remote configuration names a disabled command-line adapter and argument vector. No transport, host, credential or vendor is assumed.
- Later activation must bind run identity, exact source, lane, arguments, environment and bounded results. These are documented activation requirements, not implemented remote guarantees.
- Exact command names and JSON schemas are pinned in the architecture document before their production callers are added.
- The commander sees local checks and disabled delegation separately. Only completed deterministic checks establish check status; agent prose and Jev answers are advisory.

## Failure Modes

| Mode | Handling | Negative proof |
|---|---|---|
| Edited/unowned destination or obsolete source | Refuse with paths; leave user bytes intact | `migration_preserves_owned_content` |
| Interrupted migration, repeated run, changed journal | Resume only validated work; refuse incompatible state | `interrupted_install_recovers` |
| Symlink escape or malformed configuration | Refuse before writing or sending work | `migration_preserves_owned_content` |
| Unsupported adapter activation | Reject with explicit unsupported status; do not run a remote command | `disabled_adapter_never_becomes_pass` |
| Malformed adapter configuration | Reject before running declared checks | `remote_adapter_is_disabled` |
| Disabled adapter presented as proof | No evidence and no remote pass; existing local checks still decide | `disabled_adapter_has_no_side_effects` |
| Provider unavailable, missing scan or insufficient evidence | Explicit incomplete advice; deterministic checks still run | `advice_never_overrides_checks` |
| Missing agent authentication or account capacity | Record unavailable; further live calls skipped by explicit owner instruction | `completion_requires_observed_evidence` |
| Unobserved publication or live trial | Report missing proof explicitly; do not invent release success | `release_report_matches_verified_source` |

## Invariants

1. Authoritative repository files remain outside installed-content ownership; migration validates recorded digests before deletion.
2. A completed install is recorded only after payload and entrypoints succeed; interrupted work has a recoverable journal.
3. Disabled delegation returns no verification result and cannot clear or skip a local check.
4. The disabled adapter launches no process and allocates no workspace or remote resource.
5. Model output cannot execute commands, approve exceptions, weaken assertions or alter deterministic verdicts.
6. Hooks run the pinned Bun package through bunx; no global orly installation is required.
7. Publication requires observed verification evidence; live evaluations excluded by the explicit owner instruction remain recorded as skipped, never passed. Remote machines are unnecessary for this disabled extension point.

## Metrics & Observability

| Signal | Fires when | Allowed properties | Privacy guard | Proof |
|---|---|---|---|---|
| Local install receipt | Migration runs | Source/destination paths, content digests, stage and outcome | No file contents or credentials | `interrupted_install_recovers` |
| Lifecycle inspection | Commander requests the stage map | Declared commands, local location and disabled adapter status | No environment dump or credentials | `disabled_adapter_has_no_side_effects` |
| Judgment report | Explicit advice request | Existing typed answers, uncertainty, duration and token usage | Existing secret scan and source-free report | `advice_never_overrides_checks` |

No new external analytics collection is introduced. Existing consent behavior remains required.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts |
|---|---|---|---|
| 1.1 | integration | `inventory_covers_repository_and_package` | Every tracked and packed path has a disposition; unknown paths fail |
| 1.2 | integration | `completion_requires_observed_evidence` | Missing review/comprehension evidence cannot mark completion |
| 1.3 | integration | `personal_log_has_no_live_references` | Log absent; live instructions no longer point to it; private edit backup exists |
| 2.1 | integration | `fresh_install_uses_owned_layout` | Fresh repository contains managed payload under `.orly/` |
| 2.2 | integration | `migration_preserves_owned_content` | Edited, unowned and escaping paths refuse without deletion |
| 2.3 | integration | `interrupted_install_recovers` | Faults before/after payload, metadata and cleanup recover without data loss |
| 2.4 | integration | `repeat_install_preserves_user_files` | Second run is stable and custom hooks/instructions/configuration survive |
| 3.1 | unit | `lifecycle_plan_names_actual_commands` | Stage display matches configured commands and locations |
| 3.2 | unit | `remote_adapter_is_disabled` | Missing/disabled adapter is accepted; malformed configuration fails |
| 3.3 | integration | `disabled_adapter_has_no_side_effects` | A configured launcher sentinel never runs and local checks still run |
| 3.4 | integration | `disabled_adapter_never_becomes_pass` | Activation is refused and failed local checks remain failed |
| 3.5 | integration | `lifecycle_resource_map_matches_code` | Reported stage commands and local resource owners match production callers |
| 4.1 | unit | `judgment_catalog_remains_bounded` | Unknown questions, missing roles and excessive state refuse |
| 4.2 | integration | `strong_assertion_exposes_real_defect` | Same faulty code passes weak assertion and fails exact assertion; repair passes |
| 4.3 | integration | `advice_never_overrides_checks` | Provider failures and hostile evidence cannot approve checks or commands |
| 5.1 | integration | `bunx_hooks_work_without_global_install` | Packed installation works; hook text pins bunx; published operating-system checks stay explicitly unobserved |
| 5.2 | integration | `release_runs_real_scanner_tests` | Actual scanner success/detection/missing-scanner assertions pass; release source installs the scanner before audit |
| 5.3 | integration | `release_readiness_has_complete_receipts` | Canonical checks, coverage, secret scan and final review have observed results |
| 5.4 | manual | `release_report_matches_verified_source` | Pull Request reports current changes, retained failed attempts, excluded checks and specific proposed 0.12.0 work |

## Acceptance Rubric (single scoring surface)

| Outcome | Verify | Expected | Priority | Graded |
|---|---|---|---|---|
| Complete audit and inherited evidence | `make audit` | ALL CHECKS PASSED; inventory and completion reports resolved | P0 | Current source and receipts; final boundary reported in Pull Request Make |
| Declared conformity | `make conform` | exit 0 | P0 | |
| Declared unit lane | `bun test src` | zero failures; baseline comparison recorded | P0 | |
| Installation and migration | `make install-evals` | zero failures across fresh/upgrade/repeat/conflict/recovery cases | P0 | |
| Commander delegation extension | named disabled-adapter trial | no launcher calls; no fabricated proof; local checks retained | P0 | |
| Useful bounded judgment | named assertion control | faulty code weak-pass/exact-fail, repaired exact-pass; live response skipped by owner | P0 | |
| Agent comprehension | `make llmevals CHECK=1` | fixture validity passes; live calls skipped by owner, not counted as correct | P0 | |
| Fixture validity | `make llmevals CHECK=1` | exit 0 | P0 | |
| Secret scan | `gitleaks detect --redact` | zero leaks | P0 | |
| Package and follow-up report | `make install-evals`; named report source check | packed setup passes; 0.11.0 current and 0.12.0 proposed clearly separated | P0 | |
| Final adversarial review and PR gate | `bin/orly gate pr` | exact upstream and every declared check pass; zero unresolved review findings | P0 | |

### Behaviour evals

- **Grounding rule:** An advisory answer never establishes a deterministic pass or owner decision.
- **Golden set:** Existing judgment cases plus migration conflicts, unsupported activation, failed local checks and instruction-bearing evidence.
- **Ship threshold:** All deterministic safety cases pass; every live observation is reported without an invented accuracy score.
- **Fallback:** Missing evidence remains incomplete and names the next required action.

## Dead Code Sweep

- Delete `SOUL_LOG.md` after private preservation; remove its live references from authoritative rules and regenerated output.
- Remove obsolete installed copies only through verified migration; repository-owned sources remain authoritative.
- Search `.oracle`, `AGENTS.orly.md` and global-install prerequisites across the full repository; retain only explicit migration tests and historical records.

## Out of Scope

- A native executable, Rust runtime, infrastructure purchase, credential creation or weakening existing checks.
- Editing other active worktrees or the separate published documentation repository without explicit per-session authorization.
- Autonomous merge decisions by workers, calibrated universal Jev accuracy or an overall model readiness score.

## Product Clarity (authoring record)

1. **Successful user moment:** Indy starts a stream in `agentsfleet`; the commander can inspect every stage and identify where future remote work will attach.
2. **Preserved user behaviour:** Bun setup, repository commands, custom hooks, own instructions and deterministic gate ownership remain usable.
3. **Optimal-way check:** A disabled adapter prepares later delegation without claiming storage savings or requiring machines now.
4. **Rebuild-vs-iterate:** Extend TypeScript/Bun and recorded ownership; another runtime adds no proof of correctness.
5. **What we build:** Audited rules, recoverable installed layout, lifecycle inspection, disabled delegation, bounded advice and a verified release.
6. **What we do NOT build:** A virtual machine vendor, new billing service, autonomous approvals or a dashboard.
7. **Fit with existing features:** Declared local checks remain authoritative; Jev uses the existing catalog and evidence selectors.
8. **Surface order:** Command line first because coding agents consume commands and structured evidence.
9. **Dashboard restraint:** Show real commands, resources and outcomes; no decorative quality score.
10. **Confused-user next step:** Help and doctor identify missing setup, conflicts, disabled delegation and the evidence needed to continue.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Inventory, ownership migration, lifecycle inspection and disabled adapter, useful judgment proof, then release.
- **Alternative:** Rename directories and keep existing installers/hooks. Rejected because recorded managed paths currently authorize overwriting edits, and hooks require a global command.
- **Quality ceiling:** A focused installation/worker refactor supplies recoverability and source identity; a broader engine rewrite would add a separate compatibility burden.
- **Surface-area checklist:** OpenAPI no; command line yes; user docs yes; release/version yes; JSON configuration yes; SQL/schema removal no; spec conflicts resolved before implementation.

## Discovery (consult log)

- **Consults:** Indy requested the complete 0.12.0 audit, `.orly/` installation, release-workflow repair, merge and publication. Follow-up: "the line got cut off - so my claude, codex, opencode acts like a commander."
- **Source findings:** `src/install.ts` replaces recorded managed paths without comparing the recorded digest; generated hooks call globally installed orly. Release run 37215556936 failed at make audit before publication.
- **Inherited work:** M08 remains open until its final adversarial pass and live comprehension have observed evidence. No historical success is invented or failure deferred.
- **Remote scope decision:** Indy: "Well it could via a cli or even agentsfleet cli, for now this is noop but i want it to be activated later on." Remote execution is intentionally disabled in 0.12.0; later activation uses a command-line adapter. No live-machine proof is required or claimed.
- **Metrics review:** Existing external telemetry consent stays unchanged; lifecycle inspection and local migration receipts explain behavior.
- **Skill-chain outcomes:** Canonical audit, package checks, source questionnaire and repair inspections have current receipts; further live calls remain excluded without a passing result.
- **Owner instruction:** Indy: "just ignore the live llm call, and continue." Further live model calls are excluded from this release evaluation; deterministic and replay checks remain required. Record the initial failures and the exclusion without claiming live success.
- **Evaluation report:** Indy requested a comprehensive account of missing judgment points and the next autonomous pull-request evaluations; maintain `evals/release/evaluation-plan.md` with implemented versus proposed status.

- **Audit repair approval (Oct 05, 2026: 07:59 AM):** Indy: "Yes fix them, also how about the TEMPLATE.md changes, is it deterministic for you when used to implement a spec will get realized as a PR". Apply A01–A16 and A19–A53 from evals/release/audit.md; retain A17/A18 scope decisions. Approval includes named hook, checker and release-workflow repairs; it does not authorize live model calls or native builds.
- **Template proof:** Add a local filled-spec implementation rehearsal with real behavior checks, closed-spec discovery and PR-gate refusal controls. Document the boundary between deterministic checks and semantic review.
- **Repair scope cuts (Oct 05, 2026):** Indy: "i dont want to do telelmetry privacy, release recovery (this is orly itself i thinkk)". Exclude A40 telemetry privacy and A20/A21 registry lookup and interrupted publication recovery. These concern orly's own release workflow; retain their findings as owner-excluded, without claiming repairs or successful recovery.
- **Repair ordering (Oct 05, 2026):** Indy: "I want to focus on the getting the codebase where orly applies to improve the determinism"; "those must be fixed first"; "others must be moved down". First repair checks, configuration, completion evidence and consistent rule enforcement in repositories using orly; then prove installation preserves those checks and owner data. Internal evaluation maintenance, packaging and release work follow. This changes order, not completion status or permission to bypass a required gate.
- **Live consuming-repository trial (recorded Oct 05, 2026: 09:14 PM):** Indy: "Okay i think we can do it on the live repo later." Only the trial against an actual consuming repository is later work. Disposable upgrade proofs remain bounded evidence. Consumer repairs, finding dispositions, baseline measurement, test audits and review remain required now.
- **Repair proof ledger (Oct 05, 2026: 09:58 PM):** `evals/release/repairs.json` records a separate observed result, test/control, receipt and limit for every approved finding. Approval remains separate from closure; no green suite closes all findings. `evals/release/test-quality-Oct_05_21_14.md` records the ordered interruption matrices, scoped incorrect-implementation controls, historical comparison and remaining coverage limits.
- **Current local verification (Oct 05, 2026: 09:58 PM):** `make audit` reports 498 passed, 0 failed, 2,219 assertions across 52 files; 0 unnamed-string violations across 104 sources; rule size 37,391 / 37,888 bytes. Full output: `evals/release/receipts/Oct_05_21_14/audit-repaired.txt`. The comparison revision's `bun test src` reports 339 passed, 0 failed and 910 assertions; baseline and current selections differ by 159 cases. `bun test src --randomize --seed=2601005` reports 498 passed, 0 failed on the repaired sources; full output: `evals/release/receipts/Oct_05_21_14/unit-randomized-repaired.txt`. `make llmevals CHECK=1` validates 73 fixtures without live calls; this is fixture validity, not observed live comprehension.
- **Newly reproduced repair gaps (Oct 05, 2026: 09:58 PM):** Owner hook-setting changes during destination writes now refuse before metadata and old-source deletion; the targeted test failed before the additional ownership check and passes afterward. The command supervisor now avoids repeating a successful process-group stop during cleanup; its deterministic regression failed before the repair and passes afterward. Before/after output and repeated adjacent results are retained under `evals/release/receipts/Oct_05_21_14/`. The ledger and parity evaluation runners now retain cleanup ownership across command substitution. Inventory generation invalidates reviewed status when bytes change or a digest is missing; self-referential review records remain pending until externally bound.

- **Fresh release-probe approval (Oct 05, 2026: 10:34 PM):** Indy: "Apply the one-line correction". `.github/workflows/release.yml` now requires `.orly/AGENTS.md` rather than `AGENTS.orly.md`. The actual packed probe body passes; the old-path and missing-render controls fail. Full proof: `evals/release/receipts/Oct_05_21_14/release-layout-applied.json`. Fresh `make install-evals` reports 23 passed, 0 failed in `installation-repaired.txt`; both declared registry authoring checks have packed positive, intended-defect and installed-context refusal evidence in `packed-checkers.json`. No hosted workflow or publication was executed.
- **Final local repair evidence (Oct 05, 2026: 10:53 PM):** Current guide paths, pinned package-runner setup, recovery instructions and propagation questions now match the installation sources. `make audit`, run without the package suite alongside it, reports 498 passed, 0 failed and 2,219 assertions in `evals/release/receipts/Oct_05_21_14/audit-guidance-serial.txt`; `make install-evals` reports 23 passed, 0 failed in `installation-guidance.txt`. The overlapping audit's 497 passed / 1 failed timing receipt remains in `audit-guidance.txt`; isolated cleanup reports 4 passed / 0 failed. No test limit was raised. Final packed positive/negative proofs are `packed-checkers-final.json` and `release-layout-final.json`. The review log records incomplete coverage, three editing cycles and a changed capture; it is not a clean review. Protected owner files match the restored checkpoint in `protected-files.json`.
- **Consumer verification (Oct 05, 2026: 05:40 PM):** `make audit` reported 476 passed, 0 failed, 1,556 assertions across 49 files; `make install-evals` reported 23 passed, 0 failed. Retained logs and byte budgets: `evals/release/receipts/Oct_05_17_40`; summary and limits: `evals/release/repairs.json` → `latest_consumer_verification`. Sandbox failures remain recorded separately; the passing reruns used local-server and dependency-download permissions.
- **Published upgrade proof (Oct 05, 2026: 05:40 PM):** A disposable repository installed published 0.10.14 and updated through the packed current 0.11.0 command. Owner rules, unowned historical data and runtime settings survived; managed files were present and the installation lock released (`evals/release/receipts/Oct_05_17_40/published-upgrade-proof.json`). The fixture declared no verification commands, so this proves migration and preservation only. The 0.12.0 release remains unfinished.
- **Current source evidence (Oct 06, 2026: 12:40 AM):** `make audit`: 509 passed, 0 failed, 2,272 assertions; comparison 339, net +170. `make install-evals` with installed runtime paths: 23 passed, 0 failed. `make conform`: 0 unnamed-string findings across 104 sources, 37,414 / 37,888 rule bytes. `make llmevals CHECK=1`: 73 valid fixtures. Questionnaire: 186 YES, 0 NO. Full receipts: `evals/release/receipts/Oct_05_23_39/`. Current report: `evals/release/release-report.md`; final candidate review and actual forge follow-up are recorded in Pull Request Session Notes. Failed coverage and runtime-shim attempts remain retained without deadline changes.
- **Configured consumer upgrade proof:** The same published-to-packed upgrade preserved real `conform` and `verify.unit` command arrays. The installed work gate built the fixture before and after migration. Changing the answer from 42 to 41 still built, while the actual pull-request unit criterion failed; restoring 42 made that criterion pass (`evals/release/receipts/Oct_05_17_40/command-upgrade-proof.json`). The complete pull-request gate stayed red because the fixture remained on its default branch without an upstream.

- **Delivery steering (Oct 06, 2026: 12:05 AM):** Indy requested: "ENSURE A PR IS PUSHED WITH A REPORT ON THE ALL THE CHANGES DONE AND THE NEXT STEP OF CHANGES FOR 0.12.0 BASED ON JEV PROMPT SUGGEST." This changes the deliverable to the 0.11.0 Pull Request and a proposed 0.12.0 report; no publication is claimed.
- **Review approval (Oct 06, 2026: 12:05 AM):** Indy: "Allow one read-only reviewer (recommended)". One native reviewer is authorized; implementation remains in this checkout.
- **Simplicity direction:** Indy: "Keep thing simple, less configuration, and donot over engineer". Reuse existing modules and typed questions; add no settings or worker transport.
