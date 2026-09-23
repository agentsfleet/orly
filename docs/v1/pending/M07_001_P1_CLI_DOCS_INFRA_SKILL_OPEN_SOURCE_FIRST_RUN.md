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
**Batch:** B1 — §1 first, then M07_002, then §§2–5
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report revision, commands, counts, and environment
**Depends on:** none
**Provenance:** Large Language Model (LLM)-drafted; Claude Opus 5.5; Sep 23, 2026; revised after Codex's review as Chief Technology Officer (CTO) of `58fedbc`. Replaces the unmerged profiles draft at `55b4c75`.
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Topology, Gates, Evidence

---

## Overview

**Goal (testable):** In a fresh repository with no spec, `orly init` writes only the agent entry files, the host skill folders, and `.orly/`; no installed file instructs the agent with a person's name or private tools; and `orly gate pr` gives every criterion an explicit state, with the same JSON evidence on a laptop and in a GitHub pull request check bound to the event's head commit.

**Problem:** A first-run audit of orly 0.10.14 in a throwaway TypeScript repository on Sep 23, 2026, reproduced by the CTO review, found:
- `orly init` wrote 45 files: 13 under `dispatch/`, 7 under `audits/`, and 6 into the user's own `docs/`.
- `orly gate pr` printed 15 criteria. Nine printed green without checking anything; `docs.language` printed green while reporting 814 findings in files orly had just installed.
- The generated rules file named no person, but 30 other installed files did, or named gstack, greptile, `~/Projects`, or `op read`; `dispatch/write_any.sh:47` prints "consult Indy".
- The gate cannot run on a pull request checkout, and `spec.gate` executes the checkout's own script (`src/criteria_spec.ts:46`).

**Solution summary:** Every criterion result carries a mandatory state, and the gate emits JSON evidence with per-invocation records. Everything orly installs, configuration and generated rules included, moves under `.orly/` through an ordered, resumable migration. Personal instructions are marked for the persona pack, and markers inside code fences stay literal. A GitHub mode binds evaluation to the event's head and merge base, and a composite action runs it on every pull request.

**Verdict and reason:** Rules and skills distribution is already served by Vercel's `skills` tool with `skills-lock.json`, by Ruler, and by Claude Code plugin marketplaces. orly's distinct offer is the gate and its evidence; this Milestone makes that offer honest and runnable in CI, and shrinks what orly leaves in someone else's repository.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat: install into .orly/ and run an honest gate locally and in CI`
- **Intent:** A stranger adopts orly in one command, sees exactly what its gate checked, and adds the same gate to every pull request with one workflow step.
- **Authoring handshake:** Indy directed an open-source-first 0.11, chose `.orly/`, asked for an action that detects its own inputs, and dropped standalone executables. The CTO review of `58fedbc` returned rework; this revision applies its twelve findings.
- **ASSUMPTIONS I'M MAKING:** 1. `.orly/` replaces `.oracle/`; after migration nothing reads `.oracle/`. 2. Personal lines are marked for `persona.indy`, product lines for `product.agentsfleet`. 3. GitHub is the first CI provider. 4. Consumers stay pinned until one migration change carries path moves, caller changes, workflow configuration, and passing harness checks. 5. Bun remains the runtime.
- **Implementer handshake:** pending until PLAN.

## Implementing agent — read these first

1. `src/criteria_support.ts`, `src/criteria.ts`, `src/criteria_spec.ts`, `src/gates.ts` — the `{ ok, detail }` verdict, every `ok: true` return that checks nothing, and the override that replaces a result.
2. `src/cli.ts` — the two-glyph gate printer and flag handling; 345 of 350 lines.
3. `src/install.ts`, `src/loaders.ts`, `src/config.ts` — write order, the Markdown filter already applied at install, the host import of `AGENTS.orly.md`, and the `.oracle` constant.
4. `src/references.ts` — the marker walker, which ignores code fences, and the citation checker, which honors them.
5. `dispatch/lib.sh` and `audits/rule-ledger-lib.sh` — payload root separated from target root in one, root-relative lookups in the other.
6. https://docs.github.com/en/actions/sharing-automations/creating-actions/publishing-actions-in-github-marketplace — one root `action.yml` in a public repository.

## Files Changed (blast radius)

