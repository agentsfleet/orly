<!--
SPEC AUTHORING RULES (load-bearing — the one comment that survives):
- Body order follows the executing agent's read order; no authoring residue.
- No effort estimates, ownership labels, or completion percentages.
- Priority is the sizing signal; dependencies determine sequencing.
-->

# M13_001: Publish orly 0.14.0 with retained Jev diagnosis guidance

**Prototype:** v2.0.0
**Milestone:** Milestone 13 (M13)
**Workstream:** 001
**Date:** Oct 08, 2026
**Status:** IN_PROGRESS
**Priority:** P2 — owner-requested package publication
**Categories:** Documentation (DOCS), Infrastructure (INFRA)
**Batch:** B1 — one sequential release workstream
**Branch:** feat/m13-orly-014-release
**Baseline revision:** cfc46e2d476dfbd740f2ce3d899fabad6b0f3469
**Test Baseline:** pending — measure declared lanes before the Pull Request
**Baseline evidence:** pending — exact revision, command and count evidence
**Depends on:** M12_001 — merged offline diagnosis and candidate assessment
**Provenance:** agent-generated from Indy's Oct 08, 2026 release instruction
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §Topology and §Gates

## Overview

**Goal (testable):** The 0.14.0 package passes its existing installation checks and its release Pull Request merges after green Continuous Integration (CI).
**Problem:** The merged offline diagnosis is absent from the current release guidance, and Indy needs a published engine for the consumer upgrade.
**Solution summary:** Synchronize package metadata, explain the retained diagnosis, and publish through the existing main-branch release workflow.
The separate contributor pilot supplies no new runtime adoption decision.

## PR Intent & comprehension handshake

- **Pull Request (PR) title:** Publish orly 0.14.0 with Jev diagnosis guidance
- **Intent:** Give contributors the retained diagnosis and publish a verified engine version for the `agentsfleet` upgrade.
- **Handshake:** Publish the merged work through the existing workflow, preserve unfinished local work, and merge only after current checks pass.
- **ASSUMPTIONS I'M MAKING:** 0.14.0 packages the merged diagnosis documentation and refreshed release guidance; runtime judgment semantics remain governed by their existing evidence.
- **Golden path:** Update version metadata; render the lock; check the package and docs; push and open the PR; observe CI; merge; observe publication.
The existing release workflow uses trusted publishing. This work needs no credential lookup, new provider request, or workflow edit.

## Implementing agent — read these first

1. `package.json` — authoritative package version and published file selection.
2. `.github/workflows/release.yml` — existing publication, tag and release trigger.
3. `evals/judgments/comparison/diagnosis/report.md` — merged diagnosis and its evidence limitations.
4. `docs/ORLY_ARCHITECTURE.md` — explicit consumer propagation and gate boundaries.
5. `dispatch/lifecycle.md` — governance checkout exception and release-stage checks.

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `docs/v2/pending/M13_001_P2_DOCS_INFRA_ORLY_014_RELEASE.md` | CREATE | Record authorized scope before implementation. |
| `docs/v2/active/M13_001_P2_DOCS_INFRA_ORLY_014_RELEASE.md` | MOVE / EDIT | Opening metadata and verification evidence. |
| `docs/v2/done/M13_001_P2_DOCS_INFRA_ORLY_014_RELEASE.md` | MOVE | Completed release preparation. |
| `package.json` | EDIT | Publish the explicit 0.14.0 version. |
| `.orly/orly.json` | EDIT | Record the engine version through the existing update command. |
| `README.md` | EDIT | Explain retained diagnosis and link accessible source evidence. |
| `docs/CHANGELOG.md` | EDIT | Append the 0.14.0 entry without rewriting history. |

## Applicable Rules

