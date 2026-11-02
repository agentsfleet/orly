---
type: explanation
audience: contributor
verified: 2026-11-02
product_version: 0.28.0
executable: false
---

# Installed content and recoverable updates

## What it is

This page describes what orly 0.28.0 installs into a consuming repository, and how an update replaces it. Installation evaluations use disposable repositories.

| Content | Consumer destination | Owner |
|---|---|---|
| Configuration and managed paths | `.orly/orly.json` | Repository settings plus installer metadata |
| Generated operating model | `.orly/AGENTS.md` | orly |
| Standards and supporting documents | `.orly/standards/`, `.orly/docs/` | orly |
| Full skill instructions | `.orly/skills/<name>/SKILL.md` | orly |
| Reviewer agent | `.claude/agents/orly-standards-reviewer.md` | orly |
| Hook implementations | `.orly/hooks/` | orly |
| Agent discovery | `AGENTS.md`, `CLAUDE.md`, `opencode.json`, host skill discovery | Repository content plus thin managed entrypoints |
| Interrupted installation | `.orly/install-journal.json` and private staging | Installer; removed after successful completion |

## Why it exists

Installed rules must be distinguishable from repository-owned documentation and code. A recorded path alone does not authorize discarding a user's edit; git holds every committed version, so an update may replace only a managed path git reports as clean.

The orly source checkout remains an authoring repository: root `core/`, `standards/`, `skills/`, `agents/`, `docs/` and its generated root operating model are source files.
Consumer installation must never relocate or replace those authoritative sources.

## How it behaves

Installation validates every destination before replacing anything. A file outside `managed`, or a managed file with uncommitted changes, refuses the ordinary update. Explicit force replaces both; deleting an obsolete managed copy never uses force, and requires the copy to be clean in git.

A committed hand edit to a managed file is replaced and shows in the update's diff. `orly doctor` does not detect it.

Each operation retains the content hash from its original read or preflight. An owner save during staging refuses before writes begin. Recovery accepts only those states.

An edited destination or altered journal refuses recovery.
The installer uses same-filesystem atomic replacement for individual files; the journal covers interruption between files.

Repository hook implementations remain repository-owned. Fresh consumers use `.orly/hooks/`; existing executable owner hooks require explicit integration or `--no-hooks`, including Git’s default hook directory.

Generated hooks invoke the pinned published package through bunx.
They do not require a global orly installation or a project dependency.

Migration evaluations must cover fresh installation, populated upgrade, unchanged rerun, uncommitted edits, unowned destinations, escaping symlinks and each interruption boundary. Failure tests must assert preserved bytes and successful recovery, not only a returned error.

## Limits

Disposable migration checks do not prove an upgrade in a live consuming repository. Published-package checks on both supported operating systems remain release work.

## Related pages

- [Orly architecture](../ORLY_ARCHITECTURE.md)
