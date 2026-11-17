# Orly architecture

Orly does two jobs. It materialises one repository's rules from shared sources, and it proves the boundary before a Pull Request (PR) opens.

## How rules reach a repository

```text
core/operating-model.md   standards/**   skills/**   agents/**   registry.json
                                   │
                    orly init / orly update  (packs the repository selects)
                                   │
   .orly/AGENTS.md   .orly/standards/   .orly/skills/   host skill copies   reviewer agent
                                   │
                  .orly/orly.json records the version and every managed path
```

`orly init` writes the selected packs into the repository and records them in `.orly/orly.json`.
`orly update` re-materialises at the installed engine version, and `orly doctor` reports drift between the record and the files.
A repository needs no orly checkout to read its rules or run its gates; [installed content](architecture/installation.md) lists what is managed.

Copies won over a shared live checkout because a fresh machine, a Continuous Integration (CI) runner or a cloud task has no such checkout.
In an orly checkout, `orly verify` validates the standards catalogue and compares the root `AGENTS.md` and every pack copy with its source.

## Gates

`orly gate` runs three groups in order and stops at the first red one.

| Gate | Proves |
|---|---|
| `work` | repository configuration and the declared `conform` command |
| `verify` | documentation checks and the non-test `verify.*` commands |
| `pr` | branch, clean tree, exact pushed revision, documentation, and every declared `verify.*` command |

Every criterion reads an exit code or a file. Prerequisite failures block commands, and blocked or unrun groups never count as passes.

- **Slow lanes are conditional.** `verify.integration` and `verify.memory` run only when the branch diff carries code files.
- **The docs gate follows the diff.** A change under `surfaces.user` with no change under `surfaces.docs` is red; tests and specs never count.
- **`docs.language`** rejects mechanical language findings in changed Markdown and MDX paragraphs, and template slots left in a changed spec.
- **A worktree is its repository.** Commands run in the worktree, which resolves to its primary checkout through Git's shared object store.

`burst.*` lanes rent machines by the hour, so no gate runs them; `orly burst` runs them on request ([Burst lanes](BURST.md)).

## Overrides

`orly override <criterion> --reason <REASON>` writes an empty commit carrying an `Orly-Override: <criterion> (<reason>)` trailer.
It is visible in the PR, scoped to the branch by merge base, and dead after the merge.
A matching trailer turns a failed criterion into `overridden`; blocked or unrun work cannot be waived, and a malformed trailer stays red.

## Profiles

`.orly/orly.json` holds the repository's packs, commands, limits and diff surfaces:

```json
{
  "schema_version": 1,
  "commands": { "conform": [["make", "conform"]], "verify.unit": [["make", "test-unit-all"]] },
  "limits": { "verify.unit": { "timeout_ms": 1800000, "output_bytes": 67108864 } },
  "surfaces": { "user": ["src/", "cli/src/"], "docs": ["docs/"] }
}
```

At least one `verify.*` command is required; documentation repositories can declare only `verify.docs`.
Orly decides when commands run, and the repository owns what they do. Unknown settings and malformed types are refused before any command runs.

Each invocation defaults to 30 minutes and 64 mebibytes of combined output.
A command over either limit is stopped with its process group, and fails with its duration, byte count and a private receipt of everything captured.
`schemas/profile.schema.json` describes the file.

## Verification evidence

Checks run fresh. `gate pr --reuse-verification` may reuse a lane's last pass only when `reuse.<verify-lane>` declares it hermetic, with a maximum age, toolchain probes and any extra inputs.
Live integration and memory lanes always run fresh.

Evidence binds the source bytes, revision and base, commands and limits, configuration, environment, engine and toolchain, never raw environment values.
Missing, dirty, unpushed or symlinked inputs disable reuse, and inputs must not change while a check runs.

One attempt per worktree holds a private lock, and only the latest attempt can be reused. A failed or unfinished attempt never falls back to an older pass.

An interrupted attempt keeps its lock: after the old workload has stopped, delete the private evidence directory beneath Git metadata and run fresh.
Records protect local integrity only, not against another process running as the same user.

## Standards, skills and the reviewer

Rules live in `standards/`, one page per standard, and packs select standards through `registry.json`.
Each rule has an identifier, a statement, and the fields Applies to, Checked by, Bad, Good and Why.

Three skills carry the steps: `orly-spec`, `orly-build` and `orly-ship`, plus `orly-burst` for paid lanes.
`orly-standards-reviewer` judges a diff against the standards with no session history, and reports only findings tied to a rule and a changed line.
The rendered `AGENTS.md` carries only what applies on every turn, and a render test caps it at 16 KiB.

## Changing orly

A rule change edits its standard; a new rule takes a new identifier, and `orly verify` proves each identifier has one home.
Every commit runs `orly gate work`, which runs `orly verify`, and a push runs gitleaks.
CI runs `make audit`, `make install-evals` and the unit suite with coverage on every pull request.

`orly doctor` checks that every agent runtime on the machine has gstack and the Elephant-Goldfish Model (EGM), and prints the install command for a missing one.
A machine with no agent runtime, such as a CI runner, skips that check. Orly collects no usage telemetry.
