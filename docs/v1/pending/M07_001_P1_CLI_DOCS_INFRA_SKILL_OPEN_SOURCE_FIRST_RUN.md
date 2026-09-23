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

# M07_001: A new repository installs orly into one folder and runs an honest gate locally and in Continuous Integration (CI)

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 001
**Date:** Sep 23, 2026: 10:10 AM
**Status:** PENDING
**Priority:** P1 — an open-source user decides on the first run, and today that run shows nothing their CI does not
**Categories:** CLI (Command-Line Interface), DOCS, INFRA (CI automation), SKILL (agent workflow skills)
**Batch:** B1 — sequential Sections within this Workstream
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report revision, commands, counts, and environment
**Depends on:** none
**Provenance:** Large Language Model (LLM)-drafted; Claude Opus 5.5; Sep 23, 2026. Replaces the unmerged M07_001 profiles draft at commit `55b4c75`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Topology, Gates, Evidence

---

## Overview

**Goal (testable):** In a fresh repository with no spec, `orly init` writes only the agent entry files, the host skill folders, and `.orly/`; no installed file instructs the agent with a person's name or private tools; and `orly gate pr` labels every criterion passed, failed, skipped, or reported, with the same JSON evidence on a laptop and in a GitHub pull request check.

**Problem:** A first-run audit of orly 0.10.14 in a throwaway TypeScript repository on Sep 23, 2026 found:
- `orly init` wrote 45 files: 13 under `dispatch/`, 7 under `audits/`, and 6 into the user's own `docs/`.
- `orly gate pr` printed 15 criteria. Nine printed green without checking anything. `docs.language` printed green while reporting 814 findings, all in files orly had just installed. The five real checks were branch, clean tree, pushed, configuration, and the user's own test command.
- The generated rules file named no person, but 30 other installed files did, or named gstack, greptile, `~/Projects`, or `op read`. The orly-babysit-prs skill carried 35 such mentions in each of its three copies, and `dispatch/write_any.sh:47` prints "consult Indy" to every user.
- The gate cannot run on a pull request checkout, because `git.branch` and `git.pushed` assume a local branch with an upstream.

**Solution summary:** Criteria report explicit states and the gate emits a JSON evidence document. Everything orly installs in a consumer, its configuration included, lands under `.orly/`, with a migration and a stale-citation report. Pack markers filter every installed Markdown file, so personal lines stay behind `persona.indy`. A GitHub mode reads the pull request event, and a composite action runs the same gate on every pull request.

**Verdict and reason:** Rules and skills distribution is already served by Vercel's `skills` tool with `skills-lock.json`, by Ruler, and by Claude Code plugin marketplaces. orly's distinct offer is the gate and its evidence. This Milestone makes that offer honest and runnable in CI, and shrinks what orly leaves in someone else's repository.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: install into .orly/ and run an honest gate locally and in CI`
- **Intent:** A stranger adopts orly in one command, sees exactly what its gate checked, and adds the same gate to every pull request with one workflow step.
- **Authoring handshake:** Indy directed an open-source-first 0.11 over the profiles draft, chose `.orly/` over `.oracle/`, asked for an action that detects its own inputs, and dropped standalone executables.
- **ASSUMPTIONS I'M MAKING:** 1. `.orly/` replaces `.oracle/`; after migration nothing reads `.oracle/`. 2. Personal lines gate under `persona.indy`, product lines under `product.agentsfleet`. 3. GitHub is the first CI provider. 4. agentsfleet and e2e-observability-platform migrate in their own PRs after release. 5. Bun remains the runtime.
- **Implementer handshake:** pending until PLAN.

## Implementing agent — read these first

1. `src/criteria_support.ts` and `src/criteria.ts` — the `{ ok, detail }` verdict every criterion returns, and where skips return `ok: true`.
2. `src/cli.ts` — the two-glyph gate printer and flag handling; 345 of 350 lines.
3. `src/install.ts` and `src/config.ts` — managed targets, the hook directory, digest refusal, the refusal when another tool owns `core.hooksPath`, and the `.oracle` directory constant.
4. `src/render.ts` and `core/operating-model.md` — the `oracle-packs` markers that include lines per selected pack.
5. `audits/rule-paths.sh` — the check that rule citations resolve in the installing repository.
6. https://docs.github.com/en/actions/sharing-automations/creating-actions/publishing-actions-in-github-marketplace — one root `action.yml` in a public repository.

