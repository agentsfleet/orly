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

# M07_005: A native Rust foundation defines snapshots, evidence, and a safe .orly migration

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 005
**Date:** Sep 30, 2026: 09:48 AM
**Status:** IN_PROGRESS
**Priority:** P0 — the cross-cutting foundation removes runtime ambiguity before parallel work starts
**Categories:** Command-Line Interface (CLI), Documentation (DOCS), Infrastructure (INFRA), Agent Skills (SKILL)
**Terms:** Continuous Integration (CI); null-byte-delimited paths; KiB = kibibytes; MiB = mebibytes.
**Batch:** B1 — foundation; all Sections complete before B2 starts
**Branch:** docs/m07-open-source-first-run
**Baseline revision:** c02f1e02806204811401b01596a04ff4c039d02a
**Test Baseline:** pending — measure unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report comparison revision, commands, counts, obligations, and environment
**Depends on:** None. M07_001 is the integration successor, not a prerequisite.
**Provenance:** Revised from the Sep 23 draft by Codex after the Rust/Jev direction on Sep 30, 2026; source review at `c02f1e02806204811401b01596a04ff4c039d02a`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §M07 target: one native engine with bounded Jev judgments
**Target version:** 0.12.0; only M07_001 publishes the combined result after required approval.

---

## Overview

**Goal (testable):** A Rust binary renders, validates, installs, and migrates a repository using immutable inputs, without invoking an orly-owned interpreter.

**Problem:** The launcher requires Bun (`bin/orly:16–26`); installation generates Bash hooks (`src/install.ts:242–261`). Managed files live beside project documents, and configuration lives in `.oracle/` (`src/config.ts:19`).

**Solution summary:** Build one production Rust crate and one unpublished development runner. Freeze shared types, schemas, and feature entry points; move managed content into `.orly/` through a verified resumable migration. B2 implements isolated features against these interfaces. The product is a repository decision engine, not a hard-coded reproduction of the current milestone lifecycle. Its common flow is capture immutable facts → obtain typed decisions → compile a bounded plan → run native checks → report evidence. A repository chooses its own triggers and recipes. Existing work/verify/pr verbs are preset entry points into the same engine; new users do not need numbered milestones, a private review skill, or this repository's workflow.

