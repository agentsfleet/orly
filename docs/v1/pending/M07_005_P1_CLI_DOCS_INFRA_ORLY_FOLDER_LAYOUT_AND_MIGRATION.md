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

# M07_005: Everything orly installs moves into one .orly/ folder through an ordered, resumable migration

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 005
**Date:** Sep 23, 2026: 10:10 AM
**Status:** PENDING
**Priority:** P1 — a stranger rejects 45 files of someone else's rulebook across their root and their own `docs/`
**Categories:** CLI (Command-Line Interface), DOCS, INFRA (release and scanner configuration)
**Batch:** B1 — release 0.12, after M07_003 and M07_004, before M07_001 §§4–5
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report revision, commands, counts, and environment
**Depends on:** none. M07_001 §4 and §5 read the layout this spec creates.
**Provenance:** Large Language Model (LLM)-drafted; Claude Opus 5.5; Sep 23, 2026. Moved from M07_001 §2 after Codex's review as Chief Technology Officer (CTO) of `58fedbc`, at Indy's direction to ship the move as one spec in release 0.12.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Topology, Why it's materialised

---

## Overview

**Goal (testable):** A fresh `orly init` changes nothing at a repository's root beyond `AGENTS.md`, `CLAUDE.md`, `opencode.json`, the host skill folders, and `.orly/`, and `orly update` moves a 0.10.14 installation into `.orly/` without losing or overwriting any byte, resuming correctly after interruption at any step.

**Problem:** A first-run audit of orly 0.10.14 on Sep 23, 2026 found `orly init` writing 45 files: 13 under `dispatch/`, 7 under `audits/`, and 6 into the user's own `docs/`. The configuration lives in `.oracle/`, a name that reads as another company. Moving files is not enough, because consumers call installed scripts by root paths: agentsfleet's harness sets `ORLY_ROOT ?= $(CURDIR)` and runs `$(ORLY_ROOT)/audits/ufs.sh` (agentsfleet `make/harness.mk:42,91`), and its workflow reads `.oracle/orly.json` directly (`.github/workflows/governance.yml:33`).

