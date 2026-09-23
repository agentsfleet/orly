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

# M07_004: The right rules reach the agent before the edit where the runtime allows, and always at commit, on Claude Code, Codex, and OpenCode

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 004
**Date:** Sep 23, 2026: 10:10 AM
**Status:** PENDING
**Priority:** P1 — written rules fail to reach the agent at the moment they matter, and nothing shows whether they did
**Categories:** CLI (Command-Line Interface), DOCS, SKILL (agent workflow skills)
**Batch:** B1 — release 0.12. Execution order: M07_001 §1 → M07_002 → M07_003 and M07_004 → M07_005 → M07_001 §§2–5. "Alongside" permits independent implementation work, not concurrent edits to shared files.
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report revision, commands, counts, and environment
**Depends on:** M07_001 §1 for criterion states; M07_002 for optional Jev selection, which deterministic delivery does not need. Local delivery completes without GitHub mode; its GitHub skip behavior is implemented and verified in M07_001 §4.
**Provenance:** Large Language Model (LLM)-drafted; Claude Opus 5.5; Sep 23, 2026
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Topology, Gates, and a new §Rule delivery

---

## Overview

**Goal (testable):** When an agent edits a Rust file under a path the repository maps to a Traps list, orly delivers the Rust rule sections and that Traps list before the edit on Claude Code and Codex, and at the first commit touching that area on every runtime; orly logs each delivery, and the commit guarantee reads no runtime configuration.

**Problem:**
- The always-loaded rulebook is 37,872 bytes against a 37,888-byte cap (`make conform`); every rule page beyond it waits for the agent to choose to read it.
- The doc-read record is the agent's own claim: its script records a loop writing nine claims in one second while violations shipped from a section nobody opened (`audits/doc-read.sh:12-24`).
- An agent in an agentsfleet worktree could not reach the Representational State Transfer (REST) guide and designed from memory (`SOUL_LOG.md` P15).
- agentsfleet keeps design traps in the Traps lists of ten architecture documents, which help only when someone reads them.

**Solution summary:** One engine, `orly rules`, selects rule sections for a path or a staged diff from file-type triggers, repository path maps, and optional Jev picks, prints them as plain text, and logs each delivery. The commit gate delivers anything not yet delivered for the staged areas, on every runtime. Generated adapters let Claude Code, Codex, and OpenCode show the same sections before the edit.

**Verdict and reason:** Delivery moves from "the agent should read" to "orly showed it and recorded that it did". The log proves arrival, not compliance; deterministic checks and Jev's advisory answers judge compliance. Git is the only delivery point all three runtimes share, so the guarantee sits there.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(rules): deliver the right rules at edit and commit, on every runtime`
- **Intent:** The agent sees the rules for the code it is changing at the moment it changes it, and anyone can check that it did.
- **Authoring handshake:** Indy: "I donot want to a claude specific hook. So this must cover claude, codex, opencode", then "Both A and B".
- **ASSUMPTIONS I'M MAKING:** 1. A section is a `##` heading of an installed rule page or a repository document. 2. Jev may add sections and never removes a deterministic pick. 3. Adapters are extras; the gate never depends on them. 4. Codex runs project hooks only after the user's trust review. 5. Delivery happens where the author commits, never in Continuous Integration (CI).
- **Implementer handshake:** pending until PLAN.

## Implementing agent — read these first

