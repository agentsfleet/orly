# M17_001: Reuse verified inputs across documentation commits

**Prototype:** v2.0.0
**Milestone:** M17
**Workstream:** 001
**Date:** Nov 17, 2026
**Status:** IN_PROGRESS
**Priority:** P1, avoid repeated verification without hiding changed inputs
**Categories:** CLI, DOCS, GOV, SKILL
**Batch:** B1, one delivery on Orly 0.42.0
**Depends on:** M16_001, existing local evidence and explicit reuse
**Provenance:** agent-generated from the owner's approved proposal and follow-up requests
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`, verification evidence; `docs/architecture/installation.md`

## Overview

**Goal (testable):** An explicitly scoped lane reuses its last successful execution after an unrelated documentation commit and executes again after a declared input changes.

**Problem:** The identity in `src/verification_identity.ts` includes the revision and every tracked file. Documentation commits invalidate all evidence. Installation also puts skill bodies in `.orly/skills/` and pointers in runtime folders. Shipping lacks a concise learning proposal for the owner and visible stage reporting.

**Solution summary:** Add opt-in tracked input selection to the existing evidence mechanism, install full skills directly in runtime folders, and explain stage outcomes and proposed lessons to the owner. Target version: 0.50.0.

**Design flow:**

```text
pushed clean revision -> full source snapshot -> declared tracked subset
                                                   |
                     matching latest signed pass <-+-> fresh execution
                                  |
                     full source recheck -> signed provenance + original output

