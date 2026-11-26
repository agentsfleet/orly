# M18_001: The PR gate proves more and reruns less

**Prototype:** v2.0.0
**Milestone:** M18
**Workstream:** 001
**Date:** Nov 26, 2026
**Status:** DONE
**Priority:** P2, harness tooling; every consumer's agent pays for reruns and missed couplings
**Categories:** CLI, DOCS, GOV, SKILL
**Batch:** B1, folded into the open 0.70.0 Pull Request #90 at the owner's request
**Depends on:** M17_001, scoped reuse and signed evidence
**Provenance:** agent-generated from the owner's approved list of improvements (Nov 26, 2026)
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md`, Gates and Verification evidence

## Overview

**Goal (testable):** A lane run on an uncommitted tree is reused once that tree is committed and pushed, a branch that changes one side of a coupled pair fails `orly gate pr`, and new tests without a fail-before proof are named.

**Problem:** In an `agentsfleet` session on Nov 26, 2026, a lane run before the commit counted for nothing, so `orly gate pr` repeated about 40 minutes of identical work. A wire change shipped without its protocol version file, caught only by a human. A new test passed for the wrong reason, because every row shared one timestamp. `orly-spec` asked for `egm-review`, which an agent cannot start, so the review never ran. Owner rulings lived in a scratch file and were copied into specs by hand.

**Solution summary:** Key reuse to tracked content instead of the revision; add `coupled` path groups to `.orly/orly.json`, checked at `gate pr`; add `orly proof`, which runs a test with its change reverted and keeps a signed record only when that test is reported failing; report new tests without one; add `orly note`; make `orly-spec` dispatch the EGM reviewers itself. The version stays 0.70.0.

**Design flow:**

```text
edit -> gate pr --accept-dirty -> lane runs -> evidence keyed to (base, tracked content)
commit + push -> gate pr --reuse-verification -> same content, clean, pushed -> reused

branch diff -> coupled {when, then} -> a `when` path changed, no `then` path -> red
branch diff -> added test declarations -> signed proof per test? -> reported list
revert code -> orly proof FILE --test NAME -- CMD -> CMD fails, a line reports NAME failing -> record
orly note "QUOTE" -> persona pack owner -> one active spec -> end of Discovery
orly-spec step 6 -> stages 5..9 -> egm:* reviewers, no context -> evidence file -> fixes
```

## PR Intent & comprehension handshake

- **PR title (eventual):** unchanged, Pull Request #90 carries 0.70.0
- **Intent:** An agent stops repeating verified work and stops shipping what a mechanical check could have caught.
- **Authoring handshake:** ASSUMPTIONS I'M MAKING: 1. "Hermetic" now also means the command reads no Git history, because evidence outlives the commit it ran beside. 2. `--accept-dirty` may publish evidence, because evidence binds content and only a clean pushed tree accepts it. 3. A coupling runs one way. 4. A missing proof is reported, never a failure. 5. The owner name comes from the persona pack, as data in `registry.json`.
- **Implementer handshake:** recorded in the Pull Request Session Notes.

## Implementing agent — read these first

1. `src/verification_identity.ts` — the identity that binds evidence.
2. `src/criteria.ts` — where `docs.updated` shows a branch-diff criterion.
3. `src/verification_store.ts` — signed private records beneath Git metadata.
4. `https://github.com/google/elephant-goldfish-model` — `skills/egm_review/SKILL.md` names the five review stages and allows direct dispatch: 5 zoom-out, 6 comprehension, 7 design with structural and style, 8 zoom-out again, 9 implementation readiness with codebase details and style.
5. `docs/v2/done/M17_001_P1_CLI_DOCS_GOV_SKILL_SCOPED_VERIFICATION_REUSE.md` — the invariants reuse keeps.

## Files Changed (blast radius)

