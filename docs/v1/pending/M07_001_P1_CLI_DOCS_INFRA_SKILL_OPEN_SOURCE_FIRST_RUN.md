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

# M07_001: One adaptable Rust orly 0.12.0 release realizes Jev decisions in three projects

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 001
**Date:** Sep 30, 2026: 09:48 AM
**Status:** PENDING
**Priority:** P1 — the integration workstream is the only release boundary
**Categories:** Command-Line Interface (CLI), Documentation (DOCS), Infrastructure (INFRA), Agent Skills (SKILL)
**Terms:** Continuous Integration (CI); null-byte-delimited paths; KiB = kibibytes; MiB = mebibytes.
**Batch:** B3 — integrate the complete B2 workstreams; publish no intermediate milestone versions
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report comparison revision, commands, counts, obligations, and environment
**Depends on:** M07_005 foundation, then M07_002, M07_003, and M07_004 in parallel. This workstream joins their tested modules once.
**Provenance:** Revised from the Sep 23 draft by Codex after the Rust/Jev direction on Sep 30, 2026; source review at `c02f1e02806204811401b01596a04ff4c039d02a`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §M07 target: one native engine with bounded Jev judgments
**Target version:** 0.12.0; only M07_001 publishes the combined result after required approval.

---

## Overview

**Goal (testable):** The same native orly version composes Jev decisions and project policy into accurate plans in agentsfleet, a small Rust CLI, and a TypeScript library, without orly-owned shell execution.

**Problem:** The executable depends on Bun (`bin/orly:16–26`), criterion results only contain ok/detail (`src/criteria_support.ts:9–10`), and command seeding leaves documentation surfaces unset (`src/config.ts:242`). The drafts share implementation files and preserve interpreter-based distribution.

**Solution summary:** Join the native foundation, semantic judge, changed-line coverage, and rule delivery behind one CLI. Replace old executable paths, keep human-readable Markdown, and release one payload/version after first-run, migration, platform, and live-Jev proofs pass. The product is a repository decision engine, not a hard-coded reproduction of the current milestone lifecycle. Its common flow is capture immutable facts → obtain typed decisions → compile a bounded plan → run native checks → report evidence. A repository chooses its own triggers and recipes. Existing work/verify/pr verbs are preset entry points into the same engine; new users do not need numbered milestones, a private review skill, or this repository's workflow.

