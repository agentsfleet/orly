---
type: explanation
audience: contributor
verified: 2026-10-07
product_version: 0.13.0
executable: false
---

# Independent judgment evaluation

## What it is

The source-checkout examiner compares six frozen runtime questions with five proposed checks.
It detects controlled false completions through independent behavioral assertions.
The [specification](../v2/done/M11_001_P1_CLI_DOCS_JUDGMENT_COMPARISON_013.md) records acceptance and verification.

The proposed checks cover missing obligations, insufficient evidence, production wiring, failure coverage and finding resolution.
All five remain evaluation-only. The contributor command cannot register a runtime question or clear a gate.

## Why it exists

An agent can pass a weak test while leaving required work unfinished.
A completion claim needs evidence beyond the agent's own assertion.
A missing reply must remain missing evidence.

## How it behaves

Run these commands from a source checkout with pinned dependencies installed through `bun install --frozen-lockfile`.

```bash
bun evals/judgments/comparison/run.ts --check
```

Expected output: JSON with `baseline_questions: 6`, `candidates: 5`, `cases: 176` and `passed: true`.
This validates inputs without task execution or provider requests.

```bash
bun evals/judgments/comparison/run.ts --offline
```

Expected output: JSON with `passed: true`, twelve task controls and `live_requests: 0`.
The controls include five completed tasks, six detected false completions and one honestly blocked task.
A blocked task receives no completion credit.

A failed control exits nonzero. Exceptions remain incomplete attempts, and later scheduled controls still run.
Reports retain individual unavailable observations, metrics, source digests and adoption reasons.
Redirect output to a new file for each run to retain earlier attempts.

### Frozen inputs and independent expectations

`catalog.json` pins runtime definition digests, the model and candidate meanings.
`cases.json` supplies role-specific facts. `labels.json` stores separately authored expected answers and provenance.

The label oracle reads supplied facts, never the claimed classification or model answer.
It checks native arithmetic or date-format parts, required sets, call reachability and named failure evidence.
Pinned historical sources ground the native-value controls. Their full-file digests were checked against the recorded Git revision; runtime validation compares the frozen digests so shallow checkouts need no history fetch.

Development examples use integer-row scenarios. Held-out examples use date-format scenarios with separate origins.
Each question, class and split requires two resolved labels. Pending and disputed labels cannot fill the minimum.

These are small, controlled fixture families. Their expected answers have deterministic oracle checks, not independent human adjudication.
The held-out split prevents source-origin overlap; it does not make publicly readable examples secret from a model.

### Whole-task checks

Trusted scripts work in disposable Git repositories with actual installed discovery files.
The examiner retains assertions outside each task workspace and supplies no label file to the actor.
Independent checks call the real command, inspect exact output and refusal behavior, and verify owner and input bytes.

A correct helper with no production caller fails. A superficial finding repair fails.
The examiner also substitutes a wrong implementation and requires the submitted test to reject it.
An unrelated negative test or circular expectation cannot earn coverage credit.

Each run owns separate workspace and receipt directories. Commands run serially under the existing process supervisor.
Individual task commands have limits of 15 seconds and 64 kibibytes of output, with at most 64 commands per owner. The fixed consumer design-system Make suite has a separately approved 60-second limit. Each receipt records its actual limits.
The supervisor has an additional five-second cleanup allowance.

Success, failure, timeout, excessive output and handled cancellation clean owned processes and directories.
Unexpected owner loss leaves incomplete evidence and ownership markers.
`recoverStaleOwnership` refuses live owners, changed markers, foreign paths and still-running children before deleting verified stale directories.

Recovery is a contributor API used by the regression suite; there is no directory-scanning cleanup command.
Durable report files live outside temporary directories and survive cleanup.
The `reproducible` report section excludes changing paths, process numbers and elapsed times.

### Actual consumer rehearsal

`consumer.ts` runs in a separate `agentsfleet` worktree at the revision pinned in `consumer-checks.ts`.
It requires the branch `test/orly-013-final-main` and a clean working tree before making changes.
Install that worktree's design-system dependencies with `bun install --frozen-lockfile` in `ui/packages/design-system`.
Pack this source checkout with `npm pack`, then install the local archive in a separate temporary package directory.
Pass the resulting `node_modules/@agentsfleet/orly` directory to the rehearsal:

```bash
bun evals/judgments/comparison/consumer.ts /path/to/rehearsal-worktree /path/to/installed/package /path/to/new-report.json
```