| File | Action | Why |
|---|---|---|
| This spec, then its path under `done/` | CREATE, MOVE | Acceptance and evidence |
| `src/verification_identity.ts`, `src/verification.ts`, `src/verification_store.ts` | EDIT | Content-keyed binding, format 2 records, proof records |
| `src/config.ts`, `src/config_validation.ts`, `schemas/profile.schema.json` | EDIT | `coupled` path groups |
| `src/surfaces.ts`, `src/criteria.ts` | EDIT | `paths.coupled` and `tests.proven` |
| `src/proof.ts`, `src/note.ts` | CREATE | Test declarations, proofs, notes |
| `src/cli.ts`, `src/cli_help.ts` | EDIT | `orly proof`, `orly note`, help |
| `src/model.ts`, `registry.json` | EDIT | A persona pack names its owner |
| `src/*.test.ts` touched above, `src/coupled_paths.integration.test.ts`, `src/proof.integration.test.ts`, `src/note.integration.test.ts` | EDIT, CREATE | Proof of each Dimension |
| `SOUL.md`, `AGENTS.md`, the skills and `src/burst/*.ts` | EDIT | The owner's reduction review's one-form cuts |
| Both review records in the evidence folder | DELETE | The owner ruled review records out of the tree |
| `src/layout.test.ts` | EDIT | A retired evidence path cited anywhere outside history fails |
| `skills/orly-spec/SKILL.md`, `skills/orly-build/SKILL.md`, `skills/orly-ship/SKILL.md` | EDIT | EGM review, proof and note steps |
| `README.md`, `docs/ORLY_ARCHITECTURE.md`, `llms.txt`, `docs/CHANGELOG.md`, `standards/tests.md` | EDIT | Behaviour as shipped |

## Applicable Rules

- **`tests.md`** — TCF, TEST-MUTATE, TEST-NEG, TEST-ERROR, TEST-GITENV, TEST-LANE, TEST-CLAIM
- **`code.md`** — NDC, NRC, HLP, FLL, CODE-GITZ, PSR
- **`languages/typescript.md`** — TS-ORDER, TS-CAST, TS-NONNULL, TS-SCHEMA, TS-ERRSTYLE
- **`spec.md`** — SPEC-DEFER, SPEC-MODEL; **`changelog.md`** — CL-BUDGET, CL-USER; **`docs.md`** — DOC-02, DOC-03, DOC-05

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|---|---|---|
| `docs.language` | yes, skills and docs change | three sentences per paragraph, findings as table rows |
| `docs.updated` | yes, `src/` changes | README, architecture page, changelog |
| File & Function Length (file ≤350 lines, function ≤50, method ≤70) | yes, `src/cli.ts` nears 350 | parsing helpers shared by `proof` and `note` |

## Prior-Art / Reference Implementations

- **Reference:** `docsUpdated` in `src/criteria.ts` for a branch-diff criterion; `completeAttempt` in `src/verification_store.ts` for signed private records; `scanDocument` in `src/doc_rules.ts` for fence-aware heading scans. Practices: handlers return data and the CLI prints; human text stays the default output, as before.

## Sections (implementation slices)

### §1 — Reuse keyed to the tree

The binding holds the merge base and a digest of every tracked path's mode and working-tree bytes, or of `tracked_inputs`, never the revision. A run records evidence when no untracked file is present; reuse still needs a clean tree at the pushed revision. Records move to format 2 with `executed_uncommitted`, so a revision-keyed record runs fresh. **Implementation default:** `--accept-dirty` publishes evidence, because content binding makes the flag irrelevant to what evidence proves.

- **Dimension 1.1** — DONE — an uncommitted edit, its commit and its push bind one value → Test `an uncommitted tree binds the same evidence as the commit that records it` (integration): three identities, one binding, `current` only after the push
- **Dimension 1.2** — DONE — a run before the commit is reused after it → Test `a run on an uncommitted tree is reused once that tree is committed and pushed` (e2e): count stays 1, provenance names the parent revision `with uncommitted changes`
- **Dimension 1.3** — DONE — a different committed tree runs fresh → Test `an uncommitted run never vouches for a different committed tree` (e2e): count 2
- **Dimension 1.4** — DONE — an untracked file during the run blocks its reuse → Test `an untracked file present during a run keeps it from being reused` (e2e): count 2 after the file is removed and the tree committed
- **Dimension 1.5** — DONE — an unstaged deletion binds as the commit that deletes → Test `a tracked file deleted from the working tree binds as the commit that deletes it` (integration): `README.md` removed, then committed with `-a`, gives one binding

