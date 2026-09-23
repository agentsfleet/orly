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

# M07_003: The gate fails when a changed line never ran under a test, read from the repository's own lcov coverage

**Prototype:** v1.0.0
**Milestone:** M07
**Workstream:** 003
**Date:** Sep 23, 2026: 10:10 AM
**Status:** PENDING
**Priority:** P1 — a test that passes without running the change is the gap agent-written pull requests show most
**Categories:** CLI (Command-Line Interface), DOCS
**Batch:** B1 — release 0.12. Execution order: M07_001 §1 → M07_002 → M07_003 and M07_004 → M07_005 → M07_001 §§2–5. "Alongside" permits independent implementation work, not concurrent edits to shared files.
**Branch:** pending — set at CHORE(open)
**Baseline revision:** pending — record the full comparison commit at CHORE(open)
**Test Baseline:** pending — measure declared unit and integration lanes before the Pull Request (PR)
**Baseline evidence:** pending — report revision, commands, counts, and environment
**Depends on:** M07_001 §1 — criterion states and the evidence document
**Provenance:** Large Language Model (LLM)-drafted; Claude Opus 5.5; Sep 23, 2026
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §§Gates, Evidence

---

## Overview

**Goal (testable):** In a Bun repository, `orly gate pr` runs the declared coverage command once, reads the lcov file it writes, and fails `diff.covered` naming each changed line range no test executed; lines lcov cannot measure count as not measurable, and any tool that writes lcov works the same way.

**Problem:**
- A test can pass without running the code it claims to cover. orly's correction log records an unfalsified security test that read as coverage (`SOUL_LOG.md` P19); agentsfleet's M202_001 records a test written to assert page prose because the template demanded one per Dimension (agentsfleet `docs/v2/done/M202_001_P0_API_CLI_DOCS_GRANT_COVERS_REPOSITORY_WRITE.md:222`).
- `orly gate pr` runs the declared test command and reads its exit status (`src/criteria.ts:118-129`); no criterion reads coverage.
- Codecov's patch status and diff-cover already check changed lines, after a push or with separate setup; the coding agent sees neither before it says done.

**Solution summary:** A `coverage` block names the command that writes lcov and the file it writes. The `pr` gate removes the old file, runs the command once, maps added and modified lines since the merge base to lcov line hits, and names uncovered ranges per file. `--lcov <path>` reads a report produced elsewhere, such as a Continuous Integration (CI) job, and can pass only with producer evidence from orly's own wrapper. `orly init` seeds the block for Bun projects.

**Verdict and reason:** Changed-line coverage is not new; orly adds its placement: the same check runs inside the agent's definition of done before a push, with no upload, and in CI through the same command. A line that ran is not a line that was checked; mutation testing stays out of scope.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(gate): fail when changed lines never ran under a test`
- **Intent:** The coding agent learns which of its changed lines no test executed before it says done, and the pull request check shows the same.
- **Authoring handshake:** Indy selected "Add diff proof, move folder (Recommended)", then "Both A and B" after being told that Codecov and diff-cover already check changed lines.
- **ASSUMPTIONS I'M MAKING:** 1. lcov is the only coverage input. 2. Bun is the proven path; other runners work when they write lcov. 3. Only added and modified lines at destination paths count; deletions and pure renames never do. 4. Coverage scope is declared separately from code surfaces. 5. An in-scope runtime file absent from the report fails as missing coverage evidence.
- **Implementer handshake:** pending until PLAN.

## Implementing agent — read these first

