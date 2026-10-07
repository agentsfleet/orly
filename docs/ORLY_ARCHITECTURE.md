# Orly architecture

Orly does two jobs. It renders one rules file, and it proves the boundary
before a Pull Request (PR) opens. What it stores where is the one thing that
has changed shape since this document was first written — see "Why it's
materialised" below; the gates section after it is unaffected.

## Topology

```text
core/operating-model.md   packs/**   registry.json
                              │
                         bin/orly
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
   orly update                              orly gate
          │                                       │
   AGENTS.md (repo root)                  reads git + the tree,
          │                               runs the declared commands,
   ~/.claude/CLAUDE.md ─┐                 prints green or red
   ~/.codex/AGENTS.md  ─┼─ symlinks              │
   opencode, amp       ─┘                  exit 0 or 1
```

One generated artifact on this machine: the root `AGENTS.md`. Every agent home
here links to it, so a rule edit is one commit and reaches every session in
this checkout at once — that property is local to Kishore's own machine and
unaffected by anything below.

Every other repository gets its rules a different way: `orly init` materialises
the packs its own sources select — rendered `AGENTS.md`, the rule docs, the gate
scripts, the hooks that run them — into that repository, and writes
`.orly/orly.json` recording the engine version and every file it wrote,
alongside the repository's own packs, commands, and surfaces. `orly update` re-materialises against the currently installed engine
version; `orly doctor` reports drift between the lock and disk instead of
silently tolerating it. A materialised repository needs no checkout of this
one, on any machine, to read its own rules or run its own gates.

## Why it's materialised

An earlier model (M01) rejected storing per-repository copies: it had cost a
re-baseline commit on every edit, a SHA-256 manifest that invalidated whenever
the tool itself changed, and drift nobody caught — three of four consumer
repositories were stale anyway. The fix at the time was to derive instead of
store: one rendered `AGENTS.md`, symlinked into every agent home, with gate
scripts resolved live from this checkout via `$ORLY_ROOT`.

That traded the storage cost for a distribution cost undiscovered until a
second engineer tried to install the harness without this checkout present —
the symlink and `$ORLY_ROOT` both require a copy of the governance checkout at
a known absolute path, which is exactly what a fresh machine, a Continuous Integration
(CI) runner, or a remote fleet container does not have. `orly init` (M03)
restores storage, but not the failure mode that got it removed: `orly update`
turns a rule change into one command per repository instead of the manual
sync M01 rejected, and the lock makes staleness a reported condition —
`orly doctor` — instead of a silent one. cache-kit.rs is the evidence for both
failure modes in the same repository: its `.orly/` snapshot from the
pre-thin model sat frozen for four weeks with no update path, and its
generated `AGENTS.md` told a Rust crate its project name was `agentsfleet` —
a persona/product leak M03 also closes, by fencing both behind opt-in packs a
a repository without those sources never selects.

`orly verify --all` still re-renders each pack set twice and compares, then
compares the committed root `AGENTS.md` against a fresh render — that
determinism proof is unchanged by any of this.

## Gates

`orly gate` runs three groups in order and stops at the first red one.

| Gate | Proves |
|---|---|
| `work` | repository configuration and the declared `conform` command over the staged change |
| `verify` | documentation checks and non-test `verify.*` commands; unfinished Sections may be pushed |
| `pr` | exact pushed revision, branch/spec criteria, docs surface, and every declared `verify.*` command |

The authoritative sequence is `dispatch/lifecycle.md`. Full unit, integration,
and memory suites run at the PR boundary. No stored verification cache or
assumption about a custom pre-push hook can remove them. Baselines name an
immutable comparison revision and are measured before the Pull Request.

Every criterion is mechanical — it reads an exit code or a file. Claims that
cannot be proven that way stay prose and are graded by the spec's rubric; they
never become fake criteria.

Filename-scoped staged audits copy Git's index before selecting relevant paths.
An empty selection skips the repository checkout; matching paths still trigger
a private checkout, dependency reads and indexed-link checks. Each audit owns
its temporary files and cleanup. Audits with unconditional registry checks
retain a complete checkout. Separate relevant audits retain separate snapshots;
this optimization does not introduce a shared snapshot cache.

Four behaviours worth knowing:

- **No spec, no problem — but closing is not escaping.** Spec criteria skip
  with a printed reason, so an ad-hoc bug fix meets the quality gates without
  being told to write a spec. A spec moved to `done/` on the branch is still
  discovered through its `Branch:` header and gates the PR — CHORE(close)
  never skip-passes the criteria it exists to satisfy. Headers accept a plain
  token or an inline-code token. Active specs explicitly owned by other branches
  do not displace this branch's spec; active specs without a branch remain gated.
  Multiple specs may fold into one owner through `Folded-into`; two independent
  owners on the current branch remain an error.
- **A worktree is its repository.** `repositories.json` registers primary
  checkouts only; a linked worktree resolves through the set of checkouts git
  reports for the shared object store. Streams stay ephemeral and unregistered,
  and the declared commands still run in the worktree, never in the checkout
  that carries the registry entry.
- **Slow suites are conditional.** `verify.integration` and `verify.memory` run
  only when the branch diff carries code files.
- **The docs gate is diff-shaped.** A change under the repository's `surfaces.user`
  prefixes with no matching `surfaces.docs` change is red. Test files and the
  spec tree never count.

## Overrides

`orly override <criterion> --reason <REASON>` writes an empty commit carrying an
`Orly-Override: <criterion> (<reason>)` trailer. It is immutable once pushed,
visible in the PR, scoped to the branch by merge-base, and dead after the merge.
A red criterion with a matching trailer reports `overridden`, never green. A
malformed trailer is not an override; the gate stays red.