## Files Changed (blast radius)

Discovery greps: every root-level managed target and the token `.oracle`, across orly and both consumers.

| File | Action | Why |
|---|---|---|
| `docs/v1/pending/M07_001_P1_CLI_DOCS_INFRA_SKILL_OPEN_SOURCE_FIRST_RUN.md` | CREATE, then lifecycle MOVE | Intent and proof ledger |
| `src/criteria_support.ts`, `src/criteria.ts`, `src/criteria_spec.ts`, `src/gates.ts` | EDIT | Criterion states; consumer documentation scan limited to owned files |
| `src/evidence.ts`, `src/evidence.test.ts`, `schemas/gate-evidence.schema.json` | CREATE | Gate evidence document and its schema |
| `src/cli_gate.ts`, `src/ci_github.ts`, `src/ci_github.test.ts` | CREATE | Gate command and printer moved out of `cli.ts` for the length cap; pull request event reader |
| `src/cli.ts`, `src/cli.test.ts`, `src/surfaces.ts` | EDIT | Routing, `init --ci github`, help text; base-comparing criteria accept an explicit base |
| `src/install_migrate.ts` | CREATE | Moving prior copies and `.oracle/`; stale-citation scan; kept out of `install.ts` for the length cap |
| `src/install.ts`, `src/config.ts`, `src/validation.ts`, `src/verify.ts` | EDIT | `.orly/` root and configuration; marker filtering of installed Markdown |
| `src/doc_rules.ts`, `src/doc_reader.ts` | EDIT, CREATE | Shared configuration path replaces the duplicate at `doc_rules.ts:56`; split below the 350-line cap |
| `src/render.ts`, `src/references.ts` | EDIT | Shared marker filter; installed citations point at installed paths |
| `src/render.test.ts`, `src/references.test.ts`, `src/install.test.ts`, `src/install_packs.test.ts`, `src/install_nested.test.ts`, `src/setup.test.ts`, `src/gates.test.ts`, `src/criteria.test.ts`, `src/config.test.ts`, `src/spec_baseline.test.ts`, `src/spec_template_io.test.ts`, `src/gates_test_support.ts` | EDIT | State, layout, and `.orly/` proofs |
| `src/journey.test.ts`, `src/journey_support.ts`, `fixtures/layout-0.10/`, `fixtures/render-0.10.14.md`, `fixtures/github-events/` | CREATE | Packed first-run journey; 0.10.14 layout and render fixtures; pull request event fixtures |
| `evals/install/cases.sh`, `evals/install/release_cases.sh`, `evals/llms/fixtures.jsonl` | EDIT | `.orly/` paths |
| `.orly/orly.json` | MOVE from `.oracle/orly.json` | This repository's own configuration |
| `audits/rule-paths.sh`, `audits/agents-md.md`, `audits/spec-template.sh`, `audits/spec-template.ts` | EDIT | Consumer layout; `.orly/` citations |
| `core/operating-model.md`, `AGENTS.md` | EDIT | Tool lines behind `persona.indy`; skipped glyph in the signal legend; `.orly/`; regenerated render |
| `skills/orly-babysit-prs/SKILL.md`, `skills/orly-spec-new/SKILL.md`, `skills/orly-write-integration-test/SKILL.md`, `skills/orly-write-unit-test/SKILL.md` | EDIT | Personal instructions behind markers; review bots optional |
| `docs/TEMPLATE.md`, `docs/RELEASE_TEMPLATE.md`, `docs/CHANGELOG_VOICE.md`, `docs/DOCUMENTATION_RULES.md`, `docs/REST_API_DESIGN_GUIDELINES.md`, `docs/VERIFY_TIERS.md`, `docs/greptile-learnings/RULES.md` | EDIT | Personal instructions behind markers or reworded; `.orly/` |
| `dispatch/lifecycle.md`, `dispatch/write_any.md`, `dispatch/write_any.sh`, `dispatch/lib.sh`, `dispatch/edit_rules.md`, `dispatch/verify.md`, `dispatch/name_architecture.md`, `dispatch/write_ts_adhere_bun.md`, `dispatch/write_changelog.md`, `dispatch/write_auth.md`, `dispatch/write_spec.md`, `dispatch/write_http.md`, `dispatch/write_go.md`, `dispatch/write_python.md`, `dispatch/write_rust.md`, `dispatch/write_shell.md`, `dispatch/write_zig.md` | EDIT | Personal instructions behind markers; printed messages name no person; `.orly/` |
| `packs/language/go/rules.md`, `packs/language/python/rules.md`, `packs/language/rust/rules.md`, `packs/language/shell/rules.md` | EDIT | `.orly/` citations |
| `templates/github-workflow.yml`, `action.yml` | CREATE | One-step consumer workflow; composite action at the repository root |
| `package.json`, `src/pack_hygiene.test.ts` | EDIT | Ship `templates/`; package closure |
| `.gitignore`, `.gitleaks.toml`, `.gitleaksignore`, `.github/workflows/release.yml` | EDIT | `.orly/` paths; each needs Indy's approval at CHORE(open) |
| `README.md`, `llms.txt`, `docs/ORLY_ARCHITECTURE.md` | EDIT | First-run path; machine setup; §§Topology, Gates, Evidence |

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: NDC (No Dead Code), NLG (No Legacy compat shims), NLR (No Legacy Retained), UFS (Unified Form for Symbols), ORP (Orphan sweep on rename), FLL (File and Function Length Limits), TST-NAM (milestone-free test names), MSID (milestone identifiers banned in source), TSC and TSJ (TypeScript and Bun conventions), LOG (logging discipline).
- `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`, `dispatch/write_shell.md` — TypeScript and shell changes.
- `dispatch/edit_rules.md` — `src/**`, `core/**`, `audits/**`, `dispatch/**`, `packs/**`, and the generated `AGENTS.md` change; the default render changes, so the live comprehension evaluation runs.
- `dispatch/write_documentation.md` with `docs/DOCUMENTATION_RULES.md` — README, `llms.txt`, architecture.
- `dispatch/name_architecture.md` — `docs/ORLY_ARCHITECTURE.md` changes in the same commit as the first new behavior.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec Template | Yes | Pending metadata, Dimension-to-Test mapping, declared commands verbatim, at most 320 lines |
| TypeScript file shape; File & Function Length (≤350/≤50/≤70) | Yes | New modules for the gate command, event reader, and migration; `doc_rules.ts` splits below the cap because the rename touches it |
| Unified Form for Symbols; Logging; Milestone Identifier | Yes | One `.orly` constant; states, reason codes, and paths as named constants; no milestone labels in source or tests |
| Governance invariance | Yes | `make audit`, the questionnaire, generated evidence, and the live comprehension evaluation |
| CI/CD (Continuous Delivery) edit; secret-scanner files | Yes | `release.yml`, `.gitleaks.toml`, and `.gitleaksignore` change only their `.oracle` paths, after Indy's approval at CHORE(open); `action.yml` is new |
| Rendered rules size | Yes | `make conform` reported 37,872 of 37,888 bytes at authoring; §3 rewrites each personal line in place with an inline pack marker instead of adding a neutral twin, and any growth is cut in the same diff |
| Greptile review; Architecture consult | Yes | End-of-turn rule read; `docs/ORLY_ARCHITECTURE.md` updated with the first behavior |
| Schema removal; Zig; interface design tokens | No | No database schema, Zig, or rendered interface |