**Solution summary:** Configuration, generated rules, hooks, and every managed rule, audit, and document live under `.orly/`. One source-to-installed map rewrites only recognized references. Installed scripts separate the payload root from the evaluated repository. Migration is ordered and resumable, and `orly doctor` names every repository-owned file still citing an old path.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(install): everything orly installs lives in .orly/`
- **Intent:** A stranger sees one folder plus the agent entry files after `orly init`, and an existing consumer moves there without breaking its harness.
- **Authoring handshake:** Indy chose `.orly/` over `.oracle/`, then asked for the move "in one spec" and one release "with all". The migration design below is the one the CTO review approved after its rework findings.
- **ASSUMPTIONS I'M MAKING:** 1. After migration nothing reads `.oracle/`, and no temporary path aliases exist. 2. Consumers stay pinned until one change carries path moves, caller changes, workflow configuration, and passing harness checks. 3. Editing `release.yml`, `.gitleaks.toml`, and `.gitleaksignore` needs Indy's approval at CHORE(open).
- **Implementer handshake:** pending until PLAN.

## Implementing agent — read these first

1. `src/install.ts` — write order, digest refusal, `hooksClaimedByAnother`, and the Markdown filter at install.
2. `src/loaders.ts` — the root `AGENTS.md` host block, the `@AGENTS.orly.md` import, and the OpenCode instruction list.
3. `src/config.ts` and `src/doc_rules.ts` — the `.oracle` constant and its duplicate at `doc_rules.ts:56`.
4. `src/references.ts` — the citation checker that already honors code fences.
5. `dispatch/lib.sh` and `audits/rule-ledger-lib.sh` — payload root separated from target root in one, root-relative lookups in the other.

## Files Changed (blast radius)

Blast-radius rule: tracked files citing the string, minus the repository's managed files, the generated `AGENTS.orly.md`, and spec documents under `docs/v*/done/` and `docs/v*/pending/`. Measured at orly `58fedbc`: 47 files cite `.oracle`.

| File | Action | Why |
|---|---|---|
| `docs/v1/pending/M07_005_P1_CLI_DOCS_INFRA_ORLY_FOLDER_LAYOUT_AND_MIGRATION.md` | CREATE, then lifecycle MOVE | Intent and proof ledger |
| `src/install_migrate.ts`, `src/install_migrate.test.ts` | CREATE | Ordered migration, preflight inventory, stale-citation scan |
| `src/install.ts`, `src/config.ts`, `src/validation.ts`, `src/verify.ts`, `src/loaders.ts`, `src/loaders.test.ts` | EDIT | `.orly/` root; generated rules at `.orly/AGENTS.md`; host import and OpenCode paths; hooks under `.orly/hooks/` |
| `src/doc_rules.ts`, `src/doc_reader.ts` | EDIT, CREATE | Shared configuration path replaces the duplicate; split below the 350-line cap because the rename touches it |
| `src/references.ts`, `src/references.test.ts`, `src/cli.ts`, `src/criteria.ts` | EDIT | One citation map; `.orly/` messages; commands name `orly update` before migration |
| `src/install.test.ts`, `src/install_packs.test.ts`, `src/install_nested.test.ts`, `src/setup.test.ts`, `src/config.test.ts`, `src/cli.test.ts`, `src/criteria.test.ts`, `src/render.test.ts`, `src/spec_baseline.test.ts`, `src/spec_template_io.test.ts`, `src/gates_test_support.ts` | EDIT | Layout, migration, and `.orly/` proofs |
| `fixtures/layout-0.10/` | CREATE | A 0.10.14 installation to migrate |
| `evals/install/cases.sh`, `evals/install/release_cases.sh`, `evals/llms/fixtures.jsonl` | EDIT | `.orly/` paths |
| `.orly/orly.json` | MOVE from `.oracle/orly.json` | This repository's own configuration |
| `audits/rule-paths.sh`, `audits/rule-ledger-lib.sh`, `audits/agents-md.md`, `audits/spec-template.sh`, `audits/spec-template.ts` | EDIT | Consumer layout; payload root versus evaluated repository; `.orly/` |
| `core/operating-model.md`, `AGENTS.md` | EDIT | `.orly/` citations; regenerated render within the byte cap |
| `dispatch/edit_rules.md`, `dispatch/lib.sh`, `dispatch/lifecycle.md`, `dispatch/verify.md`, `dispatch/write_any.md`, `dispatch/write_go.md`, `dispatch/write_python.md`, `dispatch/write_rust.md`, `dispatch/write_shell.md`, `dispatch/write_zig.md` | EDIT | `.orly/` citations |
| `packs/language/go/rules.md`, `packs/language/python/rules.md`, `packs/language/rust/rules.md`, `packs/language/shell/rules.md`, `docs/TEMPLATE.md`, `docs/VERIFY_TIERS.md` | EDIT | `.orly/` citations |
| `.gitignore`, `.gitleaks.toml`, `.gitleaksignore`, `.github/workflows/release.yml` | EDIT | `.orly/` paths; each needs Indy's approval at CHORE(open) |
| `README.md`, `llms.txt`, `docs/ORLY_ARCHITECTURE.md` | EDIT | Layout and migration guide |

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: NDC (No Dead Code), NLG (No Legacy compat shims), UFS (Unified Form for Symbols), ORP (Orphan sweep on rename), FLL (File and Function Length Limits), TST-NAM (milestone-free test names), MSID (milestone identifiers banned in source).
- `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`, `dispatch/write_shell.md`; `dispatch/edit_rules.md` for every governance path above; `dispatch/write_documentation.md` with `docs/DOCUMENTATION_RULES.md`.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec Template | Yes | Pending metadata, Dimension-to-Test mapping, declared commands verbatim, at most 320 lines |
| TypeScript file shape; File & Function Length (≤350/≤50/≤70) | Yes | Migration in its own module; `doc_rules.ts` splits because the rename touches it |
| Unified Form for Symbols; Milestone Identifier | Yes | One `.orly` constant; no milestone labels in source or tests |
| Governance invariance | Yes | `make audit`, the questionnaire, generated evidence, live comprehension evaluation |
| Rendered rules size | Yes | `make conform` reported 37,872 of 37,888 bytes; path edits stay within the cap |
| Continuous Integration and Delivery (CI/CD) edit; secret-scanner files | Yes | Only `.oracle` paths change, after Indy's approval at CHORE(open) |
| Schema removal; Zig; interface design tokens | No | None touched |

## Prior-Art / Reference Implementations

- **Payload root:** `dispatch/lib.sh:40` already separates the installed payload from the repository under evaluation; installed audits adopt the same split.
- **Fence-aware scanning:** `src/references.ts:80-90` skips code fences when checking citations; the rewrite map reuses that parser.
- **Refusal shape:** `hooksClaimedByAnother` in `src/install.ts` refuses with a message and a suggestion; migration refusals follow it.
- **Superseded draft `55b4c75`:** its transaction journal is not revived; ordered steps with verified retries replace it.

## Sections (implementation slices)

### §1 — The `.orly/` layout and exact citations

In a consumer repository the configuration lives at `.orly/orly.json`, the generated rules at `.orly/AGENTS.md`, hooks under `.orly/hooks/`, and managed rules, audits, and documents at their source-relative paths under `.orly/`. The repository-owned root `AGENTS.md` host, `CLAUDE.md`, and `opencode.json` keep user content and load `.orly/AGENTS.md` through their supported mechanisms. Installation builds one source-to-installed map and rewrites only recognized managed references: Markdown link destinations, exact path tokens, and declared command examples. It preserves URLs, unrelated substrings, and already rewritten paths, resolves relative links from the destination document, and is idempotent. Installed scripts separate the payload root from the evaluated repository. The engine checkout keeps its source layout. **Implementation default:** apply the prefix in the installer rather than editing 52 registry targets, because the registry names sources and the prefix is one rule.

- **Dimension 1.1** — A fresh `orly init` adds nothing at the root beyond the entry files, the host skill folders, and `.orly/`; `core.hooksPath` is `.orly/hooks`; the host and OpenCode load `.orly/AGENTS.md` → Test `test_fresh_install_stays_in_one_folder`
- **Dimension 1.2** — Inline paths, relative links, fenced commands, and optional-pack references are rewritten; URLs and unrelated substrings are untouched; a second run changes nothing → Test `test_citation_rewrite_is_exact_and_idempotent`
- **Dimension 1.3** — Installed scripts run from the consumer root and a nested directory, finding payload siblings under `.orly/` and evaluating the repository → Test `test_installed_scripts_run_from_consumer_layout`

### §2 — Ordered, resumable migration

Migration requires a committed prior installation and exclusive access. Preflight inventories source bytes, destination collisions, symlinks, executable modes, loader blocks, and hook ownership before any mutation. The old inventory is kept until every new payload file is verified. New payloads install before loaders and hooks switch; the new configuration is written atomically after those switches; old managed copies and `.oracle/orly.json` go last. `core.hooksPath` follows only when both prior hooks were unchanged orly copies. A retry recognizes identical completed destinations and refuses conflicting bytes without overwriting them. `git status` is diagnostic output, never the recovery mechanism. Before migration every command except `orly update` names it. `orly doctor` lists repository-owned files citing an old managed path or `.oracle/`, by file and line. Under the Files Changed rule, agentsfleet at `b1bc6f0c4` owned 50 files citing a managed path and 11 citing `.oracle`; e2e-observability-platform at `8b4d75d` owned 10 and 3. Consumers stay pinned until their one migration change passes their own harness and Continuous Integration (CI) checks.

- **Dimension 2.1** — Preflight refuses an edited copy or a conflicting destination before any write; interruption at each boundary (payload, loaders, hooks, configuration, cleanup) followed by a rerun completes without data loss → Test `test_migration_resumes_at_every_boundary`
- **Dimension 2.2** — Before migration, `gate` names `orly update`; `orly doctor` names each repository-owned file and line still citing an old path or `.oracle/` → Test `test_doctor_names_stale_citations`
- **Dimension 2.3** — Repository-owned hooks, such as agentsfleet's `.githooks`, are left in place and reported, never retargeted → Test `test_migration_leaves_owned_hooks`

## Interfaces

```
orly init | update [--dry-run] [--json]     layout below; update migrates a 0.10 layout
orly doctor [--json]                        adds stale citations of old managed paths and .oracle/

