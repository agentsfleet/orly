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

# M12_001: Explain retained Jev results and assess further evaluation

**Prototype:** v2.0.0
**Milestone:** Milestone 12 (M12)
**Workstream:** 001
**Date:** Oct 08, 2026
**Status:** DONE
**Priority:** P2 — internal evaluation evidence
**Categories:** Documentation (DOCS)
**Batch:** B1 — one sequential workstream
**Branch:** feat/m12-jev-result-diagnosis
**Baseline revision:** 751ee303d0c97a403863f12f33adf8fbc20ff433
**Test Baseline:** unit=619 integration=n/a — no integration lane declared
**Baseline evidence:** https://github.com/agentsfleet/orly/actions/runs/37721747995
**Depends on:** M11_001 — retained 0.13.0 evaluation inputs and receipts
**Provenance:** agent-generated from Indy's approved next-step proposal
**Canonical architecture:** `docs/architecture/judgment-evaluation.md` §Scoring and adoption

## Overview

**Goal (testable):** Account for every retained Jev attempt, verify available input identities, and support a candidate recommendation with recorded evidence.
**Problem:** A grading disagreement conflates raw-answer differences with confidence withholding; a saved reply alone does not establish its cause.
**Solution summary:** Publish a per-attempt ledger, source audit, diagnostic explanations and candidate assessment using existing repository evidence.
Jev is TypeSafe's judgment model. Records distinguish measured results, source inspection, interpretations and unresolved causes.

## PR Intent & comprehension handshake

- **Pull Request (PR) title:** Explain retained Jev results and candidate evaluation limits
- **Intent:** Give Indy a reproducible explanation of the saved results before deciding whether further model evaluation is useful.
- **Handshake:** I will inspect the saved evidence, preserve original receipts and labels, and report supported explanations without inventing missing causes.
- **ASSUMPTIONS I'M MAKING:** Approval covers offline diagnosis and candidate assessment in this repository; fresh requests and paired experiments retain their separate approval boundary.
- **Golden path:** Read live/replay receipts, catalog, cases, labels and grading sources; audit identities; inspect case semantics; write evidence and recommendation; verify and review.
All inputs are local tracked files. No credential lookup, provider request or consumer-repository inspection is needed.

## Implementing agent — read these first

1. `docs/architecture/judgment-evaluation.md` — existing measurement, withholding and adoption boundaries.
2. `evals/release/evaluation-plan.md` — proposed quality criteria and approval requirements.
3. `evals/judgments/comparison/jev.ts` — request construction, native answers and grading.
4. `evals/judgments/comparison/hidden/label-oracle.ts` — fixture-label authority and limits.
5. `evals/judgments/comparison/receipts/jev-live.json` — retained requests, replies, hashes and outcomes.

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `docs/v2/pending/M12_001_P2_DOCS_JEV_RESULT_DIAGNOSIS.md` | CREATE | Approved specification before opening. |
| `docs/v2/active/M12_001_P2_DOCS_JEV_RESULT_DIAGNOSIS.md` | MOVE / EDIT | Opening metadata, findings and completion evidence. |
| `docs/v2/done/M12_001_P2_DOCS_JEV_RESULT_DIAGNOSIS.md` | MOVE | Completed evidence-only workstream. |
| `evals/judgments/comparison/diagnosis/ledger.json` | CREATE | Every retained attempt with evidence and explanation limits. |
| `evals/judgments/comparison/diagnosis/report.md` | CREATE | Findings, case examples and candidate assessment. |

## Applicable Rules

- `docs/greptile-learnings/RULES.md` — Use Standard Parsers (RULE PSR) for JSON; Cross-Layer Orphan Sweep (RULE ORP) for spec movement.
- `dispatch/write_spec.md` and `docs/TEMPLATE.md` — meaningful scope, proof mappings and lifecycle evidence.
- `dispatch/lifecycle.md` — governance checkout exception, stage order and PR boundary.
- `dispatch/write_documentation.md` and `docs/DOCUMENTATION_RULES.md` — contributor explanations, source-backed claims and historical-record preservation.
- `dispatch/name_architecture.md` — consult the existing scoring and adoption design without altering it.
- `dispatch/verify.md` — full declared verification at the PR boundary.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| Specification Template Gate | Yes | Required sections, exact commands, proof mappings and no authoring residue. |
| Documentation checks | Yes | Plain explanations; original-data citations; bounded paragraphs. |
| File and function length | No source edit | Specification stays within 320 lines; derived records contain data. |
| Governance audit | At push | Existing hooks and canonical checks; no changed rules or runners. |
| Architecture consult | Yes | Existing evaluation/adoption rules govern every recommendation. |

