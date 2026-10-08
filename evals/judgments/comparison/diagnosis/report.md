---
type: explanation
audience: contributor
verified: 2026-10-08
product_version: 0.13.0
executable: false
---

# Retained Jev result diagnosis

## What it is

Keep every candidate evaluation-only. Clarify fixture and label meanings before selecting a candidate for fresh measurement.
The saved evidence supports that recommendation, with each candidate assessment in [the ledger](ledger.json).

This is Milestone 12 (M12)'s offline diagnosis of Jev, TypeSafe's judgment model.
It accounts for every saved attempt and preserves the original answers, labels, thresholds and receipts.
It adds zero provider requests; see the [specification's evidence](../../../../docs/v2/done/M12_001_P2_DOCS_JEV_RESULT_DIAGNOSIS.md#discovery-consult-log).

## Why it exists

The retained report counts agreement after confidence withholding. A grading disagreement can occur even when the native answer matches its expected label.
The question inputs also use controlled fixture shorthand, which needs separate semantic review.

| Observation | Saved attempts | Evidence |
|-------------|----------------|----------|
| Total | 188 | `ledger.json`: `counts.attempts` |
| Matching grades | 68 | `counts.grades.pass` |
| Disagreements | 118 | `counts.grades.fail` |
| Unavailable replies | 2 | `counts.grades.unavailable` |
| Native answers matching stored labels | 83 | `counts.native_label_matches` |
| Withheld usable answers | 96 | `counts.withheld` |

These counters describe stored-label agreement. They do not measure autonomous coding-task improvement or independently adjudicated model accuracy.
The [existing architecture](../../../../docs/architecture/judgment-evaluation.md#scoring-and-adoption) keeps adoption evidence separate.

## How it behaves

### Input and replay audit

All 33 source digests listed in the live receipt match the checked-in bytes.
All 188 request digests and identities were reconstructed, including the twelve consumer requests.
The combined input digest also matches; the [specification](../../../../docs/v2/done/M12_001_P2_DOCS_JEV_RESULT_DIAGNOSIS.md#discovery-consult-log) records the audit results.

The consumer source and test snapshots match their retained receipt hashes.
The matching receipt is `consumer-shipping-package.json`, whose original root is `/private/tmp/agentsfleet-orly-013-final-package`.
That historical path was used as data; the diagnosis did not read or change that directory.

The original root matters because two finding-resolution requests include a probe's absolute import path.
Using the roots from `consumer-final.json` or `consumer-fresh-main.json` produces two request mismatches each.
The successful reconstruction recovers those requests from [checked-in snapshots](../fixtures/consumer-source.txt), without inspecting another repository.

Saved live and replay attempts, results, scores and adoption decisions are identical.
Their only differing fields are `mode`, `requests` and `observations`; replay changes observation provenance to editable.
This verifies saved correspondence, with no new full replay command or provider requests.

### Separate native answers from grading

The [grader](../jev.ts) withholds answers whose strength is below 0.8.
For a yes/no reply, strength is the larger of its probability and its complement.
For a choice reply, strength is the retained `confidence` field.

Withholding replaces the answer with `abstain`, then the grader compares it with the expected label.
The following groups are disjoint and account for every attempt; their case identifiers are in `ledger.json`.

| Group | Attempts | Explanation |
|-------|----------|-------------|
| Native answer and grade match | 52 | Strength meets the cutoff and the stored label matches. |
| Withholding matches an abstain label | 16 | A low-strength answer becomes the expected `abstain`. |
| Matching native answer withheld | 31 | The native answer matches, but the substituted grade does not. |
| Different native answer withheld | 49 | The native answer differs; the substituted grade also differs. |
| Different native answer retained | 38 | Strength meets the cutoff; the retained answer differs from the label. |
| Reply rejected during validation | 2 | No usable reply was retained. |

The 118 disagreements comprise 31 matching-but-withheld, 49 differing-and-withheld and 38 differing-and-retained answers.
The 68 matching grades include sixteen confidence abstentions, so they cannot all be described as matching native answers.
The ledger preserves every raw reply and this grading explanation separately.

### Inspect expectation meaning

All 176 fixture labels agree with the deterministic label oracle.
That agreement proves consistency with the coded fixture rules; it does not establish independent human agreement on the questions.
The [architecture](../../../../docs/architecture/judgment-evaluation.md#frozen-inputs-and-independent-expectations) already states this limitation.

The [oracle](../hidden/label-oracle.ts) assigns ambiguity from differing global permission alternatives before checking a question's specific property.
Those alternatives need not change the selected property. The ledger marks every affected case for semantic review without changing its original label.

For example, `fixture-069` supplies matching rule and implementation triggers, with no rule exception.
The question asks about trigger applicability, but its expected answer is `abstain` because the requirement contains competing permission alternatives.
Jev answers `yes` at strength 0.95; interpreting this as a model error requires adjudicating the expectation first.

Several questions receive encoded facts instead of complete code or natural-language decisions.
For `evidence.sufficiency`, a target identifier stands in for the named question; for failure coverage, strings assert the handler and mutant outcomes.
Those are controlled fixture meanings, so their agreement or disagreement cannot establish performance on full source-code judgments.

| Case | Saved result | Supported explanation |
|------|--------------|-----------------------|
| `fixture-113` | Expected/native `supported`; strength 0.28; grade `abstain` | The cutoff alone explains the grading disagreement. |
| `fixture-069` | Expected `abstain`; native/grade `yes` | Global ambiguity and scoped rule applicability need separate adjudication. |
| `fixture-145` | Expected `supported`; native `defective`; grade `abstain` | Encoded refusal/test facts and low confidence are visible; the model's reasoning is absent. |
| `consumer-uncalled-clock-helper-submitted` | Expected/native `defective`; strength 0.53; grade `abstain` | The reconstructed request matches; confidence withholding explains the grading disagreement. |
| `consumer-context-unknown-dependencies` | Expected `insufficient`; native/grade `defective` | Missing caller evidence and an absent dependency summary create competing classification cues. |
| `fixture-103`, `fixture-117` | Unavailable | Retained errors report that probabilities do not sum to one. |

For the two unavailable replies, the [wire validator](../../../../src/judgments/wire.ts) checks probability sums within 0.00001.
The rejected raw replies were not retained, so their exact sums and upstream causes cannot be recovered from these receipts.
The diagnosis records the known validation reason without inventing an authentication, network or timeout failure.

Every ledger row references its retained input, question definition and label source.
The row preserves its native reply and grade, with an explanation and shared interpretation notes.
Categorical replies carry no reasoning trace. A question-wording concern therefore remains a supported concern, not a proved explanation of the model's internal cause.

### Candidate assessment

The table separates raw stored-label matches from grades. Each synthetic split contains eight attempts per candidate, with two examples per class.
The ledger also retains each original adoption record and its exact numerators and denominators.

| Candidate | Development raw / grade matches | Held-out raw / grade matches | Held-out defect recall | Held-out insufficient detection |
|-----------|---------------------------------|------------------------------|------------------------|--------------------------------|
| `plan.obligation_coverage` | 2 / 0 of 8 | 4 / 0 of 8 | 0 of 2 | 0 of 2 |
| `evidence.sufficiency` | 4 / 0 of 8 | 4 / 0 of 8 | 0 of 2 | 0 of 2 |
| `verify.production_wiring` | 2 / 2 of 8 | 2 / 2 of 8 | 0 of 2 | 0 of 2 |
| `review.failure_coverage` | 2 / 2 of 8 | 2 / 2 of 8 | 2 of 2 | 0 of 2 |
| `review.finding_resolution` | 3 / 2 of 8 | 3 / 2 of 8 | 0 of 2 | 0 of 2 |

These counters use the retained scoring policy. The field named `native_correctness` applies confidence withholding before comparing labels in [score.ts](../score.ts).
Likewise, `ambiguous_abstention` can credit generic low-confidence abstention without a native `ambiguous` answer.
Neither field should be read as raw answer accuracy or demonstrated recognition of ambiguity.

Failure coverage's two detected held-out defects make it a useful question to inspect, but do not justify selecting it for fresh measurement.
Its insufficient-evidence detection is zero, the per-class sample is small, and its fixture semantics need review.
Every candidate therefore retains its recorded evaluation-only decision.

The next useful action is to adjudicate the question/fixture concerns before proposing fresh, independently resolved inputs.
That proposal would include request/token limits and uncertainty reporting under the [existing requirements](../../../release/evaluation-plan.md#adoption-requirements).
Fresh measurement and paired coding experiments retain their separate scope approval; runtime adoption requires its own reviewed change.

## Limits

The diagnosis establishes retained-input identities and recorded grading behavior, with no new provider measurements.
Historical consumer probes support scripted labels; they do not establish autonomous coding-agent improvement.
The saved held-out examples are now inspected diagnostic evidence and must not become a tuned evaluation set.

Thresholds, question wording and expected labels remain as recorded. Disputed semantics are findings for owner review, not repaired inputs.
Raw failed replies and model reasoning were not saved; those limits remain explicit in the ledger.
The approved diagnostic scope is complete even where the retained evidence cannot establish an internal cause.

## Related pages

- [Per-attempt ledger](ledger.json)
- [Saved live measurement](../receipts/jev-live.json)
- [Saved replay](../receipts/jev-replay.json)
- [Milestone specification](../../../../docs/v2/done/M12_001_P2_DOCS_JEV_RESULT_DIAGNOSIS.md)
