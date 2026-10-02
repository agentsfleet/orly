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

# M07_004: Rust replaces script enforcement and delivers applicable rules on every runtime

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 004
**Date:** Sep 30, 2026: 09:48 AM
**Status:** PENDING
**Priority:** P1 — rule delivery and enforcement must work without a private agent setup
**Categories:** Command-Line Interface (CLI), Documentation (DOCS), Infrastructure (INFRA), Agent Skills (SKILL)
**Terms:** Continuous Integration (CI); null-byte-delimited paths; KiB = kibibytes; MiB = mebibytes.
**Batch:** B2 — parallel with M07_002 and M07_003 after the B1 interface revision
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report comparison revision, commands, counts, obligations, and environment
**Depends on:** M07_005 §§1–4 only. Jev answers are optional typed inputs; this lane uses frozen fixture answers and never waits for M07_002 implementation.
**Provenance:** Revised from the Sep 23 draft by Codex after the Rust/Jev direction on Sep 30, 2026; source review at `c02f1e02806204811401b01596a04ff4c039d02a`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §M07 target: one native engine with bounded Jev judgments
**Target version:** 0.12.0; only M07_001 publishes the combined result after required approval.

---

## Overview

**Goal (testable):** Native Rust checks preserve every script obligation and emit applicable readable rule sections at commit, with supported pre-edit hooks invoking the same binary.

**Problem:** Dispatch sources shell helpers (`dispatch/lib.sh:14–18`), the old delivery draft needs a TypeScript OpenCode plugin, and product-specific audit paths can produce irrelevant no-op results (`audits/design-tokens.sh:88–100`).

**Solution summary:** Implement one native rule dispatcher, exact checker registry, immutable content selection, delivery records, and native evaluation tooling. Every runtime has commit delivery; command-based pre-edit integrations have explicit capability proofs. Rules are one consumer of the decision plan; work/verify/pr are optional recipes rather than the universal product lifecycle.

