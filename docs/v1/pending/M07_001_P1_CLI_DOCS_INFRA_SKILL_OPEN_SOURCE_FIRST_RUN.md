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

# M07_001: A new repository gets an honest gate, instructions with nothing personal, and the same gate on every pull request

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 001
**Date:** Sep 23, 2026: 10:10 AM
**Status:** PENDING
**Priority:** P1 — an open-source user decides on the first run, and today that run shows nothing their Continuous Integration (CI) does not
**Categories:** CLI (Command-Line Interface), DOCS, INFRA (CI automation), SKILL (agent workflow skills)
**Batch:** B1 — release 0.12: §1 first; §§2–5 after M07_002, M07_003, M07_004, and M07_005
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report revision, commands, counts, and environment
**Depends on:** M07_005 for §4 and §5, which read the `.orly/` layout it creates
**Provenance:** Large Language Model (LLM)-drafted; Claude Opus 5.5; Sep 23, 2026; revised after Codex's review as Chief Technology Officer (CTO) of `58fedbc`. Replaces the unmerged profiles draft at `55b4c75`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Gates, Evidence

---

## Overview

**Goal (testable):** In a fresh repository with no spec, `orly gate pr` gives every criterion an explicit state, `orly init` detects the repository's user-facing surfaces so the documentation check works without setup, no installed file instructs the agent with a person's name or private tools, and a GitHub pull request check runs the same gate on the event's head commit with the same JSON evidence.

**Problem:** A first-run audit of orly 0.10.14 in a throwaway TypeScript repository on Sep 23, 2026, reproduced by the CTO review, found:
- `orly gate pr` printed 15 criteria. Nine printed green without checking anything; `docs.language` printed green while reporting 814 findings in files orly had just installed.
- `orly init` seeds `surfaces: undefined` (`src/config.ts:242`), so `docs.updated` is skipped in every repository that does not declare surfaces by hand.
- The generated rules file named no person, but 30 other installed files did, or named gstack, greptile, `~/Projects`, or `op read`; `dispatch/write_any.sh:47` prints "consult Indy".
- The gate cannot run on a pull request checkout, and `spec.gate` executes the checkout's own script (`src/criteria_spec.ts:46`).

**Solution summary:** Every criterion result carries a mandatory state, and the gate emits JSON evidence with per-invocation records. Personal instructions are marked for the persona pack, and markers inside code fences stay literal. `orly init` seeds surfaces from the package manifest. A GitHub mode binds evaluation to the event's head and merge base, and a composite action runs it on every pull request.