Consumer layout: AGENTS.md (repository-owned host)  CLAUDE.md  opencode.json
                 .claude/skills/  .agents/skills/  .opencode/skills/
                 .orly/  orly.json  AGENTS.md  hooks/  dispatch/  audits/  docs/
Migration order: preflight → payload → verify payload → loaders → hooks → configuration → cleanup
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Conflicting destination | Edited copy or foreign bytes at a target | Preflight refusal before writes; `test_migration_resumes_at_every_boundary` |
| Interrupted migration | Killed at any boundary, hooks included | Rerun completes; no bytes lost; `test_migration_resumes_at_every_boundary` |
| Broken caller | A consumer script cites an old path | Doctor names file and line; consumer stays pinned; `test_doctor_names_stale_citations` |
| Wrong path semantics | Path-like text that is not a reference | Left untouched; `test_citation_rewrite_is_exact_and_idempotent` |
| Script from nested directory | Installed audit run below the root | Payload siblings found; repository evaluated; `test_installed_scripts_run_from_consumer_layout` |
| Owned hooks | A consumer wrote its own hooks | Left in place and reported; `test_migration_leaves_owned_hooks` |

## Invariants

1. Every orly-managed path in a consumer lives under `.orly/` or a host skill folder — the installer asserts each target's prefix before writing.
2. Migration never overwrites conflicting bytes — preflight and retry compare bytes before any write.
3. Rewriting touches only recognized references and is idempotent — the rewriter works from one map and skips fenced text.
4. Nothing reads `.oracle/` after migration — one directory constant, and no alias path.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| not applicable — no product or operator signal changes | not applicable | not applicable | not applicable | not applicable | `test_fresh_install_stays_in_one_folder` |

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | integration | `test_fresh_install_stays_in_one_folder` | Fresh repository → root diff only entry files, skill folders, `.orly/`; hooks path and loaders point into `.orly/` |
| 1.2 | unit | `test_citation_rewrite_is_exact_and_idempotent` | Inline, relative, fenced, optional-pack, and URL cases → only managed references change; second pass is a no-op |
| 1.3 | integration | `test_installed_scripts_run_from_consumer_layout` | Installed audit run from root and a nested folder → finds `.orly/` siblings; evaluates the repository |
| 2.1 | integration | `test_migration_resumes_at_every_boundary` | Faults at payload, loaders, hooks, configuration, cleanup → rerun completes; conflicts refuse; bytes intact |
| 2.2 | integration | `test_doctor_names_stale_citations` | Unmigrated repository → `gate` names `orly update`; owned citations listed by file and line |
| 2.3 | integration | `test_migration_leaves_owned_hooks` | Custom hooks at `.githooks` → untouched; report names them |
| | integration | `test_foreign_hooks_path_still_refuses` | Regression: another tool's `core.hooksPath` → existing refusal |
| | integration | `test_engine_checkout_keeps_source_layout` | Regression: the orly checkout reads sources at the root |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | A fresh install stays in `.orly/` with exact citations (§1) | `bun test src -t "test_fresh_install\|test_citation_rewrite\|test_installed_scripts"` | exit 0 | P0 | |
| R2 | Migration resumes at every boundary and names stale callers (§2) | `bun test src -t "test_migration_resumes\|test_doctor_names\|test_migration_leaves"` | exit 0 | P0 | |
| R3 | Scope holds | `git diff --name-only origin/main...HEAD` | 0 paths missing from Files Changed | P0 | |
| S1 | Declared conformance | `make conform` | exit 0 | P0 | |
| S2 | Declared verification | `bun test src` | exit 0 | P0 | |
| S3 | Governance invariance | `make audit` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S5 | No oversize source file | `git diff --name-only origin/main...HEAD \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | |

## Dead Code Sweep

N/A — no files deleted; `.oracle/orly.json` and `AGENTS.orly.md` move. The engine checkout keeps its own `.githooks`.

## Out of Scope

- Edits to agentsfleet or e2e-observability-platform, which migrate in their own changes.
- A transaction journal, a configurable rule root, or temporary path aliases.
- Renaming files inside `docs/greptile-learnings/`.

## Product Clarity (authoring record)

1. **Successful user moment** — A maintainer runs `orly init` and `git status` shows the agent entry files, the skill folders, and `.orly/`, nothing else.
2. **Preserved user behaviour** — Every rule, command, gate, and hook behaves as before; only locations change.
3. **Optimal-way check** — The unconstrained shape installs nothing at all and serves rules from the package; agents still need files they can open, so one folder is the least footprint that works in every runtime.
4. **Rebuild-vs-iterate** — Iterate on the installer; add an ordered migration.
5. **What we build** — The layout, the citation map, the payload-root split, the migration, and the doctor report.
6. **What we do NOT build** — Aliases, a journal, a configurable root.
7. **Fit with existing features** — Consumers remain pinned until their migration change includes the path moves, repository-owned caller changes, workflow configuration, and passing native harness checks together. A doctor report alone does not establish compatibility.
8. **Surface order** — Command line only.
9. **Dashboard restraint** — N/A — no user interface.
10. **Confused-user next step** — `orly doctor` names each stale citation and the command to run.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Two Sections: the layout and citations first, then migration, because migration moves files into the layout §1 defines.
- **Alternatives considered:** Keeping `.oracle/` and the root layout leaves a rulebook in a stranger's `docs/`. A configurable root or aliases keep two layouts alive, which the no-compatibility-aliases rule forbids.
- **Patch-vs-refactor verdict:** this is a **refactor** of the installer layout with an ordered migration.

## Discovery (consult log)

- **Consults** — Sep 23, 2026: the CTO review of `58fedbc` required ordered migration, a defined rewrite language, payload-root separation, and loader relocation; each cited line was verified (`src/install.ts:303-306`, `src/loaders.ts:21`, `src/references.ts:30-40`, agentsfleet `make/harness.mk:42,91`). Indy: "Also i want 0.12 move to .orly/ folder in one spec", then "so we create one release 0.12 with all".
- **Metrics review** — no analytics or funnel change.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand; implementation outcomes pending.
- **Deferrals** — None.
