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
**Status:** DONE
**Priority:** P0 — the cross-cutting foundation removes runtime ambiguity before parallel work starts
**Categories:** Command-Line Interface (CLI), Documentation (DOCS), Infrastructure (INFRA), Agent Skills (SKILL)
**Terms:** Continuous Integration (CI); null-byte-delimited paths; KiB = kibibytes; MiB = mebibytes.
**Batch:** B1 — foundation; all Sections complete before B2 starts
**Branch:** feat/m07-native-foundation
**Baseline revision:** c02f1e02806204811401b01596a04ff4c039d02a
**Test Baseline:** unit=268 integration=n/a — no integration command declared; native suites add separate proofs.
**Baseline evidence:** target/platform-evidence/baseline-unit.log
**Depends on:** None. M07_001 is the integration successor, not a prerequisite.
**Provenance:** Revised from the Sep 23 draft by Codex after the Rust/Jev direction on Sep 30, 2026; source review at `c02f1e02806204811401b01596a04ff4c039d02a`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §M07 target: one native engine with bounded Jev judgments
**Target version:** 0.12.0; only M07_001 publishes the combined result after required approval.

---

## Overview

**Goal (testable):** A Rust binary renders, validates, installs, and migrates a repository using immutable inputs, without invoking an orly-owned interpreter.

**Problem:** The launcher requires Bun (`bin/orly:16–26`); installation generates Bash hooks (`src/install.ts:242–261`). Managed files live beside project documents, and configuration lives in `.oracle/` (`src/config.ts:19`).

**Solution summary:** Build small production Rust crates behind one native binary, plus one unpublished development runner. Freeze shared types, schemas, and feature entry points; move managed content into `.orly/` through a verified resumable migration. B2 implements isolated features against these interfaces. The product is a repository decision engine, not a hard-coded reproduction of the current milestone lifecycle. Its common flow is capture immutable facts → obtain typed decisions → compile a bounded plan → run native checks → report evidence. A repository chooses its own triggers and recipes. Existing work/verify/pr verbs are preset entry points into the same engine; new users do not need numbered milestones, a private review skill, or this repository's workflow.