- `docs/greptile-learnings/RULES.md` — Use Standard Parsers (RULE PSR) for version metadata and Cross-Layer Orphan Sweep (RULE ORP) for spec movement.
- `dispatch/write_spec.md` and `docs/TEMPLATE.md` — complete scope, proof mappings and exact declared commands.
- `dispatch/write_documentation.md` and `docs/DOCUMENTATION_RULES.md` — source-backed guidance, plain prose and archive preservation.
- `dispatch/write_changelog.md` and `docs/CHANGELOG_VOICE.md` — one headline, consequence-first bullets and append-only history.
- `dispatch/edit_rules.md` — render, deterministic audit, questionnaire and generated evidence for propagation guidance.
- `dispatch/verify.md` and `dispatch/lifecycle.md` — declared boundary checks, release observation and cleanup.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| Specification Template Gate | Yes | Required sections, exact lane commands and meaningful proof mappings. |
| Documentation checks | Yes | Refresh release guidance with explicit diagnosis limits and working links. |
| Governance audit | Yes | Existing audit and installation lanes; no altered checks. |
| File and function length | No source edit | Spec below its existing 320-line cap. |
| Architecture consult | No flow change | Use the existing main-branch publishing and explicit consumer update design. |

## Prior-Art / Reference Implementations

- **Reference:** `docs/v2/done/M11_001_P1_CLI_DOCS_JUDGMENT_COMPARISON_013.md` — existing package release and evidence boundaries.
- **Reference:** `evals/install/run.sh` — real packed installation and upgrade cases with disposable homes.
- **Reference:** `.github/workflows/release.yml` — established publication without a new release mechanism.
No language implementation changes; a sibling language reference is unnecessary for metadata and prose.

## Sections (implementation slices)

### §1 — Prepare package and guidance

Publish merged diagnosis guidance through the existing package and source-checkout paths.
**Implementation default:** Keep diagnosis records in their existing source location and link them directly because the package omits contributor evaluators.

- **Dimension 1.1** — Synchronize package and engine-lock versions at 0.14.0. → Test `release_versions_match`
- **Dimension 1.2** — Explain saved-answer diagnosis and retain uncertainty and adoption limits. → Test `release_guidance_matches_diagnosis`

### §2 — Prove and submit the release

Check distribution before publication; observe the resulting hosted checks and release workflow.
**Implementation default:** Reuse existing installation cases because release metadata adds no executable branch needing a new unit test.

- **Dimension 2.1** — Existing audit, packed installation and specification checks pass. → Test `release_package_installation`
- **Dimension 2.2** — Push a reviewable PR with verified evidence; require green current-revision CI before the authorized merge. → Test `release_hosted_checks`

## Interfaces

The package version and `.orly/orly.json` engine version become 0.14.0.
Existing commands, judgment question definitions, confidence threshold and installed destinations follow their current implementation.
Merge to `main` triggers the existing workflow's package publication, version tag and GitHub release.
Published diagnosis links point to the source records because contributor evaluation files are excluded from the package.

## Failure Modes

| Mode | Cause | Handling |
|------|-------|----------|
| Version mismatch | Package or generated lock differs. | `release_versions_match` fails; rerun the existing update command before push. |
| Misleading guidance | Saved-label agreement is described as autonomous improvement. | Source review rejects the claim; preserve bounded diagnostic explanations. |
| Broken distribution | Packed installation fails. | Existing negative installation cases retain failure; do not merge the candidate. |
| Hosted check failure | CI reports failure for the current revision. | Inspect logs and repair authorized scope; gate changes retain their explicit owner boundary. |
| Publication failure | Existing release job fails after merge. | Inspect the publishing job and report its actual state; never claim an unpublished version exists. |

## Invariants

1. Version identity equals 0.14.0 — parse package and lock metadata and assert exact equality.
2. Original diagnosis and live inputs retain their bytes — scoped Git diff excludes evaluator and receipt paths.
3. Runtime behavior remains covered by the existing tests — full declared unit lane and installation checks stay mandatory.
4. Unfinished local M10 work survives — its original commit remains reachable from `wip/m10-unpublished-spec-oct08`.

## Metrics & Observability

No product/operator signal changes. Hosted check and publication observations use their existing job states and links.
No analytics or funnel playbook update is required because this work changes release metadata and contributor guidance.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|-----------|------|------|---------------------------------------------|
| 1.1 | manual | `release_versions_match` | Parsed package and lock → 0.14.0 equality; mismatches fail. |
| 1.2 | manual | `release_guidance_matches_diagnosis` | Saved diagnosis and packaged README → supported explanations, accessible links, no causal improvement claim. |
| 2.1 | integration | `release_package_installation` | `make install-evals` → existing fresh/upgrade checks pass; invalid setup remains rejected. |
| 2.2 | manual | `release_hosted_checks` | Current PR revision → all discovered required CI checks pass; pending/failed results block merge. |