## Prior-Art / Reference Implementations

- **Reference:** `evals/judgments/comparison/receipts/verification.md` — retained commands and explicit limitations.
- **Reference:** `evals/judgments/comparison/receipts/jev-test-ledger.md` — local evidence-ledger style.
- **Reference:** `evals/judgments/comparison/jev-report.ts` — result fields and exact live/replay correspondence.
No language implementation is added; sibling language patterns are unnecessary for this evidence-only work.

## Sections (implementation slices)

### §1 — Audit retained evidence — DONE

Identify what can be reproduced from the saved files before interpreting answers.
**Implementation default:** Retain every source mismatch and missing input explicitly because a replay match cannot establish source completeness.

- **Dimension 1.1** — DONE — Bind receipts, source digests, request identities and question definitions to recorded bytes. → Test `audit_saved_identities`
- **Dimension 1.2** — DONE — Compare every live/replay attempt and result; distinguish saved correspondence from running a fresh replay. → Test `audit_replay_correspondence`

### §2 — Explain results and uncertainty — DONE

After §1, inspect question wording, supplied facts, labels and response handling.
**Implementation default:** Preserve unresolved causes because a categorical reply contains no reasoning trace and sanitized failures omit provider details.

- **Dimension 2.1** — DONE — Retain every attempt's native answer, strength, expected answer, grade and source references. → Test `ledger_matches_saved_attempts`
- **Dimension 2.2** — DONE — Separate confidence withholding, raw disagreements, unavailable responses and interpretation limits; explain each disagreement or its unresolved boundary. → Test `diagnosis_preserves_uncertainty`

### §3 — Assess further evaluation — DONE

After §2, evaluate candidate evidence by split and class without pooling unsuitable baseline questions.
**Implementation default:** A recommendation may retain all candidates when the evidence cannot justify selecting one.

- **Dimension 3.1** — DONE — Assess every candidate against retained evidence and documented future-evaluation criteria. → Test `candidate_assessment_preserves_limits`
- **Dimension 3.2** — DONE — Preserve original inputs and normal runtime behavior; record scope, verification and review results. → Test `diagnosis_scope_and_input_preservation`

## Interfaces

`ledger.json` contains source identities, audit findings, totals and an ordered `attempts` array.
Each row retains its case identifier, question/version, source reference, expected label, native reply, strength, grade and explanation.
Every synthetic and consumer row references retained input facts and preserves its verified request hash.
Shared notes avoid repeating question concerns; native replies and per-attempt grading explanations remain directly readable.
The consumer snapshots and shipping receipt reproduce all twelve payloads without reading the historical checkout.
Interpretive notes state their basis; unavailable-response causes remain unknown when the retained error cannot distinguish them.
The installed command-line interface, provider question catalog, labels and adoption decisions are unchanged.

## Failure Modes

| Mode | Cause | Handling |
|------|-------|----------|
| Changed source | Saved digest differs from available bytes. | Name the mismatch; do not call current bytes the original request evidence. |
| Missing request evidence | Dynamic consumer source was not retained. | Mark payload verification unavailable; retain the attempt and its bounded explanation. |
| Misleading aggregate | Confidence withholding is counted as raw-answer error. | Recompute both categories and preserve their intersection. |
| Unknown provider failure | Sanitized message lacks a distinguishable cause. | Report unavailable; do not infer authentication, network or timeout failure. |
| Disputed expectation | Fixture shorthand or global classification conflicts with question semantics. | Record the concern; preserve the expected label and original grade. |
| Unsupported adoption | Small synthetic sample or missing paired evidence. | Keep adoption separate and assess evidence limitations explicitly. |

## Invariants

1. Original tracked inputs remain byte-identical — verify recorded hashes and the branch diff.
2. Every retained attempt appears once, in source order — verify identifiers, row count and copied fields with Python JSON parsing.
3. Totals equal the retained rows — recompute statuses and withholding intersections, comparing live and replay records.
4. No confidence threshold or expected label changes — verify the scoped diff contains only the declared new records and spec movement.
5. Unknown causes are not replaced with invented explanations — ledger checks require explicit unresolved reasons for missing inputs and sanitized failures.

