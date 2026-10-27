#!/usr/bin/env bash
# doc-read.sh — turn the 📖 DOC READ proof-line into a set comparison.
#
#   audits/doc-read.sh log <path> [section]   record that a file was read
#   audits/doc-read.sh check                  staged source vs recorded reads
#
# The DOC READ GATE asks an agent to read the façade its edit triggers, and
# then asks the same agent whether it did. That is a claim about itself
# compared against nothing. `log` records the read and `check` compares the
# record against the façades the staged files trigger.
#
# `log` is still an assertion, and a loop can make nine of them in one second.
# That happened: an agent ran `log` over its whole trigger list before opening
# most of the pages, `check` reported green, and two rule violations reached the
# diff from a section it had skipped. Two things answer it, and neither can
# block, because neither is provable:
#
#   - The optional `section` argument records WHAT the read applied — "§Error
#     discipline: composed with #[from]". A loop cannot produce that line; only
#     reading can. `check` reports how many triggered façades carry one.
#   - Rows for different façades sharing one timestamp are reported as a bulk
#     assertion. A read hook fires per read and spreads across seconds; a
#     scripted loop lands them together. An agent that genuinely read three
#     short pages inside one second is possible too, which is exactly why this
#     is a number in the output and never a red.
#
# Partial mechanisation stated honestly beats a red that means nothing — the
# same argument the missing-record branch below already makes.
#
# NOTHING HERE MAY DEPEND ON AN AGENT RUNTIME. `log` is a shell command any
# agent can run; a runtime that also has a read hook (Claude Code today) can
# call it automatically, and a runtime that removes that feature tomorrow
# changes nothing — the agent runs the command, the record is identical, the
# gate behaves the same. Vendor-shaped configuration stays out of this file and
# out of .githooks/, and an eval fails the build if it appears
# (evals/ledger/run.sh, ledger_doc_read_runtime_neutral).
#
# The record lives in the git directory, never in the tree: it is evidence
# about one working copy, not shared history. When it is absent — an agent
# runtime with no hook support — `check` warns and exits 0. Partial
# mechanization stated honestly beats a red that means nothing.
#
# Exit: 0 clean or unenforceable · 1 unread trigger (check) or a read that was
# not recorded (log) · 2 usage error, missing Bun, or an unreadable commit index.
set -uo pipefail

# A hook exports GIT_DIR/GIT_INDEX_FILE at the repository it fired in. This
# script IS a hook target, so the scope dies before the first git call.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_PREFIX \
      GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# audit_commit_index: the commit's own index, shared with the staged scanners.
source "$HERE/scope.sh"
# shellcheck source=audits/rule-ledger-lib.sh
source "$HERE/rule-ledger-lib.sh"

MODE_LOG="log"
MODE_CHECK="check"
LOG_RELATIVE_PATH="orly/doc-reads.jsonl"
USAGE="usage: $0 log <path> [section] | $0 check"

# How many façades recorded in one second read as a loop rather than as reading.
# Two is a plausible pair of short pages; three in the same second is a list
# being walked.
BULK_ASSERTION_THRESHOLD=3

if [[ -t 1 ]]; then G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; X=$'\033[0m'
else G=''; R=''; Y=''; X=''; fi

# Where the record lives for this working copy. Fails outside a repository:
# `log` then refuses, and `check` warns that nothing can be enforced.
read_log_path() {
  local git_dir
  git_dir="$(git -C "$LEDGER_ROOT" rev-parse --absolute-git-dir 2>/dev/null)" || return 1
  printf '%s/%s' "$git_dir" "$LOG_RELATIVE_PATH"
}