**Determinism boundary:** Rust owns exact facts, validation, execution, and gate status. Jev supplies probabilistic typed semantic answers. Identical validated recorded answers replay reproducibly; fresh inference can vary.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: ship native orly with bounded Jev review`
- **Intent:** Establish the native executable and shared boundaries that let the three feature workstreams proceed independently.
- **Authoring handshake:** Implement the foundation in this branch; publishing remains outside this workstream.
- **ASSUMPTIONS I'M MAKING:** Markdown remains readable source data. Git remains an explicit native dependency. Consumer languages remain supported. Migration recognizes the recorded installation version; it does not maintain a second runtime layout.
- **Implementer handshake:** Build the native foundation in this branch; preserve current verification and unrelated changes. The canonical architecture and this spec govern shared interfaces. Consumer proofs use isolated Git fixtures; no release is authorized.

## Implementing agent — read these first

1. `bin/orly` — current interpreter dependency.
2. `src/model.ts` — filesystem containment and ownership checks.
3. `src/install.ts` — preflight, ownership, hooks, and managed digests.
4. `src/loaders.ts` — host loaders and content preservation.
5. `docs/ORLY_ARCHITECTURE.md` — M07 target architecture and shared interfaces.
6. https://doc.rust-lang.org/cargo/reference/workspaces.html — workspace and dependency ownership.

## Files Changed (blast radius)

Paths name approved roles. B1 freezes an expanded per-file inventory before implementation; B2 cannot mutate shared files.

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
| crates/decision/src/lib.rs, src/core/plan.rs, src/core/packs.rs, schemas/decision-plan.schema.json, schemas/pack.schema.json | CREATE | Versioned composable decisions, acyclic plans, and data-only extension packs |
| fixtures/projects/rust-cli/, fixtures/projects/typescript-library/, fixtures/projects/agentsfleet-profile/ | CREATE | Three adaptation targets; the mixed project profile pins inspected evidence |
| core/operating-model.md, packs/language/rust/rules.md, dispatch/write_rust.md, AGENTS.md | EDIT / REGENERATE | User-requested Rust reference paths: Exonum, Apache Arrow, and read-only agentsfleet/rustd |
| src/core/, src/install/, tests/foundation/, tests/migration/, fixtures/port/, schemas/native-config.schema.json, docs/ORLY_ARCHITECTURE.md | EDIT | User-approved configurable shared storage and Linux/macOS foundation support |
| crates/fs/, crates/decision/, Cargo.toml, Cargo.lock, tools/xtask/Cargo.toml, src/, tests/ | CREATE / EDIT | User-approved small independent crates; direct imports and cause-preserving error composition |
| .github/workflows/native-foundation.yml | CREATE / EDIT | Approved tests-only Linux/macOS execution proof; Windows parked by owner |
| README.md, audits/agents-md.md | EDIT | Versioned native path documentation and explicitly approved three-row questionnaire alignment |
| audits/agents-md.md, dispatch/write_spec.md, dispatch/edit_rules.md, Makefile, evals/llms/fixtures.jsonl, docs/HARNESS_VERIFY_OUTPUT.md | EDIT | Approved questionnaire/output-guide alignment and bypass-promise removal; executable checks and fixture verdicts stay intact |

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
| Workflow or release edits | Tests-only workflow here; release in M07_001 | Explicit approval covers native-foundation.yml; publishing requires separate approval |
| Database removal; Zig source; interface tokens | No | No database migration, Zig implementation, or rendered interface |

## Prior-Art / Reference Implementations

The current containment checks in `src/model.ts` define behavior to preserve. Cargo owns dependency resolution; Git owns repository identity. Standard Markdown, JSON, and Tom's Obvious Minimal Language (TOML) parsers replace text heuristics. Rust reference checkout reads are due before implementation under `dispatch/write_rust.md`; this document revision edits no Rust.

## Sections (implementation slices)

### §1 — Freeze the complete port inventory and common interfaces — DONE

**Expanded implementation inventory (frozen before code):**
- Build: `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `.cargo/config.toml`, `build.rs`, `.gitignore`.
- Root: `src/{lib,main,cli,cli_config,cli_plan,cli_output,error}.rs`; independent crates: `crates/fs/`, `crates/decision/`.
- Filesystem crate: `crates/fs/src/{lib,error,constants,path,digest,filesystem,filesystem_parent,filesystem_atomic,file_input,permissions}.rs`, `crates/fs/tests/atomic.rs`; decision crate: `crates/decision/src/{lib,error}.rs`, `crates/decision/tests/replay.rs`.
- Core: `src/core/{mod,constants,env,logging,document,dependencies,capabilities,selection,config,storage,evidence,plan,plan_compile,plan_validate,packs,git,snapshot,snapshot_capture,execution,runner,process,process_group,process_streams,scheduler,scheduler_graph,payload,payload_materialize,render,render_markers,citations}.rs`.
- Installation: `src/install/{mod,preflight,preflight_migration,hooks,state,operation,recovery}.rs`; hosts: `src/host/mod.rs`.
- Frozen feature roots: `src/{judge,coverage,rules,checks}/mod.rs`.
- Development: `tools/xtask/Cargo.toml`, `tools/xtask/src/{main,error,manifest,manifest_model,manifest_proofs,manifest_tests}.rs`.
- Schemas: the eight schema paths in Files Changed; generated from the shared Rust types.
- Tests: `tests/{foundation,migration}.rs`, `tests/support/{mod,execution,installation,command_fixture,platform,probe,process}.rs`, `tests/foundation/{env,errors,scope,packs,scheduling,plan,plan_inputs,snapshot,runner,payload,interfaces,filesystem,projects}.rs`, `tests/migration/{install,recovery,recovery_fixture,recovery_payload,ownership,citations,host,storage}.rs`.
- Fixtures: `fixtures/port/{inventory,interfaces,native-orly,proofs}.json`, `fixtures/port/README.md`, `fixtures/layout-0.10/`, `fixtures/projects/{rust-cli,typescript-library,agentsfleet-profile}/`.
- Successor specs: only shared-interface hydration under `docs/v1/pending/`; no live verification changes.


Read tracked paths and modes from the recorded Git tree through the shared object store. Native replacement, development replacement, and release assembly dispositions require behavior proofs. Git executable modes independently require proofs even when labeled as data. Assign every Markdown file, executable script, hook, source module, fixture, and package file a disposition in `fixtures/port/inventory.json`. Include extensionless launchers, Python invocations inside scripts, and source strings generating hooks. Each executable obligation names a Rust successor and a positive and negative proof. This inventory is a coverage map, never a baseline that excuses findings.