## Metrics & Observability

No product/operator signal changes. Report counters describe saved observations, not new provider requests or autonomous task improvement.
No analytics or funnel playbook update is required because this work adds contributor records only.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|-----------|------|------|---------------------------------------------|
| 1.1 | manual | `audit_saved_identities` | Source bytes and reconstructed requests → matching hashes or an explicit mismatch/unavailable entry; no silent replacement. |
| 1.2 | manual | `audit_replay_correspondence` | Saved live/replay arrays → identical attempts/results and a documented mode/provenance distinction. |
| 2.1 | manual | `ledger_matches_saved_attempts` | Saved ordered rows → one matching ledger row each, including unavailable replies. |
| 2.2 | manual | `diagnosis_preserves_uncertainty` | Native disagreement, confidence withholding and sanitized failures → separate counters and bounded explanations; uncertain causes remain unresolved. |
| 3.1 | manual | `candidate_assessment_preserves_limits` | Candidate/class/split evidence → retained metrics, sample limitations and a documented recommendation without an adoption claim. |
| 3.2 | manual | `diagnosis_scope_and_input_preservation` | Branch diff and input hashes → only declared files; zero modified original inputs and zero fresh provider requests. |

Manual evidence checks use local parsing and source inspection, with concise results recorded in Discovery below.
These are document/data proofs, not new automated runtime tests or fabricated human acceptance.
Negative checks cover changed/missing inputs, withheld disagreements, unavailable responses, disputed labels and unsupported adoption.
No executable module boundary changes, so new unit/integration/end-to-end tests are unnecessary.

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | Every saved attempt has a ledger row | `python3 -c 'import json; from pathlib import Path; p=Path("evals/judgments/comparison"); a=json.loads((p/"receipts/jev-live.json").read_text()); b=json.loads((p/"diagnosis/ledger.json").read_text()); assert [x["id"] for x in a["attempts"]]==[x["id"] for x in b["attempts"]]; print("all saved attempts accounted for")'` | exit 0; `all saved attempts accounted for` | P0 |PASS — 188 unique ordered rows |
| R2 | Diagnostic explanations and candidate assessment are reviewed | Manual `diagnosis_review`, recorded in Discovery below | Every candidate assessed; no unsupported cause or adoption claim | P0 |PASS — parent and adversarial review; no defects |
| R3 | Original inputs and runtime remain unchanged | `git diff --name-only origin/main...HEAD` | Only paths in Files Changed | P0 |PASS — only declared records and spec movement |
| S1 | Conform gates pass | `make conform` | exit 0 | P0 |PASS — orly gate work runs make conform |
| S2 | Declared unit lane passes | `bun test src` | exit 0 | P0 |PASS — make audit: 619 pass, 0 fail |
| S3 | Specification structure passes | `bash audits/spec-template.sh --staged` | exit 0 | P0 |PASS — staged template check |
| S4 | Secret scan passes | `gitleaks detect` | exit 0 | P0 |PASS — staged and history scans clean |
| S5 | Governance audit passes | `make audit` | exit 0; `ALL CHECKS PASSED` | P0 |PASS — full deterministic audit |

Repository-command results are recorded from the final PR gate or required hooks; Section checks do not replace them.

## Dead Code Sweep

N/A — no executable files or symbols deleted. Verify the final spec path is linked from the diagnosis report and pending/active copies are absent.

## Out of Scope

- Fresh provider requests, new held-out inputs and paired coding experiments require separately reviewed scope and authorization.
- Runtime adoption, confidence-threshold changes, label repairs and gate changes are excluded from this diagnostic record.
- Other repositories and other agents' streams are outside this workstream.

## Product Clarity (authoring record)