**Determinism boundary:** Rust owns exact facts, validation, execution, and gate status. Jev supplies probabilistic typed semantic answers. Identical validated recorded answers replay reproducibly; fresh inference can vary.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: ship native orly with bounded Jev review`
- **Intent:** Ship the single native open-source release; avoid separately published foundation, migration, or Jev versions.
- **Authoring handshake:** This is a spec/design revision, not implementation or permission to publish.
- **ASSUMPTIONS I'M MAKING:** The target product version is 0.12.0. All five specs stay pending until implementation opens them. Live Jev use is opt-in because it uploads source; its complete native capability is included in every release binary. Deterministic checks work without credentials.
- **Implementer handshake:** pending until PLAN; restate intent, scope, and source authority before code.

## Implementing agent — read these first

1. `docs/ORLY_ARCHITECTURE.md` — M07 target design, ownership, resource bounds, and release sequence.
2. `package.json` — current package/version/payload boundary to replace.
3. `registry.json` — managed sources and selected packs.
4. `src/config.ts` — manifest/command/surface detection to preserve and extend.
5. `.github/workflows/release.yml` — publishing path and approval boundary.
6. https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions — isolation and untrusted pull-request inputs.

## Files Changed (blast radius)

Paths name approved roles. B1 freezes an expanded per-file inventory before implementation; B2 cannot mutate shared files. This document revision touches only pending specs and the canonical architecture.

| File | Action | Why |
|---|---|---|
| src/cli.rs, src/main.rs, src/lib.rs, src/integration/ | EDIT / CREATE | Exclusive B3 command routing and typed feature registration |
| registry.json, core/operating-model.md, AGENTS.md | EDIT / REGENERATE | Register native checkers and neutral sources; never hand-edit generated rules |
| dispatch/*.md, packs/*/*/*.md | EDIT / REGENERATE | Authoritative references move from script commands to native commands; generated pages regenerate |
| skills/orly-spec-new/SKILL.md, skills/orly-write-unit-test/SKILL.md, skills/orly-write-integration-test/SKILL.md, skills/orly-babysit-prs/SKILL.md | EDIT | Native commands, Jev review, owner-neutral approval, optional review bots |
| docs/*.md, docs/greptile-learnings/*.md, README.md, llms.txt | EDIT / REGENERATE | Current guidance, first-run docs, changelog, and generated enforcement ledger; frozen records excluded |
| src/*.ts, audits/*.sh, audits/spec-template.ts, dispatch/*.sh, evals/**/*.sh, evals/test-*.sh, bin/orly, .githooks/pre-commit, .githooks/pre-push | DELETE / REPLACE | Retire every old executable after native replacement proofs |
| package.json, bun.lock, tsconfig.json | DELETE | Retire JavaScript package runtime; no npm wrapper in this release |
| Cargo.toml, Cargo.lock, build.rs, Makefile, .gitignore, .orly/orly.json | EDIT | Final feature resources, native commands, version and packaging closure |
| tools/xtask/src/release.rs, tools/xtask/src/docs.rs, tests/release_journey.rs, tests/github_gate.rs | CREATE | Native release/docs assembly and real consumer/CI proofs |
| fixtures/github-events/, fixtures/release/, templates/github-workflow.yml | CREATE | Event identity and consumer workflow template |
| .github/workflows/release.yml, .github/workflows/test.yml, .github/workflows/harness.yml | EDIT | Approved native build/test/release jobs; existing gitleaks workflow remains |
| docs/v1/pending/*.md | MOVE at completion | One spec-completion and release proof ledger across all workstreams |
| tests/project_trials.rs, fixtures/projects/, docs/PROJECT_TRIALS.md | CREATE | Three-project trial harness, adaptation corpus, and measured proof report |

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

Cargo packaging and native release assets replace npm runtime packaging. Standard Git hooks invoke the binary; project-native tests stay explicit boundaries. Existing installer filtering and owned-entry refusal are preserved. Exact executable inventory comes from M07_005, not an extension-only grep.

## Sections (implementation slices)

### §1 — One executable plan, exclusive parallel work, one release

The five specs form one milestone plan. M07_005 is the cross-cutting fifth workstream and starts first. Its shared-interface revision makes the B2 workstreams independent. The dependency graph is acyclic:

```text
B1  M07_005 Rust foundation + immutable snapshot + schemas + safe migration
       ├─ B2 M07_002 Jev client + bounded questions + exact replay
       ├─ B2 M07_003 lcov mapping + coverage producer evidence
       └─ B2 M07_004 native checks + rule delivery + host capability plans
                 └─ B3 M07_001 assemble + first run + release 0.12.0
