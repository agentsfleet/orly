---
type: explanation
audience: contributor
verified: 2026-10-07
product_version: 0.13.0
executable: false
---

# Judgment comparison evaluation

## What it is

The 0.13.0 source candidate resumes the comparison parked during 0.12 migration verification.
Its deliverable combines deterministic task controls with explicit TypeSafe Jev measurements and complete result accounting.
The [original design](receipts/Oct_06_12_57/parked-comparison-spec.md) remains preserved.

## Why it exists

Selected passing tests can miss obligations, disconnected code, untested failures and unresolved findings.
The examiner must catch those gaps before its results can support any claim about model quality.
A passing offline exercise cannot establish that an actual agent performs better.

## How it behaves

The [architecture](../../docs/architecture/judgment-evaluation.md) describes commands, fixture boundaries, ownership and reporting.
The [closed specification](../../docs/v2/done/M11_001_P1_CLI_DOCS_JUDGMENT_COMPARISON_013.md) maps each required outcome to a proof.

| Comparison | Evidence | Decision |
|---|---|---|
| Six runtime questions | Frozen definitions, native answer formats and fixed actions | Preserve unchanged |
| Missing obligation | Sourced obligation, candidate Dimensions, applicable rule | Evaluation-only |
| Insufficient evidence | Named question, selected sources, dependency summary | Evaluation-only |
| Production wiring | Entrypoint, call chain, configuration, implementation | Evaluation-only |
| Failure coverage | Named scenario, handler, discriminating test | Evaluation-only |
| Finding resolution | Original finding, original behavior, repair, regression | Evaluation-only |

The corpus separates development and held-out origins before scoring.
Every question has healthy, defective, ambiguous and insufficient-context controls in both splits.
Resolved labels require checked provenance and agreement with an oracle outside the scored implementation.

Each task family has a healthy control and a plausible false completion with passing submitted tests.
Hidden behavioral assertions and mutation checks evaluate the result independently.
Permission blocks remain blocked and receive no completion credit.

Reports retain every scheduled task attempt, including exceptions, and every missing model observation.
Source digests bind the inputs and examiner code. The deterministic report section omits volatile timing and process metadata.

The separate `agentsfleet` consumer rehearsal runs the packed candidate against actual time-formatting source and its existing design-system test lane.
Its source mutations and independent native-format checks exercise realistic false completion, missing obligations, disconnected callers, missing failure behavior and unresolved findings.
The consumer report includes named check results, package identity, restoration and owner-preservation evidence.
It preserves failed full-suite attempts alongside later results; consumer package tests do not establish repository-wide verification.

### Native scoring

Correctness divides correct native answers by attempted resolved cases.
Defect recall divides correct defect detections by attempted defective cases.
False concerns include both the observed rate and a conservative bound that counts unavailable healthy replies.

Rule applicability scores applicability only. Yes/no abstention cannot identify why context is uncertain.
Missing observations leave accuracy and uncertainty unavailable; scripted replies cannot substitute for measurements.

### Adoption requirements

A future candidate needs at least twenty independently resolved held-out examples per class.
Required defect recall is at least 0.90; the conservative false-concern rate is at most 0.05.
Insufficient-evidence detection must reach 0.90.

Paired baseline-only and candidate-assisted task runs must show improved correct resolution on matching inputs.
Unsupported completions and new authority violations must both be zero.
The report must retain all attempts and sample uncertainty.

These are proposed acceptance thresholds, not calibrated guarantees.
The offline command has no adoption-enabled path: editable provenance fields cannot verify independent model runs.
Eligible measurement collection needs separate owner approval and a reviewed extension before runtime adoption.

## Limits

The fixed corpus is small and synthetic. Deterministic label checks do not establish human agreement on arbitrary source-code judgments.
Hidden checks are withheld from task inputs, not protected against hostile local processes.
Only trusted fixture scripts may run.

The 0.12.1 fixes and `.orly/` ownership remain in force.
Earlier package and consumer migration evidence stays in the [release report](release-report.md).
Only the explicit Jev measurement command sends model requests. Native builds and live commander/comprehension runs remain outside this evaluation.
Repository merging and consumer upgrades follow separate owner-authorized checks.

## Related pages

- [Evaluation architecture](../../docs/architecture/judgment-evaluation.md)
- [Runtime judgment reference](../../docs/JUDGMENTS.md)
- [Completed 0.12 specification](../../docs/v2/done/M10_001_P1_CLI_DOCS_JUDGMENT_EVALUATION_012.md)