**Determinism boundary:** Rust owns exact facts, validation, execution, and gate status. Jev supplies probabilistic typed semantic answers. Identical validated recorded answers replay reproducibly; fresh inference can vary.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: ship native orly with bounded Jev review`
- **Intent:** Establish the native executable and shared boundaries that let the three feature workstreams proceed independently.
- **Authoring handshake:** This is a spec/design revision, not implementation or permission to publish.
- **ASSUMPTIONS I'M MAKING:** Markdown remains readable source data. Git remains an explicit native dependency. Consumer languages remain supported. Migration recognizes the recorded installation version; it does not maintain a second runtime layout.
- **Implementer handshake:** pending until PLAN; restate intent, scope, and source authority before code.

## Implementing agent — read these first

1. `bin/orly` — current interpreter dependency.
2. `src/model.ts` — filesystem containment and ownership checks.
3. `src/install.ts` — preflight, ownership, hooks, and managed digests.
4. `src/loaders.ts` — host loaders and content preservation.
5. `docs/ORLY_ARCHITECTURE.md` — M07 target architecture and shared interfaces.
6. https://doc.rust-lang.org/cargo/reference/workspaces.html — workspace and dependency ownership.

## Files Changed (blast radius)

Paths name approved roles. B1 freezes an expanded per-file inventory before implementation; B2 cannot mutate shared files. This document revision touches only pending specs and the canonical architecture.

| File | Action | Why |
|---|---|---|
| Cargo.toml, Cargo.lock, rust-toolchain.toml, build.rs, .cargo/config.toml | CREATE | Pinned build, embedded payload, and development alias |
| src/main.rs, src/lib.rs, src/cli.rs, src/core/, src/install/, src/host/ | CREATE | Native command boundary, snapshots, renderer, migration, and host loaders |
| src/judge/mod.rs, src/coverage/mod.rs, src/rules/mod.rs, src/checks/mod.rs | CREATE | B2 extension seams; each successor exclusively edits its module |
| tools/xtask/Cargo.toml, tools/xtask/src/main.rs, tools/xtask/src/manifest.rs | CREATE | Unpublished development runner and exhaustive source inventory |
| schemas/native-config.schema.json, schemas/native-registry.schema.json | CREATE | Freeze target schema; old live schema is switched only by M07_001 |
| schemas/gate-evidence.schema.json, schemas/coverage-manifest.schema.json, schemas/question.schema.json, schemas/delivery.schema.json | CREATE | Freeze all B2 wire shapes before concurrent work |
| fixtures/port/, fixtures/layout-0.10/, tests/foundation.rs, tests/migration.rs | CREATE | Observable obligations and interrupted migration fixtures |
| fixtures/port/native-orly.json, .gitignore | CREATE / EDIT | Validate target configuration without replacing live old config/Make recipes; ignore machine state |
| docs/v1/pending/*.md | EDIT | Only shared-interface hydration at B1; live declared-command hydration is B3 |
| src/core/decision.rs, src/core/plan.rs, src/core/packs.rs, schemas/decision-plan.schema.json, schemas/pack.schema.json | CREATE | Versioned composable decisions, acyclic plans, and data-only extension packs |
| fixtures/projects/rust-cli/, fixtures/projects/typescript-library/, fixtures/projects/agentsfleet-profile/ | CREATE | Three adaptation targets; the mixed project profile pins inspected evidence |

## Applicable Rules

- `dispatch/write_rust.md`: ownership, preserved error causes, bounded concurrency, and explicit resource cleanup for the implementation.
- `dispatch/write_any.md` §Porting a codebase between languages: preserve observable guarantees; replace interpreter workarounds with Rust mechanisms.
- `docs/greptile-learnings/RULES.md`: No Dead Code (NDC), Use Standard Parsers (PSR), Prompt-injection Resistance (PRI), Orphan Sweep (ORP), and Tagged Unions (TGU).
- `dispatch/edit_rules.md`: preserve every existing gate obligation; run invariance checks and the comprehension questionnaire when rule semantics change.
- `dispatch/write_spec.md`, `docs/TEMPLATE.md`, and `dispatch/name_architecture.md`: pending metadata, test mappings, and one canonical target design.
- `dispatch/write_documentation.md` and `docs/DOCUMENTATION_RULES.md`: distinguish proposed behavior from observed results; preserve completed historical records.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec template | Yes | Required sections, exact declared commands, mapped Dimensions, and at most 320 lines |
| Rust; file and function length | At implementation | Idiomatic modules; existing caps remain; no unsafe code without a justified reviewed need |
| Governance invariance | At implementation | Golden obligations, negative fixtures, questionnaire, and generated evidence; no weakening to obtain green |
| Named constants; logging; milestone labels | At implementation | Stable reason codes and limits; source/test names describe behavior rather than milestone numbers |
| Architecture and documentation | Yes | Target design in docs/ORLY_ARCHITECTURE.md; user guides land with behavior |
| Workflow or release edits | Only M07_001 | Explicit implementation-session approval before changing automation or publishing |
| Database removal; Zig source; interface tokens | No | No database migration, Zig implementation, or rendered interface |

## Prior-Art / Reference Implementations

The current containment checks in `src/model.ts` define behavior to preserve. Cargo owns dependency resolution; Git owns repository identity. Standard Markdown, JSON, and Tom's Obvious Minimal Language (TOML) parsers replace text heuristics. Rust reference checkout reads are due before implementation under `dispatch/write_rust.md`; this document revision edits no Rust.

## Sections (implementation slices)

### §1 — Freeze the complete port inventory and common interfaces

Enumerate tracked paths from the recorded comparison revision using null-byte-delimited Git output. Assign every Markdown file, executable script, hook, source module, fixture, and package file a disposition in `fixtures/port/inventory.json`. Include extensionless launchers, Makefile recipes, Python invocations inside scripts, and source strings generating hooks. Each executable obligation names a Rust successor and a positive and negative proof. This inventory is a coverage map, never a baseline that excuses findings.

Classify Markdown as authoritative rule source, generated destination, host wrapper, project documentation, historical record, or private notes. `registry.json` remains the source-to-installed map; `packs/language/rust/rules.md` generates `dispatch/write_rust.md`, rather than creating two editable authorities. Preserve every selected language pack, safety rule, size cap, and opt-in requirement. Private notes and personal packs do not enter the default payload.

Create a root production crate with library and binary plus `tools/xtask`, which is unpublished development tooling. Pin the Rust toolchain and resolved dependencies at B1, after reading the reference implementations. Prefer `clap`, `serde`, `serde_json`, `toml`, `pulldown-cmark`, `globset`, `sha2`, `reqwest` with Rust-native transport security, and standard filesystem/process APIs. Dependency versions belong in Cargo.lock; no shell install commands run on a product path.

Freeze `EvaluationContext`, `Snapshot`, `CriterionResult`, `CommandInvocation`, `EvidencePacket`, and typed `Judge`, `Coverage`, `Rules`, and `Checks` extension entry points. The B2 module roots compile before their implementation; unavailable features return an explicit unavailable result. Reserve configuration fields and schemas for all features now. Shared schema changes later require a serialized revision before affected lanes resume.

Freeze `DecisionEnvelope` and `DecisionPlan` too. A decision envelope retains primitive type, raw answer/distribution, question/builder/model versions, input digest, and assessment identity. The plan compiler is a pure Rust reducer: exact facts plus validated decisions plus project policy yield sorted typed nodes with explicit dependencies, inputs, allowed command identifiers, and output declarations. Reject structural faults such as cycles, unknown identifiers, and exceeded budgets before execution. Missing required deterministic inputs fail their node; missing optional semantic answers leave their nodes unresolved/reported, without blocking the independent exact core. A consumed unresolved recipe branch remains explicitly blocked, never silently replaced with a guessed choice. `plan` emits the partial graph; `run` executes its valid independent nodes and reports unresolved branches; gate exit status still depends only on exact required checks. Replaying one envelope/policy yields the same plan digest; changing policy recomputes the plan without paying for inference again.

Extensibility has two deliberate surfaces. Data-only packs carry namespaced/versioned questions, source rule sections, evidence recipes using built-in selectors, candidate references, calibrated thresholds, and pure policy composition. New exact capabilities are Rust `Check`/`EvidenceBuilder` implementations compiled into the engine with fixtures. No downloaded executable plugin, shell snippet, arbitrary evaluator expression, or `eval`. Repository overrides can add checks and domain choices but cannot remove core safety checks. Version/digest every pack; reject duplicate identities, unresolved capabilities, invalid criteria, and incompatible engine requirements. Source text is state, never executable instructions. Command declarations preserve relative working directory, environment key names, output identities, and named resource claims; capacity-one claims serialize shared Cargo, JavaScript-test, and datastore resources while disjoint nodes can overlap. Credentials remain outside captured model evidence. Conformance uses builtin native nodes; reject a command route that re-enters its own gate. Commit/index, push/range, and remote event-base/head scope are explicit inputs; missing event identity fails, never becomes empty staged success.

- **Dimension 1.1** — Tracked Markdown, scripts, generated hooks, and fixtures → one disposition and successor per obligation; an omitted path fails → Test `test_port_inventory_has_no_unassigned_path`
- **Dimension 1.2** — Foundation build → typed extension seams compile; unavailable capability cannot claim passed → Test `test_shared_interfaces_compile_without_features`
- **Dimension 1.3** — Same facts/envelope/policy → same digest; unknown commands/cycles/gate recursion reject; resource claims serialize conflicts and preserve working directory; missing remote identity fails; offline missing key/replay → exact core runs, missing required input fails, semantic branches reported → Test `test_decision_plan_reducer_is_replayable_and_acyclic`
- **Dimension 1.4** — New project question/section/policy → works through built-in selectors without binary rewrite; conflicting/version-incompatible/executable pack rejects → Test `test_data_pack_extends_policy_without_executable_plugins`

### §2 — Native snapshots, execution, and truthful evidence

Render selected packs with fence-aware markers and standard Markdown parsing. Embed registry, schemas, rules, and selected resource files into the binary at build time; record their canonical digest. Build ordering is sorted and timestamp-free. A relocated binary needs no source checkout. Materialized documents remain readable under `.orly/`.

Create one immutable evaluation snapshot per invocation. Index mode reads Git index blobs, including additions, deletions, renames, modes, and symlinks; it never reads a staged path from working-tree bytes. Head mode reads committed blobs. Working-tree mode records explicit untracked selection. Carry base, head, source kind, manifest digest, configuration digest, and engine version through every checker and evidence builder. A changed index, relevant tree, configuration, or command input invalidates execution evidence.

Before executing project commands, materialize the selected index/head snapshot into a private scratch execution tree, copying only explicitly declared nonsecret untracked inputs. Commands run against those captured bytes; refuse unresolved/external dependency inputs or stale snapshot/configuration. Working-tree mode captures its chosen bytes the same way. Map coverage paths back through exact snapshot identities and check for command-induced source changes. Keep build outputs in declared scratch paths; no claim is made that an arbitrary project executable is sandboxed by std::process::Command. Execute declared argument vectors with `std::process::Command`, without shell interpolation. Clear inherited Git scope for ordinary repository calls; preserve an explicitly supplied alternate index for the one index snapshot capture. Set the intended working directory; bound output at 4 MiB per stream and wall time at 300 seconds by default. An owner-declared per-command deadline may range from 1 to 3,600 seconds for longer full-boundary suites; validate it and include it in the plan identity. Jev cannot select or extend deadlines. Kill and reap the complete command group on deadline. Do not label a limit-truncated output complete. Reject empty vectors and undeclared executables. Repository-native test commands may use the project's own runtime; orly's implementation has none.

Results are tagged states: `passed`, `failed`, `skipped`, `reported`, or `overridden`, always with a reason. Missing evidence for an applicable required check is failed; non-applicability is skipped. Preserve original failures and invocation records beneath a user override. Human and JSON rendering reuse each invocation once. The reproducible result projection excludes clocks, invocation identifiers, and durations; operational metadata keeps those separately. Evidence exposes digests, codes, counts, and relative paths, never raw command output, environment values, source, or free-text override reasons.

- **Dimension 2.1** — Stage A and keep B on disk, including alternate-index/rename cases → checks and scratch-executed tests read A; source mutation invalidates proof → Test `test_snapshot_reads_index_not_worktree`
- **Dimension 2.2** — Missing binary, timeout, surviving grandchild, signal, and output flood → named failure with children reaped and bounded records → Test `test_native_runner_bounds_and_reaps`
- **Dimension 2.3** — No spec, absent surfaces, unavailable feature, original override, and repeated snapshot → explicit states and identical semantic projection → Test `test_evidence_states_and_reproducible_projection`

### §3 — Contained installation and resumable migration

Consumer configuration is `.orly/orly.json`; rules are `.orly/AGENTS.md`; managed pages retain source-relative destinations under `.orly/`. Host entry files preserve repository-owned content. Machine-local evidence and caches use Git-resolved, worktree-specific state paths; they are not committed or trusted attestations. A binary entry point owns `init`, `update`, `doctor`, `render`, and `verify`.

Preflight the full operation before writes: prior-version inventory, source digests, destination conflicts, ancestor/file symlinks, executable modes, loader ownership, and hook ownership. Reject writes through symlinks. Acquire an exclusive worktree installation lock. Retain a versioned operation manifest in local Git state containing source revision, inventory, operation identity, prior digests, and completed entries. Whole-file writes use sibling temporary files, flushes, and atomic renames; each retry revalidates source and destination identity. Switch loaders, then hooks, then configuration only after verifying the complete payload. Delete only recorded unchanged managed copies after their destinations and switches verify. Keep recovery state until cleanup finishes; a conflicting retry refuses without further writes.

Git hooks are native executable links to the verified local engine, named `pre-commit` and `pre-push`; invocation-name routing selects the hook entry point. No generated shell wrapper. Install the versioned binary atomically under ignored `.orly/bin/`, record its digest and mode, then switch hook links. Existing repository-owned hooks remain untouched and receive an explicit integration instruction. A fresh clone runs `orly init` or `update` before native hooks are installed. Test actual Git hook invocation on every supported platform at the release boundary.

Rewrite recognized managed references using the source-to-destination map. Parse Markdown links and explicit command-example tokens; preserve URLs, literal examples, and completed historical specs. `doctor` names stale repository-owned callers and old `.oracle/` paths by file and line. After migration only the migration recognizer accepts the old input layout; normal commands never fall back to it.

- **Dimension 3.1** — Fresh, repeated, nested, and foreign-hook installs → contained layout, preserved content, correct binary links, and no redundant writes → Test `test_install_is_contained_and_idempotent`
- **Dimension 3.2** — Inject interruption at each rename, loader switch, hook switch, config switch, and deletion → verified retry completes; edited/symlinked/concurrent destinations refuse → Test `test_migration_resumes_every_write_and_cleanup`
- **Dimension 3.3** — Old managed command, literal fenced example, URL, and historical record → only real callers rewritten or reported → Test `test_doctor_and_citations_identify_stale_callers`

### §4 — Establish the Rust verification boundary before fan-out

Run the old engine against frozen observable fixtures while it remains available privately. Record outputs and rule obligations, not implementation shape or private personal state. Differences caused by approved target behavior, including explicit skip states and staged-blob correctness, have named expected outcomes and negative tests. No live credential is needed for this preparation.

Freeze the target Rust command declarations and native schema as validated fixture data at B1; do not switch this checkout's live configuration or weaken existing conform/audit checks before their replacements exist. B1/B2 retain the current complete old verification path for private development and run additional native lane tests separately. An unavailable native feature is never a passed release check. M07_001 switches the live commands/config/schema and removes old executable callers together at B3. The final integration target `release_journey` is created by that workstream, not required to exist at B1. Old runtime sources do not ship in 0.12.0.

B1 completes when the native foundation and migration tests pass, the interface/schema revision is recorded, module/file ownership is disjoint, and the successor workstreams compile. Each B2 workstream then opens its own approved worktree from that revision. Do not open extra worktrees during this authoring task. Compare behavioral obligation counts across the language rewrite; separately report old and Rust test counts, because one framework's discovery count is not another's baseline.

- **Dimension 4.1** — Relocated binary with no Bun, Node, Python, or Bash on its executable search path → render, validation, doctor, and dry-run installation work → Test `test_foundation_binary_works_without_interpreters`
- **Dimension 4.2** — Frozen target-command fixture and expanded inventory → valid Rust command declarations and exclusive B2 paths; conflicting ownership fails → Test `test_native_command_declarations_and_lane_ownership`

## Interfaces

```text
orly init | update [--no-hooks] [--no-agent-hooks] [--dry-run] [--json]
orly doctor | render | verify [--json]
Snapshot = Index | Head | WorkingTree
CriterionResult = Passed | Failed | Skipped | Reported | Overridden(original)
Configuration schema 2: engine, packs, commands, surfaces, judge, coverage, rules
Feature entry points consume EvaluationContext; return typed results and evidence packets.
Exit codes: 0 complete; 1 failed required checks; 2 invalid/unavailable/incomplete invocation.
JSON mode: exactly one document on standard output; diagnostics on standard error.
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Missing or unassigned source | Inventory omits a registered helper or generated hook | B1 refuses; test_port_inventory_has_no_unassigned_path |
| Snapshot mismatch | Index/working-tree divergence or mutation | Read the selected source; invalidate on change; test_snapshot_reads_index_not_worktree |
| Process leak | Timeout or child forks | Kill/reap group and fail; test_native_runner_bounds_and_reaps |
| Conflicting installation | Foreign hook, edited managed bytes, or symlink | Preserve user data and refuse unsafe writes; test_install_is_contained_and_idempotent |
| Partial migration | Interrupted write/switch/cleanup or concurrent update | Exclusive operation and verified retry; test_migration_resumes_every_write_and_cleanup |
| Missing runtime/resource | Binary relocated away from package sources | Embedded payload remains complete; test_foundation_binary_works_without_interpreters |

