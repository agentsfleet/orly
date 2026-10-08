# orly 0.13.0 — TypeSafe Jev evaluation

Model: `jev-1.13.0`. Mode: `--live`. Collection complete: true.

✅ means Jev agrees with the independently grounded expected answer. ❌ means disagreement. ⚪ means no usable answer.
Strength below the frozen 0.8 threshold is graded as abstention; the original native answer remains visible.
These marks grade the examiner's answer; they do not approve the agent's work.

| Judgment | Agrees | Disagrees | Unavailable | Uncertain |
|---|---:|---:|---:|---:|
| `plan.prerequisites` | 4 ✅ | 12 ❌ | 0 | 12 |
| `plan.observable_result` | 8 ✅ | 8 ❌ | 0 | 0 |
| `verify.assertion` | 8 ✅ | 7 ❌ | 1 | 11 |
| `review.failure_path` | 8 ✅ | 8 ❌ | 0 | 8 |
| `review.rule_applicability` | 9 ✅ | 7 ❌ | 0 | 7 |
| `document.claim` | 10 ✅ | 8 ❌ | 0 | 0 |
| `plan.obligation_coverage` | 3 ✅ | 15 ❌ | 0 | 15 |
| `evidence.sufficiency` | 1 ✅ | 16 ❌ | 1 | 15 |
| `verify.production_wiring` | 5 ✅ | 13 ❌ | 0 | 9 |
| `review.failure_coverage` | 5 ✅ | 13 ❌ | 0 | 13 |
| `review.finding_resolution` | 6 ✅ | 12 ❌ | 0 | 8 |

## Every evaluated example