Blast-radius rule: tracked files citing the string, minus the repository's managed files, the generated `AGENTS.orly.md`, and spec documents under `docs/v*/done/` and `docs/v*/pending/`.

| File | Action | Why |
|---|---|---|
| `docs/v1/pending/M07_001_P1_CLI_DOCS_INFRA_SKILL_OPEN_SOURCE_FIRST_RUN.md` | CREATE, then lifecycle MOVE | Intent and proof ledger |
| `src/criteria_support.ts`, `src/criteria.ts`, `src/criteria_spec.ts`, `src/gates.ts` | EDIT | Mandatory states; override records; owned-document scan; engine spec checker in CI and command-free runs |
| `src/evidence.ts`, `src/evidence.test.ts`, `schemas/gate-evidence.schema.json` | CREATE | Evidence document with per-invocation records and tree digests |
| `src/cli_gate.ts`, `src/ci_github.ts`, `src/ci_github.test.ts` | CREATE | Gate command and printer moved out of `cli.ts`; event reader and revision binding |
| `src/cli.ts`, `src/cli.test.ts`, `src/surfaces.ts` | EDIT | Routing, `init --ci github`; shared evaluation context for base-comparing criteria |
| `src/install_migrate.ts` | CREATE | Ordered migration and stale-citation scan, outside `install.ts` for the length cap |
| `src/install.ts`, `src/config.ts`, `src/validation.ts`, `src/verify.ts`, `src/loaders.ts`, `src/loaders.test.ts` | EDIT | `.orly/` root; generated rules at `.orly/AGENTS.md`; host import and OpenCode paths |
| `src/doc_rules.ts`, `src/doc_reader.ts` | EDIT, CREATE | Shared configuration path replaces the duplicate at `doc_rules.ts:56`; split below 350 lines |
| `src/render.ts`, `src/references.ts` | EDIT | Fence-aware markers; malformed markers refuse; one citation map |
| `src/judge.ts`, `src/judge.test.ts` | EDIT | GitHub-mode judging after M07_002 lands |
| `src/render.test.ts`, `src/references.test.ts`, `src/install.test.ts`, `src/install_packs.test.ts`, `src/install_nested.test.ts`, `src/setup.test.ts`, `src/gates.test.ts`, `src/criteria.test.ts`, `src/config.test.ts`, `src/spec_baseline.test.ts`, `src/spec_template_io.test.ts`, `src/gates_test_support.ts` | EDIT | State, layout, migration, marker, and `.orly/` proofs |
| `src/journey.test.ts`, `src/journey_support.ts`, `fixtures/layout-0.10/`, `fixtures/requirements-0.10.14.md`, `fixtures/github-events/` | CREATE | First-run journey; 0.10.14 layout; requirement mapping; event fixtures |
| `evals/install/cases.sh`, `evals/install/release_cases.sh`, `evals/llms/fixtures.jsonl` | EDIT | `.orly/` paths |
| `.orly/orly.json` | MOVE from `.oracle/orly.json` | This repository's own configuration |
| `audits/rule-paths.sh`, `audits/rule-ledger-lib.sh`, `audits/agents-md.md`, `audits/spec-template.sh`, `audits/spec-template.ts` | EDIT | Consumer layout; payload root versus evaluated repository; `.orly/` |
| `core/operating-model.md`, `AGENTS.md` | EDIT | Personal lines marked in place; skipped glyph; `.orly/`; regenerated render |
| `skills/orly-babysit-prs/SKILL.md`, `skills/orly-spec-new/SKILL.md`, `skills/orly-write-integration-test/SKILL.md`, `skills/orly-write-unit-test/SKILL.md` | EDIT | Personal instructions marked; review bots optional |
| `docs/TEMPLATE.md`, `docs/RELEASE_TEMPLATE.md`, `docs/CHANGELOG_VOICE.md`, `docs/DOCUMENTATION_RULES.md`, `docs/REST_API_DESIGN_GUIDELINES.md`, `docs/VERIFY_TIERS.md`, `docs/greptile-learnings/RULES.md` | EDIT | Personal instructions marked or reworded; `.orly/` |
| `dispatch/lifecycle.md`, `dispatch/write_any.md`, `dispatch/write_any.sh`, `dispatch/lib.sh`, `dispatch/edit_rules.md`, `dispatch/verify.md`, `dispatch/name_architecture.md`, `dispatch/write_ts_adhere_bun.md`, `dispatch/write_changelog.md`, `dispatch/write_auth.md`, `dispatch/write_spec.md`, `dispatch/write_http.md`, `dispatch/write_go.md`, `dispatch/write_python.md`, `dispatch/write_rust.md`, `dispatch/write_shell.md`, `dispatch/write_zig.md` | EDIT | Personal instructions marked; printed messages name no person; `.orly/` |
| `packs/language/go/rules.md`, `packs/language/python/rules.md`, `packs/language/rust/rules.md`, `packs/language/shell/rules.md` | EDIT | `.orly/` citations |
| `templates/github-workflow.yml`, `action.yml` | CREATE | One-step consumer workflow; composite action at the repository root |
| `package.json`, `src/pack_hygiene.test.ts` | EDIT | Ship `templates/`; package closure |
| `.gitignore`, `.gitleaks.toml`, `.gitleaksignore`, `.github/workflows/release.yml` | EDIT | `.orly/` paths; each needs Indy's approval at CHORE(open) |
| `README.md`, `llms.txt`, `docs/ORLY_ARCHITECTURE.md` | EDIT | First-run path; machine setup; §§Topology, Gates, Evidence |

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: NDC (No Dead Code), NLG (No Legacy compat shims), NLR (No Legacy Retained), UFS (Unified Form for Symbols), ORP (Orphan sweep on rename), FLL (File and Function Length Limits), TGU (Tagged-Union over optional-field structs), TST-NAM (milestone-free test names), MSID (milestone identifiers banned in source), TSC and TSJ (TypeScript and Bun conventions), LOG (logging discipline).
- `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`, `dispatch/write_shell.md` — TypeScript and shell changes.
- `dispatch/edit_rules.md` — `src/**`, `core/**`, `audits/**`, `dispatch/**`, `packs/**`, and the generated `AGENTS.md` change; the default render changes, so the live comprehension evaluation runs.
- `dispatch/write_documentation.md` with `docs/DOCUMENTATION_RULES.md`; `dispatch/name_architecture.md` for `docs/ORLY_ARCHITECTURE.md`.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec Template | Yes | Pending metadata, Dimension-to-Test mapping, declared commands verbatim, at most 320 lines |
| TypeScript file shape; File & Function Length (≤350/≤50/≤70) | Yes | New modules for the gate command, event reader, evidence, and migration; `doc_rules.ts` splits because the rename touches it |
| Unified Form for Symbols; Logging; Milestone Identifier | Yes | One `.orly` constant; states, reason codes, and paths as named constants; no milestone labels in source or tests |
| Governance invariance | Yes | `make audit`, the questionnaire, generated evidence, and the live comprehension evaluation |
| Rendered rules size | Yes | `make conform` reported 37,872 of 37,888 bytes; personal lines are marked in place, never duplicated, and the cap is not raised |
| CI/CD (Continuous Delivery) edit; secret-scanner files | Yes | `release.yml`, `.gitleaks.toml`, and `.gitleaksignore` change only their `.oracle` paths, after Indy's approval at CHORE(open) |
| Greptile review; Architecture consult | Yes | End-of-turn rule read; `docs/ORLY_ARCHITECTURE.md` updated with the first behavior |
| Schema removal; Zig; interface design tokens | No | No database schema, Zig, or rendered interface |

