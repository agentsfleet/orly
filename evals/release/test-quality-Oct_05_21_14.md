---
type: explanation
audience: contributor
verified: 2026-10-05
product_version: 0.11.0
executable: false
---

# Consumer repair test-quality audit

## What it is

This records the observed test-quality checks for consumer repairs on `feat/m09-verified-012`.
The unit and integration skills require failure assertions, residual-state checks and controls that demonstrate assertions can fail.
No completed boundary review is claimed.

## Why it exists

Passing tests establish their observed assertions. They cannot establish untested failure cases or semantic specification completion.
Finding A02 requires inspection of interruption state before retry, beyond a successful recovery result.

## How it behaves

### Historical comparison

Comparison revision: `41850ee0d2893857c301ce3d07380415c5aa5861`.
Its declared unit command is `bun test src`; no separate integration lane is declared.
The command includes real filesystem, process and local HTTP integration tests.
The comparison runs from a private Git archive with separately installed, frozen dependencies.
It does not use the working tree or an additional implementation worktree.
`bun test src` reported 339 passed, 0 failed, 0 skipped and 910 assertions across 35 files.
The complete output and its digest are retained in [baseline-unit.json](receipts/Oct_05_21_14/baseline-unit.json) and [baseline-unit.txt](receipts/Oct_05_21_14/baseline-unit.txt).

### Ordered installation failure matrix

Source: `src/installation/migration.test.ts`; production entrypoint: `src/install.ts:23`.
The no-hook fixture has six destination writes and three obsolete-source deletions.
Each failpoint belongs to one fixture and one selected stage/ordinal, and must fire exactly once.
Every interruption retains the journal. Unowned state and owner instructions must survive every retry.

| Workflow ordinal | Boundary-call ordinal | Interaction | Failure timing | Expected residual state before retry | Required retry result |
|---|---|---|---|---|---|
| 1 | 0 | Journal creation | After journal write | No destination writes; all old sources retained; current configuration absent | Complete migration; journal removed |
| 2 | 0 | Destination write | After write 0 | First intended destination committed; later destinations retain their prior state; old sources retained | Complete migration; journal removed |
| 3 | 1 | Destination write | After write 1 | First two intended destinations committed; later destinations retain their prior state; old sources retained | Complete migration; journal removed |
| 4 | 2 | Destination write | After write 2 | First three intended destinations committed; later destinations retain their prior state; old sources retained | Complete migration; journal removed |
| 5 | 3 | Destination write | After write 3 | First four intended destinations committed; later destinations retain their prior state; old sources retained | Complete migration; journal removed |
| 6 | 4 | Destination write | After write 4 | First five intended destinations committed; current configuration absent; old sources retained | Complete migration; journal removed |
| 7 | 5 | Configuration write | After write 5 | All intended destinations committed; current configuration has the requested version; old sources retained | Complete migration; journal removed |
| 8 | 0 | Hook metadata boundary | After destination writes | All intended destinations committed; all old sources retained | Complete migration; journal removed |
| 9 | 0 | Obsolete-source deletion | After deletion 0 | First obsolete source absent; later obsolete sources retain their exact original bytes | Complete migration; journal removed |
| 10 | 1 | Obsolete-source deletion | After deletion 1 | First two obsolete sources absent; previous configuration retains its exact original bytes | Complete migration; journal removed |
| 11 | 2 | Previous configuration deletion | After deletion 2 | All obsolete sources absent; intended destinations and journal retained | Complete migration; journal removed |

The hook-enabled fixture repeats this matrix with eight destination writes, followed by the actual Git hook-setting mutation and the same three deletions.
Its thirteen interruption points inspect `core.hooksPath` before retry: absent before metadata, `.orly/hooks` after metadata.
Both matrices retain each intended destination's exact bytes, each retained obsolete source's original bytes, owner instructions and unowned state.
The tests also refuse owner hook changes during destination writes before metadata or cleanup.
The source is [migration.test.ts](../../src/installation/migration.test.ts); all results are retained in [hook-metadata-after.txt](receipts/Oct_05_21_14/hook-metadata-after.txt).

The fixtures perform no remote mutations, so remote acknowledgement-loss proof does not apply to these rows.
Hook-setting conflicts have separate controls for both enabled and disabled resumed hook options.

### Candidate checks and assertion controls