## Prior-Art / Reference Implementations

- **Superseded draft `55b4c75`:** its evidence constraints carry forward: run once, visible drift, no argument values, environment, or raw output. Profile sources and locks are dropped, because `vercel-labs/skills` with `skills-lock.json`, `intellectronica/ruler`, and Claude Code plugin marketplaces serve that job. The transaction journal is dropped, because managed files sit in a git working tree.
- **Pack gating:** the existing `oracle-packs` markers in `core/operating-model.md` are the mechanism; §3 applies the same filter to every installed Markdown file.
- **Refusal shape:** `hooksClaimedByAnother` in `src/install.ts` refuses with a message and a suggestion; migration refusals follow it.
- **CI install pattern:** agentsfleet's `.github/workflows/governance.yml` sets up Bun, then installs the orly version pinned in its configuration. The action mirrors those steps.
- **7 Pillars of CLI developer experience:** command, handler, and error split; human and JSON renderers; structured errors; handler, integration, and subprocess tests. Divergence: JSON stays behind an explicit `--json`, because hooks pipe gate output and automatic JSON would change hook logs.

## Sections (implementation slices)

### §1 — The gate says what it checked

Every criterion result carries one state: passed, failed, skipped, reported, or overridden. The printer shows 🟢 passed, 🔴 failed, ⚪ skipped, 🟠 reported, and overridden with its recorded reason, then one line counting each state. Exit status is nonzero only when a criterion failed. In a consumer repository, `docs.language` scans only repository-owned documents; managed files are checked in orly's own repository. `orly gate [work|verify|pr] --json` writes one evidence document to standard output and human lines to standard error. It carries schema version, orly version, base and head commits, dirty flag, tree digest, and per gate and criterion the state, reason code, command key, argument-vector digest, exit status, duration, and output digest. It omits argument values, environment values, raw output, and free-text detail. Each declared command runs once per invocation. **Implementation default:** add a state to the existing verdict, derived from `ok` where a criterion sets none, because every criterion already returns `{ ok, detail }`.