## Prior-Art / Reference Implementations

- **Superseded draft `55b4c75`:** its evidence constraints carry forward. Profile sources, locks, and the transaction journal are dropped; migration uses ordered steps with verified retries instead.
- **Filtering:** installed Markdown already passes the pack filter (`src/install.ts:303-306`); the citation checker already tracks fences (`src/references.ts:80-90`), which the marker walker adopts.
- **Payload root:** `dispatch/lib.sh:40` separates the installed payload from the evaluated repository; `audits/rule-ledger-lib.sh` adopts the same split.
- **CI install pattern:** agentsfleet's `governance.yml` sets up Bun and installs the pinned orly version; the action mirrors it.
- **7 Pillars of CLI developer experience:** command, handler, and error split; human and JSON renderers; subprocess tests. JSON stays behind `--json`, because hooks pipe gate output.

## Sections (implementation slices)

### §1 — The gate says what it checked

State is mandatory on every criterion result: passed, failed, skipped, reported, or overridden, with a reason code. There is no fallback from `ok`. Every return path is classified, including absent specs, absent surfaces, reporting-only findings, conditional suites, accepted dirtiness, unavailable history, and overrides; gate success derives from state. An override preserves the original result and its execution records and adds the override commit and a reason digest; human output shows the reason, JSON excludes free text. The printer shows 🟢 passed, 🔴 failed, ⚪ skipped, 🟠 reported, and overridden with its reason, then a count per state. In a consumer repository `docs.language` scans only repository-owned documents. `orly gate [work|verify|pr] --json` writes one evidence document to standard output and human lines to standard error: schema and orly versions, base and head, whether inputs came from the index or the working tree, pre-run and post-run tree digests, and per criterion its state and reason code. Each command invocation is its own record with command key, invocation index, argument-vector digest, exit status, duration, and output digest. Each invocation runs once; both renderers reuse its result. If evaluated inputs change during execution, the evidence reports itself invalidated. **Implementation default:** state is a required field of the result type, so the compiler rejects an unclassified return.

