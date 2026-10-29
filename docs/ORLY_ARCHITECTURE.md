# Orly architecture

Orly does two jobs. It renders one rules file, and it proves the boundary
before a Pull Request (PR) opens. Where it stores things changed after this
document was first written; "Why it's materialised" explains it.

## Topology

```text
core/operating-model.md   standards/**   skills/**   registry.json
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

On this machine one file is generated: the root `AGENTS.md`. Every agent home
here links to it, so a rule edit is one commit and reaches every session in
this checkout at once. That property is local to Kishore's own machine.

Every other repository gets its rules a different way. `orly init` materialises
the packs its own sources select into that repository: the rendered `AGENTS.md`,
the standards, the skills, the reviewer agent and the hooks. It writes
`.orly/orly.json` with the engine version, every file it wrote, and the
repository's own packs, commands and surfaces.

`orly update` re-materialises against the installed engine version, and
`orly doctor` reports drift between the lock and disk. A materialised
repository needs no checkout of this one to read its rules or run its gates.

## Why it's materialised

An earlier model (M01) refused per-repository copies. They had cost a
re-baseline commit per edit and a manifest that broke when the tool
changed. Drift went unseen: three of four consumers were stale.

M01 derived instead: one rendered `AGENTS.md`, symlinked into every agent
home, with gate scripts read live through `$ORLY_ROOT`. That needs this
checkout at a known path, which a fresh machine, a Continuous Integration (CI)
runner or a remote fleet container does not have.

`orly init` (M03) restored storage without the old failure. `orly update`
turns a rule change into one command per repository, and `orly doctor`
reports drift between the lock and the files on disk.

cache-kit.rs showed both failures in one repository. Its `.orly/` snapshot sat
frozen for four weeks with no update path. Its generated `AGENTS.md` named a
Rust crate `agentsfleet`, a product leak M03 closed with opt-in packs.

`orly verify --all` still renders each pack set twice and compares them. It
then compares the committed root `AGENTS.md` against a fresh render.

## Gates

`orly gate` runs three groups in order and stops at the first red one.

| Gate | Proves |
|---|---|
| `work` | repository configuration and the declared `conform` command over the staged change |
| `verify` | documentation checks and non-test `verify.*` commands; unfinished Sections may be pushed |
| `pr` | branch, clean tree, exact pushed revision, docs surface, and every declared `verify.*` command |

The `orly-build` and `orly-ship` skills carry the sequence. Full unit, integration,
and memory suites run at the PR boundary.

No stored verification cache or
assumption about a custom pre-push hook can remove them. Baselines name an
immutable comparison revision and are measured before the Pull Request.

Every criterion is mechanical: it reads an exit code or a file. Claims that
cannot be proven that way stay prose and are graded by the spec's rubric; they
never become fake criteria.

The gate reads no spec. A spec is reviewed while it is written, by an
Elephant-Goldfish Model (EGM) review, and the gate checks code and Git only.

The `docs.language` criterion rejects mechanical language findings in changed
Markdown and Markdown JSX (MDX) prose, including new pages and uncommitted edits.
It checks complete edited paragraphs while leaving unchanged history alone.

Installed `.orly/` snapshots are generated inputs; `doctor` checks their integrity.
Readability and factual accuracy remain review judgments under DOC-43.

Three behaviours worth knowing:

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

## Standards, skills and the reviewer

Rules live in `standards/`. Each standard is a page of rule blocks: an
identifier, one statement, and the fields Applies to, Checked by, Bad, Good and
Why. Packs select standards through `registry.json`, and install copies them to
`.orly/standards/`.

Steps live in three skills. `orly-spec` turns an idea into a reviewed spec,
`orly-build` opens the stream and builds it, and `orly-ship` reviews, closes,
gates and lands it. They call gstack and EGM where those already do the job.

`orly-standards-reviewer` judges a diff against the standards with no session
history. It reports only findings it can tie to a rule and a changed line.

The rendered `AGENTS.md` carries only what applies on every turn, plus an
index of the selected standards. A render test caps it at 16 KiB.

## Changing a standard

A rule change edits its standard and keeps the five fields. A new rule takes a
new identifier; a removed one leaves the catalogue fixture with its reason.
`bun test src/standards_catalogue.test.ts` proves every identifier has one home.

Run `make audit` before pushing. It renders the rules, typechecks and runs the
suite, including the always-on size cap and the Hard Safety text.

## Helper parity

orly's skills hand work to gstack and EGM, so every agent runtime needs both.
Their versions are the owner's, because both upgrade themselves.
`registry.json` names only where each comes from.

`orly doctor` checks every agent runtime present on the machine. A missing
gstack `VERSION` or EGM plugin prints its install command. A machine with no
agent runtime, such as a CI runner, skips the helper check.

Doctor does not compare the orly that wrote `.orly/orly.json` with the one
running, because one global orly serves repositories pinned to different versions.

## Codex cloud environment

A cloud task sees repository skills only, so the environment installs the rest.
Its install script installs orly and gitleaks. It clones gstack and runs
`./setup --host codex --no-browser`.

The same script adds EGM with `codex plugin marketplace add
google/elephant-goldfish-model` and `codex plugin add egm@egm`. It
sets `core.hooksPath`, and the start skill ends with `orly doctor`.

A cloud task pushes nothing. The skills run `orly gate work` and
`orly gate verify` themselves and stop before `orly gate pr`; CI runs the
heavy lanes on the Pull Request.