- **Dimension 1.1** — With no active spec and no declared surface, the eight spec criteria and `docs.updated` print as skipped with their reasons, and the count line reports them as skipped → Test `test_spec_less_gate_reports_skips`
- **Dimension 1.2** — In a consumer checkout, `docs.language` reports findings from repository-owned documents only; managed files contribute none → Test `test_consumer_docs_language_scans_owned_documents`
- **Dimension 1.3** — `--json` output validates against the schema, keeps each state distinct, runs each declared command once, and exits with the status of the human run → Test `test_gate_evidence_records_each_state`
- **Dimension 1.4** — Sentinel secrets in the environment, in command arguments, and in command output never appear in the evidence → Test `test_gate_evidence_excludes_secrets_and_output`

### §2 — Everything orly installs lives in `.orly/`

In a consumer repository, the configuration lives at `.orly/orly.json`, and managed rules, audits, and documents install under `.orly/` at their source-relative paths, so `dispatch/write_zig.md` installs at `.orly/dispatch/write_zig.md`; hooks install under `.orly/hooks/`. The root receives only `AGENTS.md`, `CLAUDE.md`, `opencode.json`, the host skill folders, and `.orly/`. Installation rewrites each citation of a managed source path to its installed path, and `audits/rule-paths.sh` checks every citation in the consumer layout. `orly update` moves `.oracle/orly.json` and each prior root copy whose bytes match the recorded digest. It validates every planned move before the first write and refuses, naming the path, when a copy was edited. `core.hooksPath` follows only when both prior hooks were unchanged orly copies. An interrupted move shows in `git status`, and rerunning `orly update` completes it. Until migration, every other command names `orly update`. `orly doctor` lists repository-owned files that still cite an old managed path or `.oracle/`, by file and line. The orly engine checkout keeps its source layout. At authoring, repository-owned files citing a managed path numbered 50 in agentsfleet and 15 in e2e-observability-platform; files citing `.oracle` numbered 48 in orly, 24 in agentsfleet, and 16 in e2e-observability-platform. **Implementation default:** apply the `.orly/` prefix in the installer rather than editing 52 registry targets, because the registry names sources and the prefix is one rule.

- **Dimension 2.1** — A fresh `orly init` adds nothing at the root beyond the entry files, the host skill folders, and `.orly/`, and sets `core.hooksPath` to `.orly/hooks` → Test `test_fresh_install_stays_in_one_folder`
- **Dimension 2.2** — Every path cited by an installed rule, audit, or skill resolves in a fresh consumer checkout → Test `test_installed_citations_resolve`
- **Dimension 2.3** — Updating the 0.10.14 layout fixture moves `.oracle/orly.json` and unchanged copies, refuses an edited copy by path before any write, completes after an injected interruption, and other commands name `orly update` before migration → Test `test_update_moves_unchanged_copies`
- **Dimension 2.4** — `orly doctor` names each repository-owned file and line that still cites an old managed path or `.oracle/` → Test `test_doctor_names_stale_citations`