- **Dimension 1.1** — With no active spec and no declared surface, the eight spec criteria and `docs.updated` print as skipped with reasons, and the count line reports them as skipped → Test `test_spec_less_gate_reports_skips`
- **Dimension 1.2** — In a consumer checkout, `docs.language` reports findings from repository-owned documents only → Test `test_consumer_docs_language_scans_owned_documents`
- **Dimension 1.3** — Accepted dirtiness, a skipped suite, reporting-only findings, unknowable ordering, an absent spec, and an absent surface each yield their named non-passed state → Test `test_every_criterion_path_has_a_state`
- **Dimension 1.4** — An overridden failure keeps its original state and execution records and adds the override commit and reason digest; JSON carries no reason text → Test `test_override_preserves_original_result`
- **Dimension 1.5** — `--json` output validates against the schema, a two-invocation command group yields two indexed records, and each invocation ran once → Test `test_gate_evidence_records_each_invocation`
- **Dimension 1.6** — Sentinel secrets in the environment, in command arguments, and in command output never appear in the evidence → Test `test_gate_evidence_excludes_secrets_and_output`
- **Dimension 1.7** — A file changed while commands run marks the evidence invalidated, and the input source is recorded → Test `test_evidence_invalidates_on_tree_change`

### §2 — Everything orly installs lives in `.orly/`

In a consumer repository the configuration lives at `.orly/orly.json`, the generated rules at `.orly/AGENTS.md`, hooks under `.orly/hooks/`, and managed rules, audits, and documents at their source-relative paths under `.orly/`. The repository-owned root `AGENTS.md` host, `CLAUDE.md`, and `opencode.json` keep user content and load `.orly/AGENTS.md` through their supported mechanisms. Installation builds one source-to-installed map and rewrites only recognized managed references: Markdown link destinations, exact path tokens, and declared command examples. It preserves URLs, unrelated substrings, and already rewritten paths, resolves relative links from the destination document, and is idempotent. Installed scripts separate the payload root from the evaluated repository. Migration requires a committed prior installation and exclusive access. Preflight inventories source bytes, destination collisions, symlinks, executable modes, loader blocks, and hook ownership before any mutation. The old inventory is kept until every new payload file is verified. New payloads install before loaders and hooks switch; the new configuration is written atomically after those switches; old managed copies and the old configuration go last. A retry recognizes identical completed destinations and refuses conflicting bytes without overwriting them. `git status` is diagnostic output, never the recovery mechanism. Before migration every command except `orly update` names it. `orly doctor` lists repository-owned files citing an old managed path or `.oracle/`, by file and line. The engine checkout keeps its source layout. Under the Files Changed rule, agentsfleet at `b1bc6f0c4` owned 50 files citing a managed path and 11 citing `.oracle`; e2e-observability-platform at `8b4d75d` owned 10 and 3.