Classify Markdown as authoritative rule source, generated destination, host wrapper, project documentation, historical record, or private notes. `registry.json` remains the source-to-installed map; `packs/language/rust/rules.md` generates `dispatch/write_rust.md`, rather than creating two editable authorities. Preserve every selected language pack, safety rule, size cap, and opt-in requirement. Private notes and personal packs do not enter the default payload.

Create one Cargo workspace with `orly-fs` for contained files and digests, `orly-decision` for typed answers and questions, the root native library/binary, and unpublished `tools/xtask`. Independently usable modules own their types, errors, tests, and lean dependency sets under Microsoft guideline `M-SMALLER-CRATES`. Pin the Rust toolchain and resolved dependencies at B1, after reading the reference implementations. Prefer `clap`, `serde`, `serde_json`, `toml`, `pulldown-cmark`, `globset`, `sha2`, `reqwest` with Rust-native transport security, and standard filesystem/process APIs. Dependency versions belong in Cargo.lock; no shell install commands run on a product path.

Freeze `EvaluationContext`, `Snapshot`, `CriterionResult`, `CommandInvocation`, `EvidencePacket`, and typed `Judge`, `Coverage`, `Rules`, and `Checks` extension entry points. The B2 module roots compile before their implementation; unavailable features return an explicit unavailable result. Reserve configuration fields and schemas for all features now. Shared schema changes later require a serialized revision before affected lanes resume.

Freeze `DecisionEnvelope` and `DecisionPlan` too. A decision envelope retains primitive type, raw answer/distribution, question/builder/model versions, input digest, and assessment identity. The plan compiler is a pure Rust reducer: exact facts plus validated decisions plus project policy yield sorted typed nodes with explicit dependencies, inputs, allowed command identifiers, and output declarations. Reject structural faults such as cycles, unknown identifiers, and exceeded budgets before execution. Missing required deterministic inputs fail their node; missing optional semantic answers leave their nodes unresolved/reported, without blocking the independent exact core. A consumed unresolved recipe branch remains explicitly blocked, never silently replaced with a guessed choice. `plan` emits the partial graph; `run` executes its valid independent nodes and reports unresolved branches; gate exit status still depends only on exact required checks. Replaying one envelope/policy yields the same plan digest; changing policy recomputes the plan without paying for inference again.

Extensibility has two deliberate surfaces. Data-only packs carry namespaced/versioned questions, source rule sections, evidence recipes using built-in selectors, candidate references, calibrated thresholds, and pure policy composition. New exact capabilities are Rust `Check`/`EvidenceBuilder` implementations compiled into the engine with fixtures. No downloaded executable plugin, shell snippet, arbitrary evaluator expression, or `eval`. Repository overrides can add checks and domain choices but cannot remove core safety checks. Version/digest every pack; reject duplicate identities, unresolved capabilities, invalid criteria, and incompatible engine requirements. Source text is state, never executable instructions. Command declarations preserve relative working directory, environment key names, output identities, and named resource claims; capacity-one claims serialize shared Cargo, JavaScript-test, and datastore resources while disjoint nodes can overlap. Credentials remain outside captured model evidence. Conformance uses builtin native nodes; reject a command route that re-enters its own gate. Commit/index, push/range, and remote event-base/head scope are explicit inputs; missing event identity fails, never becomes empty staged success.

- **Dimension 1.1 — DONE** — Tracked Markdown, scripts, generated hooks, and fixtures → one disposition and successor per obligation; an omitted path fails → Test `test_port_inventory_has_no_unassigned_path`
- **Dimension 1.2 — DONE** — Foundation build → typed extension seams compile; unavailable capability cannot claim passed → Test `test_shared_interfaces_compile_without_features`
- **Dimension 1.3 — DONE** — Same facts/envelope/policy → same digest; unknown commands/cycles/gate recursion reject; resource claims serialize conflicts and preserve working directory; missing remote identity fails; offline missing key/replay → exact core runs, missing required input fails, semantic branches reported → Test `test_decision_plan_reducer_is_replayable_and_acyclic`
- **Dimension 1.4 — DONE** — New project question/section/policy → works through built-in selectors without binary rewrite; conflicting/version-incompatible/executable pack rejects → Test `test_data_pack_extends_policy_without_executable_plugins`

### §2 — Native snapshots, execution, and truthful evidence — DONE