## Profiles

`.orly/orly.json` names any opt-in packs, the command surface, and optionally the diff
surfaces:

```json
{
  "schema_version": 1,
  "commands": { "conform": [["make", "harness-verify"]],
                "verify.unit": [["make", "test-unit-all"]] },
  "limits": { "verify.unit": { "timeout_ms": 1800000, "output_bytes": 67108864 } },
  "surfaces": { "user": ["src/http/", "cli/src/"],
                "docs": ["docs/"] }
}
```

Orly owns policy and invokes these commands. The repository owns what they do.
Setup requires `conform` and at least one named `verify.*` command.
Documentation repositories can use `verify.docs` for site validation and link
checks without declaring application test suites. `init` reports missing
commands; `doctor` rejects incomplete setup without running those commands.
The final tree check includes the spec, so its evidence must be committed.

`schemas/profile.schema.json` describes the repository file, including ownership records and disabled execution settings.
Both configuration readers refuse unknown settings, malformed types and unsupported execution modes before selecting commands.
Each invocation defaults to 30 minutes and 64 mebibytes of combined output; `limits` supplies per-command overrides.

The synchronous gate calls a Bun supervisor that reads both streams and stops the owned process group on either limit.
Limited commands return a failure with measured duration, byte count and a private receipt directory containing all captured bytes.
Normal commands remove their temporary files after the gate reads the complete output; limit receipts remain until the caller removes them.

## Usage telemetry

Orly keeps usage telemetry off until a person enables anonymous collection in
an interactive run. Hooks, Continuous Integration (CI), and other automated
runs never ask for consent. Off writes no event and makes no network request.

Anonymous events enter a bounded outbound spool under the agentsfleet state
root. After each append, Orly launches a detached sync attempt and lets the
command exit. The sync sends at most 100 events and exits without a fetch when
another attempt ran within five minutes. A successful response removes the
acknowledged prefix. Spool maintenance drops records older than seven days and
keeps the file at or below 10 MiB, so an unavailable destination cannot create
an unbounded local log. Orly runs no telemetry daemon.

PostHog owns product-event storage and funnel analysis. Orly sends no source,
path, repository, branch, argument, output, environment, hostname, username, or
raw error value. A future Insights Fleet may query PostHog with a private key;
the Fleet is an analysis consumer and never the public ingestion boundary.

## Evidence

`orly verify --all --write-evidence` records the source commit and every check
into `.orly/evidence.json` (git-ignored). Pre-push writes it when the pushed
range touches governance paths.

## TypeScript judgment experiment

The 0.11.0 experiment keeps the Bun command line and installed `.orly/`
layout. `orly judge` accompanies the deterministic gates with explicit advice.
Indy canceled the native rewrite and its Milestone 07 plans on Oct 04, 2026.

### Timing and authority

| Stage | Input | Bounded decision | Follow-up |
|---|---|---|---|
| PLAN | One spec requirement and its selected section | Are prerequisites explicit? Is the result observable? | Clarify setup or expected results before implementation |
| VERIFY | Required behavior, complete implementation and linked test | Does the assertion discriminate correct behavior from the supplied incorrect behavior? | Add an exact assertion before accepting test evidence |
| REVIEW | One failure path or one rule with selected code | Is the failure handled? Does this rule apply? | Inspect the named path or rule before disposing of the finding |
| DOCUMENT | One claim and selected implementation or measured output | Does supplied evidence support this claim? | Narrow the claim or gather the missing proof |
| Commit, push and PR | Existing deterministic facts and command results | Existing checks only | Model advice cannot change gate outcomes |

Questions and possible next actions live in a fixed catalog. Noul supplies a
probability for one property. Choice selects an assertion category. There is
no overall quality score, model-written command or automatic owner decision.
The agent invokes advice explicitly. Skill instructions explain optional timing;
hooks never upload source and never request a model answer.

### Evidence and upload

A stage-specific manifest names the required behavior and role-labeled source
references. Each reference selects a complete file, TypeScript function, named
test, or Markdown section. Missing, ambiguous, escaping and oversized inputs
are refused before inference. Evidence remains data even when it contains
instructions. Necessary unchanged context must be named by the manifest.

The shipped command uses the official TypeSafe System One API and pins
`jev-1.13.0`. Only `--refresh` permits a live request. The provider key comes
from `TYPESAFE_API_KEY` at runtime. A passing secret scan is required for the
entire selected state before any request. Source and credentials stay out of
reports and error messages. Limits cover source, state, request and response
bytes, item count, subprocess duration, fetch and body-reading duration.
Requests are sequential and receive no automatic retries.

Evidence selection uses Babel's JavaScript parser in a bounded Bun worker.
The installed command runs TypeScript source through Bun, with the same `bunx`
installation as 0.10.x. TypeScript 7 supplies development checks. The shipped
runtime has no native compiler dependency or compiler installation step.

### Replay and proof

Default mode reads a local exact-input replay. Identity binds project root,
model, catalog definitions, requirements, selectors and selected source bytes.
A changed input or invalid record is incomplete. Replay files include typed
answers and integrity metadata, without source text. Local replay is editable
by the repository owner and is advisory evidence, never approval or a gate.

A consumer experiment uses a new `agentsfleet` worktree and the locally packed,
unpublished 0.11.0 package. The controls compare the same incorrect locale code
with a weak assertion and an exact assertion, plus healthy exact behavior.
Repeated live observations report successes, misses, uncertainty, latency and
token usage. The trial proves bounded usefulness only; broader accuracy and
runtime superiority require different evidence.