### §2 — Coupled paths

`coupled` is a list of `{when, then}` prefix groups, validated by `couplingsSchema` and the profile schema. `paths.coupled` in `gate pr` fails when a branch path matches a `when` prefix and none matches its `then`; the detail names both sides. **Implementation default:** one way and pr-only, like `docs.updated`, because a version may move alone and a Section in progress may push one side first.

- **Dimension 2.1** — DONE — the failing fixture → Test `a wire change without its version change fails and names both sides` (integration): `src/wire/frame.ts` changed alone gives `failed` and a detail naming `src/wire/` and `protocol/VERSION`
- **Dimension 2.2** — DONE — the passing fixture → Test `a wire change that moves its version passes` (integration): both changed gives `passed`, "1 coupled path group(s) changed together or not at all"
- **Dimension 2.3** — DONE — malformed groups are refused by both readers → Test `both configuration readers reject invalid coupled value []` and its siblings (unit): `[]`, a missing `then`, `../VERSION`, `.git/HEAD` and an unknown key each throw naming `coupled`

### §3 — The spec skill runs the EGM review

`skills/orly-spec/SKILL.md` step 6 dispatches `egm:egm-*` reviewers stage by stage with no conversation and resolves their findings as `egm-resolve` does. It writes no review file: accepted findings change the spec, and Discovery records rulings and declined findings with their reasons. `orly doctor` keeps its EGM check.

- **Dimension 3.1** — DONE — installed skills pass their own prose gate → Test `fresh installation passes its own prose gate and still checks skill edits` (integration): a fresh install's `docs.language` detail is "changed documentation prose is clean"
- **Dimension 3.2** — DONE — no tracked file outside history cites an evidence path → Test `no reference to a retired file` (unit): an evidence-folder path left in a skill makes the citing list non-empty

### §4 — Fail-before proofs

`orly proof` refuses a name the file does not declare, a passing command, a run without a verdict, and a failure whose output never reports the test failing. It stores the command, the failing line and the code diff from HEAD, signed, under the evidence directory. `tests.proven` reads new declarations from the lines the branch adds in TypeScript, JavaScript, Rust, Go and Python. **Implementation default:** a missing proof is reported and never fails the gate, because the record is private to one worktree and a verdict must not depend on private local history.

- **Dimension 4.1** — DONE — a reverted change that fails the test is recorded and counted → Test `a test that fails with its change reverted is recorded, and the pr gate counts it` (e2e): a flipped comparator gives exit 0, a record whose `mutation` holds the flipped line, and "1 of 2" unproven
- **Dimension 4.2** — DONE — a passing run is refused → Test `a test that passes with its change reverted is refused and records nothing` (e2e): exit 1, "the command passed", no record
- **Dimension 4.3** — DONE — another test's failure is refused → Test `a failure of another test is refused, even when the name says failed` (e2e): a verbose runner's `... ok` line for the named test gives exit 1, no record
- **Dimension 4.4** — DONE — an altered record proves nothing → Test `an altered proof record proves nothing` (integration): a changed `failing_line` gives "2 of 2" unproven
- **Dimension 4.5** — DONE — declarations per language → Test `new tests are read from added declarations in each supported language` (integration): seven declarations across `.go`, `.ts`, `.rs` and `.py`, and none from a body-only change or a non-test file

### §5 — Owner notes

`orly note` appends `- > Owner (<name>, <MMM DD, YYYY HH:MM>): "<quote>" — context: <text>` after the last line of Discovery, outside code fences. The name is the `owner` of a selected persona pack. **Implementation default:** the time is kept, because SPEC-DEFER's form carries `HH:MM`.