Render selected packs with fence-aware markers and standard Markdown parsing. Embed registry, schemas, rules, and selected resource files into the binary at build time; record their canonical digest. Build ordering is sorted and timestamp-free. A relocated binary needs no source checkout. Materialized documents remain readable under `.orly/`.

Create one immutable evaluation snapshot per invocation. Index mode reads Git index blobs, including additions, deletions, renames, modes, and symlinks; it never reads a staged path from working-tree bytes. Head mode reads committed blobs. Working-tree mode records explicit untracked selection. Carry base, head, source kind, manifest digest, configuration digest, and engine version through every checker and evidence builder. A changed index, relevant tree, configuration, or command input invalidates execution evidence.

Before executing project commands, materialize the selected index/head snapshot into a private scratch execution tree, copying only explicitly declared nonsecret untracked inputs. Commands run against those captured bytes; refuse unresolved/external dependency inputs or stale snapshot/configuration. Working-tree mode captures its chosen bytes the same way. Map coverage paths back through exact snapshot identities and check for command-induced source changes. Keep build outputs in declared scratch paths; no claim is made that an arbitrary project executable is sandboxed by std::process::Command. Execute declared argument vectors with `std::process::Command`, without shell interpolation. Clear inherited Git scope for ordinary repository calls; preserve an explicitly supplied alternate index for the one index snapshot capture. Set the intended working directory; bound output at 4 MiB per stream and wall time at 300 seconds by default. An owner-declared per-command deadline may range from 1 to 3,600 seconds for longer full-boundary suites; validate it and include it in the plan identity. Jev cannot select or extend deadlines. Kill and reap the complete command group on deadline. Do not label a limit-truncated output complete. Reject empty vectors and undeclared executables. Repository-native test commands may use the project's own runtime; orly's implementation has none.

Results are tagged states: `passed`, `failed`, `skipped`, `reported`, or `overridden`, always with a reason. Missing evidence for an applicable required check is failed; non-applicability is skipped. Preserve original failures and invocation records beneath a user override. Human and JSON rendering reuse each invocation once. The reproducible result projection excludes clocks, invocation identifiers, and durations; operational metadata keeps those separately. Evidence exposes digests, codes, counts, and relative paths, never raw command output, environment values, source, or free-text override reasons.

- **Dimension 2.1 — DONE** — Stage A and keep B on disk, including alternate-index/rename cases → checks and scratch-executed tests read A; source mutation invalidates proof → Test `test_snapshot_reads_index_not_worktree`
- **Dimension 2.2 — DONE** — Missing binary, timeout, surviving grandchild, signal, and output flood → named failure with children reaped and bounded records → Test `test_native_runner_bounds_and_reaps`
- **Dimension 2.3 — DONE** — No spec, absent surfaces, unavailable feature, original override, and repeated snapshot → explicit states and identical semantic projection → Test `test_evidence_states_and_reproducible_projection`
- **Dimension 2.4 — DONE** — Default `.orly/rels/`, a configured root, and escaping or colliding paths → shared material stays contained, preserved, and trackable → Test `storage_install_preserves_documents_and_changing_root_does_not_move_them`; companion storage tests cover path and collision refusals.
- **Dimension 2.5 — DONE** — Linux and macOS foundations → captured inputs, bounded child execution, installation, and recovery behave consistently → Test `manual_foundation_platform_report`

Shared release/spec material defaults to repository-relative `.orly/rels/` and uses an owner-configurable contained root. It remains separate from generated rules, ignored binaries, and private installation state. Preserve existing documents; no silent relocation or deletion. Standard crates and operating-system APIs provide portable process and filesystem behavior. Record real Linux and macOS execution evidence before closing; cross-compilation alone is not runtime proof. Windows support is parked outside 0.12.0.

### §3 — Contained installation and resumable migration — DONE

Consumer configuration is `.orly/orly.json`; rules are `.orly/AGENTS.md`; managed pages retain source-relative destinations under `.orly/`. Host entry files preserve repository-owned content. Machine-local evidence and caches use Git-resolved, worktree-specific state paths; they are not committed or trusted attestations. A binary entry point owns `init`, `update`, `doctor`, `render`, and `verify`.

Preflight the full operation before writes: prior-version inventory, source digests, destination conflicts, ancestor/file symlinks, executable modes, loader ownership, and hook ownership. Reject writes through symlinks. Acquire an exclusive worktree installation lock. Retain a versioned operation manifest in local Git state containing source revision, inventory, operation identity, prior digests, and completed entries. Whole-file writes use sibling temporary files, flushes, and atomic renames; each retry revalidates source and destination identity. Switch loaders, then hooks, then configuration only after verifying the complete payload. Delete only recorded unchanged managed copies after their destinations and switches verify. Keep recovery state until cleanup finishes; a conflicting retry refuses without further writes.

