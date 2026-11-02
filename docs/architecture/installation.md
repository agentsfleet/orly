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
| Configuration and recorded content digests | `.orly/orly.json` | Repository settings plus installer metadata |
| Generated operating model | `.orly/AGENTS.md` | orly |
| Standards and supporting documents | `.orly/standards/`, `.orly/docs/` | orly |
| Full skill instructions | `.orly/skills/<name>/SKILL.md` | orly |
| Reviewer agent | `.claude/agents/orly-standards-reviewer.md` | orly |
| Hook implementations | `.orly/hooks/` | orly |
| Agent discovery | `AGENTS.md`, `CLAUDE.md`, `opencode.json`, host skill discovery | Repository content plus thin managed entrypoints |
| Interrupted installation | `.orly/install-journal.json` and private staging | Installer; removed after successful completion |

## Why it exists

Installed rules must be distinguishable from repository-owned documentation and code. A recorded path alone does not authorize discarding a user's edit. Migration requires both ownership and matching bytes.

The orly source checkout remains an authoring repository: root `core/`, `standards/`, `skills/`, `agents/`, `docs/` and its generated root operating model are source files.
Consumer installation must never relocate or replace those authoritative sources.

## How it behaves

Installation validates every destination and its recorded content before replacing anything. Existing conflicting files refuse the ordinary update. Explicit force remains an ordinary update option; migration deletion never uses force as evidence of ownership.

The migration reads the previous `.oracle/orly.json` explicitly. Ordinary gates use the current path. Unknown files and unrecorded state under `.oracle/` remain untouched.

Obsolete managed copies require matching recorded digests before removal.
The new payload and discovery entrypoints must be committed, and configuration must record the new installation.

Each operation retains the digest from its original read or preflight. An owner save during staging refuses before writes begin. Recovery accepts only those states.

An edited destination or altered journal refuses recovery.
The installer uses same-filesystem atomic replacement for individual files; the journal covers interruption between files.

Repository hook implementations remain repository-owned. Fresh consumers use `.orly/hooks/`; existing executable owner hooks require explicit integration or `--no-hooks`, including Git’s default hook directory.

Generated hooks invoke the pinned published package through bunx.
They do not require a global orly installation or a project dependency.

An update replaces a hook an earlier version wrote only while its bytes still match. Under `.orly/hooks/` the recorded digest decides. Under `.githooks/` the bytes must equal what orly 0.10.6 to 0.10.14 wrote, and an older 0.10 hook stops the update.

Migration evaluations must cover fresh installation, populated upgrade, unchanged rerun, edited content, unowned destinations, escaping symlinks and each interruption boundary. Failure tests must assert preserved bytes and successful recovery, not only a returned error.

## Limits

Disposable migration checks do not prove an upgrade in a live consuming repository. Published-package checks on both supported operating systems remain release work.

## Related pages

- [Orly architecture](../ORLY_ARCHITECTURE.md)