## Invariants

1. Every tracked path and old executable obligation has one disposition and one responsible successor, checked against the frozen inventory.
2. Every checker reads the same explicit snapshot; staged bytes never come from the working file.
3. An applicable missing proof cannot become passed; compiler variants force a state and reason.
4. No orly-owned interpreter runs on a product path; native process boundaries use argument vectors.
5. Conflicting bytes, symlink destinations, and foreign hooks are preserved; migration deletes only verified owned copies.
6. B2 cannot begin before target schemas, command-interface fixtures, and exclusive file scopes are fixed; live verification changes only at B3.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Local command evidence | operator | Explicit command completes | States, counts, digests, bounded durations | No source, key, environment, or raw output; stays local | `test_port_inventory_has_no_unassigned_path` |

Existing anonymous telemetry remains opt-in. Feature review adds no source-bearing event or new analytics funnel. Source-bearing evaluation inputs are private local state or explicitly authorized judge transport.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | integration | `test_port_inventory_has_no_unassigned_path` | Tracked Markdown, scripts, generated hooks, and fixtures → one disposition and successor per obligation; an omitted path fails |
| 1.2 | integration | `test_shared_interfaces_compile_without_features` | Foundation build → typed extension seams compile; unavailable capability cannot claim passed |
| 1.3 | unit | `test_decision_plan_reducer_is_replayable_and_acyclic` | Same facts/envelope/policy → same digest; unknown commands/cycles/gate recursion reject; resource claims serialize conflicts and preserve working directory; missing remote identity fails; offline missing key/replay → exact core runs, missing required input fails, semantic branches reported |
| 1.4 | integration | `test_data_pack_extends_policy_without_executable_plugins` | New project question/section/policy → works through built-in selectors without binary rewrite; conflicting/version-incompatible/executable pack rejects |
| 2.1 | integration | `test_snapshot_reads_index_not_worktree` | Stage A and keep B on disk, including alternate-index/rename cases → checks and scratch-executed tests read A; source mutation invalidates proof |
| 2.2 | integration | `test_native_runner_bounds_and_reaps` | Missing binary, timeout, surviving grandchild, signal, and output flood → named failure with children reaped and bounded records |
| 2.3 | unit | `test_evidence_states_and_reproducible_projection` | No spec, absent surfaces, unavailable feature, original override, and repeated snapshot → explicit states and identical semantic projection |
| 3.1 | integration | `test_install_is_contained_and_idempotent` | Fresh, repeated, nested, and foreign-hook installs → contained layout, preserved content, correct binary links, and no redundant writes |
| 3.2 | integration | `test_migration_resumes_every_write_and_cleanup` | Inject interruption at each rename, loader switch, hook switch, config switch, and deletion → verified retry completes; edited/symlinked/concurrent destinations refuse |
| 3.3 | unit | `test_doctor_and_citations_identify_stale_callers` | Old managed command, literal fenced example, URL, and historical record → only real callers rewritten or reported |
| 4.1 | e2e | `test_foundation_binary_works_without_interpreters` | Relocated binary with no Bun, Node, Python, or Bash on its executable search path → render, validation, doctor, and dry-run installation work |
| 4.2 | integration | `test_native_command_declarations_and_lane_ownership` | Frozen target-command fixture and expanded inventory → valid Rust command declarations and exclusive B2 paths; conflicting ownership fails |