install -> plan full runtime skills -> journal writes -> remove obsolete managed copies
ship -> publish PR -> summarize evidenced lessons -> ask owner -> approved source updates
```

## PR Intent & comprehension handshake

- **PR title (eventual):** feat: reuse scoped verification and simplify skill delivery (0.50.0)
- **Intent:** Save repeated work while retaining explicit proof, direct skill delivery and owner control of learned rules.
- **Authoring handshake:** ASSUMPTIONS I'M MAKING: reuse remains explicit; a scoped policy declares every tracked dependency; external observations remain fresh; managed-copy cleanup preserves uncommitted edits; no consumer update, merge or release is authorized.
- **Implementer handshake:** Implement the approved source-bound reuse design on fetched 0.42.0, review the whole repository, remove redundant skill indirection, and add visible stages and an owner-approved learning step. Record this in the PR Session Notes.

## Implementing agent — read these first

1. `src/verification_identity.ts` — full-source guard and current binding.
2. `src/verification_store.ts` — signed latest-attempt evidence and original age.
3. `src/installation/plan.ts` — skill body and pointer planning.
4. `skills/orly-ship/SKILL.md` — publishing and review lifecycle.
5. `docs/v2/done/M16_001_P1_CLI_DOCS_GOV_SKILL_VERIFICATION_EVIDENCE.md` — shipped invariants.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| This spec, then its matching path under `done/` | CREATE, MOVE | Acceptance and evidence |
| `src/config_validation.ts`, `schemas/profile.schema.json` | EDIT | Optional nonempty tracked-input declaration |
| `src/verification_identity.ts`, `src/verification.ts`, `src/verification_store.ts` | EDIT | Scoped identity and signed revision provenance |
| `src/verification_policy.test.ts`, `src/verification_identity.integration.test.ts`, `src/verification_store.integration.test.ts`, `src/verification_test_support.ts` | EDIT | Defaults and rejection coverage |
| `src/verification-scoped.integration.test.ts` | CREATE | Cross-revision execution and invalidation |
| `src/installation/plan.ts` | EDIT | Full skill content at runtime destinations |
| `src/installation/migration.ts`, `src/installation/transaction.ts` | EDIT | Require tracked, clean obsolete files through recovery |
| `src/install.ts`, `src/references.ts`, `src/references.test.ts` | EDIT | Reject references to scheduled deletions |
| `registry.json` | EDIT | Ship documentation dependencies with their owner |
| `src/surfaces.ts`, `src/surfaces.test.ts`, `src/criteria.ts`, `src/criteria.test.ts`, `src/gates.ts`, `src/gates.test.ts`, `src/gates_test_support.ts` | EDIT | Refuse unavailable diff evidence, honor default branch and isolate override commits |
| `src/gate-determinism.integration.test.ts` | CREATE | Count default verification, enforce prerequisites and preserve staged edits |
| `src/cli.ts`, `src/config.ts`, `src/config.test.ts`, `src/render.ts` | EDIT | Reject misspelled write options and failed Git inspection; remove unused render branch |
| `src/doc_rules.ts`, `src/doc_rules.test.ts`, `src/layout.test.ts`, `evals/install/run.sh`, `evals/install/release_cases.sh` | EDIT | Require reasoned paragraph exceptions, keep their scope local and isolate installation coverage |
| `src/burst/process.ts`, `src/burst/process.integration.test.ts`, `src/burst/aws.ts`, `src/burst/aws.test.ts`, `src/burst/types.ts`, `src/burst/index.ts`, `src/burst/index.test.ts` | EDIT, CREATE | Repair proven process ownership and repository identity defects |
| `src/burst/repository.ts`, `src/burst/repository.integration.test.ts`, `src/burst/cloud.ts`, `src/burst/test_support.ts`, `src/burst/fake_aws.ts`, `src/burst/aws-market.integration.test.ts`, `src/burst/aws-test-support.ts`, `src/burst/e2e.test.ts`, `docs/BURST.md` | EDIT, CREATE | Isolate snapshot ownership, preserve retry policy without price lookup and test provider behavior |
| `src/burst/e2e.ts`, `src/burst/tir.ts`, `src/burst/cancellation.integration.test.ts` | EDIT, CREATE | Stop requests before cancelled mutations and attempt independent cleanup |
| `agents/orly-standards-reviewer.md`, `standards/code.md`, `standards/pr.md`, `skills/orly-burst/SKILL.md` | EDIT | Reconcile actual checker coverage, source grounding and explicit paid-run approval |
| `src/installation/skill-migration.integration.test.ts` | CREATE | Safe obsolete-copy removal and recovery |
| `src/learning_guidance.integration.test.ts`, `src/installation/migration.test.ts`, `src/install.test.ts`, `src/install_packs.test.ts`, `src/install_loaders.test.ts` | EDIT | Update delivery assertions where needed |
| `core/operating-model.md`, `SOUL.md`, generated `AGENTS.md` | EDIT | Stage start, outcome and next action |
| `skills/orly-ship/SKILL.md` | EDIT | Evidence-backed learning proposal and owner approval |
| `README.md`, `docs/ORLY_ARCHITECTURE.md`, `docs/architecture/installation.md`, `standards/tests.md`, `src/cli_help.ts`, `llms.txt` | EDIT | Actual behavior, constraints and upgrade instructions |
| `docs/v2/evidence/M17_REPOSITORY_REVIEW.md` | CREATE | Review inventory, findings, dispositions and measurements |
| `package.json`, `.orly/orly.json` | EDIT | 0.50.0 version sources |
| `docs/CHANGELOG.md` | EDIT | User-visible 0.50.0 changes and upgrade requirements |

Additional review repairs amend this table before implementation. Review is repository-wide; edits require a reproducible benefit, not speculative rewrites.

## Applicable Rules

- `standards/code.md`: NDC, NLR, NLG, HLP, CODE-SEAM, FLL, CODE-GITZ, CODE-BULK.
- `standards/languages/typescript.md`: TS-SHAPE, TS-SCHEMA, TS-BOUNDED, TS-FINALLY, TS-TYPEIMPORT.
- `standards/tests.md`: TCF, TEST-NEG, TEST-PUBLIC, TEST-DIFF, TEST-GITENV.
- `standards/domains/architecture.md`: ARCH-GROUND, ARCH-LAND, ARCH-PUBLISHED.
- `standards/spec.md`: SPEC-FILES, SPEC-DIM, SPEC-FAIL, SPEC-GRADE.
- `standards/changelog.md`: CL-EARNED, CL-BUMP, CL-SYNC.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| `orly gate work` | yes | Current generated output and catalogue |
| `orly gate pr` | yes | Exact pushed revision, documentation and all declared verification |
| Secret scan | yes | No credentials or suppressions |
| File and function length | yes | Separate scoped integration tests and small helpers |

## Prior-Art / Reference Implementations

Extend `src/verification*.ts` and `src/installation/{plan,migration,transaction}.ts`. The sibling `agentsfleet` repository's cache work demonstrates input-owned caching; no external cache or new dependency is needed. Existing local signed evidence remains the only reuse authority.

## Sections (implementation slices)

### §1 — Scoped evidence with explicit provenance

An optional nonempty `tracked_inputs` list declares exact tracked paths or directory prefixes, without globs. Existing `inputs` still identifies extra filesystem dependencies. Omission retains exact-revision, all-tracked behavior. Every declaration must match tracked content. A directory selects its tracked descendants, so added, removed, renamed and mode-changed files invalidate evidence. Missing or unsupported input disables reuse.

Derive the subset from the full tracked snapshot, without another file read. Keep before/after full-source comparison. Retain clean/pushed worktree, merge base, commands, complete configuration, environment digest, toolchain, engine, expiry and latest-attempt checks. Commands reading revision/history or omitted dependencies cannot claim this scope. Reject live lane opt-in.

Version the signed completion and record the original execution revision and the revision accepting it. Keep original output, execution time and origin across repeated reuse. Old completion formats require fresh execution. No remote evidence import or automatic reuse.

- **Dimension 1.1** — Test `scoped policy round trips and rejects invalid selectors` (unit): a nonempty declaration survives serialization; empty, traversal, absolute and glob declarations fail structurally.
- **Dimension 1.2** — Test `documentation commits reuse a scoped lane through the CLI` (integration): fresh execution, documentation commit, input commit produce native counts 1, 1, 2 with original output and revision provenance.
- **Dimension 1.3** — Test `tracked changes invalidate scoped evidence` (integration): add/delete/rename/content/mode changes require fresh execution; directory boundaries do not match sibling names.
- **Dimension 1.4** — Test `out of scope edits during execution still block completion` (integration): an unrelated tracked edit while the command runs blocks the result.
- **Dimension 1.5** — Test `missing scoped inputs and newer failures cannot reuse older evidence` (integration): no matching input or a later failed attempt forces execution.
- **Dimension 1.6** — Test `signed provenance rejects old formats and retains original age` (integration): unsupported format/tampering/expiry cannot pass; replay retains original execution facts.
- **Dimension 1.7** — Test `scoped identity reuses the tracked snapshot and hashes overlapping extras once` (integration): counters prove one file read per identity collection despite overlapping declarations.
- **Dimension 1.8** — Test `default gate executes fast verification only once at the final boundary` (integration): the default path runs work then pr; explicit verify remains available and checks run once per invocation.

### §2 — Direct skill delivery and safe cleanup

Write full filtered skill bodies directly to the registered runtime folders. Remove pointer construction and stop planning `.orly/skills/` copies. The transaction first writes valid replacements, then deletes only obsolete paths in the previous managed list, then prunes empty directories. Require obsolete files to remain tracked and clean at planning, recovery and deletion; ignored untracked files and mode-only edits also refuse deletion, even with force. Unmanaged files survive. Reference closure excludes scheduled deletions. No direct writes to consuming repositories in this workstream.

- **Dimension 2.1** — Test `runtime skills contain their instructions without private copies` (integration): install and repeat-update yield full runtime bodies and no managed `.orly/skills`.
- **Dimension 2.2** — Test `skill migration preserves owner content and refuses dirty copies` (integration): clean managed duplicates are removed; custom files stay; modified duplicates refuse migration.
- **Dimension 2.3** — Test `interrupted skill migration resumes before removing private copies` (integration): interruption after replacement writes resumes through the existing journal with usable skills.

### §3 — Observable stages and approved learning

Shared operating guidance announces the skill, current stage and action in a few lines; each stage ends with its concrete outcome, evidence or blocker, and next action. Avoid claims based on unrun tools.

After publishing the PR, `orly-ship` presents an evidence-backed learning summary with proposed source files and asks the owner whether to apply those updates. Honor explicit prior approval; without it, do not change rules or consumer pins. Ask once per unchanged proposal, record the decision in Session Notes, and continue check/review follow-up while awaiting it. This step authorizes neither merging nor releasing.

- **Dimension 3.1** — Test `shipping lessons require owner approval without stopping checks` (integration): source and installed guidance require evidence, exact targets, approval and continued follow-up; no automatic rule rewrite.
- **Dimension 3.2** — Test `stage reporting survives filtered installation` (integration): root render and installed operating guidance retain stage, outcome and next-action requirements.

### §4 — Whole repository review and delivery

Read every tracked implementation, test, configuration and instruction file by subsystem, inventory generated copies and historical documents, and record findings with exact evidence. Remove proven redundancy and repair sources of nondeterminism within the authorized scope. Record why a proposed cleanup is unnecessary rather than churning working code. Run final checks after repairs and repeat only where changes or failures justify them.

- **Dimension 4.1** — Test `repository review inventory and dispositions` (manual): compare the review inventory with tracked paths and inspect every finding's repair or rationale.
- **Dimension 4.2** — Test `version and installed behavior agree` (integration): package and root configuration name 0.50.0; installation and complete verification pass on the final pushed revision.

## Interfaces

`reuse.<lane>.tracked_inputs` is an optional nonempty list of relative tracked files or directory prefixes. Its reviewed declaration excludes Git history from command inputs. `orly gate pr --reuse-verification` remains the only reuse invocation. Completion metadata is private and versioned; unsupported records cannot authorize a pass.

## Failure Modes

| Mode | Kind | Cause | Handling | Test |
|---|---|---|---|---|
| Invalid scope | failure | Empty or escaping declaration | Configuration refusal | `scoped policy round trips and rejects invalid selectors` |
| Changed input | failure | Relevant bytes or membership change | Fresh execution | `tracked changes invalidate scoped evidence` |
| Concurrent edit | failure | Mutation outside selection | Block current result | `out of scope edits during execution still block completion` |
| Invalid evidence | security | Old format, signature or age | Fresh execution | `signed provenance rejects old formats and retains original age` |
| Dirty obsolete skill | failure | Owner's uncommitted edit | Preserve and refuse | `skill migration preserves owner content and refuses dirty copies` |
| Interrupted install | failure | Process ends after replacement | Journal recovery | `interrupted skill migration resumes before removing private copies` |

## Invariants

1. `src/verification.ts` compares full snapshots even under scoped reuse.
2. `src/verification_store.ts` accepts only the latest signed successful unexpired attempt, preserving its original age.
3. `src/installation/migration.ts` deletes only clean formerly managed files, after replacement planning and conflict checks.

## Metrics & Observability

No telemetry. Local evidence reports fresh/reused execution with original and accepted revisions. Measurements distinguish fixture timings from real consumer-suite performance.

## Acceptance Rubric (single scoring surface)

| # | Criterion | Verify | Expected | Priority | Graded |
|---|---|---|---|---|---|
| R1 | Scoped execution and refusal | `bun test src/verification-scoped.integration.test.ts src/verification_policy.test.ts src/verification_store.integration.test.ts` | All pass | P0 | |
| R2 | Safe skill migration | `bun test src/installation/skill-migration.integration.test.ts` | All pass | P0 | |
| R3 | Installed workflow guidance | `bun test src/learning_guidance.integration.test.ts` | All pass | P0 | |
| S1 | Catalogue and generated parity | `make conform` | Exit 0 | P0 | |
| S2 | Types | `bun run typecheck` | Exit 0 | P0 | |
| S3 | Full declared suite | `bun test src` | Exit 0 | P0 | |
| S4 | Isolated installation | `make install-evals` | Exit 0 | P0 | |
| S5 | Secrets | `gitleaks detect --redact --no-banner` | No leaks | P0 | |
| S6 | Final pushed boundary | `bin/orly gate pr` | Every required criterion passes | P0 | |

### Behaviour evals

- **Grounding rule:** Report only executed stage outcomes and evidenced lessons; no implied owner approval.
- **Golden set:** Existing evidence cases plus learning approval and stage reporting in `src/learning_guidance.integration.test.ts`.
- **Ship threshold:** Every deterministic instruction and installation assertion passes; these are instruction checks, not live model behavior measurements.
- **Fallback:** Repair source guidance and rerun the affected checks.

## Dead Code Sweep

Remove skill pointer construction and current references to private skill copies. Historical documents retain their release facts. Sweep all tracked and hidden paths for the old installation description.

## Out of Scope

Remote evidence trust, live observation caching, cloud machine launches, consumer pin updates, merge and release are not planned in this delivery.

## Product Clarity (authoring record)

1. Successful moment: a documentation commit keeps a valid scoped test result.
2. Preserved behavior: omitted policies execute fresh; unscoped reuse remains revision-bound.
3. Optimal way: extend the existing identity and evidence owners.
4. Rebuild: unnecessary; keep command supervision and transaction recovery.
5. Build: scoped selection, provenance, direct skills and visible workflow.
6. Exclude: distributed caches and automatic approvals.
7. Fit: existing gates and runtime skill discovery.
8. Surface order: command-line and repository policy together.
9. Dashboard: none.
10. Recovery: run fresh, or reconcile the precise named input/install conflict.

## Decomposition & alternatives (patch vs refactor)

- Chosen shape: four sections separate verification, installation, workflow and review.
- Alternatives: automatic documentation exclusions cannot prove complete dependencies; remote receipts need a separate trust design; deleting private skill directories before replacing pointers breaks discovery.
- Verdict: focused extensions and removal of the skill-pointer indirection.

## Discovery (consult log)

- Base: fetched `origin/main` at `9c177c333010b11fc83bb49bc2d00cadd549c6c3`, version 0.42.0. `bin/orly doctor` reports both setup lines green.
- Existing review worktree reused; no second worktree or consumer mutation.
- Fresh-context design review completed: two Major migration findings, both accepted. Require positive tracked/clean deletion evidence and repeat it through recovery, including executable-mode changes. The inherited review model's exact version is unavailable; no named-model approval is claimed. Static review is separate from execution proof.
- Open blockers: none identified at opening. Review and verification remain unverified.
- Deferrals and transfers: none.

> Owner: "I think pull the source code 042.0 is in progress, and update your version to 0.43.0"

> Owner: "and make those changes, you are singed off"

> Owner: "Ensure you do a full scale review of all the files and see what is redundant and code smell, techdebt which can be reduced and improve determinism."

> Owner: "Also i want the learning to be summarized and asked with Indy to update with orly after the ship of a PR is pushed (is this a /orly-ship) update to ironout out the learnings"

> Owner: "Also i notice when you install you still have the skills in \~/.orly/skill in the repo example agentsfleet, i reckon you must nuke that upon install in the repo since you have spread it out in the .agents/skills and so on in other folders."

> Owner: "when you invoke the skills right now i am not sure what you are doing, its better to add or display in few lines with  the state or stage you are on and doing. at the end of each stage you print the outcome, or what was acccomplished and your next step."

> Owner: "just move your version to 0.50"

The current target is 0.50.0; the earlier version request above remains historical evidence.