1. `src/criteria.ts` — command criteria, tiers, and where `pr` criteria are listed.
2. `src/surfaces.ts` — `classifyBranch`, `branchDiff`, and `defaultMergeBase`.
3. `src/config.ts` — `sniffCommands` and configuration seeding.
4. `.github/workflows/test.yml` — orly's own `bun test src --coverage --coverage-reporter=lcov` run.
5. https://bun.com/docs/test/coverage — the lcov reporter, the default `coverage/lcov.info`, and coverage of loaded files only.
6. https://github.com/Bachmann1234/diff_cover — prior art for changed-line coverage from lcov.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| `docs/v1/pending/M07_003_P1_CLI_DOCS_CHANGED_LINES_RAN_UNDER_A_TEST.md` | CREATE, then lifecycle MOVE | Intent and proof ledger |
| `src/lcov.ts`, `src/lcov.test.ts` | CREATE | lcov reader |
| `src/coverage_run.ts`, `src/coverage_run.test.ts`, `schemas/coverage-manifest.schema.json` | CREATE | Producer evidence wrapper and its shape |
| `src/diff_coverage.ts`, `src/diff_coverage.test.ts` | CREATE | Changed-line extraction and mapping to hits |
| `src/criteria.ts`, `src/criteria.test.ts` | EDIT | `diff.covered` in the `pr` gate |
| `src/config.ts`, `src/config.test.ts`, `src/validation.ts`, `src/validation.test.ts` | EDIT | `coverage` block; Bun seeding |
| `src/cli_gate.ts`, `src/cli.test.ts` | EDIT | `--lcov` flag |
| `schemas/gate-evidence.schema.json` | EDIT | Coverage fields |
| `fixtures/coverage/` | CREATE | lcov files, diffs, and a Bun repository for the end-to-end test |
| `.oracle/orly.json` | EDIT | This repository declares its coverage command |
| `README.md`, `llms.txt`, `docs/ORLY_ARCHITECTURE.md` | EDIT | Coverage setup; §Gates |

## Applicable Rules

- `docs/greptile-learnings/RULES.md`: NDC (No Dead Code), UFS (Unified Form for Symbols), FLL (File and Function Length Limits), TGU (Tagged-Union over optional-field structs), TST-NAM (milestone-free test names), MSID (milestone identifiers banned in source), TSC and TSJ (TypeScript and Bun conventions).
- `dispatch/write_ts_adhere_bun.md`, `dispatch/write_any.md`; `dispatch/edit_rules.md` for `src/**` and `schemas/**`; `dispatch/write_documentation.md` with `docs/DOCUMENTATION_RULES.md`.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| Spec Template | Yes | Pending metadata, Dimension-to-Test mapping, declared commands verbatim, at most 320 lines |
| TypeScript file shape; File & Function Length (≤350/≤50/≤70) | Yes | Reader and mapper in their own modules |
| Unified Form for Symbols; Milestone Identifier | Yes | Record names, reason codes, and caps as named constants |
| Governance invariance | Yes | `make audit`, the questionnaire, and generated evidence |
| Greptile review; Architecture consult | Yes | End-of-turn rule read; §Gates updated |
| Schema removal; Zig; interface design tokens; workflow file edit | No | None touched |

## Prior-Art / Reference Implementations

- **diff-cover:** compares a branch to its base and reports coverage of changed lines from lcov and other formats; orly implements the same mapping natively, because shelling out to a Python tool would add an install-process launch to a core path.
- **Codecov patch status:** measures only lines changed in a pull request, after upload; orly runs the same measure locally with no upload.
- **orly's own CI:** `.github/workflows/test.yml` already runs `bun test src --coverage --coverage-reporter=lcov`, so this repository proves the path on itself.
- **Branch diff:** `branchDiff` and `defaultMergeBase` in `src/surfaces.ts` already compute the merge base; changed lines use the same base, or M07_001's event merge base in CI.

## Sections (implementation slices)

### §1 — Changed lines meet coverage records

Coverage scope is declared independently of code surfaces through `coverage.include` and `coverage.exclude`; Bun initialization includes only its JavaScript and TypeScript source extensions, and files outside the scope are reported as outside measurement scope. Changed lines come from `git diff` between the merge base and the evaluated head, with rename detection explicitly enabled and paths decoded without newline-based splitting: the added and modified lines at destination paths and line numbers. Deleted lines never count, a pure rename contributes no changed lines, and coverage recorded only under an old path is not transferred to an edited destination. The lcov reader resolves relative source-file (`SF`) paths against the recorded coverage producer's working directory, and absolute paths must resolve beneath the evaluated repository root. Canonicalization preserves case and detects ambiguous mappings and symlink escapes; no basename or suffix matching is permitted. Repeated records merge only after canonical source identity agrees; valid non-line records are ignored; malformed required records fail with their line number. A changed line with a positive line-data (`DA`) hit count is covered, a zero count is uncovered, and a line with no `DA` record is not measurable. An in-scope runtime file absent from the report fails as missing coverage evidence; the output does not infer whether it was unloaded, excluded, or omitted by the producer. A TypeScript file is non-runtime only when transpiling it with the TypeScript loader and fixed, documented options, without macros or elimination settings that can erase runtime code, yields empty output or only an empty module marker such as `export {};`; a parse failure is an error.