```

M07_005 fixes root Cargo/build/config/schema/interfaces and scaffold module seams. B2 lanes edit only their declared module, tests, fixtures, and lane-owned documentation fragments; M07_004 also owns checks and native evaluator implementations. No B2 edits shared command routing, Cargo.lock, registry.json, installer, release workflow, or common Markdown. Propose a needed shared change against the frozen schema; serialize it before dependent lanes continue. Do not infer independence from separate branch names.

Open one worktree per actual implementation lane after its prerequisite revision exists, under the normal lifecycle. Only M07_001 integrates the resulting commits onto the milestone release branch. There is one release Pull Request (PR); internal feature branches do not publish versions or create extra ready milestone PRs. A spec filename keeps its stable identifier even though execution begins with 005. Expand every scoped path in the frozen inventory before code edits; source/gate workflow edits retain their action-triggered approval requirements.

Version authority is the root Cargo package at 0.12.0. Embedded payload, config engine pin, evidence, source package, native assets, and release notes agree. The intended tag is `v0.12.0`. Feature branches and B1/B2 completions are private development states, not user releases.

- **Dimension 1.1** — Spec metadata and frozen inventory → B1/B2/B3 graph with no shared B2 mutation; conflicting scope/cycle fails → Test `test_release_plan_is_acyclic_and_exclusive`
- **Dimension 1.2** — Cargo, binary, config, resources, and release manifest → 0.12.0; missing Jev/coverage/rules module or resource fails → Test `test_release_version_and_payload_are_single`

### §2 — An honest first run works across project ecosystems

Expose `init`, `update`, `doctor`, `render`, `verify`, `gate`, `check`, `rules`, `docs-read`, `coverage`, `judge`, `hooks`, `override`, and existing consent/telemetry behavior through typed native handlers. Preserve meaningful public verbs and explicit error codes; no old path/flag aliases. Init/update preflight before mutation and print planned ownership/surface decisions. JSON mode prints one validated document; human diagnostics use standard error without repeating commands.

Detect surfaces from Cargo.toml package targets/workspaces, package.json exports/bin entries, go.mod roots, and pyproject.toml declared packages. Parse each manifest using standard parsers; Rust-native manifest inspection replaces regex/shell sniffing. Scope ambiguous metadata to an explicit setup diagnostic, never a confident guess. README/docs are documentation candidates; declared commands and surfaces survive init/update. A repository with no supported manifest can supply its own argument vectors and globs. Missing spec or irrelevant language is skipped with a reason; missing proof for an applicable required check fails.

Default installed content contains no personal names, private workspace path, required private vault command, product-specific token list, or mandatory review bot. Persona/product packs remain opt-in. Preserve neutral obligations: explicit owner approval, adversarial review, secrets resolved at runtime, no printed credentials, and all exact gate caps. Check every installed Markdown page, generated host wrapper, skill command, and printable native diagnostic, not just root rules. Fence-aware marker failures refuse before writes; default and persona-enabled requirements have explicit mapping proofs.

Assemble lane-owned documentation into current source pages. Update authoritative pack sources before generated dispatch pages and AGENTS.md. Every current Markdown path has the reviewed inventory disposition; completed specs, review archives, and private notes retain historical text and stay outside the default binary payload. Contributor docs explain how rule/check/question changes add fixtures and mapping; licensing and third-party notices include embedded resources and Rust dependencies.

Default operation does not impose this repository's exact lifecycle or pack set on consumers. Offer a minimal profile first: explicit source facts, relevant questions, native checks, and an inspectable plan. Optional workflow/spec/persona packs add conventions by owner choice. Before applying a plan, validate input, policy, engine, and pack digests against current state; a stale plan never runs. Jev decisions can adapt the bounded task selection, while Rust controls execution and records why each selected task applies.

- **Dimension 2.1** — Fresh Rust, TypeScript, Go, Python, docs-only, and unknown project fixtures → preserved custom values, explicit setup, neutral installed pages, and honest states → Test `test_first_run_is_neutral_and_manifest_aware`
- **Dimension 2.2** — Default/persona outputs, fence markers, source/generated ownership, and updated command examples → mapped obligations, no private leak, and no executable stale caller → Test `test_rendered_requirements_and_docs_have_no_orphans`

### §3 — Secretless CI uses the same event-head engine

`orly gate pr --ci github` reads a bounded pull-request event, records event base tip/head and computed merge base, and requires checkout at the event head. Reject absent objects, unrelated history, unresolved shallow history, mismatched checkout, and pull_request_target before project commands. Base/head overrides must be explicit and appear in evidence; a behind-base policy result remains separately reported. Fetch preparation is workflow-owned, not hidden network work in an offline gate.

Provide a consumer workflow template using pinned external actions, read-only permissions, event-head checkout without persisted credentials, and the pinned verified native binary. No TypeScript/composite-action wrapper and no shell installer. Native release download is a documented action/tooling step; build/release support uses Rust xtask. A differing consumer workflow file refuses unchanged. CI executes untrusted repository commands only in a secretless evaluator job with no judge/provider/publish credential or write token. Cancellation, missing tools, and report upload preserve the original gate exit status. `--no-commands` runs only installed native structural checks; no checkout script or executable configuration runs.

Live judging is a separate maintainer-authorized job that runs no project commands or repository plugins. It obtains the trusted release binary and reads only a validated bounded snapshot produced by the completed evaluator, with event/revision identity, schema, size, allowed field/path checks, and credential scanning. Do not check out and execute the evaluated tree in that job. Forks receive no key and no automatic upload; local replay records cannot affect CI. Source text remains untrusted model input even when schema-valid. Publish source-bearing snapshots only to restricted authorized job transport; do not include them in public job summaries or public evidence downloads. A safe transport proof is mandatory before enabling this optional job; ordinary CI remains entirely secretless.

The native engine emits a state table and bounded evidence for upload even when a criterion fails. Evidence contains digests, relative ranges, counts, and provider status, never raw source/command output/key. Coverage producer identity comes only from that evaluator's installed wrapper. Delivery reports skipped in CI; semantic outages are reported/incomplete, never deterministic green.

- **Dimension 3.1** — Advanced base, merge checkout, shallow/unrelated/missing commits, malicious event, and overrides → exact revision identity or pre-execution refusal → Test `test_github_gate_binds_event_head_and_refuses_unsafe_events`
- **Dimension 3.2** — Hostile checkout, fork event, forged replay/manifest, source snapshot flood, and key sentinel → no secret in evaluator, no project execution in judge, no unsafe upload → Test `test_no_commands_and_ci_job_isolation`
- **Dimension 3.3** — Failed gate, missing artifact step, stdout noise, and sentinel output → original exit preserved and source-free evidence → Test `test_ci_evidence_upload_preserves_failure_and_privacy`

### §4 — Remove old execution paths and prove the native distribution

After all native obligation tests pass, delete the inventoried TypeScript implementation, every executable audit/dispatch/evaluation shell runner, the Bash launcher/generated hook templates, JavaScript package manifest/lock/compiler config, and old workflow runtime setup. Keep consumer-language fixtures and readable rules as data. Native commands own checks and evaluator fan-out; Makefile remains only existing thin development aliases calling Rust tooling, with no eval-based parallel scheduler or new near-duplicate targets.

Release archives contain the native executable, license, checksums, and build/release manifest; all needed rules/questions/schemas are embedded. Build from the same source revision and locked dependency graph. The binary exposes its engine version and canonical payload digest. Test a relocated binary with its executable search path containing only declared native dependencies. No automatic package installation, Bash, Node, Bun, Python, Go runtime, private checkout, or optional coding agent is needed to run orly. Git, gitleaks for required secret scanning, and repository-native test/coverage tools remain explicit external dependencies.

Required native journey matrix: `aarch64-apple-darwin`, `x86_64-apple-darwin`, `aarch64-unknown-linux-musl`, `x86_64-unknown-linux-musl`, and `x86_64-pc-windows-msvc`. Build and actually run init, native Git hooks, migration/retry, and offline checks on each target; cross-compilation alone is insufficient. State unsupported platforms explicitly. Preserve anonymous telemetry consent and bounded spool behavior through Rust; no daemon, implicit consent, source upload, or network at offline hook paths. Network sync is an explicit consented command outside deterministic checking.

Record startup, no-change staged-check, large-change check, and same-state Jev timings against the frozen old implementation on equivalent hardware and fixtures. Chosen acceptance budgets: native help/doctor startup at most 100 ms at the 95th percentile, no-change native staged checks at most 250 ms at the 95th percentile over 30 warm runs, and no greater than 128 MiB peak resident memory for the 1,000-file fixture excluding project test tools. Record cold runs separately. Excess returns to profiling; do not alter gates/caps to meet the budget. Repeat output semantic projection checks separately from timing. M07_002's real held-out provider report is required for release, not replaced by a stub demo.

- **Dimension 4.1** — Expanded executable inventory and archive contents → native successors, embedded resource closure, no old runtime caller, and unchanged historical/consumer data → Test `test_release_contains_no_interpreter_execution_path`
- **Dimension 4.2** — Implementer runs target matrix and equivalent warm/cold fixtures → real platform hook/migration proof and measured budgets in release Session Notes → Test `manual_native_platform_and_performance_report`
- **Dimension 4.3** — No consent/offline hook, consented spool, retry, expiry, and size limit → no implicit network/source event; explicit sync preserves existing bounds → Test `test_telemetry_consent_survives_native_port`

### §5 — Join every proof before one release

The real subprocess release journey uses the packaged binary in fresh and migrated Rust and TypeScript projects. Show accurate skipped states, a native failing check, rules delivered before retry, an initially untested changed function then a passing called test, a bounded authorized Jev answer, exact offline replay, and mutation invalidation. Additional manifest fixtures prove Go/Python setup and supported exact checks. Live Jev smoke and the held-out report are distinct required provider proofs.

Atomically switch the repository config to `.orly/orly.json`, the declared unit lane to `cargo test --workspace --locked`, and integration to `cargo test --locked --test release_journey`; switch existing Make recipes only now. Run native conformance, the full declared unit/integration set, exact secret scan, port inventory closure, package closure, current documentation examples, source/generated parity, invariance questionnaire, and live comprehension evaluation where semantics changed. Baselines record the full comparison revision, old-framework counts, native-framework counts, and preserved obligation totals without pretending cross-language test totals are directly comparable. Every Section Dimension has a proof; every failure has a negative test. No fabricated owner labels or host-support proof.

One version bump and one release manifest happen after all five specs' required outcomes are met. Complete CHORE(close), move complete specs to done, update user docs/release notes, and run `orly gate pr` against the final pushed revision. Pushing a development branch is not publishing the native release. Publishing the tag/assets or changing protected workflow/harness rules needs the implementation session's explicit approval; this spec revision grants no release action. If a required workstream or proof is incomplete, 0.12.0 is not released under another name.

Required adaptability trial matrix:

| Project | Evidence/profile | What must be demonstrated |
|---|---|---|
| `agentsfleet` mixed repository | Read-only source inspection at `e5a6964797dd2b841988d5ddbc730834947c5374`; `rustd/Cargo.toml`, `cli/package.json`, `build.zig`, shell source, architecture/Traps | Correct multi-root Rust/TypeScript/Zig/shell scope, applicable decisions, project rules, command working directories, and custom hooks preserved |
| Small Rust command-line project | Self-contained tracked fixture with Cargo, a function/error path, tests, README, and a domain question pack | Useful minimal plan with no milestone/spec/private skill; adding the domain decision uses a data pack, not engine edits |
| TypeScript library project | Self-contained tracked fixture with public exports, tests, README, and a distinct policy/score rubric | Public-change Noul, assertion-strength Score, recipe Choice, custom thresholds, and no Rust-only consumer assumptions |

Run trials in isolated scratch copies with no source-repository writes, no installed hook changes in the real `agentsfleet` checkout, no live project credentials, and no project command until its explicit allowlisted vector is part of the trial. Read-only source capture is permitted; executing full application environments or rewriting sibling consumers is a separate user-authorized action. Record exact source revision, profile/pack/model versions, supported versus unavailable builders, changed-file fixtures, decisions, plan nodes, commands, outputs, setup friction, latency, token use, replay equality, and failure recovery. Each profile has positive, quiet, uncertain, conflicting-policy, malicious-text, missing-tool, stale-plan, and offline cases. Rust/TypeScript have real coverage journeys; Zig/shell get native fact/rule/decision proofs and explicit missing-coverage states until a producer is declared. For `agentsfleet`, replay the actual caller map in docs/ORLY_ARCHITECTURE.md: owned hooks and no-hook update, engine mismatch refusal, builtin conformance without gate recursion, index/clean-index remote/pushed-range scope, resource-class scheduling, Rust working-directory/toolchain and active user-surface roots, live Zig runner unit obligations, and isolated datastore prerequisites. Preserve all declared full-boundary commands; scoped trial evidence cannot claim the full application passed.

For each profile, add a new rule/decision, change a threshold using the same recorded raw answers, and move a source root. Acceptance: no Rust engine change for those declared data-pack/policy adaptations; all plan nodes remain known and executable or explicitly blocked; identical replay produces identical plan digests; no orly-owned interpreter executes. Require at least 12 labeled decision scenarios per profile, including all three primitive types, and at least one real assessment with Jev plus offline replay. Publish no 0.12.0 until the trial report covers all three projects. Feature presence alone is not evidence of adaptability.

- **Dimension 5.1** — One relocated packaged version in fresh/migrated Rust/TypeScript repos → checks, coverage, delivery, authorized judge, replay, and stale-input refusal operate together → Test `test_release_journey_combines_all_features`
- **Dimension 5.2** — Missing proof/module/resource, wrong version, incomplete spec, or stale pushed revision → release gate refuses → Test `test_release_boundary_rejects_partial_feature_sets`
- **Dimension 5.3** — Three profiles and added rule/threshold/root → data-only adaptation, fixed replay and stale-plan refusal; agentsfleet caller map → pin/owned-hook/scope/resource/root/toolchain/runner obligations preserved; no sibling mutation → Test `test_three_project_adaptation_and_stale_plan_refusal`
- **Dimension 5.4** — Implementer records Jev Choice/Noul/Score assessment plus replay and scoped native commands for all three projects → complete trial report in docs/PROJECT_TRIALS.md → Test `manual_three_project_live_decision_trials`

## Interfaces

```text
orly --version                 reports 0.12.0 and payload identity via JSON version output
orly init [--ci github] [--no-hooks] [--no-agent-hooks] [--dry-run] [--json]
orly gate work|verify|pr [--staged | --base <commit>] [--ci github] [--no-commands] [--json]
orly judge --spec <path> --allow-upload --json
orly rules --for <path>
orly coverage run --json
orly telemetry sync            explicit consented network path; offline gates do not sync
One root Cargo version; tag v0.12.0; native assets share source revision and payload digest.
Normal gate success means required exact checks completed; advisory results remain separately visible.
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Partial release | Missing workstream, wrong version, or absent embedded question | Release blocked; test_release_boundary_rejects_partial_feature_sets |
| Wrong CI revision | Merge/shallow/unrelated or missing event head | Refuse before commands; test_github_gate_binds_event_head_and_refuses_unsafe_events |
| Credential crossover | Project command in a credential-bearing job | Invalid job plan; test_no_commands_and_ci_job_isolation |
| Residual interpreter | Executable script or stale command example survives | Inventory/package audit fails; test_release_contains_no_interpreter_execution_path |
| Persona/source leak | Private requirement or raw snapshot in public evidence | Neutrality/privacy check fails; test_first_run_is_neutral_and_manifest_aware and test_ci_evidence_upload_preserves_failure_and_privacy |
| Unavailable platform/provider proof | Cross-compile only or missing live Jev run | Release incomplete; manual_native_platform_and_performance_report and M07_002 manual_judge_labels_and_held_out_report |