1. `registry.json` — pack `extensions` and each pack's managed rule pages, which give the file-type triggers.
2. `audits/doc-read.sh` — the record this log replaces as proof of delivery, and its runtime-neutrality rule.
3. `src/loaders.ts` — how orly already writes host files for three runtimes without overwriting user content.
4. https://code.claude.com/docs/en/hooks — PreToolUse deny with a reason shown to Claude.
5. https://learn.chatgpt.com/docs/hooks — Codex PreToolUse over `apply_patch`, deny with reason, project `.codex/hooks.json`.
6. https://opencode.ai/docs/plugins/ — project plugins and `tool.execute.before`.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| `docs/v1/pending/M07_004_P1_CLI_DOCS_SKILL_RULES_AT_THE_RIGHT_MOMENT.md` | CREATE, then lifecycle MOVE | Intent and proof ledger |
| `src/rules.ts`, `src/rules_select.ts`, `src/rules_log.ts`, `src/rules_adapters.ts` | CREATE | Engine, selection, delivery log, runtime payload translation |
| `src/rules.test.ts`, `src/rules_select.test.ts`, `src/rules_log.test.ts`, `src/rules_adapters.test.ts` | CREATE | Unit and integration proofs |
| `templates/adapters/claude-settings.json`, `templates/adapters/codex-hooks.json`, `templates/adapters/opencode-rules.ts` | CREATE | Adapter sources the installer merges |
| `fixtures/adapters/` | CREATE | Documented pre-edit payloads for each runtime |
| `src/criteria.ts`, `src/criteria.test.ts` | EDIT | `rules.delivered` in the `work` gate |
| `src/cli.ts`, `src/cli_gate.ts`, `src/cli.test.ts` | EDIT | `rules` command; `init --no-agent-hooks` |
| `src/install.ts`, `src/loaders.ts`, `src/install.test.ts`, `src/loaders.test.ts` | EDIT | Merge adapters into runtime configuration without overwriting entries |
| `src/config.ts`, `src/validation.ts`, `src/config.test.ts` | EDIT | `rules.paths` block |
| `evals/ledger/run.sh`, `evals/ledger/doc_read_cases.sh`, `src/rules_neutrality.test.ts` | EDIT, EDIT, CREATE | Neutrality executes the real commit criterion under each runtime configuration state |
| `package.json`, `src/pack_hygiene.test.ts` | EDIT | Ship `templates/adapters/` |
| `README.md`, `llms.txt`, `docs/ORLY_ARCHITECTURE.md` | EDIT | Setup per runtime; §Rule delivery |

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: NDC (No Dead Code), UFS (Unified Form for Symbols), FLL (File and Function Length Limits), TGU (Tagged-Union over optional-field structs), TST-NAM (milestone-free test names), MSID (milestone identifiers banned in source), TSC and TSJ (TypeScript and Bun conventions), PRI (Prompt-injection Resistance from user Input).
- `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`; `dispatch/edit_rules.md` for `src/**` and `evals/**`; `dispatch/write_documentation.md` with `docs/DOCUMENTATION_RULES.md`.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec Template | Yes | Pending metadata, Dimension-to-Test mapping, declared commands verbatim, at most 320 lines |
| TypeScript file shape; File & Function Length (≤350/≤50/≤70) | Yes | Engine, selection, log, and adapters in separate modules |
| Unified Form for Symbols; Milestone Identifier | Yes | Section identifiers, runtime names, and caps as named constants |
| Governance invariance | Yes | `make audit`, the questionnaire, and generated evidence |
| Rendered rules size | Yes | No change to `core/operating-model.md`; `make conform` reported 37,872 of 37,888 bytes |
| Greptile review; Architecture consult | Yes | End-of-turn rule read; new §Rule delivery |
| Schema removal; Zig; interface design tokens; workflow file edit | No | None touched |

## Prior-Art / Reference Implementations

- **Runtime neutrality:** `audits/doc-read.sh` already forbids dependence on an agent runtime and an eval enforces it (`evals/ledger/run.sh`); the commit guarantee inherits both.
- **Loaders:** `src/loaders.ts` already writes host files for Claude Code, Codex, and OpenCode while preserving user content; adapters follow that pattern.
- **Runtime hooks:** Claude Code and Codex document PreToolUse deny with a reason the model reads; OpenCode documents a plugin that can block a tool call.

## Sections (implementation slices)

### §1 — One engine selects and delivers

