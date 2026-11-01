# M15_002: Telemetry-free catalogue verification

**Prototype:** v2.0.0
**Milestone:** M15
**Workstream:** 002
**Date:** Nov 01, 2026
**Status:** PENDING
**Priority:** P2 — finish the approved standards-model cleanup
**Categories:** CLI, DOCS, GOV, OBS
**Batch:** B1 — the recorded M15 follow-up; release target 0.28.0
**Branch:** pending, set at implementation start
**Baseline revision:** pending, set at implementation start
**Test Baseline:** pending, measured before implementation publication
**Baseline evidence:** pending, implementation has not started
**Depends on:** M15_001 supplies the standards catalogue and simplified skills
**Provenance:** agent-drafted from the owner's 0.28 direction and M15_001 follow-up
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` — verification, hooks and telemetry

## Overview

**Goal (testable):** Orly runs without usage telemetry, verifies its standards catalogue and audits the correct pushed governance range.
**Problem:** Telemetry and consent remain after the owner requested removal; `verify` still checks repeated renders instead of the catalogue; pre-push range cases remain unproved.
**Solution summary:** Remove telemetry from the CLI and generated hooks, reuse catalogue checks in `verify`, and prove the existing hook's range selection with isolated Git fixtures.
**Design flow:** CLI command → shared catalogue validation → concise findings and exit status; pre-push → pushed-ref selection → existing governance audit when required.

## PR Intent & comprehension handshake

- **PR title:** feat(orly): remove telemetry and verify the standards catalogue
- **Intent:** Ship the recorded M15 cleanup as 0.28, separately from M16's gate-language decision.
- **Authoring handshake:** ASSUMPTIONS I'M MAKING: remove Orly's own telemetry only; preserve user files and unrelated plugin settings; keep deterministic checks and no compatibility command aliases.
- **Implementer handshake:** Restate the final command/flag retirement and test mapping before source edits; resolve findings in the authoring review before implementation begins.

## Implementing agent — read these first

1. `AGENTS.md` and `standards/spec.md` — scope, safety and proof rules.
2. `docs/v2/active/M15_001_P1_GOV_SKILL_RULES_BECOME_STANDARDS.md` — recorded follow-up and owner decisions.
3. `docs/ORLY_ARCHITECTURE.md` — owning CLI, verification and telemetry descriptions.
4. `src/cli.ts`, `src/cli_help.ts`, `src/telemetry.ts`, `src/telemetry_sync.ts` — actual dispatch and telemetry lifetime.
5. `src/standards.ts`, `src/standards_catalogue.test.ts`, `src/verify.ts` — catalogue predicates and existing verification callers.
6. `.githooks/pre-push`, `src/git_env.ts`, `src/install_loaders.test.ts` — real pushed ranges and isolated Git environments.

## Files Changed (blast radius)

This authoring PR adds only this spec and its M15_001 link; source entries below scope the future implementation.
Re-run word-boundary discovery before implementation and amend the table for new active callers.

| File | Action | Why |
| --- | --- | --- |
| `src/telemetry.ts`; `src/telemetry_sync.ts`; `src/telemetry.test.ts` | DELETE | retire collection, spool transport and tests of retired behavior |
| `src/cli.ts`; `src/cli_help.ts`; `src/cli.test.ts` | EDIT | remove telemetry lifetime/command/help and verify the remaining command behavior |
| `src/installation/hooks.ts`; `src/installation/migration.ts`; `src/install_loaders.test.ts` | EDIT | remove telemetry invocation markers while preserving exact generated-hook ownership checks |
| `src/standards.ts`; `src/standards_catalogue.test.ts`; `src/verify.ts`; `src/verify.test.ts` | EDIT | share catalogue diagnostics between CLI and tests; retire superseded verification/evidence code |
| `.githooks/pre-push`; `Makefile` | EDIT | update retired verify flags/callers; preserve fail-closed governance audit selection |
| `src/pre_push.test.ts` | CREATE | exercise real temporary repositories and pushed-ref input |
| `package.json`; `bun.lock`; `docs/CHANGELOG.md`; `docs/ORLY_ARCHITECTURE.md`; `README.md` | EDIT | align 0.28 version and public command descriptions |
| This spec; `docs/v2/active/M15_001_P1_GOV_SKILL_RULES_BECOME_STANDARDS.md`; eventual `docs/v2/done/` destination | CREATE / EDIT / MOVE | retain scope, review and completion evidence |

Discovery separates production callers (`cli`, help, generated hooks/migration, verifier and pre-push) from tests (`telemetry`, CLI, install loaders, verifier/catalogue).
Historical specs and the pending removal spec legitimately mention the retired names; they are records, not live callers.
Other installed tools' telemetry and the existing judgments/replay transport are unrelated hits and remain outside this work.

## Applicable Rules

- `standards/code.md`: NDC, NLG — remove dead implementation and avoid compatibility aliases.
- `standards/tests.md`: TCF, TEST-REDGREEN, TEST-GITENV, TEST-ERROR — outcomes, failure evidence and isolated repositories.
- `standards/spec.md`: SPEC-BLAST, SPEC-MECH, SPEC-DIM, SPEC-DECIDE — complete caller inventory and observable proofs.
- `standards/domains/architecture.md`: ARCH-GROUND, ARCH-LAND — update the owning behavior page with the source changes.

## Applicable Gates

The authoring diff is Markdown only; source implementation must pass `make conform`, `make audit`, `orly gate pr` and gitleaks without bypasses.
Generated rules remain current; catalogue verification does not excuse broken installation/render tests in the declared unit suite.
No workflow, hook or gate is weakened to silence a failing result.

## Prior-Art / Reference Implementations

- Reuse `src/standards.ts` parsing and `src/standards_catalogue.test.ts` predicates; do not add a second catalogue definition.
- Mirror `src/git_env.ts` and existing installation test sandboxes for child Git isolation.
- Preserve the current CLI handler/error/render split; a catalogue check calls shared code rather than spawning its own test runner.

## Sections (implementation slices)

### §1 — Remove telemetry and consent

Remove Orly's collection, installation/session identifiers, consent prompt, spool writes and detached sync launch from every command path.
Retire `skill-event` and telemetry help; reject the removed command as unsupported rather than retaining an alias or silently doing nothing.
Do not read or send an old spool, even when an old consent setting enabled collection.

Leave existing user-owned telemetry files inert; do not delete arbitrary state directories or change another tool's configuration.
Document the obsolete files and manual cleanup location without opening their contents.
Generated-hook updates remove telemetry markers through the existing ownership/digest mechanism; user-edited hooks still refuse replacement.
Preserve the exact old `.githooks` byte-recognition template, including its historical `ORLY_INVOCATION=hook` line, as migration data using a local literal rather than an import from deleted telemetry code.
Prove both old digest-less `.githooks` and current recorded-digest `.orly/hooks` installations migrate, while a one-byte edit to either generation refuses before any mutation.

- **Dimension 1.1** — CLI commands never collect, spool or send Orly usage events → Test `commands run without telemetry side effects`.
- **Dimension 1.2** — Removed command is a clear error and help contains no consent invitation → Test `retired telemetry command is refused`.
- **Dimension 1.3** — Legacy generated hooks migrate, edited hooks remain protected → Test `hook cleanup preserves ownership conflicts`.

### §2 — Verify the standards catalogue

Expose the existing catalogue rules through one shared validator used by `orly verify` and catalogue tests.
Use the engine checkout as catalogue root and `fixtures/standards-rule-ids.json` as inventory authority.
Preserve every current predicate: nonempty standards, required rule fields, identifier uniqueness/inventory accounting, local links, standard-size bound and retired-stack exclusion; report the violated rule and source path rather than a generic success flag.
The CLI must retain its engine-checkout restriction and refuse verification from a published package.
Missing standards, malformed/missing inventory, duplicate/missing rules, broken links, oversized pages and retired-stack terms all fail with concrete findings.

Retire repeated-render verification and the flags `--all`, `--write-evidence` and `--llm-result` from the public command; keep meaningful renderer/install regression checks in their owning test lanes.
Remove exclusive `writeEvidence` callers, including the pre-push evidence write, rather than keeping a parallel obsolete report format.
Reject retired or unknown verification flags explicitly; `verify` does not call Jev or upload source.

- **Dimension 2.1** — Valid catalogue returns success with concrete check results → Test `verify accepts the shared valid catalogue`.
- **Dimension 2.2** — Invalid fields, duplicate/missing identifiers or broken links fail with their source → Test `verify names catalogue failures`.
- **Dimension 2.3** — Retired verification flags cannot silently pass → Test `verify refuses retired and unknown flags`.

### §3 — Prove pushed-range selection

Retain gitleaks on every push and the current governance-path audit boundary.
Test the actual hook with real temporary repositories and controlled audit seams, not a copied range-selection function.
Unset inherited Git scoping in children as the current hook does; no fixture operation may stage or modify the parent checkout.

A deleted ref alone has no new source to audit; a new branch selects local commits not present in fetched remote refs.
Aggregate all pushed refs before deciding whether governance changed; preserve the successful `git log --not --remotes` fallback when the remote-tip diff is unreadable. Only failure of both selectors forces audit, rather than silently skipping it.
If required audit or verification fails, pre-push remains nonzero.
Exercise deletion-only input, new branch, unreadable remote tip with successful fallback, both selectors failing, clean-then-governance refs and governance-then-clean/deleted refs.
Assert audit invocation counts, final hook status and gitleaks execution for every push, including deletion-only input.

- **Dimension 3.1** — Deleted/new/multiple refs select the intended audit decision → Test `pre-push handles deleted new and multiple refs`.
- **Dimension 3.2** — Unreadable ranges and failed audits cannot report a clean push → Test `pre-push fails closed on unreadable ranges`.
- **Dimension 3.3** — Polluted parent Git environment cannot escape fixture isolation → Test `pre-push fixture preserves the parent checkout`.

### §4 — Publish the coherent 0.28 surface

Update version/help/architecture/changelog together after the implementation proofs pass.
M15_001's follow-up description links this spec rather than duplicating its mechanisms.
Release tagging/publication still requires its existing owner authority; this spec authorizes no release command.

- **Dimension 4.1** — Public help, package version and architecture agree → Test `release surface describes telemetry-free verification`.

## Interfaces

Keep `orly verify` as a deterministic local command with meaningful findings and nonzero failure.
`orly skill-event`, telemetry consent options and retired verify evidence flags leave the supported surface without aliases.
Other command, installation and judgment interfaces retain their existing responsibilities.

## Failure Modes

| Trigger | Outcome | Test |
| --- | --- | --- |
| Old anonymous consent/spool exists | no read/send/append or sync child | `commands run without telemetry side effects` |
| User invokes retired command/flag | actionable nonzero error | `retired telemetry command is refused`; `verify refuses retired and unknown flags` |
| Catalogue malformed, missing or contradictory | named source finding, nonzero result | `verify names catalogue failures` |
| User edited generated hook | stop before replacement | `hook cleanup preserves ownership conflicts` |
| Both pushed-range selectors fail | audit runs; failed audit blocks push | `pre-push fails closed on unreadable ranges` |
| Inherited Git scope points at real checkout | fixture stays isolated and parent unchanged | `pre-push fixture preserves the parent checkout` |

## Invariants

One catalogue rule implementation serves CLI and tests; verification performs no live model request.
No Orly telemetry command path, queue writer or detached uploader survives.
Unknown range state cannot skip required audit, and user-edited files never become managed merely to complete cleanup.

## Metrics & Observability

Retire usage analytics rather than replacing them with another reporting system.
Record command/check outcomes for this implementation review only; add no daemon, queue or new usage endpoint.
No startup or throughput claim is made without measurement.

## Test Specification (tiered)

| Dimension | Tier | Test | Observable result |
| --- | --- | --- | --- |
| 1.1 | subprocess | `commands run without telemetry side effects` | enabled legacy consent still yields no telemetry state mutation, fetch or detached sync |
| 1.2 | subprocess | `retired telemetry command is refused` | command fails clearly; help has no consent prompt |
| 1.3 | integration | `hook cleanup preserves ownership conflicts` | untouched digest-less old and recorded-digest current hooks migrate; one-byte edits to either fail without mutation |
| 2.1 | unit/CLI | `verify accepts the shared valid catalogue` | shared validator and CLI agree on valid input |
| 2.2 | unit/CLI | `verify names catalogue failures` | absent standards, malformed/missing inventory, duplicate/missing rules, bad links, size/retired-stack violations and published-package invocation fail at their source |
| 2.3 | subprocess | `verify refuses retired and unknown flags` | unsupported options return nonzero rather than success |
| 3.1 | integration | `pre-push handles deleted new and multiple refs` | actual hook covers deletion/new/multiple/order cases with audit and gitleaks counts plus exit status |
| 3.2 | integration | `pre-push fails closed on unreadable ranges` | successful fallback is honored; both selectors failing triggers audit; failed audit blocks |
| 3.3 | integration | `pre-push fixture preserves the parent checkout` | hostile inherited Git scope leaves parent index/tree unchanged |
| 4.1 | manual | `release surface describes telemetry-free verification` | reviewer runs version/help and compares architecture/changelog at the exact final head; record identity, observations and evidence in PR notes |

## Acceptance Rubric (single scoring surface)

| # | Criterion | Verify | Expected | Priority | Graded |
| --- | --- | --- | --- | --- | --- |
| R1 | Telemetry retirement | `bun test src/cli.test.ts src/install_loaders.test.ts` | exit 0; named §1 outcomes pass; no telemetry effects; protected hooks remain unchanged| P0 | |
| R2 | Catalogue behavior | `bun test src/standards_catalogue.test.ts src/verify.test.ts` | exit 0; shared valid/invalid catalogue proofs and CLI refusals pass| P0 | |
| R3 | Pushed-range selection | `bun test src/pre_push.test.ts` | exit 0; named range/order/fallback/isolation outcomes pass with expected invocation counts| P0 | |
| R4 | Distribution remains installable | `make install-evals` | exit 0; isolated package installation proofs pass, including engine-only verify refusal| P0 | |
| R5 | Public version and clarity | `bin/orly --version` | 0.28.0 | P1 | |
| S1 | Declared conform | `make conform` | exit 0 | P0 | |
| S2 | Declared unit lane | `bun test src` | exit 0 with actual totals | P0 | |
| S3 | Required repository gate | `orly gate pr` | all declared criteria green at pushed head | P0 | |
| S4 | No credentials in history | `gitleaks detect --redact --no-banner` | no findings | P0 | |

## Dead Code Sweep

Remove both telemetry modules and tests exclusive to the retired feature.
Remove CLI imports, hooks/migration marker imports, consent text, sync launch and old verifier/evidence callers.
Re-run `git grep -n -E 'beginTelemetry|recordTelemetry|telemetry_sync|skill-event'` and classify active code, negative tests and historical records separately; do not demand zero matches across history/spec prose.
Keep unrelated judgment replay, installation integrity and renderer tests.

## Out of Scope

M16's language choice, new workflow changes, a new release pipeline and live Jev comparisons are excluded.
The broader Orly/EGM/Jev problem-to-spec proposal needs its own scoped decision, not an invented 0.29–0.30 release commitment.
No Agentsfleet runtime or generated consumer checkout is edited by this workstream.

## Product Clarity (authoring record)

1. **Successful user moment** — A contributor runs Orly without consent friction and gets a useful source finding for a malformed standard.
2. **Preserved user behaviour** — Install/update ownership checks and gate outcomes keep working; documented retired telemetry/verifier commands are the scoped surface changes.
3. **Optimal-way check** — Delete the unused collector and reuse the existing catalogue predicates; no second validator or test-runner subprocess is needed.
4. **Rebuild-vs-iterate** — Iterate the CLI and current hook; no gate architecture rewrite.
5. **What we build** — Telemetry removal, shared catalogue verification and pushed-range proofs.
6. **What we do NOT build** — M16 language migration, replacement analytics or Agentsfleet autonomy.
7. **Fit with existing features** — Reuses parser/tests and installation metadata; must preserve edited-file protection and fail-closed pushes.
8. **Surface order** — CLI-first, matching the existing product; help and architecture change with the commands.
9. **Dashboard restraint** — No dashboard or analytics controls are introduced.
10. **Confused-user next step** — Follow the named catalogue file/rule finding, or read `orly --help` after a retired-command error.

## Decomposition & alternatives (patch vs refactor)

Choose deletion plus shared existing catalogue code and tests of the current hook.
Reject a replacement telemetry layer, a second catalogue checker and a broad gate rewrite; they add work outside the approved cleanup.
Order: telemetry/hooks, shared verification, pushed-range proof, final public surface.

## Discovery (consult log)

- **Consults** — M15_001 records this follow-up. Fetched `origin/main` at `700df9c125530a4d2b0d356ee6f0511c536ca35b`; inspected CLI/help, catalogue/inventory, hook generation/migration and real pre-push range selection. The reference is authoring context, not the future implementation baseline.
- **Model reviews** — Fresh native authoring review `/root/orly_m15_spec_review`: zero Blockers, five Majors, two Nits; accepted source-grounded hook, catalogue, range, rubric and template corrections. Single review is not the full EGM pipeline; final rereview pending.
- **Open blockers** — Required authoring review completion before implementation; no new owner scope decision identified by the reviewer.
- **Metrics review** — Remove Orly usage analytics; no replacement signal. Other tools' telemetry is outside this source teardown.
- **Skill-chain outcomes** — Pending implementation verification and complete authoring review; no runtime or release result is claimed.
- **Deferrals and transfers** — M16 remains separate. Agent default: old user telemetry files remain inert rather than deleting unrelated state.

> Owner (Indy, Nov 01, 2026, time not recorded): "Orly 028 - Yes M15_002 is what we ship" — release scope is this cleanup, not M16.
