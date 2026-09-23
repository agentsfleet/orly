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
**Batch:** B1 — release 0.12: after M07_002, alongside M07_004
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

**Solution summary:** A `coverage` block names the command that writes lcov and the file it writes. The `pr` gate removes the old file, runs the command once, maps added and modified lines since the merge base to lcov line hits, and names uncovered ranges per file. `--lcov <path>` accepts a file produced earlier in a Continuous Integration (CI) job and records it as external. `orly init` seeds the block for Bun projects.

**Verdict and reason:** Changed-line coverage is not new; orly adds its placement: the same check runs inside the agent's definition of done before a push, with no upload, and in CI through the same command. A line that ran is not a line that was checked; mutation testing stays out of scope.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(gate): fail when changed lines never ran under a test`
- **Intent:** The coding agent learns which of its changed lines no test executed before it says done, and the pull request check shows the same.
- **Authoring handshake:** Indy selected "Add diff proof, move folder (Recommended)", then "Both A and B" after being told that Codecov and diff-cover already check changed lines.
- **ASSUMPTIONS I'M MAKING:** 1. lcov is the only coverage input. 2. Bun is the proven path; other runners work when they write lcov. 3. Only added and modified lines count; deleted lines never do. 4. Test files, declaration files, and configured exclusions are excluded. 5. A changed runtime file no test loaded counts as uncovered.
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

Changed lines are the added and modified lines between the merge base and the evaluated head, read from `git diff --unified=0` with renames followed, for files in code surfaces. Deleted lines never count. Test files, declaration files, and paths listed in `coverage.exclude` are excluded. The lcov reader accepts source-file (`SF`), line-data (`DA`), and `end_of_record` records, normalizes absolute and relative source paths to repository-relative ones, ignores paths outside the repository while counting them, merges repeated records for one file, and refuses a malformed file naming its line. A changed line with a positive hit count is covered; a zero count is uncovered; a line with no `DA` record is not measurable. A changed code file absent from lcov was never loaded by a test: its changed lines count as uncovered, unless its transpiled JavaScript is empty, which means it holds only types and counts as not measurable. **Implementation default:** detect type-only TypeScript with Bun's transpiler, because loading a file is the only runtime signal Bun's coverage gives.

- **Dimension 1.1** — Added and modified lines since the merge base are extracted with renames followed; deleted lines, test files, declaration files, and exclusions are ignored → Test `test_changed_lines_since_merge_base`
- **Dimension 1.2** — Relative and absolute lcov paths normalize, repeated records merge, outside paths are counted and ignored, and a malformed file is refused with its line number → Test `test_lcov_reader_normalizes_and_refuses_malformed`
- **Dimension 1.3** — Positive hits are covered, zero hits uncovered, missing records not measurable; a never-loaded runtime file is uncovered and a never-loaded type-only file is not measurable → Test `test_changed_lines_map_to_hits`

### §2 — `diff.covered` in the gate

The `pr` gate carries `diff.covered` when a `coverage` block is declared. It removes the lcov file, runs the coverage command once, and requires a fresh file afterwards; a failing command fails the criterion with its exit status. `--lcov <path>` uses a file produced earlier, typically in a Continuous Integration (CI) job, and records it as external with its digest instead of running the command. The criterion fails when any measurable changed line ran zero times and names the uncovered ranges per file, merged into contiguous spans and bounded by a named output cap; it passes when every measurable changed line ran; it is skipped with a reason when no coverage block is declared, no code changed, or commands were not executed. Evidence records per file the changed, measurable, and uncovered counts and ranges, the lcov digest, and its source, never source text. `orly init` seeds the block for a Bun project, with command `bun test --coverage --coverage-reporter=lcov` and file `coverage/lcov.info`; it seeds nothing for other runners, whose users declare any command that writes lcov, and it never overwrites a declared block. This repository declares its own block. **Implementation default:** the coverage command is its own invocation, because changing a repository's unit command would change what its other tooling runs.