- **Dimension 5.1** — DONE — placement before the next section → Test `a note lands dated at the end of Discovery, before the next section` (e2e): the line follows the fenced block and precedes `## Appendix`
- **Dimension 5.2** — DONE — ambiguity is refused → Test `a --spec path chooses among several active specs, which are otherwise refused` (e2e): two active specs give "2 specs are active", and `--spec` writes only the named one
- **Dimension 5.3** — DONE — no owner is never invented → Test `a repository whose packs name no owner is refused, never given an invented name` (e2e): empty `packs` gives exit 1, "no selected pack names an owner", and no line written

### §6 — Documentation

Help, README, the architecture page, `llms.txt`, TEST-LANE and the 0.70.0 entry describe what shipped.

- **Dimension 6.1** — DONE — help names both new commands → Test `uses the concise public command surface` (e2e): `--help` contains both usage lines

## Interfaces

`orly proof <TEST_FILE> --test <NAME> -- <COMMAND>...` and `orly note "<QUOTE>" [--context "<TEXT>"] [--spec <PATH>]`; usage errors are `[ORLY-PROOF-001]` and `[ORLY-NOTE-001]`. `.orly/orly.json` gains `"coupled": [{"when": ["<PREFIX>"], "then": ["<PREFIX>"]}]`; `registry.json` packs may carry `owner`. Gate criteria `paths.coupled` and `tests.proven` join `gate pr`.

## Failure Modes

| Mode | Kind | Cause | Handling | Test |
|---|---|---|---|---|
| Untracked input | security | a file the commit lacks was readable | no binding; fresh run later | `an untracked file present during a run keeps it from being reused` |
| Revision-keyed record | failure | evidence from an earlier release | schema refuses format 1 | `signed provenance rejects old formats and retains original age` |
| Build error as proof | failure | mutation breaks compilation | refused | `a build error is refused, because no line reports the test failing` |
| Forged proof | security | hand-edited record | signature fails, test unproven | `an altered proof record proves nothing` |
| Missing Discovery | failure | spec lacks the section | refused, file unchanged | `a spec without a Discovery section is refused and left unchanged` |

## Invariants

1. A reused result comes only from a clean tree at the pushed revision — `before.current` in `src/verification.ts`.
2. A proof exists only for a run orly saw fail — `recordProof` writes after the verdict checks.

## Metrics & Observability

N/A: no product or operator signal changes; orly collects no telemetry.

## Acceptance Rubric (single scoring surface)

| # | Criterion | Verify | Expected | Priority | Graded |
|---|---|---|---|---|---|
| R1 | Tree-keyed reuse (§1) | `bun test src/verification.integration.test.ts src/verification_identity.integration.test.ts src/verification-scoped.integration.test.ts src/verification_store.integration.test.ts` | 0 fail | P0 | ✅ 61 pass, 0 fail (4 files) |
| R2 | Coupled paths (§2) | `bun test src/coupled_paths.integration.test.ts src/config_validation.test.ts` | 0 fail | P0 | ✅ 61 pass, 0 fail (2 files) |
| R3 | Proofs (§4) | `bun test src/proof.integration.test.ts` | 0 fail | P0 | ✅ 16 pass, 0 fail |
| R4 | Notes (§5) | `bun test src/note.integration.test.ts src/model.test.ts` | 0 fail | P1 | ✅ 22 pass, 0 fail |
| R5 | Skills pass their prose gate (§3) | `bun test src/doc_changes.integration.test.ts` | 0 fail | P1 | ✅ 19 pass, 0 fail |
| S1 | Conform | `make conform` | exit 0 | P0 | ✅ exit 0, `standards.catalogue`, `generated.root.current` and `packs.sources.current` green |
| S2 | Types | `bun run typecheck` | exit 0 | P0 | final `orly gate pr` run, Pull Request #90 Session notes 1 |
| S3 | Unit | `bun test src` | exit 0 | P0 | final `orly gate pr` run, Pull Request #90 Session notes 1 |
| S4 | No secrets | `gitleaks detect --redact --no-banner` | exit 0 | P0 | ✅ exit 0, 692 commits scanned, no leaks found |