At implementation, apply the unit-test and integration-test skills to every changed Section. Include negative paths and boundary injection; stubs prove local behavior only. Manual proof names the responsible person and durable release Session Notes. Nothing above is marked run.

## Acceptance Rubric (single scoring surface)

A1/A2 quote the current configuration verbatim and remain required through private B1/B2 development. M07_001 switches configuration/Make recipes to Rust atomically with complete native check registration and old-path deletion at B3; update the five rubric declarations in that same change. Future native commands below are lane acceptance requirements, not commands available in this checkout yet.

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Native foundation and index correctness | `cargo test --locked --test foundation` | exit 0 | P0 |  |
| R2 | Contained migration and recovery | `cargo test --locked --test migration` | exit 0 | P0 |  |
| R3 | Inventory and feature ownership | `cargo xtask port-check --map` | exit 0 | P0 |  |
| A1 | Current declared conformance; Rust implementation replaces internals | `make conform` | exit 0 | P0 |  |
| A2 | Current declared unit lane; atomically replaced at B3 | `bun test src` | exit 0 | P0 |  |
| S1 | Native full unit boundary | `cargo test --workspace --locked` | exit 0 | P0 |  |
| S2 | Governance obligations remain enforced | `make audit` | exit 0 | P0 |  |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 |  |
| S4 | Expanded inventory mapping and exclusive scope | `cargo xtask port-check --map` | exit 0; zero unassigned obligations | P0 |  |

