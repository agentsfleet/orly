<!--
SPEC AUTHORING RULES (load-bearing — the one comment that survives):
- Body order = the executing agent's read order. Fill via the orly-spec-new
  skill (authoring order lives there); after filling, DELETE every "tpl:"
  guidance comment — the SPEC TEMPLATE GATE blocks tpl residue, unfilled
  slots, and missing required sections (audits/spec-template.sh --staged).
- No time/effort/hour/day estimates anywhere. No effort columns, complexity
  ratings, percentage-complete, implementation dates, assigned owners.
- Priority (P0/P1/P2/P3) is the only sizing signal; Dependencies are the only
  sequencing signal. A section that contradicts these rules loses — delete it.
-->

# M06_001: Every written rule reaches the agent that must obey it

**Prototype:** v1.0.0
**Milestone:** M06
**Workstream:** 001
**Date:** Aug 27, 2026
**Status:** IN_PROGRESS
**Priority:** P1 — rules that never reach a runtime are enforcement the corpus only claims to have
**Categories:** GOV, CLI, DOCS
**Batch:** B1 — one delivery path from pack source to the runtime that reads it
**Branch:** `feat/m06-harness-robustness`
**Test Baseline:** unit=148 integration=0
**Depends on:** none
**Provenance:** LLM-drafted (Claude, Aug 27, 2026) from Indy's cross-runtime instruction audit
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §Topology and §Gates

---

## Overview

**Goal (testable):** Every pack file a repository selects matches its source in the checkout that reads it, the DOC READ recorder exists wherever the rule demanding it lands, the Rust error discipline fails a machine rather than only a reviewer, and one lifecycle stage runs one boundary command instead of the same suite at three cadences.

**Problem:** A cross-runtime audit of a consuming repository found four gaps, each of which lets a written rule govern nothing. The authoring checkout's `dispatch/write_rust.md` carries 1,776 bytes against a 9,971-byte pack source, so the entire Rust error discipline is absent from the copy the coverage audit and this repository's own agents read — and no check compares the two. `audits/doc-read.sh` belongs to no pack, so the DOC READ GATE that the operating model states as a recorded proof lands in consumers as a self-report against a command that is not there. Rust error handling is tagged judgment-only, so the standard the operating model calls mandatory is enforced by review alone. And the same lint and unit suites run at EXECUTE, at COMMIT, at push, and again inside the Pull Request (PR) gate, because the prose says "always" where it means "before the boundary".

**Solution summary:** Add a source-versus-target parity check to `orly verify`, so a pack file that drifts in the checkout that authors it is a red render check rather than an invisible divergence, and repair the two drifted copies. Ship `audits/doc-read.sh` and its library through `universal.authoring`, so the recorder exists in every repository whose rules cite it. Give Rust a deterministic façade — `dispatch/write_rust.sh` over a new `audits/rust-error.sh` leaf — that fails the two mechanically decidable halves of RULE ERR-RS: a `map_err` that stringifies its cause, and a crate that declares an error type with no `Result` alias beside it. Tier the cadence prose so CONFORM stays per-edit, the declared `verify.*` set runs once at the milestone boundary, and `orly gate pr` is the named close command rather than the whole chain. Then cut the context every session pays for: the opt-in persona pack keeps voice and hands its five engineering clauses to the always-on packs, and the four packaged skill descriptions shrink to fit a fixed host skills budget.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(gov): prove every rule reaches the runtime that obeys it`
- **Intent:** Close the delivery gaps between a written rule and the agent bound by it, and stop charging every session for context that enforces nothing.
- **Handshake:** Before EXECUTE, restate the intent and list `ASSUMPTIONS I'M MAKING: …`. A mismatch stops execution.

## Implementing agent — read these first