`make audit` reported 498 passed, 0 failed and 2,219 assertions across 52 files in [audit-guidance-serial.txt](receipts/Oct_05_21_14/audit-guidance-serial.txt).
The same command reported 0 unnamed-string violations across 104 source files, 37,391 rule bytes against the 37,888-byte cap, and 46 dispatch, 10 error-parity and 25 ledger cases with zero failures.
Compared with the isolated baseline, the declared unit selection grew by 159 cases.
[test-case-ledger.json](receipts/Oct_05_21_14/test-case-ledger.json) retains exact runtime labels and multiplicities; added or renamed labels are distinguished from net growth.
Its 178 added or renamed cases include 128 classified negative or boundary cases. Parameterized mixed positive/negative cases are visible in the ledger; this count is not a branch-coverage measurement.
Counting only one negative input in each of four mixed two-input groups gives a conservative lower bound of 124 / 178, or 69.66%, in the same ledger.

[assertion-controls.json](receipts/Oct_05_21_14/assertion-controls.json) binds six deliberately incorrect implementations to their executed source, test and full-output digests.
All six correct variants passed; all six incorrect variants failed actual assertions.
The selected guards cover owner-byte refusal, journal integrity, write-checkpoint ordering, owner hook conflicts, unknown configuration and exact completion markers.
These are scoped controls, not an exhaustive mutation percentage.

Two later controls cover additional observed defects:

- Owner changes during destination writes: [before repair](receipts/Oct_05_21_14/hook-metadata-before.txt) reports 33 passed and 1 failed; [after repair](receipts/Oct_05_21_14/hook-metadata-after.txt) reports 34 passed and 0 failed.
- Repeated process-group cleanup: [before repair](receipts/Oct_05_21_14/group-test-before.txt) reports 0 passed and 1 failed; [repeated repaired runs](receipts/Oct_05_21_14/group-tests-after.txt) report 20 passed and 0 failed. The deadline and output guards retain their original assertions.

The inventory control separately restores the old stale-review behavior and fails the new assertions: [inventory-stale-control.json](receipts/Oct_05_21_14/inventory-stale-control.json).
[cleanup-controls.json](receipts/Oct_05_21_14/cleanup-controls.json) observes normal, failing and terminating startup paths for four runners; suite bodies are not executed in the failing/terminating probes.
[package-cache.json](receipts/Oct_05_21_14/package-cache.json) observes one package construction across three requests and unchanged cached bytes after a mutable upgrade case.

The fresh `make install-evals` run reports 23 passed and 0 failed in [installation-guidance.txt](receipts/Oct_05_21_14/installation-guidance.txt).
[packed-checkers-final.json](receipts/Oct_05_21_14/packed-checkers-final.json) enumerates both declared registry authoring checks: the actual packed entrypoint accepts valid authoring fixtures, rejects missing registry fixtures and stale renders, and refuses these authoring commands in an installed-package context.
The current release probe exposed an additional missed repair: its rules-file assertion still named `AGENTS.orly.md`. After the owner approved the one-line correction, the repaired body passes while the old-path and missing-render controls fail; [release-layout-final.json](receipts/Oct_05_21_14/release-layout-final.json) binds the exact workflow bytes and full outputs.
This is local package evidence; no hosted workflow or publication ran.

One later overlapping run failed the ledger-cleanup test at its unchanged 20-second timer: [audit-guidance.txt](receipts/Oct_05_21_14/audit-guidance.txt) retains 497 passed, 1 failed and 2,216 assertions. The isolated cleanup selection reports 4 passed, 0 failed in [cleanup-isolated.txt](receipts/Oct_05_21_14/cleanup-isolated.txt); the same canonical audit without the package suite alongside it reports 498 passed, 0 failed in the current receipt above. This remains an observed timing limit under overlapping load; no test budget was raised and the failed attempt remains recorded.

### Required proof ledger