1. **Successful user moment:** Indy can trace a disagreement to its saved answer, grading rule and explanation limit.
2. **Preserved user behaviour:** Existing orly commands and retained measurement evidence continue to have their recorded meaning.
3. **Optimal-way check:** Static evidence records directly answer the diagnostic question without creating another maintenance surface.
4. **Rebuild-vs-iterate:** Extend the evidence set; a runtime refactor does not help this diagnosis.
5. **What we build:** One ledger and one explanation report, with completion evidence in this spec.
6. **What we do NOT build:** Provider requests, runtime adoption or another evaluator.
7. **Fit with existing features:** Explain the 0.13.0 comparison results using their existing scoring design.
8. **Surface order:** N/A — contributor records only; no new user surface.
9. **Dashboard restraint:** N/A — no dashboard or unmeasured quality display.
10. **Confused-user next step:** Read the report's candidate assessment and follow its evidence links.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Audit identities, diagnose attempts, then assess candidates; each Section consumes the preceding evidence.
- **Alternatives considered:** A new diagnostic executable adds upkeep; fresh model measurement cannot resolve unclear fixtures without the prior audit.
- **Patch-vs-refactor verdict:** This is an evidence patch because the requested output is an explanation, not changed runtime behavior.
- **Quality ceiling:** A new service or parallel implementation would add cost without improving the saved evidence's completeness.

## Discovery (consult log)

- **Consults:** Indy: "Yes i approve that" — approves the explained offline diagnosis and candidate assessment. New requests retain their separate review boundary.
- **Consults:** The preserved local `main` commit adds a pending Milestone 10 spec. Preserve it there; create this branch from the fetched comparison revision.
- **Consults:** `dispatch/lifecycle.md` governs the main-checkout branch exception for this rules repository.
- **Consults:** Indy: "I dont want to recode these here evals/judgments/comparison/diagnosis/verification.md" — remove that page; keep concise completion evidence in this spec.
- **Metrics review:** No product/operator signal changes; no analytics/funnel playbook update required.
- **Evidence audit:** Local `bun run -` probe: 176 fixture labels, 33 recorded sources, 188 request identities and grades, and 15 consumer probe receipts match; zero Jev requests.
- **Input identity:** Reconstructed `1451ffe29e22c01fa01182c35ccb7842de0b9133d85eede1ac55133106b0830a` matches `receipts/jev-live.json:input_digest`; earlier consumer roots each produce two mismatches.
- **Ledger audit:** Local `python3 -` probe: 188 copied rows, 40 source hashes, 11 question summaries, five candidate assessments and 31 shared notes checked; no mismatch.
- **Result partitions:** The ledger records 52 native/grade matches, 16 matching abstentions, 31 matching-but-withheld, 49 differing-and-withheld, 38 differing-and-retained, and two validation failures.
- **Section proofs:** `audit_saved_identities`, `audit_replay_correspondence`, `ledger_matches_saved_attempts`, `diagnosis_preserves_uncertainty`, `candidate_assessment_preserves_limits`, and `diagnosis_scope_and_input_preservation` pass.
- **Size guard:** Expanded data caused two suite failures; reference normalization fixed them. Python measures 257018 bytes against the 262144-byte limit; no checker changed.
- **Skill-chain outcomes:** `orly-write-unit-test` audited Sections 1–3 and the boundary: zero changed executable functions, branches, errors or public symbols; manual data proofs pass.
- **Integration:** Not applicable: no executable module boundary changes. Test Delta: 619 baseline and 619 current, zero growth justified by document/data-only scope.
- **Review:** gstack review and its adversarial pass found no defects. Optional Claude Code review was disabled by host configuration; no independent model-review claim.
- **Exploratory quality assurance:** Not applicable: historical evidence records only, with no executable, prompt or template changes; native source/input checks above cover data integrity.
- **Verification:** `make audit` exits 0: typecheck passes; 619 unit tests, 46 dispatch cases, 10 parity cases and 25 ledger cases pass, all with zero failures.
- **Conform:** `orly gate work` exits 0: 137 source files clean; rules size 37414 against 37888 bytes; 20 expected audit checks ran; generated files current.
- **Security and structure:** `gitleaks protect --staged` and `gitleaks detect` report no leaks; `bash audits/spec-template.sh --staged` reports one clean spec.
- **Baseline:** Successful Continuous Integration run 37721747995 at the full comparison revision reports 619 passes, zero failures and 63 files; coverage flags retain the declared source selection.
- **Scope:** User-facing behavior, version, published pages and architecture do not change. Original sources, labels, receipts and thresholds remain byte-identical.
- **Cleanup:** The rejected verification page is absent. CHORE(close) moved this spec to `done/`; report and ledger reference that final path.
- **Deferrals:** None. Unavailable evidence is a diagnostic result, not a claim that approved work was postponed.