1. `src/verify.ts` — owns the render proofs `orly verify` reports, the new parity proof, and the evidence file it writes.
2. `src/install.ts` — `planFiles` skips copying a pack file into the checkout that owns it, which is the reason a hand-edited target can drift from its source unnoticed.
3. `registry.json` — the pack-to-file map; a file reaches a consumer only through a `managed_files` row.
4. `dispatch/lib.sh` — the dispatch framework every deterministic façade sources, and the `DISPATCH_GLOSS` map a new code must join.
5. `evals/dispatch/coverage.sh` — the five-artifact coherence audit a new deterministic code has to satisfy: tag, row, fixture, gloss, legend.
6. `audits/doc-read.sh` and `audits/rule-ledger-lib.sh` — the recorder and the façade-scope resolver it shares with the ledger.

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `docs/v1/active/M06_001_P1_GOV_CLI_HARNESS_ROBUSTNESS.md` | CREATE, then MOVE through lifecycle directories | Record intent, tests, and evidence |
| `src/verify.ts` | EDIT | Own the pack source-versus-target parity comparison and report it beside the render proofs |
| `src/install.ts` | EDIT | Export `managedContent` so one definition decides what bytes belong at a managed target |
| `src/verify.test.ts` | EDIT | Prove parity passes on a matched tree, fails on a drifted one, and reaches `orly verify` |
| `dispatch/write_rust.md`, `dispatch/write_go.md` | EDIT | Restore the drifted copies to their pack sources |
| `packs/language/rust/rules.md` | EDIT | Carry the enforcement tags the new leaf answers |
| `dispatch/write_rust.sh` | CREATE | Give Rust its deterministic façade |
| `audits/rust-error.sh` | CREATE | Decide the mechanical half of RULE ERR-RS |
| `dispatch/lib.sh`, `docs/greptile-learnings/RULES.md` | EDIT | Register the new code's gloss in both mirrors |
| `evals/dispatch/run.sh`, `evals/dispatch/fixtures/err_rs_*.rs` | EDIT, CREATE | Pin acceptance and rejection for the new code |
| `registry.json` | EDIT | Ship the recorder, its library, and the Rust façade to consumers |
| `src/install_packs.test.ts` | EDIT | Prove the shipped recorder runs in the repository it lands in |
| `core/operating-model.md` | EDIT | Tier the verification cadence and rehome the persona pack's engineering clauses |
| `dispatch/verify.md`, `docs/VERIFY_TIERS.md` | EDIT | Replace the retired-lane claim and state the two cadences |
| `SOUL.md` | EDIT | Stop claiming a reporting-only criterion enforces the banned-word list |
| `skills/orly-*/SKILL.md` | EDIT | Fit four descriptions inside a fixed host skills budget |
| `audits/data.sh`, `audits/agents-md.md` | EDIT | Register the new façade and question the new rule |
| `docs/RULE_ENFORCEMENT.md` | EDIT | Regenerate the ledger scoreboard against the new tags |
| `AGENTS.md` | EDIT | Re-render this repository's own rules from the edited sources |
| `package.json` | EDIT | Release the completed work as Orly 0.8.0 |

## Applicable Rules

- `dispatch/edit_rules.md` — `core/**`, `packs/**`, `src/**`, `registry.json`, `dispatch/`, and audits all require the governance audit, the questionnaire, and generated evidence.
- `dispatch/write_rust.md` §Error discipline — the standard the new leaf mechanises; the leaf must decide only what the prose already binds.
- `dispatch/write_shell.md` — quoted expansions, array arguments, and no untrusted `eval` in the new leaf and façade.
- `dispatch/write_ts_adhere_bun.md` §1, §2, §9 — narrow functions-modules, boundary validation, Bun tests for the parity check.
- `dispatch/write_any.md` — File & Function Length, UFS named constants, and the legacy-workaround family apply to new source.
- `docs/greptile-learnings/RULES.md` — RULE NDC removes nothing dead behind, RULE UFS names the new literals, RULE FLL bounds the new files.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| SPEC TEMPLATE GATE | yes | `bash audits/spec-template.sh --staged` passes before spec commits |
| Invariance Suite | yes | `make audit` green, questionnaire all-YES, `bin/orly verify --write-evidence` current |
| Dispatch coverage | yes | the new code carries tag, `.sh` row, pass+fail fixture, gloss, and legend row |
| DOC READ | yes | every triggered façade is read at its current content before the staged edit |
| File & Function Length | yes | the new leaf and façade stay leaf-sized; the parity helper is one function |
| UFS | yes | pattern strings, modes, and messages in the new leaf are named constants |
| LOGGING | delegated | the new shell leaf prints verdict rows through the dispatch framework, not ad-hoc output |