Retain the repository, Git-state, and installation-state directory handles throughout one installation. Lock, journal, planning, effects, and cleanup share these verified resources. Refuse detected directory replacement before the next effect or journal action; preserve the prior journal for verified retry. Directory checks do not claim a sandbox against another process changing files during a system call. Prove replacement before effects and during journal publication through real filesystem operations in `tests/migration/ownership.rs`. Also move a linked worktree using Git, reuse its old path, refuse the stale invocation, and recover from the moved location. Use cap-std directory handles, same-file identity comparison, standard file locks, and borrowed owners.

Git hooks are native executable links to the verified local engine, named `pre-commit` and `pre-push`; invocation-name routing selects the hook entry point. No generated shell wrapper. Install the versioned binary atomically under ignored `.orly/bin/`, record its digest and mode, then switch hook links. Existing repository-owned hooks remain untouched and receive an explicit integration instruction. A fresh clone runs `orly init` or `update` before native hooks are installed. Test actual Git hook invocation on every supported platform at the release boundary.

Rewrite recognized managed references using the source-to-destination map. Parse Markdown links and explicit command-example tokens; preserve URLs, literal examples, and completed historical specs. `doctor` names stale repository-owned callers and old `.oracle/` paths by file and line. After migration only the migration recognizer accepts the old input layout; normal commands never fall back to it.

- **Dimension 3.1 — DONE** — Fresh, repeated, nested, and foreign-hook installs → contained layout, preserved content, correct binary links, and no redundant writes → Test `test_install_is_contained_and_idempotent`
- **Dimension 3.2 — DONE** — Inject interruption at each rename, loader switch, hook switch, config switch, and deletion → verified retry completes; edited/symlinked/concurrent destinations refuse → Test `test_migration_resumes_every_write_and_cleanup`
- **Dimension 3.3 — DONE** — Old managed command, literal fenced example, URL, and historical record → only real callers rewritten or reported → Test `test_doctor_and_citations_identify_stale_callers`

### §4 — Establish the Rust verification boundary before fan-out — DONE

Run the old engine against frozen observable fixtures while it remains available privately. Record outputs and rule obligations, not implementation shape or private personal state. Differences caused by approved target behavior, including explicit skip states and staged-blob correctness, have named expected outcomes and negative tests. No live credential is needed for this preparation.

Freeze the target Rust command declarations and native schema as validated fixture data at B1; do not switch this checkout's live configuration or weaken existing conform/audit checks before their replacements exist. B1/B2 retain the current complete old verification path for private development and run additional native lane tests separately. An unavailable native feature is never a passed release check. M07_001 switches the live commands/config/schema and removes old executable callers together at B3. The final integration target `release_journey` is created by that workstream, not required to exist at B1. Old runtime sources do not ship in 0.12.0.

B1 completes when the native foundation and migration tests pass, the interface/schema revision is recorded, module/file ownership is disjoint, and the successor workstreams compile. Each B2 workstream then opens its own approved worktree from that revision. Do not open extra worktrees during this authoring task. Compare behavioral obligation counts across the language rewrite; separately report old and Rust test counts, because one framework's discovery count is not another's baseline.

- **Dimension 4.1 — DONE** — Relocated binary with no Bun, Node, Python, or Bash on its executable search path → render, validation, doctor, and dry-run installation work → Test `test_foundation_binary_works_without_interpreters`
- **Dimension 4.2 — DONE** — Frozen target-command fixture and expanded inventory → valid Rust command declarations and exclusive B2 paths; conflicting ownership fails → Test `test_native_command_declarations_and_lane_ownership`

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
| 2.4 | integration | `storage_install_preserves_documents_and_changing_root_does_not_move_them` | Default and configured contained roots preserve shared documents and remain trackable; companion storage cases refuse escaping or colliding paths |
| 2.5 | manual | `manual_foundation_platform_report` | Record actual snapshot, process, installation, and retry runs on Linux and macOS |
| 3.1 | integration | `test_install_is_contained_and_idempotent` | Fresh, repeated, nested, and foreign-hook installs → contained layout, preserved content, correct binary links, and no redundant writes |
| 3.2 | integration | `test_migration_resumes_every_write_and_cleanup` | Inject interruption at each rename, loader switch, hook switch, config switch, and deletion → verified retry completes; edited/symlinked/concurrent destinations refuse |
| 3.3 | unit | `test_doctor_and_citations_identify_stale_callers` | Old managed command, literal fenced example, URL, and historical record → only real callers rewritten or reported |
| 4.1 | e2e | `test_foundation_binary_works_without_interpreters` | Relocated binary with no Bun, Node, Python, or Bash on its executable search path → render, validation, doctor, and dry-run installation work |
| 4.2 | integration | `test_native_command_declarations_and_lane_ownership` | Frozen target-command fixture and expanded inventory → valid Rust command declarations and exclusive B2 paths; conflicting ownership fails |