- **Dimension 2.1** — The criterion fails naming merged uncovered ranges, passes when every measurable changed line ran, and is skipped with a reason for no block, no code change, or no command execution → Test `test_diff_covered_states`
- **Dimension 2.2** — A leftover lcov file is removed before the run; a command that writes none fails; a failing command fails with its exit status; `--lcov` is recorded as external with its digest → Test `test_diff_covered_uses_fresh_coverage`
- **Dimension 2.3** — Init seeds the Bun block, seeds nothing for other runners, and never overwrites a declared block → Test `test_init_seeds_bun_coverage`
- **Dimension 2.4** — In a Bun repository, a new exported function with no test fails naming its range, and adding a test that calls it passes → Test `test_untested_change_fails_then_passes`

## Interfaces

```
Configuration:
  "coverage": { "command": [["bun", "test", "--coverage", "--coverage-reporter=lcov"]],
                "lcov": "coverage/lcov.info", "exclude": ["**/*.test.ts", "**/*.d.ts"] }
orly gate pr [--lcov <path>] [--json]

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
| Stale file | A leftover lcov from an earlier run | Removed before the run; `test_diff_covered_uses_fresh_coverage` |
| Malformed lcov | Unknown or broken records | Failed naming the line; `test_lcov_reader_normalizes_and_refuses_malformed` |
| Foreign paths | lcov names files outside the repository | Counted and ignored; `test_lcov_reader_normalizes_and_refuses_malformed` |
| Never loaded | A changed runtime file no test imported | Its changed lines uncovered; `test_changed_lines_map_to_hits` |
| Types only | A changed file holding only types | Not measurable; `test_changed_lines_map_to_hits` |
| Rename | File moved with edits | Rename followed; `test_changed_lines_since_merge_base` |
| Large diff | Many uncovered ranges | Output capped; totals counted; `test_diff_covered_states` |

## Invariants

1. Coverage is fresh: the gate removes the lcov file before running, or records an external file with its digest.
2. `diff.covered` never passes while a measurable changed line has zero hits — the state derives from counts.
3. Deleted lines never count — extraction reads only added and modified lines.
4. Evidence holds counts and ranges, never source text — the serializer writes from a field allowlist.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|---|---|---|---|---|---|
| not applicable — the existing usage observation already names a failed criterion | not applicable | not applicable | not applicable | not applicable | `test_diff_covered_states` |

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|---|---|---|---|
| 1.1 | unit | `test_changed_lines_since_merge_base` | Fixture repository with edits, a rename, deletions, a test file, a `.d.ts` → only added and modified runtime lines |
| 1.2 | unit | `test_lcov_reader_normalizes_and_refuses_malformed` | Absolute, relative, repeated, and outside paths → normalized map; broken record → refusal naming its line |
| 1.3 | unit | `test_changed_lines_map_to_hits` | Hits 3, 0, none; a never-loaded runtime file; a types-only file → covered, uncovered, not measurable, uncovered, not measurable |
| 2.1 | integration | `test_diff_covered_states` | Uncovered lines → failed with merged spans; all ran → passed; no block, no code, no execution → skipped with reasons |
| 2.2 | integration | `test_diff_covered_uses_fresh_coverage` | Leftover file removed; silent command → failed; exit 1 → failed; `--lcov` → source external with digest |
| 2.3 | integration | `test_init_seeds_bun_coverage` | Bun project → block seeded; Node project → none; declared block → unchanged |
| 2.4 | e2e | `test_untested_change_fails_then_passes` | Bun fixture adds an exported function → failed with its range; test added → passed |
| | integration | `test_gate_without_coverage_is_unchanged` | Regression: no block → every other criterion unchanged; `diff.covered` skipped |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|---|---|---|---|---|
| R1 | Changed lines meet coverage correctly (§1) | `bun test src -t "test_changed_lines\|test_lcov_reader"` | exit 0 | P0 | |
| R2 | The gate fails on untested changes and uses fresh coverage (§2) | `bun test src -t "test_diff_covered\|test_init_seeds_bun"` | exit 0 | P0 | |
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

- **Consults** — Sep 23, 2026: Bun's coverage page states the lcov reporter, the default `coverage/lcov.info`, and that "Coverage only tracks files that are loaded". diff-cover and Codecov's patch status were read as prior art; Indy chose this work after that correction. orly's own CI already produces lcov (`.github/workflows/test.yml:38`).
- **Metrics review** — no analytics or funnel change.
- **Skill-chain outcomes** — Authoring followed `skills/orly-spec-new/SKILL.md` by hand; implementation outcomes pending.
- **Deferrals** — None.