### §3 — Installed instructions assume nothing about the user

Installation applies the `oracle-packs` marker filter to every installed Markdown file, not only the generated rules file. Instruction lines that name Indy, Kishore, Aiwa, gstack, greptile as a reviewer, `~/Projects`, `op read`, or the shared docs repository move behind `persona.indy` markers, and agentsfleet-specific instructions behind `product.agentsfleet`. Each affected rule keeps a neutral requirement for everyone: review remains an adversarial diff review before documentation, deferral needs the repository owner's quoted approval, and credentials resolve at runtime and are never printed. Messages installed scripts print name no person. The orly-babysit-prs skill finishes its loop when no review bot posts.

- **Dimension 3.1** — A default install's rendered rules, installed Markdown files, and script messages contain none of `Indy`, `Kishore`, `Aiwa`, `gstack`, `~/Projects`, `op read`, or `greptile` outside the `greptile-learnings` path → Test `test_default_install_names_no_person_or_private_tool`
- **Dimension 3.2** — An install selecting agentsfleet's packs contains every rule line of the 0.10.14 render fixture → Test `test_indy_render_keeps_every_rule_line`

### §4 — The same gate runs on every pull request

`orly gate pr --ci github` reads the pull request event GitHub provides and evaluates the checked-out commit against the event's base commit; `--base <full-commit>` and `--head-ref <name>` override the event. `git.pushed` is skipped with the reason that CI evaluates the pushed commit, `git.branch` reads the head branch, and every base-comparing criterion uses the base. A non-pull-request event, a missing or malformed base, a non-ancestor base, or a history too shallow to prove ancestry refuses before any command runs. `--no-commands` records every command criterion as skipped with the reason that other CI jobs run it. The composite action in `action.yml`, named "orly gate", checks out the pull request head with full history, sets up Bun, installs the orly version pinned in `.orly/orly.json`, runs the gate with `--ci github --json`, writes a table of criterion states to the job summary, and uploads the evidence document. Its `run-commands` input defaults to false, because most repositories already run their tests in other jobs. Users reference it as `uses: agentsfleet/orly@v0.11.0`; the release job already tags each version. `orly init --ci github` writes `.github/workflows/orly.yml` with that single step; an existing different file refuses and stays unchanged. Usage telemetry already reports CI runs from the `CI` variable (`src/telemetry.ts:258`).

- **Dimension 4.1** — With the event fixture, `--ci github` reads base, head, and branch; `git.pushed` is skipped; spec criteria compare against the event's base; `--base` overrides → Test `test_ci_github_reads_the_pull_request_event`
- **Dimension 4.2** — A non-pull-request event, missing or malformed base, non-ancestor base, or shallow history refuses before any command runs → Test `test_ci_mode_refuses_a_bad_base`
- **Dimension 4.3** — `--no-commands` records each command criterion as skipped with its reason and runs no declared command → Test `test_no_commands_records_skips`
- **Dimension 4.4** — `orly init --ci github` writes the one-step workflow, and a differing existing workflow refuses unchanged → Test `test_init_writes_the_ci_workflow`
- **Dimension 4.5** — A pull request in a scratch repository shows the "orly gate" check with its state table and evidence artifact → Test `manual_scratch_repository_pull_request`

### §5 — A stranger's first run is proved and documented

Depends on §§1–4. An end-to-end test packs the package, installs it into temporary repositories with no orly history, and walks `init`, a spec-less `gate pr`, `gate pr --ci github --json` with an event fixture, and `update` from the 0.10.14 layout fixture. README opens with that path: install, init, gate, and the one-step workflow. `llms.txt` carries the machine version of the same steps. `docs/ORLY_ARCHITECTURE.md` updates §§Topology, Gates, and Evidence.

- **Dimension 5.1** — The packed journey completes in fresh temporary repositories without the author checkout → Test `test_first_run_journey`
- **Dimension 5.2** — Every orly command in README's first-run section appears in the journey test → Test `test_readme_first_run_matches_journey`

## Interfaces