- **Dimension 1.1** — Changed lines use destination paths and lines at the evaluated head; deletions and pure renames add none; old-path coverage never transfers to an edited destination; quoted filenames decode; out-of-scope files are reported as such → Test `test_changed_lines_since_merge_base`
- **Dimension 1.2** — Relative paths resolve against the producer directory, absolute paths must sit under the repository, ambiguous mappings and symlink escapes are refused, duplicate basenames never match, repeated records merge only for one canonical file, and malformed records fail with their line number → Test `test_lcov_reader_resolves_paths_exactly`
- **Dimension 1.3** — Positive hits are covered, zero hits uncovered, and missing records not measurable; an in-scope file absent from the report fails as missing evidence; a file transpiling to nothing or to `export {};` is non-runtime; a parse failure is an error → Test `test_changed_lines_map_to_hits`

### §2 — `diff.covered` in the gate

The `pr` gate carries `diff.covered` when a `coverage` block is declared. Before running the coverage command once, it may remove only the configured untracked output file beneath the repository root; tracked files, directories, and paths escaping through symlinks are refused before deletion. It requires a fresh file afterwards, and a failing command fails the criterion with its exit status. `--lcov <path>` reads external coverage without executing the coverage command. A bare external file produces `reported`, never `passed`. Passing requires producer evidence binding the report digest, tested head, source-tree digest, coverage configuration, runner version, and successful command exit to the evaluated input; `orly coverage run --manifest <path>`, run from the installed engine, writes that evidence. In GitHub mode, the action's trusted wrapper captures it around coverage generation at the event head; a manifest supplied by the evaluated checkout cannot establish provenance. Missing or mismatched producer evidence is reported as unverified coverage. These records establish run identity, not the honesty of repository-controlled tests. The criterion fails when any measurable changed line ran zero times and names the uncovered ranges per file, merged into contiguous spans and bounded by a named output cap; it passes when every measurable changed line ran; it is skipped with a reason when no coverage block is declared, no code changed, or commands were not executed. Evidence records per file the changed, measurable, and uncovered counts and ranges, the lcov digest, and its source, never source text. `orly init` seeds the block for a Bun project, with command `bun test --coverage --coverage-reporter=lcov` and file `coverage/lcov.info`; it seeds nothing for other runners, whose users declare any command that writes lcov, and it never overwrites a declared block. This repository declares its own block. **Implementation default:** the coverage command is its own invocation, because changing a repository's unit command would change what its other tooling runs.

- **Dimension 2.1** — The criterion fails naming merged uncovered ranges, passes when every measurable changed line ran, and is skipped with a reason for no block, no code change, or no command execution → Test `test_diff_covered_states`
- **Dimension 2.2** — Only the configured untracked output file is removed, and tracked files, directories, and symlink escapes are refused; a command that writes no file fails; a failing command fails with its exit status → Test `test_diff_covered_uses_fresh_coverage`
- **Dimension 2.3** — Init seeds the Bun block, seeds nothing for other runners, and never overwrites a declared block → Test `test_init_seeds_bun_coverage`
- **Dimension 2.4** — In a Bun repository, a new exported function with no test fails naming its range, and adding a test that calls it passes → Test `test_untested_change_fails_then_passes`
- **Dimension 2.5** — A bare `--lcov` file yields `reported`; matching producer evidence from `orly coverage run` allows `passed`; evidence for another head, tree, configuration, or a failed command yields unverified coverage → Test `test_external_coverage_needs_producer_evidence`

## Interfaces