## Prior-Art / Reference Implementations

- **`audits/logging.sh`** — the closest leaf in shape: `--staged` versus full-tree modes, `git ls-files` discovery, Rust path carve-outs for `tests/`, `benches/`, `examples/`, and `build.rs`, and a one-line summary on success. The new Rust leaf copies that skeleton rather than inventing a second convention.
- **`dispatch/write_sql.sh`** — the smallest complete deterministic façade: source `lib.sh`, `dispatch_init`, resolve, header, gates, verdict. The Rust façade follows it exactly.
- **`src/references.ts`** — already walks a staged tree comparing what a rule cites against what a pack provides; source-versus-target parity is the same shape of question asked of bytes rather than citations.
- **`evals/dispatch/run.sh` Rust logging fixtures** — `log_ok.rs` and its failing sibling establish the fixture pair convention, sandbox destination paths, and expected-exit column the new fixtures reuse.
- **gstack host skill metadata** — Codex renders every skill's description into a fixed context budget and truncates when the set overflows, which is the constraint the four shortened descriptions answer.

## Sections (implementation slices)

### §1 — A pack file matches its source in the checkout that reads it — DONE

`planFiles` skips writing a managed file into the checkout that owns its source, so the authoring copy is maintained by hand and drifts silently. Two copies had already drifted. Parity becomes a render-tier check: for every `managed_files` row whose target exists in this checkout and whose source is a different path, the bytes must match, and the drifted copies are restored.

- **Dimension 1.1** — DONE — a matched tree reports parity clean and a drifted target names the pack, the source, and the target → Tests `pack targets match their sources`, `a matched pack target reports clean`, and `pack target drift names the pack and both paths`
- **Dimension 1.2** — DONE — a target absent from the checkout is silence rather than a finding, because a consumer-only path is not drift → Test `a pack target the checkout does not carry is not drift`
- **Dimension 1.3** — DONE — `orly verify` reports the parity check beside the render proofs and fails when it fails → Test `verify reports pack source parity beside the render proofs`
- **Dimension 1.4** — DONE — `dispatch/write_rust.md` and `dispatch/write_go.md` byte-match their pack sources → Test `pack targets match their sources` over the real tree

### §2 — The recorder ships wherever the rule that needs it lands — DONE

The operating model tells every agent to record a triggered read with `bash audits/doc-read.sh log <path>`, and the consuming repository has no such file: the pack that carries the rule never carried the script. `universal.authoring` gains the recorder and the library it sources, so the command exists in every repository whose rules cite it.

- **Dimension 2.1** — DONE — `universal.authoring` manages `audits/doc-read.sh` and `audits/rule-ledger-lib.sh` → Test `installs with the authoring pack and runs where it lands`
- **Dimension 2.2** — DONE — the shipped pair runs in the repository it lands in: `log` records and `check` reports, so an incomplete shipment fails at run time rather than passing as a copied file → Test `installs with the authoring pack and runs where it lands`

### §3 — Rust error discipline fails a machine

RULE ERR-RS is written, cited by the doc-read map, and enforced by nobody: Rust carries no deterministic façade at all. `dispatch/write_rust.sh` runs `audits/rust-error.sh`, which decides the two halves of the rule that need no judgment — a `map_err` that stringifies its cause into an error type, and a crate declaring an error type with no `Result` alias beside it. Everything the rule leaves to taste stays a judgment row.

- **Dimension 3.1** — a `map_err` closure converting its cause through `to_string()` or `format!` fails, and one adding context without stringifying passes → Fixtures `err_rs_map_err_to_string.rs` and `err_rs_ok.rs`
- **Dimension 3.2** — a crate declaring `pub enum Error` or `pub struct Error` with no `pub type Result<` beside it fails → Fixture `err_rs_no_result_alias.rs`
- **Dimension 3.3** — test modules, `tests/`, `benches/`, `examples/`, and `build.rs` are carved out, matching the logging leaf's Rust scope → Fixture `err_rs_test_ok.rs`
- **Dimension 3.4** — the new code carries a tag in the façade prose, a row in the `.sh`, a gloss in both mirrors, and a pass+fail fixture pair → `evals/dispatch/coverage.sh` green

