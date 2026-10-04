---
type: explanation
audience: contributor
verified: 2026-10-04
product_version: 0.11.0
executable: false
---

# Jev advice in the 0.11 Bun package

## What it is

The unpublished 0.11 package extends the existing `bunx` installation with explicit judgment commands.
The command sends selected, scanned evidence to TypeSafe's Jev model and returns fixed next actions.
The consumer trial demonstrates a passing test that misses a seeded locale bug.

Sources: `package.json:3`, `src/cli.ts`, `src/judgments/questions.ts`, and the receipts described below.

## Why it exists

A passing test can accept an incorrect result when its assertion checks only truthiness.
The trial asks whether Jev identifies that gap before a reviewer accepts the test.
An independent exact assertion then checks whether the suggested improvement catches the bug.

Indy's scope: “this is an extention of 0.10.x type of install and the focus is on judgement”.
The shipped command runs TypeScript source through Bun; TypeScript 7 remains development tooling.
The runtime parser uses JavaScript dependencies (`package.json`, `src/judgments/syntax_worker.ts`).

## How it behaves

### Consumer control

The consumer was a fresh `agentsfleet` worktree at `189b6394d620746231badfaad0df7f823cfd93fa`.
The controlled files were `ui/packages/design-system/src/design-system/time-utils.ts` and its sibling test.
The original checkout and the consumer's own hooks were preserved.

The healthy helper uses the requested locale.
The seeded bug uses the default locale and adds a locale prefix.
That prefix keeps an existing shallow locale-difference test passing.

The weak linked test uses `toBeTruthy()`.
The exact linked test compares against an independent `Intl.DateTimeFormat` result for `en-GB`.
Both tests call the same controlled helper with the same date.

| Source and assertion | Actual test result | Jev decisions |
|---|---|---|
| Healthy source, exact assertion | 49 passed; zero failed | exact, exact, exact |
| Seeded bug, weak assertion | 49 passed; zero failed | weak, weak, weak |
| Same seeded bug, exact assertion | 48 passed; one failed | exact, exact, exact |

The failing exact test expected `03 May 2026, 15:30` and received `en-GB May 03, 2026, 03:30 PM`.
An `exact` answer assesses the assertion's precision; it does not approve the implementation.

The command was `bun run test -- src/design-system/time-utils.test.ts` from the consumer package.
Evidence: `consumer-live-41e9ht/{healthy-exact,wrong-weak,wrong-exact}-tests.log` under the private receipt root below.

Each judgment used the packed package through `bunx --bun --package <local-tarball> orly judge verify ... --refresh --json`.
Each request returned one validated answer from `jev-1.13.0`; no automatic retries occurred.

| Control | Repeat | Decision | Strength | Milliseconds | Input tokens | Output tokens |
|---|---:|---|---:|---:|---:|---:|
| Healthy exact | 1 | exact | 0.99 | 626.111 | 1868 | 56 |
| Healthy exact | 2 | exact | 1.00 | 509.164 | 1868 | 56 |
| Healthy exact | 3 | exact | 0.99 | 453.659 | 1868 | 56 |
| Wrong weak | 1 | weak | 1.00 | 459.109 | 1817 | 56 |
| Wrong weak | 2 | weak | 1.00 | 445.946 | 1817 | 56 |
| Wrong weak | 3 | weak | 1.00 | 468.918 | 1817 | 56 |
| Wrong exact | 1 | exact | 0.96 | 499.700 | 1890 | 56 |
| Wrong exact | 2 | exact | 0.96 | 517.176 | 1890 | 56 |
| Wrong exact | 3 | exact | 0.96 | 446.220 | 1890 | 56 |

These nine requests used 16,725 input tokens and 504 output tokens.
Recorded request-to-replay-write time ranged from 445.946 to 626.111 milliseconds; the median was 468.918.
The observations contain no classification disagreement, missing reply or uncertain answer within these selected controls.

The weak answers selected the fixed action to replace the broad assertion and rerun the seeded bug (`src/judgments/constants.ts`).
The consumer now retains healthy source and the exact assertion (`consumer-bunx-trial.log`).

### Other question controls

The other five questions each received one positive and one negative synthetic example through the packed command.
These controls check provider wiring and the intended distinctions; they are separate from the real consumer example.