Apply the unit-test and integration-test skills to every changed Section. Include negative paths and boundary injection; stubs prove local behavior only. Platform proof records the executing system, revision, commands, results, and evidence location.

## Acceptance Rubric (single scoring surface)

A1/A2 quote the current configuration verbatim and remain required through private B1/B2 development. M07_001 switches live commands to Rust with complete native check registration and old-path deletion. The native commands below are additional foundation checks available in this checkout.

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Native foundation and index correctness | `cargo test --locked --test foundation` | exit 0 | P0 | ✅ Linux/macOS: 81 passed, 0 failed at ee16d65; run 37100342773 |
| R2 | Contained migration and recovery | `cargo test --locked --test migration` | exit 0 | P0 | ✅ Linux/macOS: 45 passed, 0 failed; 91 operations × 3 interruption timings; run 37100342773 |
| R3 | Inventory and feature ownership | `cargo xtask port-check --map` | exit 0 | P0 | ✅ 220 tracked paths; 110 assigned obligations; 0 unassigned; target/platform-evidence/port-map.log |
| A1 | Current declared conformance; Rust implementation replaces internals | `make conform` | exit 0 | P0 | ✅ `ALL CHECKS PASSED`; target/platform-evidence/conform.log |
| A2 | Current declared unit lane; atomically replaced at B3 | `bun test src` | exit 0 | P0 | ✅ 268 pass, 0 fail inside make audit; target/platform-evidence/audit.log |
| S1 | Native full unit boundary | `cargo test --workspace --locked` | exit 0 | P0 | ✅ Hosted all-feature workspace: Linux/macOS exit 0 at ee16d65; run 37100342773 |
| S2 | Governance obligations remain enforced | `make audit` | exit 0 | P0 | ✅ unit 268/0; dispatch 46/0; parity 10/0; ledger 25/0; target/platform-evidence/audit.log |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 | ✅ Required pre-push scan: no leaks; pull request Session notes 6 records final scan |
| S4 | Expanded inventory mapping and exclusive scope | `cargo xtask port-check --map` | exit 0; zero unassigned obligations | P0 | ✅ 220 tracked paths; 110 assigned obligations; 0 unassigned; target/platform-evidence/port-map.log |
| S5 | Supported foundation systems | `manual_foundation_platform_report` | Linux and macOS runtime evidence | P0 | ✅ Both native jobs passed; run 37100342773; Windows parked by owner |

## Dead Code Sweep

M07_001 deletes the old executable inventory after replacement proofs exist. This workstream creates the inventory and records every old caller. Migration removes only unchanged managed consumer copies, including root audits/dispatch scripts and `.oracle/orly.json`, after verifying replacements. Historical records and consumer source fixtures remain data.

## Out of Scope