## Dead Code Sweep

M07_001 deletes the old executable inventory after replacement proofs exist. This workstream creates the inventory and records every old caller. Migration removes only unchanged managed consumer copies, including root audits/dispatch scripts and `.oracle/orly.json`, after verifying replacements. Historical records and consumer source fixtures remain data.

## Out of Scope

- Implementation of the three B2 features; their seams are defined here.
- Editing sibling consumers; each migrates on its own approved branch.
- Windows binaries: 0.12.0 supports the Linux and macOS matrix in M07_001. Unsupported platforms receive an explicit diagnostic.
- Global daemon, database, runtime path aliases, or model-generated migration decisions.

## Product Clarity (authoring record)

1. **Successful user moment** — A maintainer runs one native binary in a clean checkout and gets an accurate installation plan.
2. **Preserved user behaviour** — Selected rules, custom hooks, command behavior, and user files retain their meaning.
3. **Optimal-way check** — Embedding readable data avoids interpreter setup and a package-directory dependency.
4. **Rebuild-vs-iterate** — Rewrite guarantees using ownership and typed variants; avoid file-for-file transliteration.
5. **What we build** — Rust crate, frozen interfaces, source inventory, renderer, migration, and native hook installation.
6. **What we do NOT build** — No daemon, database, hidden fallback runtime, or edits to other repositories.
7. **Fit with existing features** — The foundation establishes the boundaries all B2 features consume.
8. **Surface order** — Command line first; every renderer shares a result.
9. **Dashboard restraint** — No dashboard; doctor names the conflict and its source.
10. **Confused-user next step** — Use `orly doctor --json` to identify the exact incomplete setup or conflicting file.

## Decomposition & alternatives (patch vs refactor)

One cross-cutting workstream establishes shared interfaces and installation authority. The three independent features follow in B2; release integration follows in B3. A shell-wrapper port keeps the same distribution failure; the native rewrite removes it.

## Discovery (consult log)

- **Consults** — Reviewed launcher, containment, installer, loaders, registry mappings, and command declarations at the recorded source revision. The user explicitly requests Rust and removal of TypeScript and shell implementation. The local recovery manifest is an agent-selected mechanism required by interrupted multi-file migration; it replaces the draft prohibition on such recovery state.
- **Metrics review** — No new analytics funnel. Local diagnostics and the existing consented telemetry retain separate privacy rules.
- **Skill-chain outcomes** — Source/spec adversarial review performed during authoring; native implementation, live calibration, platform journeys, and boundary verification remain pending.
- **Deferrals** — None recorded. The explicit native-command OpenCode guarantee replaces the former executable plugin approach; no missing required release proof is treated as deferred.