- **Dimension 2.1** — A fresh `orly init` adds nothing at the root beyond the entry files, the host skill folders, and `.orly/`; `core.hooksPath` is `.orly/hooks`; the host and OpenCode load `.orly/AGENTS.md` → Test `test_fresh_install_stays_in_one_folder`
- **Dimension 2.2** — Inline paths, relative links, fenced commands, and optional-pack references are rewritten; URLs and unrelated substrings are untouched; a second run changes nothing → Test `test_citation_rewrite_is_exact_and_idempotent`
- **Dimension 2.3** — Installed scripts run from the consumer root and a nested directory, finding payload siblings under `.orly/` and evaluating the repository → Test `test_installed_scripts_run_from_consumer_layout`
- **Dimension 2.4** — Preflight refuses an edited copy or a conflicting destination before any write; interruption at each boundary (payload, loaders, hooks, configuration, cleanup) followed by a rerun completes without data loss → Test `test_migration_resumes_at_every_boundary`
- **Dimension 2.5** — Before migration, `gate` names `orly update`; `orly doctor` names each repository-owned file and line still citing an old path or `.oracle/` → Test `test_doctor_names_stale_citations`

### §3 — Installed instructions assume nothing about the user

The install filter already applies to every installed Markdown file; this Section marks the content. Instruction lines naming Indy, Kishore, Aiwa, gstack, greptile as a reviewer, `~/Projects`, `op read`, or the shared docs repository are marked for `persona.indy` in place, with inline markers where a neutral requirement stays on the same line; agentsfleet instructions are marked for `product.agentsfleet`. Neutral requirements remain for everyone: an adversarial diff review before documentation, the repository owner's quoted approval for a deferral, and credentials resolved at runtime and never printed. Messages installed scripts print name no person. The orly-babysit-prs skill finishes its loop when no review bot posts. Markers are active only outside fenced code blocks; nested, unknown, unmatched, or unclosed active markers refuse installation before writes; literal marker examples remain unchanged.

- **Dimension 3.1** — A default install's rendered rules, installed Markdown, and script messages contain none of `Indy`, `Kishore`, `Aiwa`, `gstack`, `~/Projects`, `op read`, or `greptile` outside the `greptile-learnings` path → Test `test_default_install_names_no_person_or_private_tool`
- **Dimension 3.2** — The persona selection preserves each prior normative requirement after the source-path mapping in `fixtures/requirements-0.10.14.md`, which enumerates every approved wording change → Test `test_indy_render_keeps_every_requirement`
- **Dimension 3.3** — A fenced marker example survives install unchanged; a malformed marker refuses before writes; the rendered rules stay within the existing byte cap → Test `test_markers_respect_fences_and_refuse_malformed`

### §4 — The same gate runs on every pull request

`orly gate pr --ci github` reads the pull request event and records the event base tip, event head, evaluated head, and their merge base separately. The checkout must equal the event head. The workflow fetches enough history to resolve both commits and prove their merge base; diff-sensitive criteria, override discovery, and spec discovery share that context. A branch behind its base is a separate `reported` policy result, never malformed input. Missing objects, unrelated histories, a mismatched checkout, an unresolved shallow history, and a merge-ref checkout in head mode refuse before commands run; `--base` and `--head-ref` override the event. With `--no-commands`, nothing from the evaluated checkout executes, the spec-template script included; structural checks use the installed engine, and command criteria report that commands were not executed. `orly init --ci github` writes `.github/workflows/orly.yml`: `pull_request` only, read-only permissions, checkout without persisted credentials, and one step, `uses: agentsfleet/orly@v0.11.0`; a differing file refuses unchanged. The composite `action.yml`, named "orly gate", identifies its own revision and the installed engine version separately, declares supported engine and evidence-schema versions, and rejects incompatible pins before evaluation; its tag and the repository's pinned engine version need not match. It writes a state table to the job summary and uploads evidence even after gate failure, without replacing the exit status. `pull_request_target` is rejected. Judging from M07_002 runs in this mode only when maintainers set the repository variable `ORLY_JUDGE_UPLOAD` to `allow` and supply the provider key as a secret; forks receive no key, and local records are ignored. Usage telemetry already reports CI runs (`src/telemetry.ts:258`).