| Example | Judgment | Expected | Jev | Graded decision | Grade | Strength |
|---|---|---|---|---|---|---:|
| `fixture-001` | `plan.prerequisites` | yes | no | abstain | ❌ | 0.7 (uncertain) |
| `fixture-002` | `plan.prerequisites` | yes | no | abstain | ❌ | 0.74 (uncertain) |
| `fixture-003` | `plan.prerequisites` | no | no | abstain | ❌ | 0.6699999999999999 (uncertain) |
| `fixture-004` | `plan.prerequisites` | no | no | abstain | ❌ | 0.7 (uncertain) |
| `fixture-005` | `plan.prerequisites` | abstain | no | abstain | ✅ | 0.52 (uncertain) |
| `fixture-006` | `plan.prerequisites` | abstain | no | abstain | ✅ | 0.5900000000000001 (uncertain) |
| `fixture-007` | `plan.prerequisites` | abstain | no | no | ❌ | 0.85 |
| `fixture-008` | `plan.prerequisites` | abstain | no | no | ❌ | 0.85 |
| `fixture-009` | `plan.prerequisites` | yes | no | abstain | ❌ | 0.74 (uncertain) |
| `fixture-010` | `plan.prerequisites` | yes | no | abstain | ❌ | 0.73 (uncertain) |
| `fixture-011` | `plan.prerequisites` | no | no | abstain | ❌ | 0.69 (uncertain) |
| `fixture-012` | `plan.prerequisites` | no | no | abstain | ❌ | 0.71 (uncertain) |
| `fixture-013` | `plan.prerequisites` | abstain | no | abstain | ✅ | 0.6 (uncertain) |
| `fixture-014` | `plan.prerequisites` | abstain | no | abstain | ✅ | 0.63 (uncertain) |
| `fixture-015` | `plan.prerequisites` | abstain | no | no | ❌ | 0.86 |
| `fixture-016` | `plan.prerequisites` | abstain | no | no | ❌ | 0.88 |
| `fixture-017` | `plan.observable_result` | yes | yes | yes | ✅ | 0.95 |
| `fixture-018` | `plan.observable_result` | yes | yes | yes | ✅ | 0.94 |
| `fixture-019` | `plan.observable_result` | no | no | no | ✅ | 0.9 |
| `fixture-020` | `plan.observable_result` | no | no | no | ✅ | 0.91 |
| `fixture-021` | `plan.observable_result` | abstain | yes | yes | ❌ | 0.93 |
| `fixture-022` | `plan.observable_result` | abstain | yes | yes | ❌ | 0.93 |
| `fixture-023` | `plan.observable_result` | abstain | no | no | ❌ | 0.89 |
| `fixture-024` | `plan.observable_result` | abstain | no | no | ❌ | 0.89 |
| `fixture-025` | `plan.observable_result` | yes | yes | yes | ✅ | 0.95 |
| `fixture-026` | `plan.observable_result` | yes | yes | yes | ✅ | 0.96 |
| `fixture-027` | `plan.observable_result` | no | no | no | ✅ | 0.92 |
| `fixture-028` | `plan.observable_result` | no | no | no | ✅ | 0.92 |
| `fixture-029` | `plan.observable_result` | abstain | yes | yes | ❌ | 0.94 |
| `fixture-030` | `plan.observable_result` | abstain | yes | yes | ❌ | 0.94 |
| `fixture-031` | `plan.observable_result` | abstain | no | no | ❌ | 0.83 |
| `fixture-032` | `plan.observable_result` | abstain | no | no | ❌ | 0.81 |
| `fixture-033` | `verify.assertion` | exact | exact | abstain | ❌ | 0.21 (uncertain) |
| `fixture-034` | `verify.assertion` | exact | exact | abstain | ❌ | 0.47 (uncertain) |
| `fixture-035` | `verify.assertion` | weak | weak | weak | ✅ | 0.95 |
| `fixture-036` | `verify.assertion` | weak | weak | weak | ✅ | 0.96 |
| `fixture-037` | `verify.assertion` | abstain | exact | abstain | ✅ | 0.3 (uncertain) |
| `fixture-038` | `verify.assertion` | abstain | exact | abstain | ✅ | 0.42 (uncertain) |
| `fixture-039` | `verify.assertion` | insufficient | missing | abstain | ❌ | 0.69 (uncertain) |
| `fixture-040` | `verify.assertion` | insufficient | unavailable | unavailable | ⚪ | unavailable |
| `fixture-041` | `verify.assertion` | exact | exact | abstain | ❌ | 0.5 (uncertain) |
| `fixture-042` | `verify.assertion` | exact | exact | abstain | ❌ | 0.49 (uncertain) |
| `fixture-043` | `verify.assertion` | weak | weak | weak | ✅ | 0.96 |
| `fixture-044` | `verify.assertion` | weak | weak | weak | ✅ | 0.97 |
| `fixture-045` | `verify.assertion` | abstain | exact | abstain | ✅ | 0.55 (uncertain) |
| `fixture-046` | `verify.assertion` | abstain | exact | abstain | ✅ | 0.5 (uncertain) |
| `fixture-047` | `verify.assertion` | insufficient | missing | abstain | ❌ | 0.71 (uncertain) |
| `fixture-048` | `verify.assertion` | insufficient | missing | abstain | ❌ | 0.7 (uncertain) |
| `fixture-049` | `review.failure_path` | yes | yes | abstain | ❌ | 0.58 (uncertain) |
| `fixture-050` | `review.failure_path` | yes | yes | abstain | ❌ | 0.62 (uncertain) |
| `fixture-051` | `review.failure_path` | no | no | no | ✅ | 0.84 |
| `fixture-052` | `review.failure_path` | no | no | no | ✅ | 0.83 |
| `fixture-053` | `review.failure_path` | abstain | yes | abstain | ✅ | 0.51 (uncertain) |
| `fixture-054` | `review.failure_path` | abstain | yes | abstain | ✅ | 0.53 (uncertain) |
| `fixture-055` | `review.failure_path` | abstain | no | no | ❌ | 0.87 |
| `fixture-056` | `review.failure_path` | abstain | no | no | ❌ | 0.87 |
| `fixture-057` | `review.failure_path` | yes | yes | abstain | ❌ | 0.52 (uncertain) |
| `fixture-058` | `review.failure_path` | yes | yes | abstain | ❌ | 0.52 (uncertain) |
| `fixture-059` | `review.failure_path` | no | no | no | ✅ | 0.84 |
| `fixture-060` | `review.failure_path` | no | no | no | ✅ | 0.83 |
| `fixture-061` | `review.failure_path` | abstain | no | abstain | ✅ | 0.52 (uncertain) |
| `fixture-062` | `review.failure_path` | abstain | no | abstain | ✅ | 0.56 (uncertain) |
| `fixture-063` | `review.failure_path` | abstain | no | no | ❌ | 0.87 |
| `fixture-064` | `review.failure_path` | abstain | no | no | ❌ | 0.88 |
| `fixture-065` | `review.rule_applicability` | yes | yes | yes | ✅ | 0.95 |
| `fixture-066` | `review.rule_applicability` | yes | yes | yes | ✅ | 0.95 |
| `fixture-067` | `review.rule_applicability` | no | no | no | ✅ | 0.84 |
| `fixture-068` | `review.rule_applicability` | no | no | abstain | ❌ | 0.76 (uncertain) |
| `fixture-069` | `review.rule_applicability` | abstain | yes | yes | ❌ | 0.95 |
| `fixture-070` | `review.rule_applicability` | abstain | yes | yes | ❌ | 0.95 |
| `fixture-071` | `review.rule_applicability` | abstain | no | abstain | ✅ | 0.69 (uncertain) |
| `fixture-072` | `review.rule_applicability` | abstain | no | abstain | ✅ | 0.71 (uncertain) |
| `fixture-073` | `review.rule_applicability` | yes | yes | yes | ✅ | 0.95 |
| `fixture-074` | `review.rule_applicability` | yes | yes | yes | ✅ | 0.96 |
| `fixture-075` | `review.rule_applicability` | no | no | abstain | ❌ | 0.76 (uncertain) |
| `fixture-076` | `review.rule_applicability` | no | no | abstain | ❌ | 0.76 (uncertain) |
| `fixture-077` | `review.rule_applicability` | abstain | yes | yes | ❌ | 0.95 |
| `fixture-078` | `review.rule_applicability` | abstain | yes | yes | ❌ | 0.95 |
| `fixture-079` | `review.rule_applicability` | abstain | no | abstain | ✅ | 0.65 (uncertain) |
| `fixture-080` | `review.rule_applicability` | abstain | no | abstain | ✅ | 0.6599999999999999 (uncertain) |
| `fixture-081` | `document.claim` | yes | yes | yes | ✅ | 0.92 |
| `fixture-082` | `document.claim` | yes | yes | yes | ✅ | 0.92 |
| `fixture-083` | `document.claim` | no | no | no | ✅ | 0.96 |
| `fixture-084` | `document.claim` | no | no | no | ✅ | 0.96 |
| `fixture-085` | `document.claim` | abstain | yes | yes | ❌ | 0.9 |
| `fixture-086` | `document.claim` | abstain | yes | yes | ❌ | 0.88 |
| `fixture-087` | `document.claim` | abstain | no | no | ❌ | 0.91 |
| `fixture-088` | `document.claim` | abstain | no | no | ❌ | 0.91 |
| `fixture-089` | `document.claim` | yes | yes | yes | ✅ | 0.96 |
| `fixture-090` | `document.claim` | yes | yes | yes | ✅ | 0.96 |
| `fixture-091` | `document.claim` | no | no | no | ✅ | 0.97 |
| `fixture-092` | `document.claim` | no | no | no | ✅ | 0.97 |
| `fixture-093` | `document.claim` | abstain | yes | yes | ❌ | 0.95 |
| `fixture-094` | `document.claim` | abstain | yes | yes | ❌ | 0.95 |
| `fixture-095` | `document.claim` | abstain | no | no | ❌ | 0.94 |
| `fixture-096` | `document.claim` | abstain | no | no | ❌ | 0.94 |
| `fixture-097` | `plan.obligation_coverage` | supported | insufficient | abstain | ❌ | 0.24 (uncertain) |
| `fixture-098` | `plan.obligation_coverage` | supported | supported | abstain | ❌ | 0.27 (uncertain) |
| `fixture-099` | `plan.obligation_coverage` | defective | supported | abstain | ❌ | 0.4 (uncertain) |
| `fixture-100` | `plan.obligation_coverage` | defective | supported | abstain | ❌ | 0.55 (uncertain) |
| `fixture-101` | `plan.obligation_coverage` | ambiguous | supported | abstain | ❌ | 0.52 (uncertain) |
| `fixture-102` | `plan.obligation_coverage` | ambiguous | supported | abstain | ❌ | 0.61 (uncertain) |
| `fixture-103` | `plan.obligation_coverage` | insufficient | insufficient | abstain | ❌ | 0.71 (uncertain) |
| `fixture-104` | `plan.obligation_coverage` | insufficient | insufficient | insufficient | ✅ | 0.81 |
| `fixture-105` | `plan.obligation_coverage` | supported | supported | abstain | ❌ | 0.51 (uncertain) |
| `fixture-106` | `plan.obligation_coverage` | supported | supported | abstain | ❌ | 0.45 (uncertain) |
| `fixture-107` | `plan.obligation_coverage` | defective | supported | abstain | ❌ | 0.53 (uncertain) |
| `fixture-108` | `plan.obligation_coverage` | defective | supported | abstain | ❌ | 0.51 (uncertain) |
| `fixture-109` | `plan.obligation_coverage` | ambiguous | supported | abstain | ❌ | 0.67 (uncertain) |
| `fixture-110` | `plan.obligation_coverage` | ambiguous | supported | abstain | ❌ | 0.5 (uncertain) |
| `fixture-111` | `plan.obligation_coverage` | insufficient | insufficient | abstain | ❌ | 0.67 (uncertain) |
| `fixture-112` | `plan.obligation_coverage` | insufficient | insufficient | abstain | ❌ | 0.72 (uncertain) |
| `fixture-113` | `evidence.sufficiency` | supported | supported | abstain | ❌ | 0.27 (uncertain) |
| `fixture-114` | `evidence.sufficiency` | supported | supported | abstain | ❌ | 0.23 (uncertain) |
| `fixture-115` | `evidence.sufficiency` | defective | defective | abstain | ❌ | 0.55 (uncertain) |
| `fixture-116` | `evidence.sufficiency` | defective | defective | abstain | ❌ | 0.49 (uncertain) |
| `fixture-117` | `evidence.sufficiency` | ambiguous | supported | abstain | ❌ | 0.53 (uncertain) |
| `fixture-118` | `evidence.sufficiency` | ambiguous | unavailable | unavailable | ⚪ | unavailable |
| `fixture-119` | `evidence.sufficiency` | insufficient | supported | abstain | ❌ | 0.17 (uncertain) |
| `fixture-120` | `evidence.sufficiency` | insufficient | supported | abstain | ❌ | 0.17 (uncertain) |
| `fixture-121` | `evidence.sufficiency` | supported | insufficient | abstain | ❌ | 0.2 (uncertain) |
| `fixture-122` | `evidence.sufficiency` | supported | insufficient | abstain | ❌ | 0.29 (uncertain) |
| `fixture-123` | `evidence.sufficiency` | defective | defective | abstain | ❌ | 0.56 (uncertain) |
| `fixture-124` | `evidence.sufficiency` | defective | defective | abstain | ❌ | 0.45 (uncertain) |
| `fixture-125` | `evidence.sufficiency` | ambiguous | supported | abstain | ❌ | 0.28 (uncertain) |
| `fixture-126` | `evidence.sufficiency` | ambiguous | supported | abstain | ❌ | 0.27 (uncertain) |
| `fixture-127` | `evidence.sufficiency` | insufficient | defective | abstain | ❌ | 0.17 (uncertain) |
| `fixture-128` | `evidence.sufficiency` | insufficient | insufficient | abstain | ❌ | 0.19 (uncertain) |
| `fixture-129` | `verify.production_wiring` | supported | supported | supported | ✅ | 0.95 |
| `fixture-130` | `verify.production_wiring` | supported | supported | supported | ✅ | 0.95 |
| `fixture-131` | `verify.production_wiring` | defective | supported | abstain | ❌ | 0.73 (uncertain) |
| `fixture-132` | `verify.production_wiring` | defective | supported | abstain | ❌ | 0.72 (uncertain) |
| `fixture-133` | `verify.production_wiring` | ambiguous | supported | supported | ❌ | 0.95 |
| `fixture-134` | `verify.production_wiring` | ambiguous | supported | supported | ❌ | 0.95 |
| `fixture-135` | `verify.production_wiring` | insufficient | defective | abstain | ❌ | 0.27 (uncertain) |
| `fixture-136` | `verify.production_wiring` | insufficient | defective | abstain | ❌ | 0.29 (uncertain) |
| `fixture-137` | `verify.production_wiring` | supported | supported | supported | ✅ | 0.89 |
| `fixture-138` | `verify.production_wiring` | supported | supported | supported | ✅ | 0.93 |
| `fixture-139` | `verify.production_wiring` | defective | supported | abstain | ❌ | 0.64 (uncertain) |
| `fixture-140` | `verify.production_wiring` | defective | supported | abstain | ❌ | 0.61 (uncertain) |
| `fixture-141` | `verify.production_wiring` | ambiguous | supported | supported | ❌ | 0.92 |
| `fixture-142` | `verify.production_wiring` | ambiguous | supported | supported | ❌ | 0.92 |
| `fixture-143` | `verify.production_wiring` | insufficient | insufficient | abstain | ❌ | 0.2 (uncertain) |
| `fixture-144` | `verify.production_wiring` | insufficient | defective | abstain | ❌ | 0.23 (uncertain) |
| `fixture-145` | `review.failure_coverage` | supported | defective | abstain | ❌ | 0.6 (uncertain) |
| `fixture-146` | `review.failure_coverage` | supported | defective | abstain | ❌ | 0.67 (uncertain) |
| `fixture-147` | `review.failure_coverage` | defective | defective | defective | ✅ | 0.97 |
| `fixture-148` | `review.failure_coverage` | defective | defective | defective | ✅ | 0.95 |
| `fixture-149` | `review.failure_coverage` | ambiguous | defective | abstain | ❌ | 0.63 (uncertain) |
| `fixture-150` | `review.failure_coverage` | ambiguous | defective | abstain | ❌ | 0.51 (uncertain) |
| `fixture-151` | `review.failure_coverage` | insufficient | defective | abstain | ❌ | 0.76 (uncertain) |
| `fixture-152` | `review.failure_coverage` | insufficient | defective | abstain | ❌ | 0.71 (uncertain) |
| `fixture-153` | `review.failure_coverage` | supported | defective | abstain | ❌ | 0.62 (uncertain) |
| `fixture-154` | `review.failure_coverage` | supported | defective | abstain | ❌ | 0.71 (uncertain) |
| `fixture-155` | `review.failure_coverage` | defective | defective | defective | ✅ | 0.97 |
| `fixture-156` | `review.failure_coverage` | defective | defective | defective | ✅ | 0.97 |
| `fixture-157` | `review.failure_coverage` | ambiguous | defective | abstain | ❌ | 0.53 (uncertain) |
| `fixture-158` | `review.failure_coverage` | ambiguous | defective | abstain | ❌ | 0.64 (uncertain) |
| `fixture-159` | `review.failure_coverage` | insufficient | defective | abstain | ❌ | 0.76 (uncertain) |
| `fixture-160` | `review.failure_coverage` | insufficient | defective | abstain | ❌ | 0.77 (uncertain) |
| `fixture-161` | `review.finding_resolution` | supported | supported | supported | ✅ | 0.89 |
| `fixture-162` | `review.finding_resolution` | supported | supported | supported | ✅ | 0.93 |
| `fixture-163` | `review.finding_resolution` | defective | supported | abstain | ❌ | 0.52 (uncertain) |
| `fixture-164` | `review.finding_resolution` | defective | supported | abstain | ❌ | 0.4 (uncertain) |
| `fixture-165` | `review.finding_resolution` | ambiguous | supported | supported | ❌ | 0.95 |
| `fixture-166` | `review.finding_resolution` | ambiguous | supported | supported | ❌ | 0.95 |
| `fixture-167` | `review.finding_resolution` | insufficient | insufficient | abstain | ❌ | 0.32 (uncertain) |
| `fixture-168` | `review.finding_resolution` | insufficient | insufficient | abstain | ❌ | 0.31 (uncertain) |
| `fixture-169` | `review.finding_resolution` | supported | supported | supported | ✅ | 0.89 |
| `fixture-170` | `review.finding_resolution` | supported | supported | supported | ✅ | 0.89 |
| `fixture-171` | `review.finding_resolution` | defective | supported | abstain | ❌ | 0.37 (uncertain) |
| `fixture-172` | `review.finding_resolution` | defective | supported | abstain | ❌ | 0.44 (uncertain) |
| `fixture-173` | `review.finding_resolution` | ambiguous | supported | supported | ❌ | 0.91 |
| `fixture-174` | `review.finding_resolution` | ambiguous | supported | supported | ❌ | 0.96 |
| `fixture-175` | `review.finding_resolution` | insufficient | defective | abstain | ❌ | 0.31 (uncertain) |
| `fixture-176` | `review.finding_resolution` | insufficient | defective | abstain | ❌ | 0.27 (uncertain) |
| `consumer-locale-false-completion-restored` | `document.claim` | yes | yes | yes | ✅ | 0.89 |
| `consumer-locale-false-completion-submitted` | `document.claim` | no | no | no | ✅ | 0.92 |
| `consumer-missing-seconds-restored` | `plan.obligation_coverage` | supported | supported | supported | ✅ | 0.93 |
| `consumer-missing-seconds-submitted` | `plan.obligation_coverage` | defective | defective | defective | ✅ | 0.99 |
| `consumer-uncalled-clock-helper-restored` | `verify.production_wiring` | supported | supported | supported | ✅ | 0.88 |
| `consumer-uncalled-clock-helper-submitted` | `verify.production_wiring` | defective | defective | abstain | ❌ | 0.47 (uncertain) |
| `consumer-missing-invalid-guard-restored` | `review.failure_coverage` | supported | supported | supported | ✅ | 1 |
| `consumer-missing-invalid-guard-submitted` | `review.failure_coverage` | defective | defective | abstain | ❌ | 0.79 (uncertain) |
| `consumer-unresolved-locale-finding-restored` | `review.finding_resolution` | supported | supported | supported | ✅ | 1 |
| `consumer-unresolved-locale-finding-submitted` | `review.finding_resolution` | defective | defective | defective | ✅ | 1 |
| `consumer-context-known-gap` | `evidence.sufficiency` | defective | defective | defective | ✅ | 1 |
| `consumer-context-unknown-dependencies` | `evidence.sufficiency` | insufficient | defective | defective | ❌ | 0.91 |