```
Configuration:
  "coverage": { "command": [["bun", "test", "--coverage", "--coverage-reporter=lcov"]],
                "lcov": "coverage/lcov.info", "include": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
                "exclude": ["**/*.test.ts", "**/*.d.ts"] }
orly coverage run [--manifest <path>]          runs the command; writes producer evidence
orly gate pr [--lcov <path> [--coverage-manifest <path>]] [--json]

Human output (example):
  🔴 diff.covered  src/cli/json.ts:12-40 · src/cli/flags.ts:7   changed lines no test ran
  🟢 diff.covered  every measurable changed line ran under a test

Evidence entry:
  { "name": "diff.covered", "state": "failed",
    "coverage": { "source": "run", "lcov_digest": "sha256:<hex>",
      "files": [ { "path": "src/cli/json.ts", "changed": 31, "measurable": 24, "uncovered": ["12-40"] } ] } }
```

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|---|---|---|
| Not configured | No `coverage` block | Skipped with reason; `test_diff_covered_states` |
| Command fails | Non-zero exit | Failed with the exit status; `test_diff_covered_uses_fresh_coverage` |
| No output | Command writes no lcov file | Failed naming the expected path; `test_diff_covered_uses_fresh_coverage` |
| Stale file | A leftover lcov from an earlier run | Only the configured untracked file is removed; tracked or escaping paths refused; `test_diff_covered_uses_fresh_coverage` |
| Bare external report | `--lcov` without producer evidence | `reported`, never `passed`; `test_external_coverage_needs_producer_evidence` |
| Wrong revision | Evidence for another head, tree, or configuration | Unverified coverage; `test_external_coverage_needs_producer_evidence` |
| Malformed lcov | Broken required records | Failed naming the line; `test_lcov_reader_resolves_paths_exactly` |
| Path identity | Nested producer directory, duplicate basenames, symlink escape | Resolved against the producer directory; ambiguity refused; `test_lcov_reader_resolves_paths_exactly` |
| Out of scope | `package.json` or YAML changed | Reported outside measurement scope, never uncovered; `test_changed_lines_since_merge_base` |
| Missing evidence | An in-scope file absent from the report | Fails as missing coverage evidence; `test_changed_lines_map_to_hits` |
| Types only | Transpiles to nothing or to `export {};` | Non-runtime; parse failure is an error; `test_changed_lines_map_to_hits` |
| Rename | Pure or edited rename | Pure adds nothing; old-path coverage never transfers; `test_changed_lines_since_merge_base` |
| Large diff | Many uncovered ranges | Output capped; totals counted; `test_diff_covered_states` |

## Invariants

1. `passed` requires coverage produced in this invocation or verified producer evidence for the evaluated input — a bare external report is `reported`.
2. `diff.covered` never passes while a measurable changed line has zero hits — the state derives from counts.
3. Deleted lines never count — extraction reads only added and modified lines.
4. Evidence holds counts and ranges, never source text — the serializer writes from a field allowlist.
5. Only the configured untracked output file is ever deleted — the gate refuses tracked, directory, and escaping paths first.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| not applicable — the existing usage observation already names a failed criterion | not applicable | not applicable | not applicable | not applicable | `test_diff_covered_states` |

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | unit | `test_changed_lines_since_merge_base` | Edits, pure and edited renames, deletions, quoted names, `package.json` → destination lines only; pure rename none; JSON reported out of scope |
| 1.2 | unit | `test_lcov_reader_resolves_paths_exactly` | Nested producer directory, duplicate basenames, symlink escape, repeated records, broken record → exact map, refusals, line number |
| 1.3 | unit | `test_changed_lines_map_to_hits` | Hits 3, 0, none; in-scope file absent; interface-only file; `export {};` file; unparsable file → covered, uncovered, not measurable, missing evidence, non-runtime, non-runtime, error |
| 2.1 | integration | `test_diff_covered_states` | Uncovered lines → failed with merged spans; all ran → passed; no block, no code, no execution → skipped with reasons |
| 2.2 | integration | `test_diff_covered_uses_fresh_coverage` | Untracked output removed; tracked or symlinked output refused; silent command → failed; exit 1 → failed |
| 2.3 | integration | `test_init_seeds_bun_coverage` | Bun project → block seeded; Node project → none; declared block → unchanged |
| 2.4 | e2e | `test_untested_change_fails_then_passes` | Bun fixture adds an exported function → failed with its range; test added → passed |
| 2.5 | integration | `test_external_coverage_needs_producer_evidence` | Bare file → reported; matching manifest → passed; manifest for another head, tree, or a failed run → unverified |
| | integration | `test_gate_without_coverage_is_unchanged` | Regression: no block → every other criterion unchanged; `diff.covered` skipped |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Changed lines meet coverage correctly (§1) | `bun test src -t "test_changed_lines\|test_lcov_reader"` | exit 0 | P0 | |
| R2 | The gate fails on untested changes and uses fresh coverage (§2) | `bun test src -t "test_diff_covered\|test_init_seeds_bun\|test_external_coverage"` | exit 0 | P0 | |
| R3 | An untested change fails, then passes once tested (§2) | `bun test src -t test_untested_change_fails_then_passes` | exit 0 | P0 | |
| R4 | Scope holds | `git diff --name-only origin/main...HEAD` | 0 paths missing from Files Changed | P0 | |
| S1 | Declared conformance | `make conform` | exit 0 | P0 | |
| S2 | Declared verification | `bun test src` | exit 0 | P0 | |
| S3 | Governance invariance | `make audit` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S5 | No oversize source file | `git diff --name-only origin/main...HEAD \| grep -v '\.md$' \| xargs wc -l 2>/dev/null \| awk '$1>350 && $2!="total"'` | no output | P0 | |