## Invariants

1. One public engine version contains every required workstream and resource; release validation rejects partial sets.
2. B2 file scopes are disjoint and depend only on the frozen B1 interfaces; shared edits are serialized.
3. The same installed Rust engine owns local and CI exact checks; offline mode executes no evaluated-tree script.
4. Untrusted project execution receives no provider/publish key; the live judge job executes no evaluated-tree code.
5. Default rules/skills assume no personal setup; historical records and selected consumer languages retain their meaning.
6. Every removed executable has a tested native successor and every current caller uses it before release.
7. Minimal consumers require no milestone lifecycle; data-only policy/pack adaptation is proven in three distinct projects.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Local command evidence | operator | Explicit command completes | States, counts, digests, bounded durations | No source, key, environment, or raw output; stays local | `test_release_plan_is_acyclic_and_exclusive` |

Existing anonymous telemetry remains opt-in. Feature review adds no source-bearing event or new analytics funnel. Source-bearing evaluation inputs are private local state or explicitly authorized judge transport.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | integration | `test_release_plan_is_acyclic_and_exclusive` | Spec metadata and frozen inventory → B1/B2/B3 graph with no shared B2 mutation; conflicting scope/cycle fails |
| 1.2 | integration | `test_release_version_and_payload_are_single` | Cargo, binary, config, resources, and release manifest → 0.12.0; missing Jev/coverage/rules module or resource fails |
| 2.1 | e2e | `test_first_run_is_neutral_and_manifest_aware` | Fresh Rust, TypeScript, Go, Python, docs-only, and unknown project fixtures → preserved custom values, explicit setup, neutral installed pages, and honest states |
| 2.2 | integration | `test_rendered_requirements_and_docs_have_no_orphans` | Default/persona outputs, fence markers, source/generated ownership, and updated command examples → mapped obligations, no private leak, and no executable stale caller |
| 3.1 | integration | `test_github_gate_binds_event_head_and_refuses_unsafe_events` | Advanced base, merge checkout, shallow/unrelated/missing commits, malicious event, and overrides → exact revision identity or pre-execution refusal |
| 3.2 | integration | `test_no_commands_and_ci_job_isolation` | Hostile checkout, fork event, forged replay/manifest, source snapshot flood, and key sentinel → no secret in evaluator, no project execution in judge, no unsafe upload |
| 3.3 | integration | `test_ci_evidence_upload_preserves_failure_and_privacy` | Failed gate, missing artifact step, stdout noise, and sentinel output → original exit preserved and source-free evidence |
| 4.1 | integration | `test_release_contains_no_interpreter_execution_path` | Expanded executable inventory and archive contents → native successors, embedded resource closure, no old runtime caller, and unchanged historical/consumer data |
| 4.2 | manual | `manual_native_platform_and_performance_report` | Implementer runs target matrix and equivalent warm/cold fixtures → real platform hook/migration proof and measured budgets in release Session Notes |
| 4.3 | integration | `test_telemetry_consent_survives_native_port` | No consent/offline hook, consented spool, retry, expiry, and size limit → no implicit network/source event; explicit sync preserves existing bounds |
| 5.1 | e2e | `test_release_journey_combines_all_features` | One relocated packaged version in fresh/migrated Rust/TypeScript repos → checks, coverage, delivery, authorized judge, replay, and stale-input refusal operate together |
| 5.2 | integration | `test_release_boundary_rejects_partial_feature_sets` | Missing proof/module/resource, wrong version, incomplete spec, or stale pushed revision → release gate refuses |
| 5.3 | integration | `test_three_project_adaptation_and_stale_plan_refusal` | Three profiles and added rule/threshold/root → data-only adaptation, fixed replay and stale-plan refusal; agentsfleet caller map → pin/owned-hook/scope/resource/root/toolchain/runner obligations preserved; no sibling mutation |
| 5.4 | manual | `manual_three_project_live_decision_trials` | Implementer records Jev Choice/Noul/Score assessment plus replay and scoped native commands for all three projects → complete trial report in docs/PROJECT_TRIALS.md |