## Adoption

- `plan.obligation_coverage`: evaluation-only; This report does not certify independent measurement provenance or paired agent improvement; owner-editable files cannot establish either. Fewer than twenty independently resolved held-out cases exist in at least one class. Required recall, conservative false-concern bound or insufficiency detection is unavailable or below its threshold. Paired task improvement without unsupported completion or authority violations is unproved.
- `evidence.sufficiency`: evaluation-only; This report does not certify independent measurement provenance or paired agent improvement; owner-editable files cannot establish either. Fewer than twenty independently resolved held-out cases exist in at least one class. Required recall, conservative false-concern bound or insufficiency detection is unavailable or below its threshold. Paired task improvement without unsupported completion or authority violations is unproved.
- `verify.production_wiring`: evaluation-only; This report does not certify independent measurement provenance or paired agent improvement; owner-editable files cannot establish either. Fewer than twenty independently resolved held-out cases exist in at least one class. Required recall, conservative false-concern bound or insufficiency detection is unavailable or below its threshold. Paired task improvement without unsupported completion or authority violations is unproved.
- `review.failure_coverage`: evaluation-only; This report does not certify independent measurement provenance or paired agent improvement; owner-editable files cannot establish either. Fewer than twenty independently resolved held-out cases exist in at least one class. Required recall, conservative false-concern bound or insufficiency detection is unavailable or below its threshold. Paired task improvement without unsupported completion or authority violations is unproved.
- `review.finding_resolution`: evaluation-only; This report does not certify independent measurement provenance or paired agent improvement; owner-editable files cannot establish either. Fewer than twenty independently resolved held-out cases exist in at least one class. Required recall, conservative false-concern bound or insufficiency detection is unavailable or below its threshold. Paired task improvement without unsupported completion or authority violations is unproved.

Requests in this run: 188. Recorded original requests: 188. Recorded token usage: 129135 input, 7205 output.
Raw typed replies, failures, elapsed milliseconds, request digests and source digests are retained in report.json.

These are measured Jev answers on fixed examples, not measured autonomous agent improvement. Replay is owner-editable and cannot certify independent provenance.