- **Dimension 4.1** — With event fixtures where the base advanced after branching, base tip, head, and merge base are recorded, criteria compare against the merge base, and the lag is reported → Test `test_ci_github_binds_to_event_head`
- **Dimension 4.2** — A non-pull-request event, `pull_request_target`, missing objects, unrelated histories, a mismatched checkout, a merge-ref checkout, and unresolved shallow history each refuse before commands run → Test `test_ci_mode_refuses_bad_revisions`
- **Dimension 4.3** — With `--no-commands`, a planted checkout `audits/spec-template.sh` never executes, structural checks still run, and command criteria report not executed → Test `test_no_commands_runs_nothing_from_checkout`
- **Dimension 4.4** — `orly init --ci github` writes the one-step workflow with read-only permissions and no persisted credentials; a differing file refuses unchanged → Test `test_init_writes_the_ci_workflow`
- **Dimension 4.5** — Judging runs only with the maintainer variable and a key; a fork or a missing variable skips it with a reason; local records are ignored → Test `test_ci_judging_requires_maintainer_setting`
- **Dimension 4.6** — In a scratch repository, a pull request shows the "orly gate" check and its evidence; an incompatible pin fails before evaluation; a failing gate still uploads evidence → Test `manual_scratch_repository_pull_request`

### §5 — A stranger's first run is proved and documented

Depends on §§1–4. An end-to-end test packs the package, installs it into temporary repositories with no orly history, and walks `init`, a spec-less `gate pr`, `gate pr --ci github --json` over an advanced-base event fixture, and `update` from the 0.10.14 layout. README opens with that path; `llms.txt` carries the machine version; `docs/ORLY_ARCHITECTURE.md` updates §§Topology, Gates, and Evidence.

- **Dimension 5.1** — The packed journey completes in fresh temporary repositories without the author checkout → Test `test_first_run_journey`
- **Dimension 5.2** — Every orly command in README's first-run section appears in the journey test → Test `test_readme_first_run_matches_journey`

## Interfaces