At implementation, apply the unit-test and integration-test skills to every changed Section. Include negative paths and boundary injection; stubs prove local behavior only. Manual proof names the responsible person and durable release Session Notes. Nothing above is marked run.

## Acceptance Rubric (single scoring surface)

A1/A2 quote the current configuration verbatim and remain required through private B1/B2 development. M07_001 switches configuration/Make recipes to Rust atomically with complete native check registration and old-path deletion at B3; update the five rubric declarations in that same change. Future native commands below are lane acceptance requirements, not commands available in this checkout yet.

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Complete first-run and combined feature journey | `cargo test --locked --test release_journey` | exit 0 | P0 |  |
| R2 | Event identity, isolation, and source-free evidence | `cargo test --locked --test github_gate` | exit 0 | P0 |  |
| R3 | Native distribution and executable inventory closure | `cargo xtask release-check` | exit 0 | P0 |  |
| R4 | Three-project live adaptability proof | `manual_three_project_live_decision_trials` | Recorded required proof and thresholds met | P0 |  |
| R5 | Native target journeys and performance | `manual_native_platform_and_performance_report` | Recorded required proof and thresholds met | P0 |  |
| A1 | Current declared conformance; Rust implementation replaces internals | `make conform` | exit 0 | P0 |  |
| A2 | Current declared unit lane; atomically replaced at B3 | `bun test src` | exit 0 | P0 |  |
| S1 | Native full unit boundary after B3 | `cargo test --workspace --locked` | exit 0 | P0 |  |
| S2 | Governance obligations remain enforced | `make audit` | exit 0 | P0 |  |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 |  |
| S4 | Expanded inventory and scope closure | `cargo xtask port-check --closure` | exit 0; zero unassigned/retired reachable paths | P0 |  |