```
orly gate [work|verify|pr] [--json] [--accept-dirty]
orly gate pr --ci github [--base <full-commit>] [--head-ref <name>] [--no-commands] [--json]
orly init [--ci github] [--force] [--no-hooks] [--with <PACK>] [--dry-run] [--json]
orly doctor [--json]             adds stale citations of old managed paths and .oracle/

Consumer layout:  AGENTS.md  CLAUDE.md  opencode.json  .claude/skills/  .agents/skills/  .opencode/skills/
                  .orly/  orly.json  hooks/  dispatch/  audits/  docs/

Consumer workflow written by init --ci github:
  on: pull_request
  jobs: { orly: { runs-on: ubuntu-latest, steps: [ { uses: agentsfleet/orly@v0.11.0 } ] } }

Evidence on standard output under --json (schemas/gate-evidence.schema.json):
{ "schema_version": 1, "orly_version": "0.11.0", "base": "<40 hex>", "head": "<40 hex>",
  "dirty": false, "tree_digest": "sha256:<hex>",
  "gates": [ { "gate": "pr", "criteria": [
    { "name": "cmd.verify.unit", "state": "passed", "command_key": "verify.unit",
      "argv_digest": "sha256:<hex>", "exit_code": 0, "duration_ms": 812, "output_digest": "sha256:<hex>" },
    { "name": "spec.dimensions", "state": "skipped", "reason": "no_active_spec" } ] } ] }

Exit: 0 when no criterion failed; 1 when one failed; usage errors keep their current status.
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Nothing to check | No spec, no declared surface | Criteria print skipped with reasons and never count as passed; `test_spec_less_gate_reports_skips` |
| Secret exposure | A command prints a token or receives one as an argument | Evidence holds digests only; `test_gate_evidence_excludes_secrets_and_output` |
| Edited managed copy | The user changed an installed file before update | Refuse naming the path before any write; `test_update_moves_unchanged_copies` |
| Interrupted move | Update killed mid-move | Partial state shows in `git status`; rerun completes; `test_update_moves_unchanged_copies` |
| Unmigrated repository | `.oracle/orly.json` exists, `.orly/` does not | Every command except update names `orly update`; `test_update_moves_unchanged_copies` |
| Stale citation | A repository-owned file cites an old path | Doctor names file and line; `test_doctor_names_stale_citations` |
| Personal instruction leak | A new unmarked line names a person or private tool | Default install check fails; `test_default_install_names_no_person_or_private_tool` |
| Bad CI input | Non-pull-request event, missing, malformed, non-ancestor, or unprovable base | Refuse before commands run; `test_ci_mode_refuses_a_bad_base` |
| Existing workflow | A different `.github/workflows/orly.yml` exists | Refuse and leave it unchanged; `test_init_writes_the_ci_workflow` |
| Foreign hook owner | Another tool owns `core.hooksPath` | The existing refusal and suggestion stand; `test_foreign_hooks_path_still_refuses` |

## Invariants

1. A skipped or reported criterion never counts as passed — the summary counter and exit status key on state, never on `ok` alone.
2. Evidence carries no argument values, environment values, or raw output — the serializer writes from a field allowlist.
3. In a consumer repository every orly-managed path lives under `.orly/` or a host skill folder — the installer asserts each planned target's prefix before writing.
4. Every citation in installed text resolves — `audits/rule-paths.sh` runs in `make audit` and the install tests.
5. The default install names no person or private tool — the install test scans every installed file and printed script message.
6. CI mode never evaluates against an unproven base — argument and event validation run before any criterion.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Existing usage observation, unchanged | product | A command completes with prior anonymous consent | Existing fields, including the `ci` invocation | Evidence content, paths, and commands never enter telemetry | Existing `src/telemetry.test.ts` suite |

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | integration | `test_spec_less_gate_reports_skips` | Spec-less temporary repository → nine skipped lines with reasons; count line shows them as skipped |
| 1.2 | integration | `test_consumer_docs_language_scans_owned_documents` | Consumer with a bad owned page and bad managed pages → findings name only the owned page |
| 1.3 | integration | `test_gate_evidence_records_each_state` | Fixture producing all five states → schema-valid JSON; a counting command ran once; exit matches the human run |
| 1.4 | integration | `test_gate_evidence_excludes_secrets_and_output` | Sentinels in environment, arguments, and output → absent from the JSON |
| 2.1 | integration | `test_fresh_install_stays_in_one_folder` | Fresh repository → root diff is only entry files, skill folders, `.orly/`; hooks path `.orly/hooks` |
| 2.2 | integration | `test_installed_citations_resolve` | Every cited path in installed text exists in the consumer checkout |
| 2.3 | integration | `test_update_moves_unchanged_copies` | 0.10.14 layout → moved; edited copy → refusal by path, no writes; interruption → rerun completes; `gate` before migration → names `orly update` |
| 2.4 | integration | `test_doctor_names_stale_citations` | Owned files citing `dispatch/write_zig.md` or `.oracle/orly.json` → doctor lists each file and line |
| 3.1 | integration | `test_default_install_names_no_person_or_private_tool` | Default install → zero matches for the listed names outside `greptile-learnings` |
| 3.2 | integration | `test_indy_render_keeps_every_rule_line` | agentsfleet's pack selection → every line of `fixtures/render-0.10.14.md` present |
| 4.1 | integration | `test_ci_github_reads_the_pull_request_event` | Event fixture on a detached checkout → base, head, branch from the event; `git.pushed` skipped; `--base` overrides |
| 4.2 | unit | `test_ci_mode_refuses_a_bad_base` | Push event, missing, malformed, non-ancestor, shallow → refusal; no command ran |
| 4.3 | integration | `test_no_commands_records_skips` | `--no-commands` → each command criterion skipped with its reason; counting commands never ran |
| 4.4 | integration | `test_init_writes_the_ci_workflow` | Fresh → one-step workflow written; differing file → refusal with bytes unchanged |
| 4.5 | manual | `manual_scratch_repository_pull_request` | Implementer opens a PR in a scratch repository using the action at the release candidate; evidence is the run URL in Session Notes |
| 5.1 | e2e | `test_first_run_journey` | Packed package in fresh temporary repositories → init, spec-less gate, GitHub mode with JSON, and update all succeed |
| 5.2 | unit | `test_readme_first_run_matches_journey` | Commands in README's first-run section → each appears in the journey test |
| | integration | `test_foreign_hooks_path_still_refuses` | Regression: another tool's `core.hooksPath` → existing refusal and suggestion |
| | integration | `test_engine_checkout_keeps_source_layout` | Regression: in the orly checkout, render and audits read sources at the root |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | The gate reports states and honest evidence (§1) | `bun test src -t "test_spec_less_gate_reports_skips\|test_gate_evidence"` | exit 0 | P0 | |
| R2 | A fresh install stays in `.orly/` and migrates (§2) | `bun test src -t "test_fresh_install_stays_in_one_folder\|test_update_moves_unchanged_copies"` | exit 0 | P0 | |
| R3 | Default install names no person or private tool (§3) | `bun test src -t test_default_install_names_no_person_or_private_tool` | exit 0 | P0 | |
| R4 | GitHub mode reads the event and refuses bad input (§4) | `bun test src -t "test_ci_github\|test_ci_mode"` | exit 0 | P0 | |
| R5 | The first-run journey completes (§5) | `bun test src -t test_first_run_journey` | exit 0 | P0 | |
| R6 | Scope holds | `git diff --name-only origin/main...HEAD` | 0 paths missing from Files Changed | P0 | |
| S1 | Declared conformance | `make conform` | exit 0 | P0 | |
| S2 | Declared verification | `bun test src` | exit 0 | P0 | |
| S3 | Governance invariance | `make audit` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S5 | No oversize source file | `git diff --name-only origin/main...HEAD \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | |

## Dead Code Sweep

N/A — no files deleted; `.oracle/orly.json` moves. The orly engine checkout keeps its own `.githooks`.

## Out of Scope

- Standalone executables and running without Bun. Indy, Sep 23, 2026: "Now i am not very much focussed on the binary version of orly, since its not a show stopper."
- Proof from the diff, where changed code must be run by a test that ran, and the learning loop that turns corrections into checks. Both follow in the next Milestone.
- Jev judgments, specified in M07_002, which depends on §1 of this spec.
- Profiles, upstream skill sources, and lock files, which existing tools cover.
- A separate `agentsfleet/orly-action` repository and a Marketplace listing; decided when a listing matters.
- Splitting Indy's toolchain into separate packs, and the vendor name in `docs/greptile-learnings/`.
- Product names inside rule history and script comments, including agentsfleet-specific scan roots in `audits/logging.sh` and `audits/ufs.sh`, which run only where a consumer wires them in.
- Clearing documentation findings inside orly's own corpus; consumer checks stop reporting them and orly's own gate keeps reporting them.
- GitLab CI; tamper resistance against a pull request that edits its own workflow, which depends on the maintainer's branch rules.
- Edits to agentsfleet or e2e-observability-platform, and changes to the GitHub repository description.

## Product Clarity (authoring record)