# Repo-relative form of a path, or nothing when it sits outside the tree — an
# agent reading its own notes elsewhere on disk is not a doc read.
repo_relative() {
  local path="$1" root resolved
  # /var and /private/var name the same file on macOS. git reports the
  # physical root, but ORLY_ROOT may carry either spelling, so both sides of
  # the comparison are resolved to their physical form.
  root="$(cd "$LEDGER_ROOT" 2>/dev/null && pwd -P)" || return 1
  if [ "${path#/}" = "$path" ]; then
    # A relative path names a file from where the caller stands. When that
    # reading lands outside the tree, the caller stands elsewhere and named a
    # root-relative path, so the root-relative reading is the fallback.
    if [ -e "$path" ] && resolved="$(physical_path "$PWD/$path")" && [ "${resolved#"$root"/}" != "$resolved" ]; then
      printf '%s' "${resolved#"$root"/}"
      return 0
    fi
    [ -e "$LEDGER_ROOT/$path" ] || return 1
    resolved="$(physical_path "$LEDGER_ROOT/$path")" || return 1
  else
    resolved="$(physical_path "$path")" || return 1
  fi
  case "$resolved" in
    "$root"/*) printf '%s' "${resolved#"$root"/}" ;;
    *) return 1 ;;
  esac
}

# An existing path with its directory resolved physically, or failure when the
# directory does not exist.
physical_path() {
  local directory
  directory="$(cd "$(dirname "$1")" 2>/dev/null && pwd -P)" || return 1
  printf '%s/%s' "$directory" "$(basename "$1")"
}

# One JSON Lines row per call, appended. Append-only with a single write per
# invocation is why two agents in two sessions cannot corrupt each other: the
# order rows land in does not change which paths the set contains.
run_log() {
  local path="$1" section="${2:-}" relative log blob
  # Outside the tree is not a doc read; say so rather than exit as if recorded.
  relative="$(repo_relative "$path")" || { printf 'doc-read: not recorded — %s is outside %s\n' "$path" "$LEDGER_ROOT" >&2; return 0; }
  [ -n "$relative" ] || return 0
  log="$(read_log_path)" || { printf 'doc-read: not recorded — no git directory for %s\n' "$LEDGER_ROOT" >&2; return 1; }
  mkdir -p "$(dirname "$log")" 2>/dev/null || { printf 'doc-read: not recorded — cannot create %s\n' "$(dirname "$log")" >&2; return 1; }
  blob="$(content_hash "$relative")"
  # A hash we could not compute proves nothing was read at a known version.
  # Recording it would let two failures compare equal and validate a read of a
  # file that is no longer there.
  [ -n "$blob" ] || { printf 'doc-read: not recorded — cannot hash %s\n' "$relative" >&2; return 1; }
  # The section rides the SAME row rather than a second file: a citation that
  # could be written without a read beside it would be a third assertion to
  # reconcile, and the pair is what carries meaning.
  bun "$HERE/doc-reads.ts" log "$(date +%s)" "$relative" "$blob" "$section" >> "$log"
}

# JSON encoding preserves quoted names, tabs, newlines and other controls.
# Fields are escaped while passing through the tab-delimited comparison file.
json_escape() {
  bun "$HERE/doc-reads.ts" escape "$1"
}

# The content a read actually saw. Validity is keyed to this rather than to a
# clock: an unchanged document does not need re-reading because a commit
# happened, and a changed one voids every prior read the same second it is
# edited — which a timestamp window silently fails to do.
content_hash() {
  git -C "$LEDGER_ROOT" hash-object "$LEDGER_ROOT/$1" 2>/dev/null || printf ''
}

# Façade pages the staged files trigger, one per line. Scope comes from
# ledger_facade_scope — the page's own oracle-scope tag, else its leaf's
# dispatch_init — which is the SAME resolver the ledger's reachability report
# uses, so this check and the ledger can never disagree about what fires.
# Iterating pages rather than leaves is the point: a façade without a
# deterministic leaf still has a trigger surface, and used to be unaskable.
expected_facade_pages() {
  local staged="$1" page stem scope
  while IFS= read -r page; do
    [ -n "$page" ] || continue
    scope="$(ledger_facade_scope "$page")"
    [ -n "$scope" ] || continue
    stem="$(basename "$page" .md)"
    [ "$(ledger_match_count "$scope" < "$staged")" -gt 0 ] && printf '%s\n' "${page#"$LEDGER_ROOT"/}"
  done < <(ledger_facade_pages)
}

# Paths whose recorded read saw the content that is on disk now, one
# `path<TAB>ts<TAB>section` row each. A row written against an older version of
# the document proves the agent read something else, so it does not count — and
# rows from before this milestone, which carry no blob, cannot prove anything
# and are ignored.
#
# The helper validates each JSON row, skips malformed records and compares the
# current file hash before emitting escaped fields for the shell comparison.
current_reads() {
  bun "$HERE/doc-reads.ts" current "$1" "$LEDGER_ROOT"
}

# Rows whose path field equals the escaped page exactly. A fixed-string search
# for "<page><TAB>" also matched recorded paths that merely end with <page>.
# ENVIRON, not `awk -v`: -v rewrites the backslashes JSON escaping produces.
recorded_rows() {
  DOC_READ_PAGE="$1" awk -F'\t' '$1 == ENVIRON["DOC_READ_PAGE"]' "$2"
}

# Timestamps carrying BULK_ASSERTION_THRESHOLD or more distinct façades, one
# `ts<TAB>count` row each. See the header: reported, never blocking.
bulk_seconds() {
  cut -f1,2 "$1" | sort -u | cut -f2 | sort | uniq -c |
    while read -r count ts; do
      [ "$count" -ge "$BULK_ASSERTION_THRESHOLD" ] && printf '%s\t%s\n' "$ts" "$count"
    done
}

# File-scope so the EXIT trap can still see them: a trap fires after a
# function's locals are gone, and `set -u` turns that into a spurious error on
# the way out of a clean run.
STAGED_FILE=""
EXPECTED_FILE=""
RECORDED_FILE=""
cleanup_temporaries() { rm -f "$STAGED_FILE" "$EXPECTED_FILE" "$RECORDED_FILE"; }

run_check() {
  local log unread=0 page staged expected recorded
  STAGED_FILE="$(mktemp)"; EXPECTED_FILE="$(mktemp)"; RECORDED_FILE="$(mktemp)"
  staged="$STAGED_FILE"; expected="$EXPECTED_FILE"; recorded="$RECORDED_FILE"
  trap cleanup_temporaries EXIT
  # The index `git commit -a` and `git commit <path>` stage into, when the
  # calling hook handed one over for this repository (audit_commit_index).
  local index
  index="$(cd "$LEDGER_ROOT" && audit_commit_index)" || {
    printf '  %s🔴%s DOC READ: cannot read the commit index\n' "$R" "$X"; return 2; }
  if ! env ${index:+"GIT_INDEX_FILE=$index"} \
    git -C "$LEDGER_ROOT" -c core.quotePath=false diff --cached --name-only --diff-filter=ACMRT > "$staged" 2>/dev/null; then
    printf '  %s🔴%s DOC READ: cannot list staged files\n' "$R" "$X"; return 2
  fi
  expected_facade_pages "$staged" | sort -u > "$expected"

  if [ ! -s "$expected" ]; then
    printf '  %s🟢%s DOC READ: nothing staged triggers a façade\n' "$G" "$X"
    return 0
  fi
  if ! log="$(read_log_path)" || [ ! -f "$log" ]; then
    printf '  %s🟠%s DOC READ: no read record for this working copy — the agent runtime\n' "$Y" "$X"
    printf '     has no Read hook, so the proof-line stays self-reported here\n'
    return 0
  fi

  # Materialised once, and never piped into `grep -q`: under `pipefail` the
  # producer takes SIGPIPE the moment grep matches and exits, and the pipeline
  # then reports 141 — which reads exactly like "not found" and reds a doc that
  # was read.
  current_reads "$log" | sort -u > "$recorded"

  while IFS= read -r page; do
    [ -n "$(recorded_rows "$(json_escape "$page")" "$recorded")" ] && continue
    printf '  %s🔴%s DOC READ: %s triggered by the staged diff, not read at its current content\n' "$R" "$X" "$page"
    unread=1
  done < "$expected"
  [ "$unread" -eq 0 ] && printf '  %s🟢%s DOC READ: every triggered façade was read at its current content\n' "$G" "$X"
  report_citations "$expected" "$recorded"
  report_bulk "$recorded"
  return "$unread"
}

# How many of the triggered façades carry a cited section. A record with one
# says what the read APPLIED; a record without says only that a read happened,
# which is the claim a loop can also make.
report_citations() {
  local expected="$1" recorded="$2" page total=0 cited=0 section
  while IFS= read -r page; do
    total=$((total + 1))
    section="$(recorded_rows "$(json_escape "$page")" "$recorded" | cut -f3 | grep -c '[^[:space:]]')"
    [ "$section" -gt 0 ] && cited=$((cited + 1))
  done < "$expected"
  [ "$total" -eq 0 ] && return 0
  if [ "$cited" -eq "$total" ]; then
    printf '  %s🟢%s DOC READ: all %s triggered façade(s) cite the section applied\n' "$G" "$X" "$total"
    return 0
  fi
  printf '  %s🟠%s DOC READ: %s of %s triggered façade(s) cite a section; the rest record\n' \
    "$Y" "$X" "$cited" "$total"
  printf '     only that a read happened — pass it: doc-read.sh log <path> "<section applied>"\n'
}

# Says when rows look like a list being walked rather than pages being read.
report_bulk() {
  local recorded="$1" ts count
  while IFS="$(printf '\t')" read -r ts count; do
    [ -n "$ts" ] || continue
    printf '  %s🟠%s DOC READ: %s façades recorded in one second (ts %s) — that is a bulk\n' \
      "$Y" "$X" "$count" "$ts"
    printf '     assertion, not %s reads; log each at the moment it is read\n' "$count"
  done < <(bulk_seconds "$recorded")
}

# Both modes hand records to Bun; without it `log` appends nothing and `check`
# reports every read as missing, so stop with the cause instead.
if [ "${1:-}" = "$MODE_LOG" ] || [ "${1:-}" = "$MODE_CHECK" ]; then
  command -v bun >/dev/null 2>&1 || { printf 'doc-read: bun is required on PATH\n' >&2; exit 2; }
fi

case "${1:-}" in
  "$MODE_LOG")
    { [ "$#" -eq 2 ] || [ "$#" -eq 3 ]; } || { printf '%s\n' "$USAGE" >&2; exit 2; }
    run_log "$2" "${3:-}"
    ;;
  "$MODE_CHECK")
    [ "$#" -eq 1 ] || { printf '%s\n' "$USAGE" >&2; exit 2; }
    run_check
    ;;
  *) printf '%s\n' "$USAGE" >&2; exit 2 ;;
esac
