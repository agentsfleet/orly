---
type: explanation
audience: contributor
verified: 2026-10-04
product_version: 0.11.0
executable: false
---

# Verification of the Bun judgment experiment

## What it is

This report maps the changed judgment code to behavior, failure, integration and regression proofs.
The public entrypoint calls `judgmentCommand`, which validates input before `judge` prepares evidence and requests advice.
Sources: `src/cli.ts`, `src/judgments/command.ts:27`, and `src/judgments/runner.ts:19`.

## Why it exists

The useful outcome is a precise assertion that catches an incorrect result accepted by a weak test.
The [consumer report](report.md) records that outcome through the packed `bunx` command.
This report checks the surrounding input, transport and failure behavior without giving model answers gate authority.

## How it behaves

### Required-test ledger

The unit and integration test skills were applied to the changed source, including the ordered boundaries below.
Every listed test calls production helpers; no internal module is mocked.
Provider replies and scanner refusals use typed external dependency seams in the runner tests.

| Changed unit or failure group | Proof | Status |
|---|---|---|
| `judgmentCommand`, option parsing, help and structured results | `command.integration.test.ts`; packed consumer calls | covered |
| Manifest schemas: unknown fields, stage, question, roles, identifiers and size | `types.test.ts`, `questions.test.ts` | covered |
| `validateManifest`, `validateItem`: duplicates and missing supporting roles | `types.test.ts`, `questions.test.ts` | covered |
| `CATALOG`, fixed questions, polarity and next actions | `questions.test.ts`, `advice.test.ts`; six live question controls | covered |
| `prepareItem`: complete evidence, changed-input identity, state budget and embedded instructions | `evidence.test.ts` | covered |
| `containedFile`: absolute paths, traversal, missing files and escaped symlinks | `files.test.ts`, `evidence.test.ts` | covered |
| `readBounded`: regular files, size, symlinks and malformed Unicode Transformation Format (UTF-8) | `files.test.ts` | covered |
| `readStream`: multibyte chunks, byte budget, cancellation and reader release | `files.test.ts`, `transport.integration.test.ts` | covered |
| `digest`, `byteLength`: selected bytes change identity; byte budgets count encoded data | `evidence.test.ts`, `files.test.ts` | covered through callers |
| `selectSyntax`: full functions, named tests, syntax errors, duplicate and absent symbols | `syntax.test.ts` | covered |
| Parser worker: TypeScript, JavaScript XML (JSX) syntax, skipped ancestors and computed skip/todo | `syntax.test.ts` | covered |
| Parser worker startup and timeout; later parsing remains usable | `syntax.test.ts` | covered |
| Markdown section: child headings, duplicate and missing headings, fences and literal trailing hashes | `syntax.test.ts` | covered |
| `scanUpload`: real clean input, detected credential and owned-process deadline | `scan.test.ts` | covered |
| `requestAdvice`: real HTTP request, status refusal, invalid body, byte limit and timeout | `transport.integration.test.ts` | covered |
| Transport cleanup: request canceled, stream reader released, response body hidden | `transport.integration.test.ts` | covered |
| `parseReply`: pinned model, exactly one answer, answer kind, usage and probability distribution | `wire.test.ts` | covered |
| `assess`: fixed actions, weak assertions, diffuse probabilities and uncertainty | `advice.test.ts` | covered |
| `replayDirectory`, `replayDestination`: real directories, existing/dangling symlinks and non-regular destinations | `replay.test.ts`, `runner.integration.test.ts` | covered |
| `readReplay`, `writeReplay`: exact identity, checksum, malformed JSON and source-free record | `replay.test.ts` | covered |
| `judge`: all-item preflight, missing credentials, refused upload and attempted-request accounting | `runner.integration.test.ts` | covered |
| Later scanner, provider and post-upload replay failures | `runner.integration.test.ts` | covered with residual-state checks |
| Invalid replay identity passed directly to an internal helper | `won't-test`: production accepts only the digest produced by `prepareItem` | guarded invariant |
| Request byte limit beyond the state limit and fixed catalog text | `won't-test`: catalog text plus accepted state stays below this defensive limit | guarded invariant |
| Scanner pipe shape inconsistent with `Bun.spawn`'s declared pipe configuration | `won't-test`: Bun owns this interface; the production configuration fixes the pipe type | guarded invariant |
| Disk exhaustion and operating-system failure during atomic file replacement | `needs-infra`: no disk-fault injection or durability claim in this trial | coverage limit |

Selected source is parsed without running it.
The worker is not included in Bun's parent-process coverage table, so its behavior is checked by semantic input tests.

### Ordered partial-completion proof

Each counter belongs to one test invocation; ordinal failures are local to that invocation.
No model request automatically retries, and a default re-read never falls through to a new upload.
These requests perform inference, not remote business-state mutation; no remote exactly-once write guarantee is claimed.

| Workflow ordinal | Boundary-call ordinal | Failure and seam | Prior completed work | Durable and external residual state | User-visible result and next read | Proof |
|---|---|---|---|---|---|---|
| 1: prepare all items | item 2 | Missing selected source | Item 1 prepared | No replay directory or provider call | Both incomplete; zero requests | `an invalid later item stops the whole batch before upload` |
| 2: scan all requests | scan 1 | Scanner throws through typed seam | Evidence prepared | No upload or replay directory | Incomplete; zero requests | `missing credentials or failed scanning prevent all uploads` |
| 2: scan all requests | scan 2 | Local counter throws on the later request | First scan complete | No upload or replay directory | Both incomplete; zero requests | `a later scanner refusal leaves every item incomplete without upload` |
| 3: check destinations | destination 2 | Real existing/dangling symlink or directory | All scans complete | Existing blocked path retained; no upload | Both incomplete; zero requests | replay symlink and directory regressions |
| 4: request and validate | provider 1 | Invalid provider shape | Preflight complete | One attempt; no valid replay | Incomplete; default re-read makes zero requests | `invalid provider replies count the attempt and never create a valid replay` |
| 4: request and validate | provider 2 | Local counter returns HTTP 503 | Item 1 answer and replay complete | Two attempts; first replay survives | First complete, second incomplete; default re-read preserves both outcomes without upload | `a later provider refusal preserves earlier evidence and never retries` |
| 5: write replay | write 2 | Provider seam creates a directory at the later filename after preflight | Item 1 answer and replay complete | Two replies; first replay survives; no pending temporary file | Later item incomplete with usage retained; default re-read makes zero requests | `a later replay failure after upload preserves usage and earlier evidence` |

The last three tests passed together with the original runner tests: 11 passed, zero failed, 60 assertions (`partial-completion.log`).
Disk-fault rows beyond these deterministic seams remain a named coverage limit, not a claimed exhaustive failure proof.

### Meaningful regressions

The tests ran before their fixes, then passed after the corresponding production change.
The private receipt root is `/private/tmp/orly-ts-011-Oct_04_13_50`.

| Regression set | Before repair | After repair | Receipt files |
|---|---|---|---|
| Later replay symlink must prevent all uploads | 5 passed; 2 failed; observed two forbidden uploads | 11 passed; zero failed | `replay-preflight-{red,green}.log` |
| Computed skipped tests, repeated fenced headings and replay filename directory | 16 passed; 8 failed | 24 passed; zero failed | `review-fixes-{red,green}.log` |
| Heading example inside a list fence | 16 passed; 1 failed | 17 passed; zero failed | `markdown-list-{red,green}.log` |
| Literal trailing hash must remain in the selected heading | 18 passed; 1 failed | 19 passed; zero failed | `markdown-hash-{red,green}.log` |

These are targeted regression-killing proofs, not a full mutation-testing campaign.

### Verification receipts

| Command or check | Decisive evidence |
|---|---|
| Baseline `bun test src` at `bc3e62f14c5ad420c6986bda4155f11c1470b8c3` | 268 passed; zero failed; 700 assertions; 23 files (`baseline-unit.log`) |
| Final `make audit` | 339 passed; zero failed; 910 assertions; 35 files (`audit-final-339.log`) |
| `bun test src/judgments --coverage --randomize --seed 104` | 71 passed; zero failed; 210 assertions; 12 files (`judgments-final-coverage.log`) |
| `make llmevals CHECK=1` | 57 valid fixtures; no live calls (`llmevals-check.log`) |
| Generated-rules invariance | 19 dispatch entries; 10 trigger extensions; 9 lifecycle stages; 6 bans; 37,781 bytes against 37,888 (`audit-final-339.log`) |
| Prompt questionnaire | 180 of 180 answers YES ([questionnaire](questionnaire.md)) |
| macOS packed `bunx` command | Version 0.11.0; consumer `doctor` exit zero (`final-bunx-version.log`, `consumer-doctor-final.log`) |
| Consumer hook hashes | Both pre-commit and pre-push unchanged (`consumer-hooks-check.log`) |
| Linux aarch64 packed `bunx` command | Bun 1.4.2; package 0.11.0; evidence prepared; expected missing-result exit two with zero requests (`linux-final-package.log`) |
| Live judgment usefulness | Nine real consumer answers and ten other question controls ([trial report](report.md)) |
| Native teardown backup | 293 saved paths; 293 backup files present; zero removed paths still on disk (`native-removal-check.log`) |

The repository declares `bun test src` as its unit lane in `.oracle/orly.json:31`.
It declares no separate integration or memory-check lane; real HTTP, subprocess and filesystem tests run inside that unit lane.
The narrowed judgment run is Section evidence and does not replace the final repository gate.

### Integration coverage

| Tier | Evidence and limits |
|---|---|
| Real dependency wiring | Real Bun HTTP server, worker, file descriptors, private filesystem and gitleaks |
| Request lifecycle | Shipped command and bounded request/body handling |
| State and partial completion | Exact records, stale identity refusal and earlier-item preservation after later failures |
| Failure injection | Typed provider/scanner seams, owned nonresponding worker and real blocked replay paths |
| Isolation | Fresh `TestProject` per test; randomized execution passes |
| Resource lifecycle | Worker stopped; stream reader released; scanner process killed and awaited; temporary files checked |
| Incremental streaming | Response byte bounds and stalled-body cancellation; no product event stream |
| API validation | Strict manifests and typed provider replies; no OpenAPI change |
| Client/daemon supervision | Not applicable: one-shot command, no daemon or lease |

The command processes at most 12 items sequentially, with at most eight evidence references per item.
It makes at most one provider request per item, without retry (`src/judgments/constants.ts`, `src/judgments/runner.ts`).
No throughput, shared-write concurrency or 100-connection service claim is made.

## Limits

Bun reports lines and functions, not branch coverage; those numbers do not prove all error paths were injected.
The coverage table includes unrelated imported validation code and omits worker-process instrumentation.
No calibrated model accuracy, monetary cost, language superiority or operating-system disk durability is claimed.

Gstack review and its native adversarial reader found the listed defects; each repair has a failing and passing regression.
The invocation stopped at its three-fix-cycle limit, so a fresh final adversarial pass is still required before merge.
The outside review provider was disabled by the installed review configuration; no independent model review is claimed.

The live rules-comprehension smoke run failed: Claude could not authenticate, and OpenCode exceeded its account quota.
Codex and Amp each answered the selected question correctly (`llmevals-smoke.log`, `comprehension-diagnostic.log`).
The live check remains incomplete; no owner-approved deferral or passing evidence is recorded.

The source sweep retains independent Rust authoring rules and prior records; all 293 archived teardown paths are absent (`native-removal-check.log`).
The questionnaire's Scenario 26 introduction still names the canceled Milestone 07 plan (`audits/agents-md.md:335`).
That unchanged rules prose does not describe the retained runtime, which is checked against `README.md` and `docs/ORLY_ARCHITECTURE.md`.

## Related pages

- [Consumer judgment report](report.md)
- [Rules questionnaire](questionnaire.md)
- [Judgment command reference](../../docs/JUDGMENTS.md)