**Verdict and reason:** Rules and skills distribution is already served by Vercel's `skills` tool, by Ruler, and by Claude Code plugin marketplaces. orly's distinct offer is the gate and its evidence; this workstream makes that offer honest, useful without setup, and runnable in CI.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: an honest gate, locally and on every pull request`
- **Intent:** A stranger adopts orly in one command, sees exactly what its gate checked, and adds the same gate to every pull request with one workflow step.
- **Authoring handshake:** Indy directed an open-source-first release, chose `.orly/`, asked for an action that detects its own inputs, dropped standalone executables, and asked for one release, 0.12, "with all". The CTO review of `58fedbc` returned rework; this revision applies its findings.
- **ASSUMPTIONS I'M MAKING:** 1. The `.orly/` layout comes from M07_005. 2. Personal lines are marked for `persona.indy`, product lines for `product.agentsfleet`. 3. GitHub is the first CI provider. 4. Surface detection starts with `package.json`, `README.md`, and `docs/`; other ecosystems declare surfaces by hand. 5. Bun remains the runtime.
- **Implementer handshake:** pending until PLAN.

## Implementing agent — read these first

1. `src/criteria_support.ts`, `src/criteria.ts`, `src/criteria_spec.ts`, `src/gates.ts` — the `{ ok, detail }` verdict, every `ok: true` return that checks nothing, and the override that replaces a result.
2. `src/cli.ts` — the two-glyph gate printer and flag handling; 345 of 350 lines.
3. `src/config.ts` and `src/surfaces.ts` — command seeding, the unset surfaces, and the branch classifier `docs.updated` reads.
4. `src/references.ts` — the marker walker, which ignores code fences, and the citation checker, which honors them.
5. https://docs.github.com/en/actions/sharing-automations/creating-actions/publishing-actions-in-github-marketplace — one root `action.yml` in a public repository.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| `docs/v1/pending/M07_001_P1_CLI_DOCS_INFRA_SKILL_OPEN_SOURCE_FIRST_RUN.md` | CREATE, then lifecycle MOVE | Intent and proof ledger |
| `src/criteria_support.ts`, `src/criteria.ts`, `src/criteria_spec.ts`, `src/gates.ts` | EDIT | Mandatory states; override records; owned-document scan; engine spec checker in CI and command-free runs |
| `src/evidence.ts`, `src/evidence.test.ts`, `schemas/gate-evidence.schema.json` | CREATE | Evidence document with per-invocation records and tree digests |
| `src/cli_gate.ts`, `src/ci_github.ts`, `src/ci_github.test.ts` | CREATE | Gate command and printer moved out of `cli.ts`; event reader and revision binding |
| `src/cli.ts`, `src/cli.test.ts`, `src/surfaces.ts` | EDIT | Routing and `init --ci github`; shared evaluation context for base-comparing criteria |
| `src/surfaces_detect.ts`, `src/surfaces_detect.test.ts`, `src/config.ts`, `src/config.test.ts` | CREATE, EDIT | Surfaces seeded from the package manifest when absent |
| `src/render.ts`, `src/references.ts`, `src/render.test.ts`, `src/references.test.ts` | EDIT | Fence-aware markers; malformed markers refuse |
| `src/judge.ts`, `src/judge.test.ts` | EDIT | GitHub-mode judging after M07_002 lands |
| `src/setup.test.ts`, `src/gates.test.ts`, `src/criteria.test.ts`, `src/install.test.ts`, `src/gates_test_support.ts` | EDIT | State, marker, and regression proofs |
| `src/journey.test.ts`, `src/journey_support.ts`, `fixtures/requirements-0.10.14.md`, `fixtures/github-events/` | CREATE | First-run journey; requirement mapping; event fixtures |
| `core/operating-model.md`, `AGENTS.md` | EDIT | Personal lines marked in place; skipped glyph; regenerated render |
| `skills/orly-babysit-prs/SKILL.md`, `skills/orly-spec-new/SKILL.md`, `skills/orly-write-integration-test/SKILL.md`, `skills/orly-write-unit-test/SKILL.md` | EDIT | Personal instructions marked; review bots optional |
| `docs/TEMPLATE.md`, `docs/RELEASE_TEMPLATE.md`, `docs/CHANGELOG_VOICE.md`, `docs/DOCUMENTATION_RULES.md`, `docs/REST_API_DESIGN_GUIDELINES.md`, `docs/greptile-learnings/RULES.md` | EDIT | Personal instructions marked or reworded |
| `dispatch/lifecycle.md`, `dispatch/write_any.md`, `dispatch/write_any.sh`, `dispatch/name_architecture.md`, `dispatch/write_ts_adhere_bun.md`, `dispatch/write_changelog.md`, `dispatch/write_auth.md`, `dispatch/write_spec.md`, `dispatch/write_http.md` | EDIT | Personal instructions marked; printed messages name no person |
| `templates/github-workflow.yml`, `action.yml` | CREATE | Consumer workflow; composite action at the repository root |
| `package.json`, `src/pack_hygiene.test.ts` | EDIT | Ship `templates/`; package closure |
| `README.md`, `llms.txt`, `docs/ORLY_ARCHITECTURE.md` | EDIT | First-run path; machine setup; §§Gates, Evidence |

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: NDC (No Dead Code), NLG (No Legacy compat shims), UFS (Unified Form for Symbols), FLL (File and Function Length Limits), TGU (Tagged-Union over optional-field structs), TST-NAM (milestone-free test names), MSID (milestone identifiers banned in source), TSC and TSJ (TypeScript and Bun conventions), LOG (logging discipline).
- `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`, `dispatch/write_shell.md` — TypeScript and shell changes.
- `dispatch/edit_rules.md` — `src/**`, `core/**`, `dispatch/**`, and the generated `AGENTS.md` change; the default render changes, so the live comprehension evaluation runs.
- `dispatch/write_documentation.md` with `docs/DOCUMENTATION_RULES.md`; `dispatch/name_architecture.md` for `docs/ORLY_ARCHITECTURE.md`.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec Template | Yes | Pending metadata, Dimension-to-Test mapping, declared commands verbatim, at most 320 lines |
| TypeScript file shape; File & Function Length (≤350/≤50/≤70) | Yes | New modules for the gate command, event reader, evidence, and surface detection |
| Unified Form for Symbols; Logging; Milestone Identifier | Yes | States, reason codes, and paths as named constants; no milestone labels in source or tests |
| Governance invariance | Yes | `make audit`, the questionnaire, generated evidence, and the live comprehension evaluation |
| Rendered rules size | Yes | `make conform` reported 37,872 of 37,888 bytes; personal lines are marked in place, never duplicated, and the cap is not raised |
| Greptile review; Architecture consult | Yes | End-of-turn rule read; `docs/ORLY_ARCHITECTURE.md` updated with the first behavior |
| Schema removal; Zig; interface design tokens | No | No database schema, Zig, or rendered interface |

## Prior-Art / Reference Implementations

- **Superseded draft `55b4c75`:** its evidence constraints carry forward; profile sources, locks, and the transaction journal are dropped.
- **Filtering:** installed Markdown already passes the pack filter (`src/install.ts:303-306`); the citation checker already tracks fences (`src/references.ts:80-90`), which the marker walker adopts.
- **Command seeding:** `sniffCommands` in `src/config.ts` already reads `package.json` scripts and make targets; surface detection reads the same manifest.
- **CI install pattern:** agentsfleet's `governance.yml` sets up Bun and installs the pinned orly version; the action mirrors it.
- **7 Pillars of CLI developer experience:** command, handler, and error split; human and JSON renderers; subprocess tests. JSON stays behind `--json`, because hooks pipe gate output.

## Sections (implementation slices)

### §1 — The gate says what it checked

State is mandatory on every criterion result: passed, failed, skipped, reported, or overridden, with a reason code. There is no fallback from `ok`. Every return path is classified, including absent specs, absent surfaces, reporting-only findings, conditional suites, accepted dirtiness, unavailable history, and overrides; gate success derives from state. An override preserves the original result and its execution records and adds the override commit and a reason digest; human output shows the reason, JSON excludes free text. The printer shows 🟢 passed, 🔴 failed, ⚪ skipped, 🟠 reported, and overridden with its reason, then a count per state. In a consumer repository `docs.language` scans only repository-owned documents. `orly gate [work|verify|pr] --json` writes one evidence document to standard output and human lines to standard error: schema and orly versions, base and head, whether inputs came from the index or the working tree, pre-run and post-run tree digests, and per criterion its state and reason code. Each command invocation is its own record with command key, invocation index, argument-vector digest, exit status, duration, and output digest. Each invocation runs once; both renderers reuse its result. If evaluated inputs change during execution, the evidence reports itself invalidated. **Implementation default:** state is a required field of the result type, so the compiler rejects an unclassified return.

- **Dimension 1.1** — With no active spec and no surface, the eight spec criteria and `docs.updated` print as skipped with reasons, and the count line reports them as skipped → Test `test_spec_less_gate_reports_skips`
- **Dimension 1.2** — In a consumer checkout, `docs.language` reports findings from repository-owned documents only → Test `test_consumer_docs_language_scans_owned_documents`
- **Dimension 1.3** — Accepted dirtiness, a skipped suite, reporting-only findings, unknowable ordering, an absent spec, and an absent surface each yield their named non-passed state → Test `test_every_criterion_path_has_a_state`
- **Dimension 1.4** — An overridden failure keeps its original state and execution records and adds the override commit and reason digest; JSON carries no reason text → Test `test_override_preserves_original_result`
- **Dimension 1.5** — `--json` output validates against the schema, a two-invocation command group yields two indexed records, and each invocation ran once → Test `test_gate_evidence_records_each_invocation`
- **Dimension 1.6** — Sentinel secrets in the environment, in command arguments, and in command output never appear in the evidence → Test `test_gate_evidence_excludes_secrets_and_output`
- **Dimension 1.7** — A file changed while commands run marks the evidence invalidated, and the input source is recorded → Test `test_evidence_invalidates_on_tree_change`

### §2 — Installed instructions assume nothing about the user

The install filter already applies to every installed Markdown file; this Section marks the content. Instruction lines naming Indy, Kishore, Aiwa, gstack, greptile as a reviewer, `~/Projects`, `op read`, or the shared docs repository are marked for `persona.indy` in place, with inline markers where a neutral requirement stays on the same line; agentsfleet instructions are marked for `product.agentsfleet`. Neutral requirements remain for everyone: an adversarial diff review before documentation, the repository owner's quoted approval for a deferral, and credentials resolved at runtime and never printed. Messages installed scripts print name no person. The orly-babysit-prs skill finishes its loop when no review bot posts. Markers are active only outside fenced code blocks; nested, unknown, unmatched, or unclosed active markers refuse installation before writes; literal marker examples remain unchanged.

- **Dimension 2.1** — A default install's rendered rules, installed Markdown, and script messages contain none of `Indy`, `Kishore`, `Aiwa`, `gstack`, `~/Projects`, `op read`, or `greptile` outside the `greptile-learnings` path → Test `test_default_install_names_no_person_or_private_tool`
- **Dimension 2.2** — The persona selection preserves each prior normative requirement after the mapping in `fixtures/requirements-0.10.14.md`, which enumerates every approved wording change → Test `test_indy_render_keeps_every_requirement`
- **Dimension 2.3** — A fenced marker example survives install unchanged; a malformed marker refuses before writes; the rendered rules stay within the existing byte cap → Test `test_markers_respect_fences_and_refuse_malformed`

### §3 — The documentation check works without setup

`orly init` seeds `surfaces` when the field is absent instead of leaving it undefined. User surfaces come from `package.json`: its `bin` targets and the files `main` and `exports` name. Documentation surfaces come from `README.md` and a top-level `docs/` directory. Init prints what it found for the user to confirm. Without a `package.json` it seeds nothing, and `docs.updated` stays skipped with the reason that no surface is declared or detected. Neither `init` nor `update` overwrites a declared `surfaces` block. With seeded surfaces, a change to a user-facing file without a documentation change fails `docs.updated`, exactly as declared surfaces do today.

- **Dimension 3.1** — Init on a package with `bin` and `main` seeds those paths as user surfaces and `README.md` plus `docs/` as documentation surfaces, and prints them → Test `test_init_detects_package_surfaces`
- **Dimension 3.2** — A repository without `package.json` seeds nothing, and a declared `surfaces` block survives `init` and `update` unchanged → Test `test_surface_detection_never_guesses_or_overwrites`
- **Dimension 3.3** — With seeded surfaces, changing the `bin` target without a documentation change fails `docs.updated`, and adding a README change passes it → Test `test_seeded_surfaces_drive_docs_updated`

### §4 — The same gate runs on every pull request

`orly gate pr --ci github` reads the pull request event and records the event base tip, event head, evaluated head, and their merge base separately. The checkout must equal the event head. The workflow fetches enough history to resolve both commits and prove their merge base; diff-sensitive criteria, override discovery, and spec discovery share that context. A branch behind its base is a separate `reported` policy result, never malformed input. Missing objects, unrelated histories, a mismatched checkout, an unresolved shallow history, and a merge-ref checkout in head mode refuse before commands run; `--base` and `--head-ref` override the event. With `--no-commands`, nothing from the evaluated checkout executes, the spec-template script included; structural checks use the installed engine, and command criteria report that commands were not executed. `orly init --ci github` writes `.github/workflows/orly.yml`: `pull_request` only, read-only permissions, checkout without persisted credentials, and the orly step, with setup and coverage steps first when a Bun project is detected; a differing file refuses unchanged. The composite `action.yml`, named "orly gate", identifies its own revision and the installed engine version separately, declares supported engine and evidence-schema versions, and rejects incompatible pins before evaluation; its tag and the repository's pinned engine version need not match. Its `lcov` input passes a coverage file produced earlier in the job to M07_003's `diff.covered`, and M07_004's `rules.delivered` reports skipped in CI because delivery happens where the author commits. It writes a state table to the job summary and uploads evidence even after gate failure, without replacing the exit status. `pull_request_target` is rejected. M07_002 judging runs in this mode only when maintainers set the repository variable `ORLY_JUDGE_UPLOAD` to `allow` and supply the provider key as a secret; forks receive no key, and local records are ignored. Usage telemetry already reports CI runs (`src/telemetry.ts:258`).

- **Dimension 4.1** — With event fixtures where the base advanced after branching, base tip, head, and merge base are recorded, criteria compare against the merge base, and the lag is reported → Test `test_ci_github_binds_to_event_head`
- **Dimension 4.2** — A non-pull-request event, `pull_request_target`, missing objects, unrelated histories, a mismatched checkout, a merge-ref checkout, and unresolved shallow history each refuse before commands run → Test `test_ci_mode_refuses_bad_revisions`
- **Dimension 4.3** — With `--no-commands`, a planted checkout `audits/spec-template.sh` never executes, structural checks still run, and command criteria report not executed → Test `test_no_commands_runs_nothing_from_checkout`
- **Dimension 4.4** — `orly init --ci github` writes the workflow with read-only permissions and no persisted credentials, adding coverage steps for a Bun project; a differing file refuses unchanged → Test `test_init_writes_the_ci_workflow`
- **Dimension 4.5** — Judging runs only with the maintainer variable and a key; a fork or a missing variable skips it with a reason; local records are ignored → Test `test_ci_judging_requires_maintainer_setting`
- **Dimension 4.6** — In a scratch repository, a pull request shows the "orly gate" check and its evidence; an incompatible pin fails before evaluation; a failing gate still uploads evidence → Test `manual_scratch_repository_pull_request`

### §5 — A stranger's first run is proved and documented

Depends on §§1–4, M07_003, M07_004, and M07_005. An end-to-end test packs the package, installs it into temporary repositories with no orly history, and walks `init` with detected surfaces, a spec-less `gate pr`, an untested function that fails `diff.covered`, the first commit that receives its rules, `gate pr --ci github --json` over an advanced-base event with a coverage file, and `update` from the 0.10.14 layout. README opens with that path; `llms.txt` carries the machine version; `docs/ORLY_ARCHITECTURE.md` updates §§Gates and Evidence.

- **Dimension 5.1** — The packed journey completes in fresh temporary repositories without the author checkout → Test `test_first_run_journey`
- **Dimension 5.2** — Every orly command in README's first-run section appears in the journey test → Test `test_readme_first_run_matches_journey`

## Interfaces

```
orly gate [work|verify|pr] [--json] [--accept-dirty]
orly gate pr --ci github [--base <full-commit>] [--head-ref <name>] [--no-commands] [--lcov <path>] [--json]
orly init [--ci github] [--force] [--no-hooks] [--with <PACK>] [--dry-run] [--json]

Seeded when absent (.orly/orly.json):  "surfaces": { "user": ["bin/cli.ts", "src/index.ts"], "docs": ["README.md", "docs/"] }
Workflow written by init --ci github: on pull_request; permissions contents: read; checkout with
  persist-credentials: false and enough history; Bun setup and coverage when detected;
  uses: agentsfleet/orly@v0.12.0 with lcov: coverage/lcov.info

Evidence (schemas/gate-evidence.schema.json), no free text:
{ "schema_version": 1, "orly_version": "0.12.0", "source": "working_tree",
  "event": { "base_tip": "<40 hex>", "head": "<40 hex>", "merge_base": "<40 hex>" },
  "tree_digest": { "before": "sha256:<hex>", "after": "sha256:<hex>" }, "invalidated": false,
  "gates": [ { "gate": "pr", "criteria": [
    { "name": "cmd.verify.unit", "state": "passed", "invocations": [ { "index": 0, "command_key": "verify.unit",
      "argv_digest": "sha256:<hex>", "exit_code": 0, "duration_ms": 812, "output_digest": "sha256:<hex>" } ] },
    { "name": "spec.dimensions", "state": "skipped", "reason": "no_active_spec" },
    { "name": "docs.updated", "state": "overridden", "original_state": "failed",
      "override": { "commit": "<40 hex>", "reason_digest": "sha256:<hex>" } } ] } ] }

Exit: 0 when no criterion failed; 1 when one failed; usage errors keep their current status.
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Nothing to check | No spec, no surface | Skipped with reasons, never counted passed; `test_spec_less_gate_reports_skips` |
| Unclassified return | A criterion returns without a state | Compile error; `test_every_criterion_path_has_a_state` |
| Secret exposure | A command prints or receives a token | Digests only; `test_gate_evidence_excludes_secrets_and_output` |
| Tree changed mid-run | A file edits during commands | Evidence marked invalidated; `test_evidence_invalidates_on_tree_change` |
| Malformed marker | Nested, unknown, unmatched, or unclosed | Refuse before writes; fenced examples stay; `test_markers_respect_fences_and_refuse_malformed` |
| No manifest | No `package.json` | Nothing seeded; `docs.updated` skipped with reason; `test_surface_detection_never_guesses_or_overwrites` |
| Declared surfaces | The user already declared them | Never overwritten; `test_surface_detection_never_guesses_or_overwrites` |
| Bad CI revision | Missing objects, unrelated history, wrong or merge-ref checkout, shallow | Refuse before commands; `test_ci_mode_refuses_bad_revisions` |
| Untrusted execution | Checkout script under `--no-commands`, or `pull_request_target` | Engine checks only; event refused; `test_no_commands_runs_nothing_from_checkout` |
| Fork pull request | No provider key | Judging skipped with reason; `test_ci_judging_requires_maintainer_setting` |
| Foreign hook owner | Another tool owns `core.hooksPath` | Existing refusal stands; `test_foreign_hooks_path_still_refuses` |

## Invariants

1. Every criterion result carries a state — the result type requires it.
2. Evidence carries no argument values, environment values, raw output, or free text — the serializer writes from a field allowlist.
3. Surface detection never overwrites declared surfaces — init writes the field only when it is absent.
4. CI mode evaluates only the event head with a proven merge base — revision checks run before any criterion.
5. `--no-commands` executes nothing from the evaluated checkout — the runner refuses checkout paths in that mode.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| Existing usage observation, unchanged | product | A command completes with prior anonymous consent | Existing fields, including the `ci` invocation | Evidence content, paths, and commands never enter telemetry | Existing `src/telemetry.test.ts` suite |

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | integration | `test_spec_less_gate_reports_skips` | Spec-less repository → nine skipped lines with reasons; count line shows skipped |
| 1.2 | integration | `test_consumer_docs_language_scans_owned_documents` | Bad owned page and bad managed pages → findings name only the owned page |
| 1.3 | unit | `test_every_criterion_path_has_a_state` | Six fixtures for the listed paths → six named non-passed states |
| 1.4 | integration | `test_override_preserves_original_result` | Failed criterion plus override commit → `overridden`, original `failed`, records kept, no reason text in JSON |
| 1.5 | integration | `test_gate_evidence_records_each_invocation` | Two-invocation group with counters → two indexed records; each counter incremented once |
| 1.6 | integration | `test_gate_evidence_excludes_secrets_and_output` | Sentinels in environment, arguments, and output → absent from JSON |
| 1.7 | integration | `test_evidence_invalidates_on_tree_change` | A command that edits a tracked file → `invalidated: true`; digests differ |
| 2.1 | integration | `test_default_install_names_no_person_or_private_tool` | Default install → zero matches outside `greptile-learnings` |
| 2.2 | integration | `test_indy_render_keeps_every_requirement` | agentsfleet's packs → every mapped requirement present; only enumerated wording changes differ |
| 2.3 | unit | `test_markers_respect_fences_and_refuse_malformed` | Fenced example → unchanged; nested or unclosed marker → refusal, no writes; size within cap |
| 3.1 | integration | `test_init_detects_package_surfaces` | `package.json` with `bin` and `main`, README, `docs/` → those paths seeded and printed |
| 3.2 | integration | `test_surface_detection_never_guesses_or_overwrites` | No manifest → nothing seeded; declared block → unchanged after init and update |
| 3.3 | integration | `test_seeded_surfaces_drive_docs_updated` | `bin` target changed alone → `docs.updated` failed; with a README change → passed |
| 4.1 | integration | `test_ci_github_binds_to_event_head` | Base advanced after branching → merge base used; lag reported; `--base` overrides |
| 4.2 | unit | `test_ci_mode_refuses_bad_revisions` | Seven bad inputs → refusal before any command |
| 4.3 | integration | `test_no_commands_runs_nothing_from_checkout` | Planted script writing a sentinel → sentinel absent; structural checks ran |
| 4.4 | integration | `test_init_writes_the_ci_workflow` | Bun project → workflow with setup, coverage, read permissions, no persisted credentials; differing file → refusal |
| 4.5 | integration | `test_ci_judging_requires_maintainer_setting` | Variable absent, fork without key, planted record → judging skipped or asked fresh |
| 4.6 | manual | `manual_scratch_repository_pull_request` | Implementer runs the action in a scratch repository; run URLs for pass, incompatible pin, and failing gate in Session Notes |
| 5.1 | e2e | `test_first_run_journey` | Packed package in fresh repositories → every journey step succeeds or fails as written |
| 5.2 | unit | `test_readme_first_run_matches_journey` | README first-run commands → each appears in the journey test |
| | integration | `test_foreign_hooks_path_still_refuses` | Regression: another tool's `core.hooksPath` → existing refusal |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Every criterion has a state and honest evidence (§1) | `bun test src -t "test_every_criterion_path\|test_gate_evidence\|test_override_preserves"` | exit 0 | P0 | |
| R2 | Default install names no person or private tool (§2) | `bun test src -t "test_default_install\|test_markers_respect"` | exit 0 | P0 | |
| R3 | Surfaces are detected and drive the documentation check (§3) | `bun test src -t "test_init_detects\|test_surface_detection\|test_seeded_surfaces"` | exit 0 | P0 | |
| R4 | GitHub mode binds to the event head and runs nothing untrusted (§4) | `bun test src -t "test_ci_github\|test_ci_mode\|test_no_commands"` | exit 0 | P0 | |
| R5 | The first-run journey completes (§5) | `bun test src -t test_first_run_journey` | exit 0 | P0 | |
| R6 | Scope holds | `git diff --name-only origin/main...HEAD` | 0 paths missing from Files Changed | P0 | |
| S1 | Declared conformance | `make conform` | exit 0 | P0 | |
| S2 | Declared verification | `bun test src` | exit 0 | P0 | |
| S3 | Governance invariance | `make audit` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S5 | No oversize source file | `git diff --name-only origin/main...HEAD \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | |

## Dead Code Sweep

N/A — no files deleted.

## Out of Scope

- The `.orly/` layout and migration (M07_005), Jev judgments (M07_002), changed-line test proof (M07_003), and rule delivery at edit and commit time (M07_004), all in release 0.12.
- Standalone executables. Indy, Sep 23, 2026: "Now i am not very much focussed on the binary version of orly, since its not a show stopper."
- Surface detection beyond `package.json`, `README.md`, and `docs/`; other ecosystems declare surfaces by hand.
- The correction-learning loop; profiles, upstream skill sources, and lock files; a separate `agentsfleet/orly-action` repository and a Marketplace listing.
- Splitting Indy's toolchain into separate packs; product names inside rule history and script comments; clearing documentation findings inside orly's own corpus; GitLab CI.
- Edits to agentsfleet or e2e-observability-platform, and the repository description.

## Product Clarity (authoring record)

1. **Successful user moment** — A maintainer runs `orly init`, sees the surfaces it found, runs `orly gate pr`, and every line names its state; the same table appears on their next pull request.
2. **Preserved user behaviour** — agentsfleet and orly keep every rule requirement, command, gate order, override trailer, and hook behavior.
3. **Optimal-way check** — Detecting surfaces from one manifest leaves other ecosystems to declare theirs; the documented declaration closes that gap until more detectors earn their place.
4. **Rebuild-vs-iterate** — Iterate. The gate engine, packs, and markers are sound; the result type, marker parser, surface seeding, and CI binding change.
5. **What we build** — States and evidence, marked personal instructions, surface detection, a GitHub mode, a composite action, `init --ci github`, a journey test, and a first-run README.
6. **What we do NOT build** — Profiles and skill sources; a dashboard; detectors for every ecosystem.
7. **Fit with existing features** — Compounds with `orly doctor`, pack markers, and the other four workstreams of release 0.12; it must not break agentsfleet's harness.
8. **Surface order** — Command line first; the action wraps the command.
9. **Dashboard restraint** — No dashboard or badge; the CI summary shows criterion states only, never a score.
10. **Confused-user next step** — `orly doctor` names the problem and the command to run; README's first-run section is the path.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Five Sections. §1's states feed every other workstream; §4 and §5 read M07_005's layout.
- **Order:** release 0.12: §1, then M07_002, then M07_003 and M07_004, then M07_005, then §§2–5, because Jev is the priority and reports through §1's states, and CI binds to the final layout.
- **Alternatives considered:** The profiles draft duplicated existing skill tools and git. Requiring the base tip to be an ancestor of the head refuses every branch whose base advanced. Asking every user to declare surfaces leaves the documentation check off for nearly all of them.
- **Patch-vs-refactor verdict:** this is a **refactor** of the result type, marker parser, surface seeding, and CI binding.

## Discovery (consult log)

- **Consults** — Sep 23, 2026: 10:10 AM, first-run audit of orly 0.10.14; figures in Problem. Codex's CTO review of `58fedbc` returned rework with twelve findings; each cited line was verified before revision (`src/criteria_spec.ts:46`, `src/criteria.ts:87,125,174,194`, `src/gates.ts:56-61`, `src/install.ts:303-306`, `src/references.ts:30-40`). Indy, this session: "What is relevant now, for distribution, for opensource folks to use must be seen more"; he selected "Replace M07 (Recommended)", "Add diff proof, move folder (Recommended)", and "Both A and B", then: "Also i want 0.12 move to .orly/ folder in one spec" and "so we create one release 0.12 with all".
- **Metrics review** — no analytics or funnel change; the usage observation already records CI runs.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand. Implementation proofs, `/review`, and post-push monitoring are pending.
- **Deferrals** — None.