## Dead Code Sweep

N/A: no files deleted. The `Completion` type folds into the shared signature helper.

## Out of Scope

- `egm-brainstorm` in `orly-spec` step 2 has the same refusal; it is listed for the owner in the reduction review.
- Detecting a changed test body under an unchanged declaration; not planned.

---

## Product Clarity (authoring record)

1. **Successful user moment** — `gate pr --reuse-verification` prints `reused run … with uncommitted changes` after the commit.
2. **Preserved user behaviour** — reuse stays opt-in per lane, live lanes stay fresh, gate verdicts ignore local records.
3. **Optimal-way check** — content keys replace revision keys inside the existing identity; no new store.
4. **Rebuild-vs-iterate** — iterate.
5. **What we build** — one binding change, two criteria, two commands, one skill step.
6. **What we do NOT build** — remote evidence, enforced proofs, glob couplings.
7. **Fit with existing features** — must not destabilize the full-source guard around each run.
8. **Surface order** — CLI and repository configuration together.
9. **Dashboard restraint** — none.
10. **Confused-user next step** — the criterion's detail names the command or override to run.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** five slices, one per approved item, plus documentation.
- **Alternatives considered:** a Git tree object for the binding needs blob writes, while the existing file digests already hold the content; failing on a missing proof would make a fresh clone red.
- **Patch-vs-refactor verdict:** a **patch** because each item extends an existing owner.

## Discovery (consult log)

- **Consults** — base `origin/main` at `bb741d6`; branch `feat/burst-tailnet` at `3979189`. The owner approved items 1, 3, 6, 7 and 8 and named this Pull Request and version.
- **Model reviews** — none of the spec: the owner approved the items. Claude Opus 5.5 (`claude-opus-5-5`) ran three fresh-context reviews. The standards review found 13: 12 fixed, and CL-BUDGET stands on the owner's ruling below. The rule-text reduction review found 30, with 5 applied and 25 proposed. The code reduction review found 22, with 9 applied and 13 proposed. The owner ruled review records out of the tree, so the proposals went to him in the session report and their file was deleted.
- **Proofs** — `orly proof` recorded a fail-before proof for each of the 33 new test declarations, run by an unmutated copy of the engine. Its first run found three defects, fixed in `fix(proof)`: a mutated `src/proof.ts` also mutated the recording tool, a multi-line `test.each` table went unread, and bun prints no passing lines off a terminal, which made one test vacuous.
- **CL-BUDGET** — the 0.70.0 entry carries ten bullets, over the five-bullet budget, because the owner kept both changes in one version; his ruling is quoted below.
- **Open blockers** — none.
- **Deferrals and transfers** — none.
- > Owner (Indy, Nov 26, 2026 16:21): "Yes i agree on 1, 3, 6 - have the skill do egm-review, 7, 8 and push it in the existing PR with 0.70 in orly." — context: approves the five improvements this spec builds, in Pull Request #90 at 0.70.0
- > Owner (Indy, Nov 26, 2026 16:22): "In orly i recommend you to check the code files in the PR and other to see if we could reduce and make the skill to be more deterministic including the AGENTS.md and others" — context: the reduction review; only meaning-preserving cuts apply without sign-off, and the rest go to him as proposals
- > Owner (Indy, Nov 26, 2026 16:54): "Dont keep adding more documents so i prefer you delete docs/v2/evidence/* in orly and ensure you suggest review and clean up the docs to be deterministic the md files in orly" — context: both review records deleted; orly-spec writes no review file; the Markdown cleanup plan went to him as a proposal
- > Owner (Indy, Nov 26, 2026 16:54): "1. keep it at 0.70.0" — context: CL-BUDGET: both changes stay in the one 0.70.0 entry, past the five-bullet budget