| Question | Example | Expected | Returned | Strength | Uncertain |
|---|---|---|---|---:|---|
| `plan.prerequisites` | Self-contained arithmetic with supplied inputs | yes | yes | 0.77 | yes |
| `plan.prerequisites` | Private receipt with missing key and endpoint | no | no | 0.96 | no |
| `plan.observable_result` | Explicit inputs and exact output | yes | yes | 0.98 | no |
| `plan.observable_result` | Vague improvement request | no | no | 0.89 | no |
| `review.failure_path` | Propagated read error and cleanup in `finally` | yes | yes | 0.90 | no |
| `review.failure_path` | Swallowed error and missing cleanup | no | no | 0.97 | no |
| `review.rule_applicability` | Fetch rule with a fetch call | yes | yes | 0.96 | no |
| `review.rule_applicability` | Fetch rule with arithmetic only | no | no | 0.95 | no |
| `document.claim` | Claim bounded to measured consumer results | yes | yes | 0.94 | no |
| `document.claim` | Universal detection and automatic gate clearance | no | no | 0.97 | no |

All ten replies validated and matched the expected direction (`catalog-live-np0xAb/receipts.json`).
The self-contained arithmetic answer fell below the existing 0.8 advice threshold and suggested inspection instead of approval.
That uncertainty remains recorded; the threshold and question were not tuned to make this example pass.

These ten requests used 5,576 input tokens and 200 output tokens.
Recorded elapsed time ranged from 310.233 to 500.294 milliseconds (`catalog-live-np0xAb/receipts.json`).
Provider response shapes follow the [TypeSafe API reference](https://docs.typesafe.ai/api).

### Runtime checks

The macOS consumer calls used Bun 1.4.2 and the local 0.11.0 tarball through `bunx`.
Babel and Zod are runtime dependencies; TypeScript remains a development dependency (`package.json:60`).
The final source package reports `0.11.0`, and the consumer's installed rules pass `doctor`.
Evidence: `final-bunx-version.log` and `consumer-doctor-final.log`.

A Linux aarch64 container ran the same source package through `bunx` with Bun 1.4.2.
It selected the complete function and named test, then returned the expected missing-replay result with zero requests.
This checks Linux command loading and evidence selection; it does not claim a live Linux provider run (`linux-final-package.log`).

### Receipt locations

The private receipt root is `/private/tmp/orly-ts-011-Oct_04_13_50`.
The consumer harness saved original bytes, each report, test output and a combined receipt file before proceeding.
The catalog harness saved separate stdout, stderr and reports for each stage.

| Evidence | Location under the receipt root |
|---|---|
| Consumer harness | `consumer-trial.ts` |
| Nine consumer replies and exact source references | `consumer-live-41e9ht/consumer-receipts.json` |
| Consumer command outcomes | `consumer-bunx-trial.log` |
| Supplemental question inputs | `catalog-live-np0xAb/project/` |
| Ten supplemental replies | `catalog-live-np0xAb/receipts.json` |
| Supplemental harness and command outcomes | `catalog-trial.ts`, `catalog-trial.log` |
| Linux command fixture and package | `bunx-linux/` |
| Replay preflight regression before and after repair | `replay-preflight-red.log`, `replay-preflight-green.log` |
| Selector and replay review regressions | `review-fixes-{red,green}.log`, `markdown-{list,hash}-{red,green}.log` |
| Partial completion and refusal behavior | `partial-completion.log` |

The three consumer identities were stable within each repeated control:

| Control | Identity |
|---|---|
| Healthy exact | `9902b60ef4ca5687be6e61d977716278cba3e28c75495dedb4cf3dbf0b890420` |
| Wrong weak | `bce3c0f97773df1ee7ef4b07c1d15ee86c749d1b5b2e43e60c7fc00f3f7b84ef` |
| Wrong exact | `2bd6edb9fdc3a963d339d5615e118b065b92366aeffa674302dacd3579fe2ff9` |

## Limits

This is a selected locale example and ten synthetic question controls, not an independent accuracy benchmark.
The provider's confidence and the 0.8 advice threshold have no independent calibration.
The experiment compares assertions on controlled code; it establishes no language, runtime or cost superiority.

Nineteen final requests produced validated results.
An earlier macOS package probe produced one additional exact answer before the final consumer run (`bunx-macos.5OYKJS/healthy-first-live.json`).
The earlier missing-parser attempt made zero provider requests; its incomplete result is retained outside the final control counts.

Token counts are usage observations, not a monetary bill.
Only the bounded consumer test file ran; these results do not claim the whole consumer repository passed verification.
The package remains unpublished, and model advice cannot change a gate or authorize a command.

Private receipt paths belong to this machine.
The tables retain the measured outcomes, while a fresh machine must repeat the controls to obtain new receipts.
Windows and Linux x86_64 were not exercised in this trial.

## Related pages

- [Judgment command reference](../../docs/JUDGMENTS.md)
- [Command architecture](../../docs/ORLY_ARCHITECTURE.md)
- [Package usage](../../README.md)