`orly rules (--for <path>... | --staged | --base <commit>) [--adapter <runtime>] [--json]` selects sections by three means. File-type triggers map a changed file's extension to its pack's managed rule pages, so a `.rs` file selects the sections of the installed Rust page, `dispatch/write_rust.md`, rendered from `packs/language/rust/rules.md`. Repository path maps in `rules.paths` map globs to documents or named sections, such as `docs/architecture/runner_fleet.md#Traps`. With M07_002's authorization, a Jev question per candidate section may add sections whose trigger is semantic; Jev never removes a deterministic pick. Commit gates and adapters never make network requests. They may consume only exact-input recorded selection answers; absent, stale, uncertain, or invalid answers produce deterministic selection alone. Live semantic selection requires an explicit command using M07_002's complete authorization, scanning, model-pinning, and request-budget rules. Candidates are bounded, locally resolved section identifiers, never model-generated paths. Deterministic sections are delivered before semantic additions, and additions cannot consume their output allowance or change the deterministic criterion's success. Engine-owned sections are resolved through the selected packs' source-to-target map and rendered through the same pack filtering and citation rewriting used for installation before selection or delivery; repository-owned sections are read from the evaluated repository; delivery digests cover the final rendered text. Output is plain text, bounded by a named size cap, and sections beyond it stay pending. Each completely emitted section writes a row to the delivery log under the git directory; a section whose rendered text changed is pending again.

- **Dimension 1.1** — A `.rs` change selects the Rust rule page's sections, and a `.ts` change selects the TypeScript page's → Test `test_rules_select_by_file_type`
- **Dimension 1.2** — A repository path map selects a whole document or one named section for matching paths only → Test `test_rules_select_by_path_map`
- **Dimension 1.3** — Authorized explicit selection can record additions; commit and adapter paths open no socket; stale or missing answers retain deterministic selection; additions never displace deterministic output → Test `test_jev_only_adds_sections`
- **Dimension 1.4** — Output respects the size cap with overflow left pending; each completely emitted section writes one log row; a section whose rendered text changed is pending again → Test `test_rules_output_and_delivery_log`
- **Dimension 1.5** — Delivered engine sections equal the installed consumer sections for a default install and a persona-enabled install → Test `test_delivered_sections_match_installed_pages`

### §2 — The commit guarantee

`orly gate work` carries `rules.delivered`. It proves complete emission of applicable rule text, not model receipt or comprehension. Its cache key contains the worktree identity, full branch reference, normalized area, section identifier, section digest, and selection-configuration digest. An area is a matched repository path-map key, or the language-pack identifier when no path map applies. The gate prints only pending sections in deterministic order; completely emitted sections are logged, overflow remains pending, and subsequent attempts continue with pending content. A section larger than the output cap produces a named failure and is never marked delivered. Missing sections and output failures fail without a delivery record. The criterion passes only when no required section remains pending. Commits that touch no new area are unaffected. The criterion reads only git, the engine, and the delivery log, so it behaves the same whichever runtime runs `git commit`; `evals/ledger/run.sh` fails the build if runtime configuration enters its path. In GitHub mode from M07_001 §4, it is skipped with the reason that delivery happens where the author commits.

- **Dimension 2.1** — An undelivered selection fails while emitting complete sections; retries drain overflow and pass only when nothing remains pending; a section exceeding the cap or a failed output remains undelivered; unchanged selections do not repeat → Test `test_commit_delivers_rules_once`
- **Dimension 2.2** — Execute the real commit criterion with each runtime configuration absent, present, malformed, and unreadable; identical repository and delivery inputs yield identical selection and verdicts. A fixture injecting a runtime-configuration read through a transitive helper is detected. Adapters remain outside this dependency path → Test `test_commit_guarantee_is_runtime_neutral`
- **Dimension 2.3** — In GitHub mode, `rules.delivered` is skipped with its reason → Test `test_rules_delivered_skipped_in_ci`

### §3 — Adapters for Claude Code, Codex, and OpenCode