## Dead Code Sweep

N/A — no files deleted.

## Out of Scope

- Which test covered which line, and Jev judging whether a test asserts what it covers; both need per-test attribution.
- Mutation testing, branch coverage, and project-wide coverage thresholds.
- Uploading coverage anywhere, including Codecov.
- Seeding coverage for runners other than Bun; users declare any command that writes lcov.

## Product Clarity (authoring record)

1. **Successful user moment** — The agent says "tests pass", runs `orly gate pr`, sees `src/cli/json.ts:12-40` named as never run, writes the test that calls it, and the line turns green before the push.
2. **Preserved user behaviour** — A repository without a `coverage` block sees no change beyond one skipped line; `verify.unit` runs as before.
3. **Optimal-way check** — Per-test attribution plus mutation would prove assertions, not just execution; line hits exist in every major ecosystem today and catch the most common gap first.
4. **Rebuild-vs-iterate** — Iterate: one criterion, one reader, one mapper.
5. **What we build** — The lcov reader, the changed-line mapper, `diff.covered`, the `coverage` block, Bun seeding, and `--lcov`.
6. **What we do NOT build** — A coverage runner, thresholds, percentages, or an upload.
7. **Fit with existing features** — Reports through M07_001's states and evidence; CI passes a coverage file through M07_001 §4's `lcov` input.
8. **Surface order** — Command line first; CI through the same command.
9. **Dashboard restraint** — No percentages; only ranges and counts.
10. **Confused-user next step** — The failure line names each range; README shows the `coverage` block and one command per runner that writes lcov.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Two Sections: the mapping, then the criterion that uses it.
- **Alternatives considered:** Calling diff-cover adds a Python dependency and an install-process launch in a core path. Reading Codecov's result needs an upload and a network call. Adding coverage flags to `verify.unit` would change what a repository's other tooling runs.
- **Patch-vs-refactor verdict:** this is an additive **patch**: one criterion on existing gate and branch-diff shapes.

## Discovery (consult log)

- **Consults** — Codex's CTO review of `136b04c` required declared coverage scope, exact path identity, producer evidence for external reports, and safe deletion; Bun 1.4.2 transpiles `export {};` to `export {};` and type-only modules to empty output, verified locally. Sep 23, 2026: Bun's coverage page states the lcov reporter, the default `coverage/lcov.info`, and that "Coverage only tracks files that are loaded". diff-cover and Codecov's patch status were read as prior art; Indy chose this work after that correction. orly's own CI already produces lcov (`.github/workflows/test.yml:38`).
- **Metrics review** — no analytics or funnel change.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand; implementation outcomes pending.
- **Deferrals** — None.
