---
type: explanation
audience: contributor
verified: 2026-11-17
product_version: 0.60.0
executable: false
---

# Installed content and recoverable updates

## What it is

What `orly init` and `orly update` write into a consuming repository, and who owns each part.

| Content | Destination | Owner |
|---|---|---|
| Settings and the managed-path record | `.orly/orly.json` | the repository's settings; orly's version and `managed` list |
| Operating model | `.orly/AGENTS.md` | orly |
| Selected standards, and the docs they cite | `.orly/standards/`, `.orly/docs/` | orly |
| Full skill instructions | `.claude/skills/`, `.agents/skills/`, `.opencode/skills/` | orly |
| Reviewer agent | `.claude/agents/orly-standards-reviewer.md` | orly |
| Hooks, unless `--no-hooks` | `.orly/hooks/` | orly |
| Agent entrypoints | `AGENTS.md`, `CLAUDE.md`, `opencode.json` | the repository, plus one thin managed block |
| An interrupted install | `.orly/install-journal.json` | the installer, until the install is done |

## Why it exists

Installed rules must stay apart from the repository's own documentation and code, and a recorded path alone never licenses discarding someone's edit.
Git holds every committed version, so an update replaces only managed paths Git reports clean.
In the orly checkout itself, `core/`, `standards/`, `skills/`, `agents/` and `docs/` are sources that installation never replaces.

## How it behaves

Installation checks every destination before it replaces anything.
A path outside `managed`, or a managed file with uncommitted changes, refuses the update; `--force` replaces both.

Deleting an obsolete managed copy requires a tracked, clean file, including during journal recovery. Force never bypasses this check.
Ignored untracked files, hidden index flags and executable-mode edits refuse deletion, even when Git ignores mode changes.

Version 0.50.0 writes full skill bodies into each runtime folder, then removes obsolete `.orly/skills/` copies recorded in `managed`.
Unmanaged files stay, and only empty old directories are pruned. Runtime guidance retains references to the repository's root `AGENTS.md`.

A committed hand edit to a managed file is replaced and shows in the update's diff, and `orly doctor` does not report it.
Each file is replaced atomically, and the journal covers an interruption between files.
Recovery refuses an edited destination or an altered journal.

Existing executable hooks stay the repository's: integrate them, or install with `--no-hooks`.
Generated hooks run the pinned published package through `bunx`, so neither a global orly nor a project dependency is needed.

## Limits

Installation evaluations use disposable repositories, so they do not prove an upgrade of a live consuming repository.

## Related pages

- [Orly architecture](../ORLY_ARCHITECTURE.md)