## Dead Code Sweep

Delete the exact executable inventory assigned here: TypeScript engine/tests, audit/dispatch/evaluation runners, launcher/hook script templates, and JavaScript runtime metadata. Native `cargo xtask port-check --closure` expands the frozen comparison inventory and requires zero unassigned or reachable retired executable paths. Search active registry, hooks, skills, Makefile, workflows, docs, and native source for each retired path/command. Historical records and consumer-language fixtures are classified data, not a runtime escape hatch.

## Out of Scope

- Publishing B1/B2 as separate versions, npm runtime wrapper, daemon, or hosted service.
- Editing another repository or silently migrating its owned callers.
- Model-based approvals, overrides, secret suppressions, or probabilistic exact-gate enforcement.
- Guaranteed automatic pre-edit interception on an unsupported host.

## Product Clarity (authoring record)

1. **Successful user moment** — A maintainer uses the same binary on a mixed monorepo and a small library; Jev supplies constrained choices and Rust produces the right bounded plan.
2. **Preserved user behaviour** — Custom commands/hooks remain owned by the maintainer; selected language support and neutral safety rules remain.
3. **Optimal-way check** — One embedded Rust executable removes runtime setup; explicit native project tools keep test authority local.
4. **Rebuild-vs-iterate** — A first-principles rewrite is warranted because script/runtime distribution is the problem itself.
5. **What we build** — One integrated binary, readable payload, honest evidence, safe migration, and verified native distribution.
6. **What we do NOT build** — No intermediate public versions, npm wrapper, daemon, or hidden source upload.
7. **Fit with existing features** — Combines all four prerequisite workstreams without requiring separate installs or user coordination.
8. **Surface order** — Command line first; CI invokes the same engine and version.
9. **Dashboard restraint** — Show what was checked, skipped, reported, or incomplete; avoid an overall quality badge.
10. **Confused-user next step** — Use `orly doctor` and the first-run guide; each failure identifies its required setup or source.