| Changed behavior and production symbols | Required branches and effects | Observed tests or controls |
|---|---|---|
| `install`, `InstallTransaction.commit/recover`, `migrationDeletes`, `diskDigest`, `installationLock` | Recorded/unrecorded/edited ownership, every ordered mutation, retained journal, safe restart, metadata conflicts, competing and stale lock owners | `installation/migration.test.ts`, `installation/lock.test.ts`, `installation_preservation.test.ts`; interruption and assertion-control receipts above |
| `planFiles`, `installedPath`, `resolveLayout`, `managedContent`, loader preparation and hook planning | Fresh/repeated installation, selected packs, thin entrypoints, references, owner hooks and host content | `install.test.ts`, `install_loaders.test.ts`, `install_packs.test.ts`, `loaders.test.ts`; [installation.txt](receipts/Oct_05_21_14/installation.txt) |
| `readConfig/readConfigSync`, `parseConfig`, `serialiseConfig`, `selectPacks`, `sniffCommands` | Missing, minimal and malformed settings; unknown keys; round-trip command/limit preservation; previous-only preview | `config.test.ts`, `config_validation.test.ts`, `setup.test.ts`, `cli.test.ts`; unknown-configuration assertion control |
| `selectedCommands`, `lifecyclePlan`, `readExecution`, command criteria | Preview equals selected local work; invalid/active remote options refuse; disabled launcher supplies no pass or side effect | `execution/plan.test.ts`, `criteria.test.ts`, `gates.test.ts` |
| `runCommand`, `stopOwnedGroup`, `limitsFor`, supervisor capture | Deadline and combined-stream limit; actual owned child termination; private full receipts; lane override; successful stop happens once | `command_runner.test.ts`, `command_process.test.ts`; repeated cleanup red/green evidence |
| `specDimensionsOf`, `unacknowledgedObligations`, specification criteria | Exact statuses, quoted/example exclusions, item-bound acknowledgement, independently wrong production wiring and behavior | `spec_completion.test.ts`, `spec_rehearsal.test.ts`; exact-marker assertion control |
| Source/index selection and scanner entrypoints | Index/configuration agreement, inverse working edits, rename/delete, quoted paths, explicit targets, unknown options, alias ownership, allocating initialization, private concurrent receipts | `scanner_scope.test.ts`, dispatch/error-parity evaluations |
| `assertWritableInside`, evidence writing, document classification, product-reference checking | Outside/dangling symlinks; dotted/integer spec paths; generic versus opt-in product rules; preservation of outside bytes | `model.test.ts`, `verify.test.ts`, `doc_rules.test.ts`, `pack_hygiene.test.ts` |
| Document-read records, comprehension cache, review-poll collector | Escaping and malformed records, invalidated/incomplete cached proof, all-page shapes, pushed revision, missing/failed/changed checks | `doc_reads.test.ts`, `comprehension_cache.test.ts`, `review_poll.test.ts`, ledger evaluations |
| `inventory`, `reviewFor`, evaluation-runner cleanup | Changed/missing review digests become pending, record self-reference stays pending, caller-owned resources survive | `release_inventory.test.ts`, `evaluation_resources.test.ts`, inventory and cleanup controls |

The per-finding evidence is recorded in [repairs.json](repairs.json).
The integration audit exercises real files, Git repositories, installed packages, process groups and local HTTP boundaries through repository-native tests.
No datastore or remote worker is introduced by this repair.
Database teardown, Zig allocation checks and a network service's hundred-connection test are inapplicable to these local installation/scanner changes.
The installation race proof uses controlled competing processes at the filesystem boundary; it does not establish arbitrary cross-tool isolation.

### Historical assertion changes

The runtime-label comparison includes nineteen removed or renamed labels.
Twelve move installation assertions into the loader suite; three change the owned directory name.
The missing executable hook case becomes the missing `bunx` case.
Three old destructive-ownership cases are replaced by exact preservation/refusal assertions: owner-edited managed content, unrecorded generated banners and owner Claude instructions.
The full label ledger remains available for review; test-count growth alone does not prove assertion equivalence.

## Limits

The historical baseline is a comparison result, not final candidate verification. The randomized full selection preceded the final guide edits; unchanged runtime/test bytes and the fresh canonical audit supply current revalidation.
An actual live consuming-repository trial remains later work under Indy's recorded instruction.
Further live model calls, native builds and the recorded owner-excluded findings remain excluded.
No numeric branch-coverage result, exhaustive syscall-failure injection or transitive executable-cache closure is claimed.
Every named guard above has bounded observed evidence; this does not certify every conditional in the complete release diff.
Review-poll tests exercise collection and incomplete results, not a finished two-quiet-poll follow-up session.
The pinned generated hook on both requested operating systems, every installed scanner, hosted release readiness and publication remain unobserved. The two registry authoring checks have bounded packed-entrypoint evidence above.
The required subagent review is unavailable under the owner's work-alone instruction; a parent review cannot silently complete that requirement.

## Related pages

- [Active specification](../../docs/v1/active/M09_001_P1_CLI_DOCS_INFRA_SKILL_VERIFIED_COMMANDER_RELEASE.md)
- [Unit-test skill](../../skills/orly-write-unit-test/SKILL.md)
- [Integration-test skill](../../skills/orly-write-integration-test/SKILL.md)