Init and update identify each orly adapter by a stable owned identity and its recorded prior digest. They append an absent adapter, leave an identical adapter unchanged, and replace only an unchanged prior orly adapter. Other handlers sharing the event or matcher are preserved. An edited owned entry, malformed configuration, or foreign file at the OpenCode adapter path refuses before any adapter file changes. Preflight covers all destinations; replacements are atomic. `--no-agent-hooks` makes no adapter changes and does not uninstall existing adapters. Claude Code: a PreToolUse entry in `.claude/settings.json` for edit and write tools. Codex: a PreToolUse entry in `.codex/hooks.json` for `apply_patch`. OpenCode: `.opencode/plugins/orly-rules.ts` on `tool.execute.before` for edit and write tools. Each adapter calls `orly rules --adapter <runtime>` with the runtime's payload; Codex's payload carries the patch in `tool_input.command`, and its adapter returns the documented response object, because plain standard output is ignored for PreToolUse. On first delivery, Claude Code and Codex receive the documented denial response containing the sections; OpenCode throws the delivery message. Otherwise the adapter returns no permission decision and leaves the runtime's normal approval flow intact. If orly is unreachable, the adapter warns and returns no decision. Rule delivery never grants permission, changes tool arguments, or overrides another hook's decision. OpenCode's documentation does not state whether a thrown message reaches the model, so its behavior is recorded by manual check.

- **Dimension 3.1** — Repeated init, upgrades from a prior orly adapter, edited owned entries, malformed files, same-matcher user hooks, and symlink destinations each behave as specified, and `--no-agent-hooks` changes nothing → Test `test_init_writes_three_adapters`
- **Dimension 3.2** — Each runtime's documented payload fixture becomes the same `orly rules` call; first delivery yields the documented denial or a thrown message; otherwise and when orly is unreachable, no permission decision → Test `test_adapters_translate_each_runtime`
- **Dimension 3.3** — In each runtime, one Rust edit shows whether the sections reached the model before the edit, recorded in Session Notes → Test `manual_three_runtime_delivery`

### §4 — Measuring delivery

`orly rules --report [--base <commit>]` counts deliveries per section and per channel, which is commit or one of the three adapters. A pilot compares selections: Indy labels which sections should apply to twenty past agentsfleet diffs before seeing either selection, and deterministic-only picks are compared with picks after Jev additions.

- **Dimension 4.1** — The report counts deliveries by section and channel over a commit range → Test `test_delivery_report_counts`
- **Dimension 4.2** — Indy labels twenty past diffs, and both selections are scored against his labels in Session Notes → Test `manual_selection_pilot`

## Interfaces