The command updates only the isolated worktree with the packed version, runs the existing design-system Make target,
and mutates actual time-formatting source to omit seconds, bypass a helper, mishandle invalid input or leave a locale finding unresolved.
Each submitted weak check must pass; each hidden check must report the expected named failures; each restored implementation must pass.
An exit code without the complete named check results cannot establish defect detection.

The report binds the complete installed package inventory and original consumer source.
Owner instructions, hooks, verification commands, surfaces and existing tests retain their original bytes or values.
Every source mutation is restored; the isolated worktree retains only the corrected managed OpenAPI guide and the configuration version/hash update.
Failed suite attempts and cleanup failures remain in the report. Reports are never overwritten by a later run.
This exercise measures controlled behavior in real consumer code, not autonomous agent performance.

### Actual TypeSafe Jev measurement

`jev-run.ts` grades actual `jev-1.13.0` answers against the frozen expected answers.
It combines 176 corpus examples with twelve source-bound consumer examples.
Expected labels and example identities stay outside uploaded state.

Set `TYPESAFE_API_KEY` in the calling environment without printing its value.
PATH must contain actual Bun, Node and Gitleaks executables; home-dependent tool-manager shims cannot run in the scanner's minimal environment.
The scanner checks every upload before the first provider request.

Supply the restored consumer worktree as `<CONSUMER>`, its successful receipt as `<RECEIPT>`, and a new external directory as `<OUTPUT>`.

```bash
bun evals/judgments/comparison/jev-run.ts --live <CONSUMER> <RECEIPT> <OUTPUT>
```

Expected output: JSON naming `report.json`, `report.md`, `attempts: 188` and `requests: <varies>`.
The caller owns these private output files and removes them when no longer needed.
The command refuses existing output directories and output inside the authoring or consumer tree.

Requests run serially, with at most 256 requests, fifteen seconds each and no automatic retry.
Upload, state and response limits are 32, 24 and 64 kibibytes respectively.
Each request-start record is saved before upload; each answer or failure replaces its pending result.
A report-write failure prevents subsequent uploads. Earlier saved attempts survive interruption.

Use the original `report.json` as `<SAVED_REPORT>` and a fresh `<OUTPUT>` to replay.

```bash
bun evals/judgments/comparison/jev-run.ts --replay <CONSUMER> <RECEIPT> <OUTPUT> <SAVED_REPORT>
```

Expected output: JSON naming both reports, `attempts: 188` and `requests: 0`.
Replay refuses changed input identities, invalid answer shapes and reports above two mebibytes.

The [retained measurement](../../evals/judgments/comparison/receipts/jev-live.md) lists every request, grading match, disagreement and unavailable answer.
The raw JSON preserves native answers, confidence, usage and elapsed time. Strength below 0.8 grades as abstention.
Replay reproduced the same attempts and results with zero new requests.
These counts describe fixed examples; they do not establish autonomous agent improvement.

### Scoring and adoption

Native correctness and task health remain separate. Rule applicability has no defect-recall or false-concern score.
A yes/no abstention cannot distinguish ambiguity from absent context.
Empty denominators and missing measurements remain unavailable.

Invalid and unavailable responses retain their attempted-case denominators.
The conservative false-concern bound counts missing healthy replies against adoption.
All candidates receive retain decisions because independent model and paired-task evidence is unavailable.

The evaluator refuses adoption even if editable observations claim independent provenance.
Authorized model measurement and independently verified paired improvement are prerequisites to any future adoption path.
See the [evaluation plan](../../evals/release/evaluation-plan.md) for thresholds.

## Limits

Offline success proves examiner behavior. It does not measure model accuracy or improvement in an actual agent.
Only explicit `jev-run.ts --live` sends model requests. Native builds, remote workers and ordinary consumer upgrades are outside these commands.
Input separation does not isolate hostile code from the host filesystem; task scripts must remain trusted.

The installed `.orly/` layout and six runtime questions remain unchanged.
The 0.12 package proof and migration receipts remain historical evidence; this evaluation does not repeat that live consumer migration.

## Related pages

- [Judgment reference](../JUDGMENTS.md)
- [Evaluation plan](../../evals/release/evaluation-plan.md)
- [Installed ownership](installation.md)
- [Preserved comparison design](../../evals/release/receipts/Oct_06_12_57/parked-comparison-spec.md)