These manual checks are agent-run metadata, source and forge inspections, not invented human acceptance.
No executable module boundary changes; the integration-test authoring skill records why no new integration tests are needed.
Existing failed-input installation cases provide negative distribution coverage.

## Acceptance Rubric (single scoring surface)

| # | Criterion | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|-----------|---------------------|----------|----------|-----------------|
| R1 | Versions synchronized | `python3 -c 'import json; from pathlib import Path; a=json.loads(Path("package.json").read_text()); b=json.loads(Path(".orly/orly.json").read_text()); assert a["version"]==b["orly_version"]=="0.14.0"; print("versions match 0.14.0")'` | exit 0; `versions match 0.14.0` | P0 | |
| R2 | Packed installation succeeds | `make install-evals` | exit 0; zero failed cases | P0 | |
| R3 | Scope and guidance reviewed | Manual `release_guidance_matches_diagnosis` and `git diff --name-only origin/main...HEAD` | Only declared paths; supported diagnosis claims | P0 | |
| S1 | Conformance succeeds | `make conform` | exit 0 | P0 | |
| S2 | Declared unit lane succeeds | `bun test src` | exit 0 | P0 | |
| S3 | Governance audit succeeds | `make audit` | exit 0; zero failed checks | P0 | |
| S4 | Fixture comprehension succeeds | `make llmevals CHECK=1` | exit 0; no provider calls | P0 | |
| S5 | Structure and secret scan succeed | `bash audits/spec-template.sh --staged` and `gitleaks detect` | Both exit 0 | P0 | |

Repository-command grades cite final gate and hook results in PR Session Notes; no duplicate final suite is required for a prose grade.

## Dead Code Sweep

No executable symbols are renamed or deleted. Check the pending and active spec paths have no nonhistorical references after closing.
Preserve the unpublished M10 branch and every unmerged workstream during cleanup.

## Out of Scope

- New judgment questions, confidence changes, provider requests, runtime adoption or changed gates.
- Editing release workflows, secret-scanner suppressions or another contributor's work.
- The `agentsfleet` upgrade is a separate consumer outcome, reviewed by Indy before its merge.

## Product Clarity (authoring record)

1. **Successful user moment:** Indy can install published orly 0.14.0 and trace retained Jev disagreements to the source diagnosis.
2. **Preserved user behaviour:** Existing commands and gate boundaries retain their current meaning.
3. **Optimal-way check:** Existing trusted publishing directly supplies the consumer version without a new deployment mechanism.
4. **Rebuild-vs-iterate:** Update metadata and prose; a runtime refactor would not improve this release outcome.
5. **What we build:** Synchronized version metadata, diagnosis guidance, changelog and release evidence.
6. **What we do NOT build:** New evaluators, model requests or autonomous-benefit claims.
7. **Fit with existing features:** Explain the merged diagnosis while preserving experimental adoption boundaries.
8. **Surface order:** Existing command-line installation first; source links carry contributor detail.
9. **Dashboard restraint:** No dashboard or unmeasured quality display.
10. **Confused-user next step:** Follow the diagnosis link or run the documented `orly doctor` command after upgrading.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Prepare metadata and docs, then prove distribution and submit the release.
- **Alternatives considered:** Shipping another runtime evaluator would create unrelated maintenance and measurement obligations.
- **Patch-vs-refactor verdict:** This is a release metadata and documentation patch because the required publication path already exists.
- **Quality ceiling:** A larger build adds no useful correctness, performance or concurrency guarantee to this release.

## Discovery (consult log)

- **Consults:** Indy authorized the 0.14 release PR, green CI and merge without waiting for Greptile, followed by consumer upgrade and review.
- **Consults:** `git log v0.13.0..origin/main` identifies merged M12 diagnosis as the unpublished release content.
- **Consults:** Local commit `e41d236b0a439524c67f11ceb7539b7e14893361` is preserved on `wip/m10-unpublished-spec-oct08`; clean main tracks the fetched default branch.
- **Metrics review:** No product/operator signals or analytics/funnel playbooks change.
- **Skill-chain outcomes:** Pending verification, gstack review and post-push babysitting; user explicitly waives the Greptile wait for this release.
- **Deferrals:** None.
