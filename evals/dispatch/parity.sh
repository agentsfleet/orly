#!/usr/bin/env bash
# evals/dispatch/parity.sh — cross-runtime ERR_* parity, in isolation.
#
# The check this pins had globbed one repository's directory names
# (`agentsfleet/src/`, `ui/packages/*/src/`). When one of those paths stopped
# existing the glob matched zero files and the check passed by scanning nothing,
# for as long as it took a human to notice. Runtime-derived globs (`*.zig`,
# `*.ts`) cannot go stale that way, and these cases hold that property down:
# every case asserts what the check FOUND, never only that it exited 0. A
# vacuous pass and a real pass are the same exit code, which is the whole
# reason this file exists.
set -uo pipefail

# A hook exports GIT_DIR/GIT_INDEX_FILE at the repository it fired in; a
# sandbox must be its own repository or `git add` lands in the caller's index.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_PREFIX \
      GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UFS="$ROOT/audits/ufs.sh"

pass=0; fail=0
# case <name> <expect-substring> -- then a heredoc-fed layout on stdin as
# "path<TAB>content" rows. Asserts the substring appears in the audit output.
run_case() {
  local name="$1" expect="$2" layout="$3" sb out
  sb="$(mktemp -d)"
  git -C "$sb" init -q
  git -C "$sb" config user.email evals@local
  git -C "$sb" config user.name evals
  while IFS=$'\t' read -r path content; do
    [ -z "$path" ] && continue
    mkdir -p "$sb/$(dirname "$path")"
    printf '%s\n' "$content" > "$sb/$path"
  done <<<"$layout"
  git -C "$sb" add -A >/dev/null 2>&1
  out="$( cd "$sb" && bash "$UFS" --all 2>&1 )"
  rm -rf "$sb"
  if printf '%s' "$out" | grep -qF "$expect"; then
    printf '  PASS  %s\n' "$name"; pass=$((pass + 1))
  else
    printf '  FAIL  %s\n        expected to find: %s\n        got: %s\n' \
      "$name" "$expect" "$(printf '%s' "$out" | tr '\n' '|')"
    fail=$((fail + 1))
  fi
}

ZIG_OK=$'src/errors.zig\tpub const ERR_UNAUTHORIZED = "unauthorized";'

printf '\nparity evals — cross-runtime ERR_* scope\n\n'

# The bug itself: a client code outside the two directory names the old globs
# knew. `cli/src/` is where agentsfleet actually keeps them.
run_case "orphan outside the old hardcoded globs is caught" \
  "cross-runtime-orphan ERR_NEVER_MIRRORED absent-in-zig" \
  "$ZIG_OK
cli/src/drift.ts	export const ERR_NEVER_MIRRORED = \"drift\";"

# A mirrored code is not an orphan — proves the check compares rather than
# reporting every client code it can see.
run_case "code present in Zig is not reported" \
  "no violations" \
  "$ZIG_OK
cli/src/auth.ts	export const ERR_UNAUTHORIZED = \"unauthorized\";"

# Directory-shaped test exclusion. An infix-only `.test.` filter walked past
# this path and would have graded two fixtures as production orphans.
run_case "codes in a fixtures/ tree are excluded" \
  "no violations" \
  "$ZIG_OK
cli/test/acceptance/fixtures/negatives.ts	export const ERR_FIXTURE_ONLY = \"fixture\";"

# The safety property. Fixing the globs without this turns every error code in
# a repository that ships no Zig into an orphan on the next `orly update`.
run_case "no Zig means skipped with a reason, not a vacuous pass" \
  "cross-runtime parity skipped" \
  "cli/src/codes.ts	export const ERR_TS_ONLY = \"ts-only\";"

# The runtime that DID work before still works — no regression in the half
# whose glob happened to resolve.
run_case "ui/ orphan still caught after the rewrite" \
  "cross-runtime-orphan ERR_UI_ONLY absent-in-zig" \
  "$ZIG_OK
ui/packages/app/src/codes.ts	export const ERR_UI_ONLY = \"ui-only\";"

# ── The Rust registry as oracle ──────────────────────────────────────────────
# A Rust daemon declares codes as strings through `ErrorCode::declare("…")`, and
# a client's contract is that string, not a constant's spelling. These cases
# pin that the comparison is on the string, and that a Zig mirror beside the
# registry (a runner's own subset) neither excuses nor condemns a client code.
RUST_OK=$'rustd/crates/core/src/error_code/registry.rs\tpub fn declare_all() { ErrorCode::declare("UZ-AUTH-001"); }'

run_case "a client string the Rust registry never declared is an orphan" \
  "cross-runtime-orphan ERR_DRIFT (UZ-AUTH-999) absent-in-daemon" \
  "$RUST_OK
cli/src/drift.ts	export const ERR_DRIFT = \"UZ-AUTH-999\";"

run_case "a client string the Rust registry declares is not reported" \
  "no violations" \
  "$RUST_OK
cli/src/auth.ts	export const ERR_UNAUTHORIZED = \"UZ-AUTH-001\";"

# Zig is present but is not the oracle: the constant NAME is unknown to Zig,
# the STRING is declared by Rust, and the string is what decides.
run_case "Rust registry outranks a Zig mirror — a name Zig lacks is fine when the string is declared" \
  "no violations" \
  "$RUST_OK
$ZIG_OK
cli/src/auth.ts	export const ERR_RUST_ONLY = \"UZ-AUTH-001\";"

# And the other direction: a name Zig HAS does not excuse a string the
# registry never declared.
run_case "Rust registry outranks a Zig mirror — a name Zig has does not excuse an undeclared string" \
  "cross-runtime-orphan ERR_UNAUTHORIZED (unauthorized) absent-in-daemon" \
  "$RUST_OK
$ZIG_OK
cli/src/auth.ts	export const ERR_UNAUTHORIZED = \"unauthorized\";"

# Registry declarations inside a tests/ tree are fixtures, not the oracle.
run_case "a registry declaration under tests/ does not make Rust the oracle" \
  "cross-runtime parity skipped" \
  "rustd/crates/core/tests/fixture.rs	fn f() { ErrorCode::declare(\"UZ-TEST-001\"); }
cli/src/codes.ts	export const ERR_TS_ONLY = \"ts-only\";"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