```
orly gate [work|verify|pr] [--json] [--accept-dirty]
orly gate pr --ci github [--base <full-commit>] [--head-ref <name>] [--no-commands] [--json]
orly init [--ci github] [--force] [--no-hooks] [--with <PACK>] [--dry-run] [--json]
orly doctor [--json]             adds stale citations of old managed paths and .oracle/

Consumer layout: AGENTS.md (repository-owned host)  CLAUDE.md  opencode.json  .claude/skills/  .agents/skills/
                 .opencode/skills/  .orly/  orly.json  AGENTS.md  hooks/  dispatch/  audits/  docs/

Workflow written by init --ci github: on pull_request; permissions contents: read;
  checkout with persist-credentials: false and enough history; one step uses agentsfleet/orly@v0.11.0

Evidence (schemas/gate-evidence.schema.json), no free text:
{ "schema_version": 1, "orly_version": "0.11.0", "source": "working_tree",
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
| Nothing to check | No spec, no declared surface | Skipped with reasons, never counted passed; `test_spec_less_gate_reports_skips` |
| Unclassified return | A criterion returns without a state | Compile error; `test_every_criterion_path_has_a_state` |
| Secret exposure | A command prints or receives a token | Digests only; `test_gate_evidence_excludes_secrets_and_output` |
| Tree changed mid-run | A file edits during commands | Evidence marked invalidated; `test_evidence_invalidates_on_tree_change` |
| Conflicting destination | Edited copy or foreign bytes at a target | Preflight refusal before writes; `test_migration_resumes_at_every_boundary` |
| Interrupted migration | Killed at any boundary, hooks included | Rerun completes; no bytes lost; `test_migration_resumes_at_every_boundary` |
| Broken caller | A consumer script cites an old path | Doctor names file and line; consumer stays pinned until fixed; `test_doctor_names_stale_citations` |
| Wrong path semantics | Path-like text that is not a reference | Left untouched; `test_citation_rewrite_is_exact_and_idempotent` |
| Malformed marker | Nested, unknown, unmatched, or unclosed | Refuse before writes; fenced examples stay; `test_markers_respect_fences_and_refuse_malformed` |
| Bad CI revision | Missing objects, unrelated history, wrong or merge-ref checkout, shallow | Refuse before commands; `test_ci_mode_refuses_bad_revisions` |
| Untrusted execution | Checkout script under `--no-commands`, or `pull_request_target` | Engine checks only; event refused; `test_no_commands_runs_nothing_from_checkout` |
| Fork pull request | No provider key | Judging skipped with reason; `test_ci_judging_requires_maintainer_setting` |
| Foreign hook owner | Another tool owns `core.hooksPath` | Existing refusal stands; `test_foreign_hooks_path_still_refuses` |

## Invariants

1. Every criterion result carries a state — the result type requires it.
2. Evidence carries no argument values, environment values, raw output, or free text — the serializer writes from a field allowlist.
3. Every orly-managed path in a consumer lives under `.orly/` or a host skill folder — the installer asserts each target's prefix before writing.
4. Migration never overwrites conflicting bytes — preflight and retry compare bytes before any write.
5. CI mode evaluates only the event head with a proven merge base — revision checks run before any criterion.
6. `--no-commands` executes nothing from the evaluated checkout — the runner refuses checkout paths in that mode.

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
| 2.1 | integration | `test_fresh_install_stays_in_one_folder` | Fresh repository → root diff only entry files, skill folders, `.orly/`; hooks path and loaders point into `.orly/` |
| 2.2 | unit | `test_citation_rewrite_is_exact_and_idempotent` | Inline, relative, fenced, optional-pack, and URL cases → only managed references change; second pass is a no-op |
| 2.3 | integration | `test_installed_scripts_run_from_consumer_layout` | Installed audit run from root and a nested folder → finds `.orly/` siblings; evaluates the repository |
| 2.4 | integration | `test_migration_resumes_at_every_boundary` | Faults at payload, loaders, hooks, configuration, cleanup → rerun completes; conflicts refuse; bytes intact |
| 2.5 | integration | `test_doctor_names_stale_citations` | Unmigrated repository → `gate` names `orly update`; owned citations listed by file and line |
| 3.1 | integration | `test_default_install_names_no_person_or_private_tool` | Default install → zero matches outside `greptile-learnings` |
| 3.2 | integration | `test_indy_render_keeps_every_requirement` | agentsfleet's packs → every mapped requirement present; only enumerated wording changes differ |
| 3.3 | unit | `test_markers_respect_fences_and_refuse_malformed` | Fenced example → unchanged; nested or unclosed marker → refusal, no writes; size within cap |
| 4.1 | integration | `test_ci_github_binds_to_event_head` | Base advanced after branching → merge base used; lag reported; `--base` overrides |
| 4.2 | unit | `test_ci_mode_refuses_bad_revisions` | Seven bad inputs → refusal before any command |
| 4.3 | integration | `test_no_commands_runs_nothing_from_checkout` | Planted script writing a sentinel → sentinel absent; structural checks ran |
| 4.4 | integration | `test_init_writes_the_ci_workflow` | Fresh → workflow with read permissions and no persisted credentials; differing file → refusal |
| 4.5 | integration | `test_ci_judging_requires_maintainer_setting` | Variable absent, fork without key, planted record → judging skipped or asked fresh |
| 4.6 | manual | `manual_scratch_repository_pull_request` | Implementer runs the action in a scratch repository; run URLs for pass, incompatible pin, and failing gate in Session Notes |
| 5.1 | e2e | `test_first_run_journey` | Packed package in fresh repositories → init, spec-less gate, GitHub mode, update succeed |
| 5.2 | unit | `test_readme_first_run_matches_journey` | README first-run commands → each appears in the journey test |
| | integration | `test_foreign_hooks_path_still_refuses` | Regression: another tool's `core.hooksPath` → existing refusal |
| | integration | `test_engine_checkout_keeps_source_layout` | Regression: the orly checkout reads sources at the root |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Every criterion has a state and honest evidence (§1) | `bun test src -t "test_every_criterion_path\|test_gate_evidence\|test_override_preserves"` | exit 0 | P0 | |
| R2 | Install and migration stay in `.orly/` safely (§2) | `bun test src -t "test_fresh_install\|test_migration_resumes\|test_installed_scripts"` | exit 0 | P0 | |
| R3 | Default install names no person or private tool (§3) | `bun test src -t "test_default_install\|test_markers_respect"` | exit 0 | P0 | |
| R4 | GitHub mode binds to the event head and runs nothing untrusted (§4) | `bun test src -t "test_ci_github\|test_ci_mode\|test_no_commands"` | exit 0 | P0 | |
| R5 | The first-run journey completes (§5) | `bun test src -t test_first_run_journey` | exit 0 | P0 | |
| R6 | Scope holds | `git diff --name-only origin/main...HEAD` | 0 paths missing from Files Changed | P0 | |
| S1 | Declared conformance | `make conform` | exit 0 | P0 | |
| S2 | Declared verification | `bun test src` | exit 0 | P0 | |
| S3 | Governance invariance | `make audit` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S5 | No oversize source file | `git diff --name-only origin/main...HEAD \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | |

## Dead Code Sweep