**Determinism boundary:** Rust owns exact facts, validation, execution, and gate status. Jev supplies probabilistic typed semantic answers. Identical validated recorded answers replay reproducibly; fresh inference can vary.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: ship native orly with bounded Jev review`
- **Intent:** Make readable rules arrive when relevant and make their exact checks run from the same native engine.
- **Authoring handshake:** This is a spec/design revision, not implementation or permission to publish.
- **ASSUMPTIONS I'M MAKING:** Emission proves complete output, not model receipt or comprehension. File/path rules stay deterministic. Jev may add bounded candidate sections; it never removes required selections. No hook contacts the provider.
- **Implementer handshake:** pending until PLAN; restate intent, scope, and source authority before code.

## Implementing agent — read these first

1. `dispatch/lib.sh` — dispatch, gloss, applicable files, and helper-failure semantics.
2. `audits/data.sh` — invariance expectations and source-path inventories.
3. `audits/doc-read.sh` — record meaning and runtime-neutrality.
4. `evals/dispatch/coverage.sh` — check/fixture/gloss coherence obligations.
5. `docs/ORLY_ARCHITECTURE.md` — shared checker and delivery interfaces.
6. https://git-scm.com/docs/githooks — native executable hook semantics.

## Files Changed (blast radius)

Paths name approved roles. B1 freezes an expanded per-file inventory before implementation; B2 cannot mutate shared files. This document revision touches only pending specs and the canonical architecture.

| File | Action | Why |
|---|---|---|
| src/rules/, src/checks/ | EDIT / CREATE | Exclusive rule selection/delivery and native audit implementations |
| tools/xtask/src/checks.rs, tools/xtask/src/evals.rs | CREATE | Native parity, installation, ledger, and agent-evaluation runners |
| templates/adapters/ | CREATE | JSON command-hook configuration and neutral instruction templates; no executable TypeScript |
| tests/rules.rs, tests/checks.rs, tests/rules_journey.rs | CREATE | Selection, script-obligation, runtime, and output proofs |
| fixtures/adapters/, fixtures/checks/, fixtures/delivery/ | CREATE | Bounded runtime payloads, negative rules, and delivery cases |
| docs/fragments/rules.md, docs/fragments/checks.md | CREATE | Lane-owned docs merged by M07_001 |
| fixtures/packs/, tests/adaptation.rs | CREATE | Project policy/pack extension and reduced-workflow adaptation proofs |

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

Reuse the existing positive/negative rule fixture expectations and glosses from `evals/dispatch/`. Git is the common commit boundary. Host hooks are optional adapters; documented external command invocation is the only supported executable integration.

## Sections (implementation slices)

### §1 — Replace every executable audit obligation with a Rust check

Consume the exhaustive B1 inventory. Replace `audits/*.sh`, `audits/spec-template.ts`, all dispatch leaves and `dispatch/lib.sh`, and all evaluation shell runners with native predicates or Rust development-runner commands. Preserve script outcomes against existing positive/negative fixtures; compare behavior, not grep/awk implementation. Native checkers use the shared snapshot, standard parsers, configured applicability, bounded input, and stable codes.

Audit families include invariance/questionnaire expectations, spec structure, rule paths/ledger, dispatch parity/glosses, doc-read evidence, file/function length, named constants, logging, milestone labels, error registries, Rust error discipline, Zig lifecycle, SQL placement, and design tokens. Keep supported consumer-language rules. Product-specific token vocabularies and source roots come from selected packs/configuration; absent applicability is skipped, whereas an applicable missing checker/configuration is a named failure. A semantic parser limitation remains explicit; never downgrade an existing exact obligation to advisory without user approval.

The Rust development runner owns dispatch positive/negative checks, parity, ledger cases, installed-package checks, invariance negative tests, and coding-agent comprehension fixtures. External coding-agent binaries run only in an explicitly requested live evaluation, with deadline and availability reporting. No embedded Python parser, shell `eval`, or mandatory private agent binary. Inventory reconciliation rejects a missing checker, orphan fixture, unregistered code, altered cap, or silently retired obligation.

Rebuild around a small check kernel and a typed recipe graph instead of reproducing one script per file. A check declares applicable inputs, required exact facts, result schema, and bounded resource use. The scheduler shares snapshot parsing and runs independent pure checks concurrently, then emits results in deterministic order. Nontrivial side effects remain explicit ordered nodes. Existing script names are review inventory, not the native module architecture.

Recipes are data mapping user triggers to allowed check/decision nodes. An open-source library can use capture → assess → test → report without a spec, milestone label, private review bot, or commit ceremony. A mixed monorepo may add security and multi-language rules. Domain packs extend questions, selectors, and policy without forking the engine. Validate behavior on the three project profiles in M07_001; merely detecting a manifest does not prove adaptation.

- **Dimension 1.1** — Every old executable obligation and positive/negative fixture → native result; missing helper or altered cap fails → Test `test_native_checks_preserve_all_script_obligations`
- **Dimension 1.2** — Foreign language tree, configured source roots, absent product tokens, and missing required config → accurate skipped or failed states; no vacuous passed → Test `test_checker_applicability_is_repository_scoped`
- **Dimension 1.3** — Dispatch/ledger/invariance/fixture checks with interpreter binaries absent → native evaluation works; live agent absence is explicitly unavailable → Test `test_native_evaluators_need_no_interpreter`
- **Dimension 1.4** — Small spec-less library and mixed monorepo profiles → different declared recipes through same kernel; mandatory safety remains; no private workflow required → Test `test_recipe_adaptation_needs_no_private_lifecycle`

### §2 — Select immutable rule sections and record complete emission

`orly rules` selects section identifiers from installed language-pack triggers and repository `rules.paths` maps. Parse headings and links with the foundation Markdown parser; missing/ambiguous headings fail selection. Engine sections pass through the same pack filtering and citation rewrite as installed pages, so default and persona-enabled delivery match their installed bytes.

Select deterministic sections first in stable path/heading order. Optional exact-input Jev records can only add existing candidate sections. Unknown identifiers, stale answers, uncalibrated thresholds, or incomplete evidence become reported suggestions; no arbitrary model paths. Limit deterministic output to 64 KiB per attempt and optional additions to a separate 16 KiB allowance. Overflow stays pending; a required section individually larger than the deterministic cap fails explicitly. This protects required text from semantic additions.

Record a delivery only after its entire text is emitted and flushed. The key covers worktree identity, full branch reference, selected source snapshot, area, section, final content digest, and selection-config digest. A changed staged snapshot or rule text is pending again; repeated identical attempts reuse complete records. Keep records in worktree-specific Git state with a lock, atomic writes, 30-day retention, and a 16 MiB cap; eviction causes honest redelivery. A corrupt log means no proof, not successful delivery. Reports count complete emissions by section and channel only.

- **Dimension 2.1** — Rust/TypeScript files, path maps, missing headings, and default/persona filters → deterministic exact installed sections or named error → Test `test_rules_select_exact_rendered_sections`
- **Dimension 2.2** — Valid/stale/uncertain/unknown candidate answers → safe additions or reports; deterministic selections unchanged → Test `test_semantic_selection_can_only_add_known_sections`
- **Dimension 2.3** — Overflow, huge section, broken pipe, changed stage/text, concurrent writer, retention, and corrupt log → pending or redelivery; no false record → Test `test_delivery_requires_complete_snapshot_bound_output`

### §3 — Native commit delivery is runtime-neutral and offline

`rules.delivered` in the native work gate checks required selection against complete-emission records. First attempt emits missing sections and returns failed when any were previously undelivered, giving the agent a chance to inspect them before retry. Each bounded retry advances pending sections; passed requires every required section emitted for the exact evaluated snapshot. A broken output or missing section never advances the log.

The commit checker depends only on Git identity, snapshot/configuration, rule payload, and local records. It reads no Claude Code, Codex, or OpenCode settings, and opens no provider socket. Execute the real native hook under each runtime's absent/present/malformed/unreadable settings to prove neutrality; a forbidden transitive dependency is detected by the test boundary. CI reports delivery skipped because it happens at the authoring commit. Delivery records attest only local emission; remote CI never accepts them as author comprehension.

The doc-read interface is ported to native Rust as `orly docs-read log/check`, preserving required page/section citations. Complete emission and self-reported reading remain separately labeled; neither becomes semantic compliance. Report interrupted delivery and command setup errors with actionable diagnostics. M07_001 connects native hook dispatch and the three feature handlers without feature lanes editing shared command routing.

- **Dimension 3.1** — Actual Git commit under each host-config state → same offline result; first pending attempt fails, complete retry passes; CI explicitly skips → Test `test_native_commit_delivery_is_neutral_and_offline`
- **Dimension 3.2** — Emitted sections without a citation and self-reported read without emission → separately reported obligations; no implied comprehension → Test `test_doc_read_and_emission_proofs_remain_distinct`

### §4 — Host capability adapters invoke the binary without plugins

Provide pre-edit adapters only for officially documented external-command hook surfaces verified at a pinned runtime version. Claude Code and Codex candidates are tested using their documented payload/response shapes before advertising support. The native binary parses bounded tool payloads and returns the runtime's denial/message form on first delivery; it never grants permission, rewrites tool arguments, or overrules another hook. Unsupported tool payloads are explicit unavailable results.

OpenCode receives a native `orly rules --for <path>` instruction/skill entry and the same Git commit guarantee. Do not install `.opencode/plugins/*.ts` or claim automatic before-edit interception without a verified native command surface. This is the explicit replacement for the prior three-plugin promise. Every runtime must be able to invoke the command and see rules; model-visible pre-edit behavior is recorded only where demonstrated.

Adapter installation is planned as typed updates and applied by M07_005's installer at B3. Stable owned identity and prior digest distinguish upgrade from foreign edits. Preflight all adapter destinations; preserve other handlers, refuse symlinks/malformed config/edited owned entries, and replace atomically. `--no-agent-hooks` makes no adapter edits and does not remove user entries. Local failure to find the binary warns without granting permission; the native Git gate remains the backstop. Manual host checks record version, payload, resulting message, and supported guarantee in Session Notes.

- **Dimension 4.1** — Repeated install, owned upgrade/edit, same-matcher foreign entry, malformed/symlink target, and disable option → correct no-loss typed plan → Test `test_adapter_plans_preserve_foreign_entries`
- **Dimension 4.2** — Pinned payload fixtures and malformed/unknown/oversized input → supported denial/no-decision or explicit unavailable; no executable plugin → Test `test_native_adapters_translate_only_supported_payloads`
- **Dimension 4.3** — Implementer invokes rules in Claude Code, Codex, and OpenCode; records actual versions and visible delivery; unsupported interception remains honestly labeled → Test `manual_host_delivery_capabilities`

## Interfaces

```text
orly check [--staged | --all | --for <path>] [--json]
orly rules (--for <path> | --staged | --base <commit>) [--json]
orly rules --report [--json]
orly hooks adapter --runtime claude|codex (bounded tool payload on standard input)
orly docs-read log <path> <section> | check
Configuration: rules.paths maps globs to document/section identifiers.
Local delivery: exact snapshot + section/config digest + channel + complete emission.
All hook/check/rules commands use replay-only judgments and perform no model upload.
orly plan [--staged | --base <commit>] [--replay-only] [--json]
orly run --plan <path> [--json] (revalidate source/policy/engine identity before any node runs)
orly pack check <path> | add <path> (data-only, validated, digest-pinned local extension)
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Lost check | Old executable obligation lacks successor or negative fixture | Audit fails; test_native_checks_preserve_all_script_obligations |
| Wrong applicability | Product/language root guessed | Skipped or failed with reason; test_checker_applicability_is_repository_scoped |
| Incomplete delivery | Large section, overflow, broken output, or stale snapshot | No record; retry pending; test_delivery_requires_complete_snapshot_bound_output |
| Unsafe semantic selection | Model proposes unknown path or drops a required section | Ignore/report unsafe candidate; test_semantic_selection_can_only_add_known_sections |
| Adapter conflict | Foreign/edited entry, malformed file, or symlink | Refuse with user data preserved; test_adapter_plans_preserve_foreign_entries |
| Unsupported host surface | No documented native interception | Command/commit guarantee only; test_native_adapters_translate_only_supported_payloads and manual_host_delivery_capabilities |

## Invariants

1. Every former executable gate has a native successor and behavior proofs; no suppression or weakened rule closes a port gap.
2. Required rule selection is deterministic; Jev additions never remove or displace it.
3. Complete emission is the sole delivery-record event; records are bound to the selected snapshot.
4. Native commit checking has no host configuration dependency and performs no provider request.
5. Host capability claims require the pinned runtime proof; OpenCode needs no TypeScript plugin.
6. Adapter plans preserve foreign content and never grant permission.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Local command evidence | operator | Explicit command completes | States, counts, digests, bounded durations | No source, key, environment, or raw output; stays local | `test_native_checks_preserve_all_script_obligations` |

Existing anonymous telemetry remains opt-in. Feature review adds no source-bearing event or new analytics funnel. Source-bearing evaluation inputs are private local state or explicitly authorized judge transport.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | integration | `test_native_checks_preserve_all_script_obligations` | Every old executable obligation and positive/negative fixture → native result; missing helper or altered cap fails |
| 1.2 | integration | `test_checker_applicability_is_repository_scoped` | Foreign language tree, configured source roots, absent product tokens, and missing required config → accurate skipped or failed states; no vacuous passed |
| 1.3 | integration | `test_native_evaluators_need_no_interpreter` | Dispatch/ledger/invariance/fixture checks with interpreter binaries absent → native evaluation works; live agent absence is explicitly unavailable |
| 1.4 | integration | `test_recipe_adaptation_needs_no_private_lifecycle` | Small spec-less library and mixed monorepo profiles → different declared recipes through same kernel; mandatory safety remains; no private workflow required |
| 2.1 | unit | `test_rules_select_exact_rendered_sections` | Rust/TypeScript files, path maps, missing headings, and default/persona filters → deterministic exact installed sections or named error |
| 2.2 | unit | `test_semantic_selection_can_only_add_known_sections` | Valid/stale/uncertain/unknown candidate answers → safe additions or reports; deterministic selections unchanged |
| 2.3 | integration | `test_delivery_requires_complete_snapshot_bound_output` | Overflow, huge section, broken pipe, changed stage/text, concurrent writer, retention, and corrupt log → pending or redelivery; no false record |
| 3.1 | integration | `test_native_commit_delivery_is_neutral_and_offline` | Actual Git commit under each host-config state → same offline result; first pending attempt fails, complete retry passes; CI explicitly skips |
| 3.2 | unit | `test_doc_read_and_emission_proofs_remain_distinct` | Emitted sections without a citation and self-reported read without emission → separately reported obligations; no implied comprehension |
| 4.1 | integration | `test_adapter_plans_preserve_foreign_entries` | Repeated install, owned upgrade/edit, same-matcher foreign entry, malformed/symlink target, and disable option → correct no-loss typed plan |
| 4.2 | unit | `test_native_adapters_translate_only_supported_payloads` | Pinned payload fixtures and malformed/unknown/oversized input → supported denial/no-decision or explicit unavailable; no executable plugin |
| 4.3 | manual | `manual_host_delivery_capabilities` | Implementer invokes rules in Claude Code, Codex, and OpenCode; records actual versions and visible delivery; unsupported interception remains honestly labeled |

At implementation, apply the unit-test and integration-test skills to every changed Section. Include negative paths and boundary injection; stubs prove local behavior only. Manual proof names the responsible person and durable release Session Notes. Nothing above is marked run.

## Acceptance Rubric (single scoring surface)

A1/A2 quote the current configuration verbatim and remain required through private B1/B2 development. M07_001 switches configuration/Make recipes to Rust atomically with complete native check registration and old-path deletion at B3; update the five rubric declarations in that same change. Future native commands below are lane acceptance requirements, not commands available in this checkout yet.

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Native audit obligation preservation | `cargo test --locked --test checks` | exit 0 | P0 |  |
| R2 | Selection and complete delivery | `cargo test --locked --test rules` | exit 0 | P0 |  |
| R3 | Real native commit journey | `cargo test --locked --test rules_journey` | exit 0 | P0 |  |
| R4 | Native evaluators and fixture parity | `cargo xtask evals --check` | exit 0 | P0 |  |
| R5 | Host capability evidence | `manual_host_delivery_capabilities` | Recorded required proof and thresholds met | P0 |  |
| A1 | Current declared conformance; Rust implementation replaces internals | `make conform` | exit 0 | P0 |  |
| A2 | Current declared unit lane; atomically replaced at B3 | `bun test src` | exit 0 | P0 |  |
| S1 | Native full unit boundary | `cargo test --workspace --locked` | exit 0 | P0 |  |
| S2 | Governance obligations remain enforced | `make audit` | exit 0 | P0 |  |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 |  |
| S4 | Expanded inventory mapping and exclusive scope | `cargo xtask port-check --map` | exit 0; zero unassigned obligations | P0 |  |

## Dead Code Sweep

M07_001 removes all old audit, dispatch, and evaluation executable scripts after this lane proves their native successors. Keep source-language negative fixtures as data. The coherence audit rejects documentation invoking deleted script entry points and checker modules without a routed consumer.

## Out of Scope

- A TypeScript OpenCode plugin or an undocumented promise of before-edit interception.
- Model-context filtering, provider calls during commit, or owner approval inferred from a judgment.
- Retiring human doc-read obligations or changing rule caps to simplify the rewrite.

## Product Clarity (authoring record)

1. **Successful user moment** — An agent committing a Rust edit receives the required rules and a precise failed check before retry.
2. **Preserved user behaviour** — All selected consumer-language checks and manual safety decisions retain their obligations.
3. **Optimal-way check** — One native dispatcher and standard parser replace scattered shell conventions.
4. **Rebuild-vs-iterate** — Rewrite enforcement behavior and delete shell orchestration once native proofs exist.
5. **What we build** — Native predicates, rule selection, delivery state, development evals, and capability-based adapters.
6. **What we do NOT build** — No executable plugin, hidden provider call, or claim that output proves reading.
7. **Fit with existing features** — Shares installed payload and snapshots; optional Jev additions have separate output budget.
8. **Surface order** — Command line and Git first; pre-edit hooks are verified extras.
9. **Dashboard restraint** — Local reports show delivered text/counts and exact unavailable capabilities.
10. **Confused-user next step** — Run `orly rules --for <path>` or read the named check failure.

## Decomposition & alternatives (patch vs refactor)

One lane owns checks plus delivery because both route the same rule identities and immutable sections. Other lanes consume typed results only. A shell wrapper around Rust would keep the original runtime dependency; documented native command hooks replace it.

## Discovery (consult log)

- **Consults** — Reviewed dispatch, every audit/evaluation script family, source-to-target rule mappings, product-specific scopes, and runtime-neutrality limits. OpenCode's TypeScript plugin requirement is superseded by native command/commit delivery. Runtime before-edit capabilities remain an implementation proof, not an assumed platform feature.
- **Metrics review** — No new analytics funnel. Local diagnostics and the existing consented telemetry retain separate privacy rules.
- **Skill-chain outcomes** — Source/spec adversarial review performed during authoring; native implementation, live calibration, platform journeys, and boundary verification remain pending.
- **Deferrals** — None recorded. The explicit native-command OpenCode guarantee replaces the former executable plugin approach; no missing required release proof is treated as deferred.