- Implementation of the three B2 features; their seams are defined here.
- Editing sibling consumers; each migrates on its own approved branch.
- Release packaging and publishing remain in M07_001; Linux and macOS foundation behavior is required here. Windows support is parked outside 0.12.0.
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
- **Resource ownership decision** — Indy: "Okay fix that, when will i see this issue?" Authorizes retaining installation resources and refusing directory replacement; the isolated ownership probe reproduced separate held locks and redirected journal publication.
- **Metrics review** — No new analytics funnel. Local diagnostics and the existing consented telemetry retain separate privacy rules.
- **Capture ownership** — User direction: "is SnapshotCapture a struct that captures snaphots, tracks, untracks, knows working file and so on? That must be the design". Capture now owns those operations and its byte budget; the immutable snapshot remains the execution input.
- **Scheduler decision** — User approval: "Implement the scheduler refactor (recommended)". Dependency counters, ordered readiness, and resource waiters replace repeated full scans. Tests cover dependency order, overlapping resource queues, bounded concurrency, invocation deduplication, and measured node-visit budgets.
- **Skill-chain outcomes** — Native adversarial findings repaired; current foundation 78/0, development runner 6/0, and journal regression 1/0. Repeated broad verification and review are skipped on the delivery instruction below; Windows proof runs after push, and live comprehension remains parked.
- **Deferrals** — Live comprehension is parked; failed smoke results remain failures. Resume those runs only on Indy's instruction.
> Indy (2026-10-02 20:36): "Let us park 3. and move on to other to get a PR when 1, 2, 4 are done." — context: live Claude/OpenCode checks; timestamp is the saved checkpoint's capture time.
- **Platform decision** — Indy selected "Windows, Linux, and macOS now" on Oct 01, 2026. The foundation and release scopes include all three systems; platform execution evidence remains required.
- **Storage decision** — Indy selected "Use configurable .orly/rels/ now" on Oct 01, 2026. Shared release/spec storage is configurable; existing documents remain preserved until an explicit migration.
- **Simplicity decision** — Indy: "orly is a single user cli, and it wont be used too concurrently. Donot over engineer and cut the crap". Prefer local path checks and existing tools; add concurrency machinery only when a demonstrated need requires it.
- **Platform automation** — Indy: "Yes, add the tests-only workflow". This permits .github/workflows/native-foundation.yml; compiler 1.98.1, formatting, Clippy, and native tests only.
- **Docker decision** — Indy revoked the earlier hold: "You are free to run docker now, there is space". Real runtime proof remains required on every supported system.
- **Questionnaire decision** — Indy: "yes apply the 3 corrections". Align only rows 6.4, 12.3, and 14.6 with declared verification commands, ready pull requests, and Aiwa's name.
- **Questionnaire reconciliation** — Indy: "yes go ahead, i need a workstream based report". Apply the reviewed four-file corrections and report each workstream's verified status.
- **Governance choices** — Indy: "Keep exceptions; narrow questionnaire (recommended)"; "Remove unsupported bypass promise". Align row 4.7c and remove the unused bypass from source rules, generated instructions, dispatch, and fixture explanation.
- **Review repairs** — Indy: "Fix nested object validation (recommended)"; "Fix exact hook-path parsing (recommended)". Regressions fail on the original parser and hook reader; repairs preserve valid objects and foreign hook activation.
- **Governance sign-off wording** — Indy: "Apply wording corrections (recommended)"; "Align both descriptions (recommended)"; "Apply both corrections (recommended)". Match the questionnaire to actual audit scope, evidence conditions, and ledger comparison; executable checks remain unchanged.
- **Delivery instruction** — Indy: "get your rear moving to a PR. donot repeatedly review and test and the loop again." Also: "shoot for a PR if you did verify recently and a review and test would add no more benefit, if so you must skip and push the PR". Use the recent proofs, push the existing Pull Request, and retain Windows as pending until the hosted run proves it. The final 15 questionnaire corrections were approved as "Apply the wording corrections (recommended)".
- **Hosted checkout repair** — The first native Linux run passed foundation 78/0 and migration 45/0; three inventory tests could not read the recorded comparison commit because checkout fetched one revision. The authorized tests-only workflow now fetches history; all proof checks remain intact. Evidence: GitHub run 37039450903, job 110945660727.
- **Windows repair** — Indy: "YEs PR#52 is merged, pull origin into your branch and push with the fixes". Run 37040722481 passed Linux/macOS and failed six Windows foundation cases; fixes preserve held-directory ownership, normalize native link targets, reject nonregular inputs, and isolate interpreter/output-limit proofs. Native logs now use library-provided `logfmt` with unconditional error/warning filtering; patched Windows execution remains pending.
- **Supported-system close** — Run 37100342773 at ee16d65 passed Linux/macOS: foundation 81/0, migration 45/0, development runner 6/0. Windows foundation passed 79/0; migration failed 39/5. Linux and macOS are supported for 0.12.0; Windows support is parked and has no passing-proof claim. The local branch is feat/m07-native-foundation; the remote keeps pull request 51 open pending the rename decision.
> Indy (Oct 03, 2026: 11:45 AM): "i want you to move the spec to done with the windows support being parked for 0.12" — context: Windows proof no longer blocks the completed Linux/macOS foundation.