N/A — no files deleted; `.oracle/orly.json` and `AGENTS.orly.md` move. The engine checkout keeps its own `.githooks`.

## Out of Scope

- Standalone executables. Indy, Sep 23, 2026: "Now i am not very much focussed on the binary version of orly, since its not a show stopper."
- Proof from the diff and the correction-learning loop, proposed for the next Milestone.
- Profiles, upstream skill sources, lock files, and a transaction journal.
- A separate `agentsfleet/orly-action` repository and a Marketplace listing.
- Splitting Indy's toolchain into separate packs; the vendor name in `docs/greptile-learnings/`; product names inside rule history and script comments.
- Clearing documentation findings inside orly's own corpus; GitLab CI; tamper resistance beyond the maintainer's branch rules.
- Edits to agentsfleet or e2e-observability-platform, which migrate in their own changes, and the repository description.

## Product Clarity (authoring record)

1. **Successful user moment** — A maintainer runs `orly init`, sees only agent files and `.orly/` in `git status`, runs `orly gate pr`, and every line names its state; the same table appears on their next pull request.
2. **Preserved user behaviour** — agentsfleet and orly keep every rule requirement, command, gate order, override trailer, and hook behavior; file locations move through `orly update`.
3. **Optimal-way check** — The unconstrained shape also proves claims from the diff, which needs per-language coverage. Mandatory states, one folder, and CI are the base every later proof reports through.
4. **Rebuild-vs-iterate** — Iterate. The gate engine, packs, and markers are sound; the result type, installer root, marker parser, and CI binding change.
5. **What we build** — States and evidence, the `.orly/` layout with ordered migration and a stale-citation report, marked personal instructions, a GitHub mode, a composite action, `init --ci github`, a journey test, and a first-run README.
6. **What we do NOT build** — Profiles and skill sources, which existing tools cover; a transaction journal; a dashboard.
7. **Fit with existing features** — Consumers remain pinned until their migration change includes the path moves, repository-owned caller changes, workflow configuration, and passing native harness checks together. Prepare each consumer migration in an isolated checkout. A doctor report alone does not establish compatibility; no temporary path aliases are introduced.
8. **Surface order** — Command line first; the action wraps the command.
9. **Dashboard restraint** — No dashboard or badge; the CI summary shows criterion states only, never a score.
10. **Confused-user next step** — `orly doctor` names the problem and the command to run; README's first-run section is the path.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Five Sections. §1's states feed everything; §2's layout and §3's markers feed §5's journey; §4 needs §1 and M07_002.
- **Order:** §1, then M07_002, then §§2–5, because Indy made the Jev work the priority, it reports through §1's states, and its GitHub integration waits for §4's trust model.
- **Alternatives considered:** The profiles draft duplicated existing skill tools and git. Keeping `.oracle/` and the root layout leaves someone else's rulebook in a stranger's `docs/`. A configurable rule root or temporary aliases keep two layouts alive. Requiring the base tip to be an ancestor of the head refuses every branch whose base advanced.
- **Patch-vs-refactor verdict:** this is a **refactor** of the result type, installer layout, marker parser, and CI binding.

## Discovery (consult log)

- **Consults** — Sep 23, 2026: 10:10 AM, first-run audit of orly 0.10.14; figures in Problem. Blast radius measured under the Files Changed rule at orly `58fedbc`, agentsfleet `b1bc6f0c4`, and e2e-observability-platform `8b4d75d`; orly owned 47 files citing `.oracle`. Indy, this session: "What is relevant now, for distribution, for opensource folks to use must be seen more"; he selected "Replace M07 (Recommended)", asked "shoudl we say like .orly/ as opposed to .oracle", and asked for "CI action ... that detects this". Codex's CTO review of `58fedbc` returned rework with twelve findings; each cited line was verified against source before this revision (`src/criteria_spec.ts:46`, `src/criteria.ts:87,125,174,194`, `src/gates.ts:56-61`, `src/install.ts:303-306`, `src/references.ts:30-40`, `src/loaders.ts:21`, agentsfleet `make/harness.mk:42,91`). Its root-action and `.orly/` recommendations match Indy's choices.
- **Metrics review** — no analytics or funnel change; the usage observation already records CI runs.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand. Implementation proofs, `/review`, and post-push monitoring are pending.
- **Deferrals** — None.
