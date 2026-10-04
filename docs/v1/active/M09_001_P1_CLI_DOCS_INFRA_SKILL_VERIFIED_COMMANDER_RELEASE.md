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
**Status:** IN_PROGRESS
**Priority:** P1 — install and verify the package used in `agentsfleet`
**Categories:** CLI DOCS INFRA SKILL (command-line interface, documentation, infrastructure, skills)
**Batch:** B1 — one release stream; remote delegation stays disabled
**Branch:** feat/m09-verified-012
**Baseline revision:** 41850ee0d2893857c301ce3d07380415c5aa5861
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request
**Baseline evidence:** pending — report revision, environment, commands and passed/failed/skipped counts
**Depends on:** M08_001 implementation; its unfinished review and comprehension checks remain required here before closure
**Provenance:** agent-generated from Indy's release and commander instructions, Oct 04, 2026
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`; installation and remote execution decisions land with their implementation

## Overview

**Goal (testable):** A fresh macOS or Linux repository installs 0.12.0 through bunx, runs its hooks, preserves owned content during migration, and reports disabled delegation without fabricating check evidence.
**Problem:** Installed rules occupy repository-owned paths, hooks require a global executable, and expensive local checks compete for laptop storage.
**Solution summary:** Audit the complete repository, move installed orly content into `.orly/`, and make ownership checks recoverable. Keep Claude, Codex or OpenCode as commander. Define a disabled command-line delegation adapter for later activation; deterministic checks continue locally. Reuse Jev's selected-evidence questions and prove a useful assertion repair. Complete review, package trials and publication through the existing workflow.

## PR Intent & comprehension handshake

- **Pull Request (PR) title:** Release owned installation and remote verification in orly 0.12
- **Intent:** Give the commander reliable rules, useful judgment advice and explicit future delegation points for moving builds off the laptop.
- **Handshake:** Read and audit every tracked file and the packed payload; correct authoritative sources, preserve user content, and complete the requested release.
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
| `src/cli.ts`, `src/cli_help.ts`, `src/criteria.ts`, `src/criteria_support.ts`, `src/criteria_spec.ts`, `src/gates.ts`, `src/doc_rules.ts` | EDIT | Command routing, lifecycle inspection, disabled delegation and path consumers |
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
| `docs/architecture/installation.md`, `docs/architecture/remote-execution.md`, `docs/RELEASE_0.12.0.md` | CREATE | Ownership, recovery, worker boundaries and release evidence |
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

### §1 — Establish the complete audit and inherited evidence

- **Dimension 1.1** — Inventory every tracked file and packed path with ownership, purpose, findings and evidence. → Test `inventory_covers_repository_and_package`
- **Dimension 1.2** — Reconcile M08 final review and live comprehension without converting missing evidence into success. → Test `completion_requires_observed_evidence`
- **Dimension 1.3** — Remove the personal log and its live instructions while preserving the user's pending edit privately. → Test `personal_log_has_no_live_references`

### §2 — Install and migrate owned content

- **Dimension 2.1** — Install managed rules, supporting files and skills under `.orly/`; required discovery files contain only entrypoints plus repository-owned content. → Test `fresh_install_uses_owned_layout`
- **Dimension 2.2** — Migrate recorded owned files only after digest verification; unrecorded, edited or escaping paths refuse before destructive changes. → Test `migration_preserves_owned_content`
- **Dimension 2.3** — Save an installation journal, commit destinations before obsolete-copy removal, and recover interrupted runs without losing the original content. → Test `interrupted_install_recovers`
- **Dimension 2.4** — Repeat installs preserve configuration, host instructions and repository hooks byte-for-byte outside managed regions. → Test `repeat_install_preserves_user_files`

### §3 — Expose lifecycle work and a disabled delegation adapter

- **Dimension 3.1** — Show each lifecycle stage's commands, execution location, inputs, outputs and cleanup responsibility. → Test `lifecycle_plan_names_actual_commands`
- **Dimension 3.2** — Define a command-line adapter configuration for future worker launchers, including `agentsfleet`; default and only supported execution mode is disabled. → Test `remote_adapter_is_disabled`
- **Dimension 3.3** — Report the disabled adapter to the commander without launching subprocesses or replacing any local check. → Test `disabled_adapter_has_no_side_effects`
- **Dimension 3.4** — Reject unsupported activation and malformed adapter configuration; a no-op supplies no verification evidence. → Test `disabled_adapter_never_becomes_pass`
- **Dimension 3.5** — Document actual local disk consumers, cleanup ownership and the source/result/resource requirements for later remote activation. → Test `lifecycle_resource_map_matches_code`

### §4 — Demonstrate useful Jev judgment

- **Dimension 4.1** — Reuse cataloged planning, assertion, failure, applicability and claim questions with complete selected evidence. → Test `judgment_catalog_remains_bounded`
- **Dimension 4.2** — Reproduce a real defect passing a weak test, prove the stronger assertion fails, repair it and record the live advice. → Test `strong_assertion_exposes_real_defect`
- **Dimension 4.3** — Record all live observations, uncertainty and failures; keep hooks free of model uploads and deterministic results independent. → Test `advice_never_overrides_checks`

### §5 — Prove and publish the release

- **Dimension 5.1** — Fresh bunx setup and subsequent hooks work without global orly or bun add on macOS and Linux. → Test `bunx_hooks_work_without_global_install`
- **Dimension 5.2** — Install Gitleaks in the release job and preserve all scanner assertions. → Test `release_runs_real_scanner_tests`
- **Dimension 5.3** — Complete canonical checks, coverage, adversarial review and package-content trials before merging. → Test `release_readiness_has_complete_receipts`
- **Dimension 5.4** — Publish 0.12.0 through the existing workflow and verify the published package on both operating systems. → Test `published_package_matches_verified_release`

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
| Missing agent authentication or account capacity | Incomplete comprehension evidence; release remains blocked | `completion_requires_observed_evidence` |
| Registry or publication failure | Preserve failure receipt; verify actual published state before retry | `published_package_matches_verified_release` |

## Invariants

1. Authoritative repository files remain outside installed-content ownership; migration validates recorded digests before deletion.
2. A completed install is recorded only after payload and entrypoints succeed; interrupted work has a recoverable journal.
3. Disabled delegation returns no verification result and cannot clear or skip a local check.
4. The disabled adapter launches no process and allocates no workspace or remote resource.
5. Model output cannot execute commands, approve exceptions, weaken assertions or alter deterministic verdicts.
6. Hooks run the pinned Bun package through bunx; no global orly installation is required.
7. Publication requires observed verification evidence; unavailable comprehension accounts remain visible blockers. Remote machines are unnecessary for this disabled extension point.

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
| 5.1 | end-to-end | `bunx_hooks_work_without_global_install` | Fresh macOS/Linux package install and hooks succeed with no global executable |
| 5.2 | integration | `release_runs_real_scanner_tests` | Hosted release runs existing scanner success, detection and missing-scanner cases |
| 5.3 | integration | `release_readiness_has_complete_receipts` | Canonical checks, coverage, secret scan and final review have observed results |
| 5.4 | end-to-end | `published_package_matches_verified_release` | Published version and package behavior match verified macOS/Linux trials |

## Acceptance Rubric (single scoring surface)

| Outcome | Verify | Expected | Priority | Graded |
|---|---|---|---|---|
| Complete audit and inherited evidence | `make audit` | ALL CHECKS PASSED; inventory and completion reports resolved | P0 | |
| Declared conformity | `make conform` | exit 0 | P0 | |
| Declared unit lane | `bun test src` | zero failures; baseline comparison recorded | P0 | |
| Installation and migration | `make install-evals` | zero failures across fresh/upgrade/repeat/conflict/recovery cases | P0 | |
| Commander delegation extension | named disabled-adapter trial | no launcher calls; no fabricated proof; local checks retained | P0 | |
| Useful bounded judgment | named live assertion control | faulty code weak-pass/exact-fail, repaired exact-pass and actual Jev response | P0 | |
| Agent comprehension | `make llmevals SMOKE=1` | required agent responses correct; unavailable is incomplete | P0 | |
| Fixture validity | `make llmevals CHECK=1` | exit 0 | P0 | |
| Secret scan | `gitleaks detect --redact` | zero leaks | P0 | |
| Package and publication | named macOS/Linux packed and published trials | version 0.12.0, setup/hooks/doctor succeed | P0 | |
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
- **Skill-chain outcomes:** Pending implementation and verification; no completed review or passing live run is claimed.
- **Deferrals:** None authorized or recorded.