### §4 — One stage, one boundary run

The cadence prose says the declared `verify.*` set runs "always", which reads as every done-claim; the same suites then run again in the hooks and a third time inside a bare `orly gate`. The prose is tiered instead: CONFORM stays per-edit, the section-scoped lane proves a section, the declared set runs once at the milestone boundary, and `orly gate pr` is the close command. Two retired-lane claims that now contradict the declared integration command are removed, and one false enforcement claim is corrected.

- **Dimension 4.1** — `dispatch/verify.md` and `docs/VERIFY_TIERS.md` state the section and milestone cadences and no longer claim no lane needs live datastores → Test `verify_tiers_state_both_cadences`
- **Dimension 4.2** — the operating model names `orly gate pr` as the close command and makes the integration skill conditional on a real-input/output boundary, matching `dispatch/verify.md` → Test `operating_model_names_the_pr_gate_at_close`
- **Dimension 4.3** — `SOUL.md` no longer claims `orly gate verify` enforces the banned-word list, which `docs.language` reports without failing → Test `soul_does_not_claim_docs_language_gates`

### §5 — Less context, same enforcement

The opt-in persona pack carries five engineering clauses among its voice: reference canon, sibling-repository precedent, vault resolution, symlinked-edit routing, and dotfiles backup. A repository dropping the persona silently drops those rules too. They move to the always-on packs, so persona becomes what its name claims. Four packaged skill descriptions shrink to fit a fixed host skills budget.

- **Dimension 5.1** — the five engineering clauses render for a repository that takes no persona pack → Test `engineering_clauses_survive_without_the_persona_pack`
- **Dimension 5.2** — each packaged skill description fits the budget bound → Test `packaged_skill_descriptions_stay_within_budget`

## Interfaces