```
orly rules (--for <path>... | --staged | --base <commit>) [--adapter claude|codex|opencode] [--json]
orly rules --report [--base <commit>]
orly init [--no-agent-hooks]

Configuration:
  "rules": { "paths": { "src/runner/**": ["docs/architecture/runner_fleet.md#Traps"] } }
Delivery log (<git dir>/orly/deliveries.jsonl), one row per printed section:
  { "at", "worktree", "branch", "area", "section", "section_digest", "selection_digest",
    "via": "commit|claude|codex|opencode|cli" }
Adapters:
  .claude/settings.json            PreToolUse, edit and write tools   → orly rules --adapter claude
  .codex/hooks.json                PreToolUse, apply_patch            → orly rules --adapter codex
  .opencode/plugins/orly-rules.ts  tool.execute.before, edit and write → orly rules --adapter opencode
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| No adapter ran | Runtime lacks one, trust not granted, or disabled | Commit guarantee delivers; `test_commit_delivers_rules_once` |
| Engine unreachable in adapter | orly missing on the path | Adapter warns and returns no decision; `test_adapters_translate_each_runtime` |
| Oversized section | One section exceeds the cap | Named failure; never marked delivered; `test_commit_delivers_rules_once` |
| Output failure | Standard output closed mid-print | Fails without a delivery record; `test_commit_delivers_rules_once` |
| Persona leak | Raw package page read directly | Rendered through the install filter; `test_delivered_sections_match_installed_pages` |
| Adapter ownership | Upgrade, edited owned entry, same-matcher user hook | Unchanged prior replaced; edited refused; user hook preserved; `test_init_writes_three_adapters` |
| Missing section | A path map names an absent document or heading | Reported with the path; `test_rules_select_by_path_map` |
| Output too large | Many sections selected | Capped; overflow stays pending; `test_rules_output_and_delivery_log` |
| Changed section | Rule text edited after delivery | Delivered again; `test_rules_output_and_delivery_log` |
| Network at commit | Semantic selection wanted at commit | None; only exact-input recorded answers; `test_jev_only_adds_sections` |
| Corrupt log | Unreadable delivery log | Treated as empty; sections delivered again; `test_rules_output_and_delivery_log` |
| Runtime leak | Runtime configuration enters the gate path | Eval fails the build; `test_commit_guarantee_is_runtime_neutral` |

## Invariants

1. The commit guarantee reads only git, the engine, and the delivery log — `evals/ledger/run.sh` enforces it.
2. Jev only adds sections, after the deterministic ones, and never consumes their output allowance — the selector orders and budgets deterministic picks first.
3. A delivery is logged only for a completely emitted section — the logger is called after the write succeeds.
4. Adapters change only orly-owned entries identified by identity and prior digest — merging refuses edited or foreign entries.
5. Rule delivery never grants permission — adapters return no decision except a delivery denial.
6. Commit gates and adapters open no network connection — they read recorded answers only.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Local delivery report | ops | `orly rules --report` runs | Section names, channels, counts | Stays on the machine; no telemetry change | `test_delivery_report_counts` |

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | unit | `test_rules_select_by_file_type` | `.rs` and `.ts` changes → sections of the Rust and TypeScript pages |
| 1.2 | unit | `test_rules_select_by_path_map` | Map to a document and to `#Traps` → matching paths only; absent heading reported |
| 1.3 | integration | `test_jev_only_adds_sections` | Explicit authorized run records one addition; commit and adapter paths open no socket; stale answer → deterministic only; additions after deterministic output |
| 1.4 | integration | `test_rules_output_and_delivery_log` | Oversized selection → capped, overflow pending; one row per emitted section; edited section → pending again |
| 1.5 | integration | `test_delivered_sections_match_installed_pages` | Default and persona installs → delivered engine sections byte-equal their installed pages |
| 2.1 | integration | `test_commit_delivers_rules_once` | Selection larger than the cap → retries drain pending sections, then pass; oversized section → named failure; closed output → no record |
| 2.2 | integration | `test_commit_guarantee_is_runtime_neutral` | Each runtime configuration absent, present, malformed, unreadable → identical verdicts; transitive read fixture → detected |
| 2.3 | integration | `test_rules_delivered_skipped_in_ci` | GitHub mode → skipped with its reason |
| 3.1 | integration | `test_init_writes_three_adapters` | Repeat, upgrade, edited owned entry, malformed file, same-matcher user hook, symlink → as specified; `--no-agent-hooks` → no change |
| 3.2 | unit | `test_adapters_translate_each_runtime` | Three payload fixtures → one call each; first delivery → documented denial or throw; repeat and unreachable engine → no decision |
| 3.3 | manual | `manual_three_runtime_delivery` | Implementer edits a Rust file in each runtime; what the model saw is recorded in Session Notes |
| 4.1 | unit | `test_delivery_report_counts` | Fixture log → counts by section and channel |
| 4.2 | manual | `manual_selection_pilot` | Indy labels twenty past diffs; both selections scored in Session Notes |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | The engine selects and logs deliveries (§1) | `bun test src -t "test_rules_select\|test_jev_only_adds\|test_rules_output\|test_delivered_sections"` | exit 0 | P0 | |
| R2 | The commit guarantee delivers once and stays runtime-neutral (§2) | `bun test src -t "test_commit_delivers\|test_commit_guarantee\|test_rules_delivered_skipped"` | exit 0 | P0 | |
| R3 | Three adapters merge safely and translate each runtime (§3) | `bun test src -t "test_init_writes_three_adapters\|test_adapters_translate"` | exit 0 | P0 | |
| R4 | Deliveries are countable (§4) | `bun test src -t test_delivery_report_counts` | exit 0 | P0 | |
| R5 | Scope holds | `git diff --name-only origin/main...HEAD` | 0 paths missing from Files Changed | P0 | |
| S1 | Declared conformance | `make conform` | exit 0 | P0 | |
| S2 | Declared verification | `bun test src` | exit 0 | P0 | |
| S3 | Governance invariance | `make audit` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S5 | No oversize source file | `git diff --name-only origin/main...HEAD \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | |

## Dead Code Sweep

N/A — no files deleted.

## Out of Scope

- Shrinking the always-loaded rulebook or retiring the doc-read record; both follow once the delivery report shows the new path working.
- Delivery at session start, on prompts, or on file reads; adapters for other runtimes; delivery in CI.
- Filtering or compressing the agent's own context, and routing between models.

## Product Clarity (authoring record)

1. **Successful user moment** — An agent opens an edit to the runner's lease code, and before the edit lands it sees the Rust error rules and the runner's Traps; `orly rules --report` later shows both were delivered before the commit.
2. **Preserved user behaviour** — Every rule page stays readable as today; without path maps or adapters, file-type delivery at commit is the only change.
3. **Optimal-way check** — Delivery before every edit on every runtime would be ideal; OpenCode's model-visible path is undocumented, so the commit guarantee carries every runtime until manual checks prove more.
4. **Rebuild-vs-iterate** — Iterate on packs, loaders, and the work gate.
5. **What we build** — The engine, the delivery log, `rules.delivered`, three adapters, path maps, and the report.
6. **What we do NOT build** — Context filtering inside the agent, model routing, or a new rule format.
7. **Fit with existing features** — Uses M07_002's authorization for Jev picks and M07_001's states; must not slow commits beyond one selection and print.
8. **Surface order** — Command line first; adapters call the same command.
9. **Dashboard restraint** — No scores; the report lists deliveries and counts.
10. **Confused-user next step** — `orly rules --for <path>` prints what an edit there would receive; README lists each runtime's adapter file.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Four Sections: engine, commit guarantee, adapters, measurement. The guarantee lands before adapters so no runtime is ever the only path.
- **Alternatives considered:** A Claude-only hook fails Indy's runtime requirement. A tool the agent may call keeps delivery voluntary. Nested instruction files load by working directory with different rules per runtime.
- **Patch-vs-refactor verdict:** this is an additive **patch** on packs, loaders, and the work gate.

## Discovery (consult log)

- **Consults** — Codex's CTO review of `136b04c` required complete-emission semantics, no permission grants, owned adapter identity, persona-filtered delivery, offline commits, and an executed neutrality test; each was applied. The installed Rust page is sourced from `packs/language/rust/rules.md` (`registry.json:138`), and today's neutrality eval greps four files for four strings (`evals/ledger/doc_read_cases.sh:124-128`). Sep 23, 2026: official documentation read for each runtime. Claude Code: PreToolUse deny with a reason shown to Claude. Codex: PreToolUse covers Bash, `apply_patch` edits, and MCP (Model Context Protocol) tools, can deny with a reason shown to the model, loads project hooks from `.codex/hooks.json` after trust review. OpenCode: project plugins in `.opencode/plugins/` can block via `tool.execute.before`; whether the message reaches the model is not stated. Ten agentsfleet architecture documents carry a `## Traps` section.
- **Metrics review** — no telemetry change; the delivery report stays local.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand; implementation outcomes pending.
- **Deferrals** — None.