## Decomposition & alternatives (patch vs refactor)

M07_005 creates shared boundaries, three B2 lanes implement independent features, and this lane joins them once. Keeping separate overlapping feature edits would serialize integration and risk contradictory command/schema changes. A single native release is the user-requested product boundary.

## Discovery (consult log)

- **Consults** — User direction on Sep 30, 2026: "getting rid of the typescript, shell scripts and go with rust"; "I will need 1 version when that is pushed that is the new orly with JEV in it." This revision supersedes the old Bun/runtime plugin sequence. Existing version 0.10.14 is confirmed by package.json and .oracle/orly.json; 0.12.0 is the retained target from the pending milestone, not a published result. Subsequent user direction explicitly rejects copying the current process, requests extendable/adaptable decisions using Jev System One primitives, and requires trials including `agentsfleet`. Read-only inspection confirmed Rust at rustd/Cargo.toml, TypeScript at cli/package.json, Zig at build.zig, and existing Make-based project commands; no sibling edits were made.
- **Metrics review** — No new analytics funnel. Local diagnostics and the existing consented telemetry retain separate privacy rules.
- **Skill-chain outcomes** — Source/spec adversarial review performed during authoring; native implementation, live calibration, platform journeys, and boundary verification remain pending.
- **Deferrals** — None recorded. The explicit native-command OpenCode guarantee replaces the former executable plugin approach; no missing required release proof is treated as deferred.
