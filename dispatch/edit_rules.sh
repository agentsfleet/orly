#!/usr/bin/env bash
# dispatch/edit_rules.sh — the rule-corpus dispatch, DETERMINISTIC façade.
#
# Pairs with dispatch/edit_rules.md (the LATENT façade — prose the agent reads).
#
# This leaf exists for the reason RULE UFS exists in the Rust pack: a façade
# that declares its scope in PROSE declares it to nobody. edit_rules.md has
# always named its trigger surface — core/**, packs/**, schemas/**, src/**,
# registry.json, governance hooks (edit_rules.md:15, and the same row in
# docs/EXECUTE_DOC_READS.md) — but audits/doc-read.sh derives what fires from
# `dispatch_init` globs in a leaf, and this façade had no leaf. So every
# governance edit reported "nothing staged triggers a façade" and the DOC READ
# GATE could not fire on the one surface whose edits change the rules
# themselves. The globs below ARE that scope, now in a form a gate can read.
#
#   dispatch/edit_rules.sh <file> [...]   # explicit targets (EXECUTE)
#   dispatch/edit_rules.sh --staged       # staged corpus files (CONFORM, pre-commit)
#
# Layering:  AGENTS.md → edit_rules.md (latent) → edit_rules.sh (this) → audits/*.sh
# Signals:   🟢 pass · 🔴 fail (blocks) · 🤔 DECIDE (judgment; blocks the TURN, not the script)
# Exit:      0 = mechanical gates pass · 1 = ≥1 failed · 2 = usage error.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Scope mirrors docs/EXECUTE_DOC_READS.md's governance row and edit_rules.md:15.
# Kept in one order with them: a glob here that the row does not name is a leaf
# reading more than the façade declares, which is the same drift inverted.
# ONE LINE, deliberately: ledger_facade_globs reads `head -1` of the
# dispatch_init line, so a backslash continuation declares an EMPTY scope and
# the façade silently stops firing — the exact failure this leaf exists to end.
dispatch_init "RULES" 'core/*' 'packs/*' 'schemas/*' 'src/*' 'registry.json' 'dispatch/*' 'audits/*' '.githooks/*' 'AGENTS.md' 'AGENTS.orly.md'
dispatch_resolve_files "$@"
dispatch_header

# ── deterministic gates ────────────────────────────────────────────
# Rule prose carries no milestone ids — the packs say so themselves ("never a
# memory file, never a milestone cite"), and until now nothing read the corpus
# for them. Same leaf write_any already wires, so no new code enters the gloss.
dispatch_run_helper "MSID" "msid-ui.sh" "--staged"

dispatch_verdict