1. **Successful user moment** — A maintainer runs `orly init`, sees only agent files and `.orly/` in `git status`, runs `orly gate pr`, and every line says passed, failed, skipped, or reported; the same table appears on their next pull request.
2. **Preserved user behaviour** — agentsfleet and orly keep every rule line, command, gate order, override trailer, and hook behavior; only file locations move, through `orly update`.
3. **Optimal-way check** — The unconstrained shape also proves claims from the diff, which needs per-language coverage. Honest states, one folder, and CI are the base every later proof reports through.
4. **Rebuild-vs-iterate** — Iterate. The gate engine, packs, and markers are sound; the verdict type, installer root, and marker scope change.
5. **What we build** — Criterion states, gate evidence, the `.orly/` layout with migration and stale-citation report, marker filtering for every installed file, a GitHub mode, a composite action, `init --ci github`, a journey test, and a first-run README.
6. **What we do NOT build** — Profiles and skill sources, which existing tools cover; a transaction journal, which git provides; a model judge; a dashboard.
7. **Fit with existing features** — Compounds with `orly doctor`, the managed digest inventory, and pack markers. It must not break agentsfleet's harness, which migrates after release using the doctor list.
8. **Surface order** — Command line first; the action wraps the command.
9. **Dashboard restraint** — No dashboard or badge; the CI summary shows criterion states only, never a score.
10. **Confused-user next step** — `orly doctor` names the problem and the command to run; README's first-run section is the path.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Five Sections in dependency order. §1's states feed §4's CI summary; §2's layout and §3's filter feed §5's journey.
- **Alternatives considered:** The profiles draft `55b4c75` invests in skill distribution that existing tools cover and adds a journal git already provides. Keeping `.oracle/` and the root layout leaves someone else's rulebook in a stranger's `docs/`. A configurable rule root keeps two layouts alive, which the no-compatibility-aliases rule forbids. Event detection inside the action alone would leave it untestable here.
- **Order:** §1 lands first, then M07_002, then §§2–5, because Indy made the Jev work the priority and it reports through §1's states.
- **Patch-vs-refactor verdict:** this is a **refactor** of the installer layout, the verdict type, and the marker scope, plus an additive CI surface.

## Discovery (consult log)

- **Consults** — Sep 23, 2026: 10:10 AM, first-run audit of orly 0.10.14 in a throwaway TypeScript repository; figures in Problem. Blast radius: `git grep -F` for each of the 52 root-level managed targets and for `.oracle`, excluding managed files and done specs; counts in §2. Checked tools: `vercel-labs/skills`, `luisalima/skills-lock`, `pcomans/skills-lock`, `intellectronica/ruler`, Claude Code plugin marketplaces, and GitHub's composite action and Marketplace rules. Indy, this session: "Just because TARZY CTO propose the spec you donot have to agree to it. Just because the code is conceptualized the way it is, its not a great one to follow. What is relevant now, for distribution, for opensource folks to use must be seen more." He selected "Replace M07 (Recommended)", then asked "shoudl we say like .orly/ as opposed to .oracle" and "should this be CI action (agentsfleet-orly action?) that detects this", and asked for review by Codex.
- **Metrics review** — no analytics or funnel change; the existing usage observation already records CI runs.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand. Implementation proofs, `/review`, and post-push monitoring are pending.
- **Deferrals** — None. Out of Scope records Indy's scope decision on executables and the boundary of this Milestone.