```text
orly verify
  render.local.idempotent      unchanged
  render.all.idempotent        unchanged
  generated.root.current       unchanged
  packs.sources.current        NEW — every managed_files target present in this
                               checkout byte-matches its source

dispatch/write_rust.sh <file.rs> [...]   explicit targets (EXECUTE)
dispatch/write_rust.sh --staged          staged *.rs (CONFORM, pre-commit)
  ERR-RS   deterministic — audits/rust-error.sh
  FLL      deterministic — file length
  NDC/NLR  judgment rows

audits/rust-error.sh [--staged|--all]
  exit 0   no finding
  exit 1   >=1 finding, each printed as path:line with its rule half

registry.json
  universal.authoring += audits/doc-read.sh, audits/rule-ledger-lib.sh
  language.rust       += dispatch/write_rust.sh, audits/rust-error.sh
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|------|-------|--------------------------------------------------------|
| Pack target unreadable | A managed target exists but cannot be read | Parity reports it as drift naming the path, never a silent pass |
| Pack target absent | The row targets a consumer-only path | No finding; absence is not drift |
| Recorder without a git directory | The leaf runs outside a work tree | `log` returns success and writes nothing, as it does today |
| Rust leaf with no crate manifest | A staged `.rs` sits outside any Cargo crate | The alias half is skipped for that file; the `map_err` half still runs |
| Rust leaf false positive | A `map_err` legitimately renders a foreign type for display | The row is deterministic and blocking; the escape is restructuring, or the documented dispatch override |
| Skill description over budget | A future edit grows a description past the bound | The unit test fails before the host silently truncates it |
| Cadence prose disagreeing with the config | A repository declares an integration command the tiers deny | The tier document states the declared set is the source of truth |

## Invariants

1. A managed file present in this checkout equals its pack source — enforced by `packs.sources.current` and its tests.
2. A rule that names a command ships that command in the same pack — enforced by the recorder's `managed_files` rows.
3. A deterministic code has a tag, a row, a fixture pair, and one gloss in both mirrors — enforced by `evals/dispatch/coverage.sh`.
4. The Rust leaf decides only what the written rule already binds — enforced by fixtures pinned to the prose examples.
5. Engineering enforcement never depends on an opt-in persona pack — enforced by a render test with the persona excluded.
6. `orly verify` fails when any proof fails — enforced by the aggregate exit test.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|----------------|-------|------------|--------------------|---------------|------------|
| `orly_command_run` | product | `orly verify` finishes with the new check in its set | command, outcome, duration, version, invocation | existing closed schema; the new check adds no property | `verify_reports_pack_source_parity` |
| `ERR-RS` verdict row | governance | `dispatch/write_rust.sh` runs over staged Rust | code, glyph, leaf script, mode | prints paths inside the repository only | `evals/dispatch/run.sh` fixture pair |

No new event name and no new property enter the telemetry schema; the parity check is observed through the command outcome that already exists.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|-----------|------|------|---------------------------------------------|
| 1.1 | unit | `pack targets match their sources` | the real tree reports zero parity findings |
| 1.1 | unit | `pack target drift names the pack and both paths` | a byte-changed target yields one finding naming pack, source, and target |
| 1.2 | unit | `a pack target the checkout does not carry is not drift` | a row whose target is missing yields no finding |
| 1.3 | unit | `verify reports pack source parity beside the render proofs` | `verifyRenders` includes `packs.sources.current` and reports pass on a matched tree |
| 2.1 | integration | `installs with the authoring pack and runs where it lands` | a real install into a fresh repository writes both the recorder and its library |
| 2.2 | integration | `installs with the authoring pack and runs where it lands` | `bash audits/doc-read.sh log` then `check` both exit 0 inside the installed repository |
| 3.1 | integration | `err_rs_map_err_to_string` fixture | a stringifying `map_err` exits 1; the context-adding sibling exits 0 |
| 3.2 | integration | `err_rs_no_result_alias` fixture | an error type with no alias beside it exits 1 |
| 3.3 | integration | `err_rs_test_ok` fixture | a `#[cfg(test)]` module carrying both shapes exits 0 |
| 3.4 | integration | `evals/dispatch/coverage.sh` | the new code passes tag, row, fixture, gloss, and legend checks |
| 4.1 | unit | `verify_tiers_state_both_cadences` | the tier document names the section lane and the milestone set and carries no retired-lane claim |
| 4.2 | unit | `operating_model_names_the_pr_gate_at_close` | the rendered rules name `orly gate pr` at CHORE(close) and make the integration skill conditional |
| 4.3 | unit | `soul_does_not_claim_docs_language_gates` | `SOUL.md` states the criterion reports rather than enforces |
| 5.1 | unit | `engineering_clauses_survive_without_the_persona_pack` | a render without persona still carries all five clauses |
| 5.2 | unit | `packaged_skill_descriptions_stay_within_budget` | every packaged skill description is at most 320 characters |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | Pack sources reach this checkout and drift is a red check (§1) | `bun test src/verify.test.ts` | exit 0 | P0 | pending |
| R2 | The recorder and the Rust façade ship through packs (§2, §3) | `bun test src/install_packs.test.ts` | exit 0 | P0 | pending |
| R3 | The new deterministic code is coherent across all five artifacts (§3) | `bash evals/dispatch/coverage.sh` | exit 0 | P0 | pending |
| R4 | The Rust leaf accepts and rejects the pinned prose shapes (§3) | `bash evals/dispatch/run.sh` | exit 0 | P0 | pending |
| R5 | Cadence and enforcement claims match the machine (§4, §5) | `bun test src/render.test.ts` | exit 0 | P0 | pending |
| R6 | Diff stays inside Files Changed | `git diff --name-only origin/main` | 0 paths missing from the Files Changed table | P0 | pending |
| S1 | Conform gates green | `make audit` | exit 0 | P0 | pending |
| S2 | Unit tests pass | `bun test src` | exit 0 | P0 | pending |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 | pending |
| S4 | No newly added oversize source file | `git diff --diff-filter=A --name-only origin/main \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | pending |
| S5 | Orphan sweep | `git diff --diff-filter=D --name-only origin/main` | no output | P0 | pending |

**Command source rule:** `make audit` and `bun test src` are copied verbatim from `.oracle/orly.json`; VERIFY grades only their actual output.

**Grading protocol:** Run each Verify command from the repository root. Every row must carry one decisive output line before CHORE(close). Any P0 failure returns to EXECUTE.

## Dead Code Sweep

N/A — no file, command, flag, or public symbol is deleted or renamed. Two prose claims are removed because they are false, not because their subject retired.

## Out of Scope

- Changing any consuming repository's hooks, Makefile, or configuration; those land in that repository's own branch after this engine version ships.
- Removing the persona pack from any repository's selection; this workstream only makes the removal lossless.
- Mechanising the judgment halves of the Rust error standard — `source()` shape and whether a context addition is warranted stay judgment rows.
- Pruning globally installed host skills, which is a machine-level action outside any repository.
- Splitting the packaged skill bodies into core and appendix files.

---

## Product Clarity (authoring record)

1. **Successful user moment** — a maintainer runs `orly update` in a consuming repository and every rule the generated file cites is a file that exists there, including the recorder the DOC READ GATE names.
2. **Preserved user behaviour** — every existing command, gate, criterion, hook, and exit code behaves as before; the new check adds one row to `orly verify` and the new façade adds one dispatch entry.
3. **Optimal-way check** — parity belongs in `orly verify` because that command already owns "the committed copy matches what the engine would write"; a separate audit script would be a second answer to one question.
4. **Rebuild-vs-iterate** — iterate. The pack model, the dispatch framework, and the render tier already exist; each gap is a missing row rather than a missing mechanism.
5. **What we build** — one parity helper and its check row, two `managed_files` additions, one Rust leaf with its façade and fixtures, tiered cadence prose, and rehomed engineering clauses.
6. **What we do NOT build** — a new gate tier, a new command, a consumer-side migration, or a second rules delivery path.
7. **Fit with existing features** — the parity check reads the same registry `install` reads; the Rust façade uses the same framework every other language façade uses.
8. **Surface order** — engine first, because a consuming repository cannot adopt any of it until the version that carries it is published.
9. **Restraint** — the leaf decides only the two halves the prose already states in plain sentences; a rule needing a paragraph to explain its exception stays judgment.
10. **Confused-user next step** — every new finding prints the path, the rule half, and the command that produced it, so the fix is readable from the failure alone.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** four independent repairs behind one theme — delivery parity, recorder shipment, Rust determinism, cadence truth — plus the context reduction they make safe.
- **Alternative considered:** a shell audit for source-versus-target parity. Rejected because the registry is already parsed in TypeScript, and a second parser would drift from the first.
- **Alternative considered:** teaching `install` to write pack files into the authoring checkout. Rejected because a pack-filtered render would then overwrite the unfiltered source, which is the exact failure the skip exists to prevent.
- **Alternative considered:** mechanising the full Rust error standard. Rejected because `source()` shape and context-addition judgment need a call-site reading no regex can perform, and a gate that guesses gets switched off.
- **Alternative considered:** deleting the persona pack outright. Rejected because voice is a legitimate opt-in; the defect is that engineering rules were hiding inside it.
- **Patch-vs-refactor verdict:** a focused extension. No existing criterion, command, or pack changes meaning.

## Discovery (consult log)

- **Consults** — Indy commissioned a read-only audit of the instruction and skill surface across Claude Code, Codex, and OpenCode in a consuming repository, then directed the findings into engine repairs and a release. The audit measured the persona pack at 9,575 rendered bytes rather than the assumed 6,500, and found five engineering clauses inside it. It found the host skills budget overflowing on Codex from globally installed skills rather than from packaged ones, which is why this workstream shortens descriptions and leaves machine-level pruning out of scope.
- **Evidence that redirected the work** — `dispatch/write_rust.md` measured 1,776 bytes against a 9,971-byte pack source, and `dispatch/write_go.md` 1,204 against 1,751. Neither had a check. That discovery moved delivery parity ahead of the context reduction the audit was commissioned to find.
- **Metrics review** — no new event or property; the parity check is observed through the existing command outcome.
- **Follow-ups** — the consuming repository's own hook cadence, harness rows, and pack selection land in its branch once this version is published; that work is named in Out of Scope rather than folded here.
