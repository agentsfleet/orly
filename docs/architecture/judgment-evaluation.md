---
type: explanation
audience: contributor
verified: 2026-10-06
product_version: 0.11.0
executable: false
---

# Independent judgment evaluation

## What it is

Read this page for the planned M10 evaluation and its proof boundaries.
Implementation and behavior checks remain pending in the [M10 specification](../v2/active/M10_001_P1_CLI_DOCS_JUDGMENT_EVALUATION_012.md).
The proposed contributor evaluation compares the six shipped questions with five proposed questions.

The runtime catalog remains the comparison authority.
The evaluation cannot register a runtime question or clear a gate.

## Why it exists

An evaluator needs expectations that are independent of the answers it grades.
A missing reply must remain missing evidence.
Task assertions must examine behavior even when submitted tests pass.

## How it behaves

The catalog records the exact runtime question definitions and model.
Cases carry evidence and a defect-family origin.
Development and held-out sets cannot share an origin.

Labels live separately from actor evidence.
Each label names its expected native answer, rationale, independent source/revision, author, reviewer or oracle, and adjudication state.
Each question/class/split group requires two independently resolved labels before corpus validation passes.

Pending or disputed labels cannot fill that minimum; a self-declared independence flag proves nothing.
Missing model responses leave accuracy unavailable even when the independently grounded corpus is complete.

The validator rejects changed sources, overlapping origins, duplicate cases and missing evidence roles.
Scoring reports separate numerators and denominators for each property.
An empty denominator produces an unavailable result.

The specification's Interfaces table fixes native-answer mappings before observations.
Rule applicability is scored against applicability, separately from task health.
A yes/no abstention cannot distinguish ambiguity from missing context.

Invalid and unavailable responses remain attempted cases; adoption uses the conservative false-concern bound.

Task controls run in temporary repositories with installed discovery files.
The evaluator keeps hidden assertions outside each task workspace.
It records command results and checks the final behavior against independent expected values.

An outer evaluation owner owns temporary repositories, command receipts and child processes.
An evaluator-local adapter uses the existing command supervisor; production runner files remain unchanged.
The owner records bounded structured results before removing both temporary directories and reaping owned children.

Success, nonzero exit, timeout, excessive output and handled interruption must leave unrelated sentinel files untouched.
Abrupt owner loss leaves incomplete evidence; restart cleans only resources whose stale ownership it verifies.
Durable reports remain outside temporary directories and contain no hidden expectations.

Process deadlines and output limits apply to every task command.

The report distinguishes completed, failed and truthfully blocked tasks.
A blocked task receives no completion credit.
Scripted controls prove evaluator behavior; autonomous commander performance remains unmeasured.

Candidate adoption requires independently labeled observations with matching inputs and a paired task improvement.
Synthetic replies and editable replay files cannot establish that evidence.
The offline release retains all six runtime questions when observations are unavailable.

Hook controls use real generated hooks and real `bunx` with a disposable loopback registry and isolated cache.
Package and resolved-source digests must match the packed candidate, including the pinned dependency closure.
A failing-check proof requires its check-specific side effect; package-resolution failure receives no such credit.

Same-version packages with different bytes must fail identity checks.
The evaluation owner removes the registry and cache; public-registry fallback is forbidden.

## Limits

Input separation does not isolate a hostile process from the host filesystem.
The local task controls run trusted fixture code only.
No live model call, remote worker or consuming-repository deployment runs here.

The 0.11 installed layout remains authoritative.
Managed rules, audits, standards and skills stay under `.orly/`; repository-owned documentation keeps its own paths.

Indy excluded the dedicated 0.11-to-0.12 upgrade proof in the specification's Discovery record.
The separate `agentsfleet` 0.10.x-to-0.12 migration remains unverified by this evaluation.
Existing installation, reference-resolution, ownership and recovery checks remain required.

## Related pages

- [Judgment reference](../JUDGMENTS.md)
- [Evaluation design](../../evals/release/evaluation-plan.md)
- [Installed ownership](installation.md)
