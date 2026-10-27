#!/usr/bin/env bash
# Shared filename scope and coherent index reads for deterministic scanners.

AUDIT_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

audit_scope_init() {
  AUDIT_MODE="${SCOPE:-$1}"; shift
  AUDIT_TARGETS=()
  local arg selected=0 literal=0
  for arg in "$@"; do
    if [ "$literal" -eq 1 ]; then AUDIT_TARGETS+=("$arg"); continue; fi
    case "$arg" in
      --) literal=1 ;;
      --staged|staged|--all|all)
        [ "$selected" -eq 0 ] || { printf 'choose one audit mode\n' >&2; return 2; }
        AUDIT_MODE="$arg"; selected=1 ;;
      --strict)
        [ "${0##*/}" = logging.sh ] || { printf 'unsupported audit option: %s\n' "$arg" >&2; return 2; } ;;
      -h|--help) printf 'usage: %s [--all|--staged] | file [...]\n' "$0"; exit 0 ;;
      -*) printf 'unknown audit option: %s\n' "$arg" >&2; return 2 ;;
      *) AUDIT_TARGETS+=("$arg") ;;
    esac
  done
  if [ "${#AUDIT_TARGETS[@]}" -gt 0 ]; then
    [ "$selected" -eq 0 ] || { printf 'audit modes and explicit files cannot be mixed\n' >&2; return 2; }
    AUDIT_MODE=explicit
    audit_scope_rebase || return 2
  fi
  case "$AUDIT_MODE" in
    staged|--staged) AUDIT_MODE=--staged ;;
    all|--all) AUDIT_MODE=--all ;;
    explicit) ;;
    *) printf 'unknown audit scope: %s\n' "$AUDIT_MODE" >&2; return 2 ;;
  esac
}

# Explicit files are named from the caller's directory, and every scanner reads
# them after `cd` to the repository root. Rebase each onto the root, and refuse
# a name that is not a file: skipping it reported an unread file as clean.
audit_scope_rebase() {
  local prefix target rebased=()
  prefix="$(git rev-parse --show-prefix 2>/dev/null)" || prefix=""
  for target in "${AUDIT_TARGETS[@]}"; do
    [ -f "$target" ] || { printf 'audit target is not a file: %s\n' "$target" >&2; return 2; }
    case "$target" in /*) rebased+=("$target") ;; *) rebased+=("$prefix$target") ;; esac
  done
  AUDIT_TARGETS=("${rebased[@]}")
}

# Source and dependencies share a copied index. Git's object store is read-only;
# the index copy and checked-out files belong to this invocation alone.
audit_index_snapshot() {
  [ "$AUDIT_MODE" = --staged ] || return 0
  local gitdir index changed=0
  AUDIT_SNAPSHOT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/orly-index.XXXXXX")" || return 1
  trap 'rm -rf -- "$AUDIT_SNAPSHOT_ROOT"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  gitdir="$(git rev-parse --absolute-git-dir)" || exit 1
  index="$(audit_commit_index)" || exit 2
  [ -n "$index" ] || index="$(git rev-parse --git-path index)" || exit 1
  cp "$index" "$AUDIT_SNAPSHOT_ROOT/index" || exit 1
  export GIT_DIR="$gitdir" GIT_INDEX_FILE="$AUDIT_SNAPSHOT_ROOT/index" GIT_OPTIONAL_LOCKS=0
  if [ "$#" -gt 0 ]; then
    git diff --cached --quiet --diff-filter=ACMRT -- "$@" || changed=$?
    case "$changed" in
      0) return 0 ;;
      1) ;;
      *) printf 'cannot select staged audit files (git exit %s)\n' "$changed" >&2; exit 2 ;;
    esac
  fi
  export GIT_WORK_TREE="$AUDIT_SNAPSHOT_ROOT/tree"
  mkdir "$GIT_WORK_TREE" || exit 1
  git checkout-index --all --prefix="$GIT_WORK_TREE/" || exit 1
  cd "$GIT_WORK_TREE" || exit 1
  [ -z "${TARGET_ROOT:-}" ] || TARGET_ROOT="$GIT_WORK_TREE"
  audit_index_links || exit 2
}

# The index a commit hook handed over in ORLY_INDEX_FILE: `git commit -a` and
# `git commit <path>` stage into a temporary one the default index lacks.
# Printed only when it lives in this repository's git directory; a value
# inherited into another repository (a nested sandbox) is ignored. One that
# names a missing file here refuses: git reads a missing index as empty, so
# the commit would be graded as having nothing staged.
audit_commit_index() {
  local index="${ORLY_INDEX_FILE:-}" gitdir directory
  [ -n "$index" ] || return 0
  gitdir="$(git rev-parse --absolute-git-dir 2>/dev/null)" || return 1
  gitdir="$(cd "$gitdir" && pwd -P)" || return 1
  directory="$(cd "$(dirname "$index")" 2>/dev/null && pwd -P)" || return 0
  case "$directory" in "$gitdir"|"$gitdir"/*) ;; *) return 0 ;; esac
  index="$directory/$(basename "$index")"
  [ -f "$index" ] || { printf 'commit index is missing: %s\n' "$index" >&2; return 1; }
  printf '%s' "$index"
}

# Each tracked link is followed the way the kernel would: an existing component
# through its real path, and a missing tail (a link into an ignored build
# directory) lexically. Any step outside the snapshot tree refuses, so an
# in-tree link such as `inner -> .` cannot hide a climb out of it.
AUDIT_LINK_CHECK='import {lstatSync, readlinkSync, realpathSync} from "node:fs";
import {dirname, isAbsolute, join, sep} from "node:path";
const root = realpathSync(process.cwd()), link = process.argv[1];
const inside = (path) => path === root || path.startsWith(root + sep);
function contained() {
  const target = readlinkSync(link);
  if (isAbsolute(target)) return inside(realpathSync(link));
  let current = realpathSync(dirname(join(root, link))), missing = false;
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { current = dirname(current); if (!inside(current)) return false; continue; }
    const next = join(current, part);
    if (!missing) {
      try { lstatSync(next); current = realpathSync(next); if (!inside(current)) return false; continue; }
      catch { missing = true; }
    }
    current = next;
  }
  return inside(current);
}
let safe = false;
try { safe = contained(); } catch { safe = false; }
if (!safe) { console.error("unsafe indexed symbolic link: " + link); process.exit(2); }'

audit_index_links() {
  local entry path
  git ls-files --stage -z > "$AUDIT_SNAPSHOT_ROOT/entries" || return 1
  while IFS= read -r -d '' entry; do
    case "$entry" in 120000*) ;; *) continue ;; esac
    path="${entry#*$'\t'}"
    bun -e "$AUDIT_LINK_CHECK" "$path" || return 2
  done < "$AUDIT_SNAPSHOT_ROOT/entries"
}

# Zero-delimited throughout: spaces, tabs, quotes and newlines are filenames.
audit_scope_paths() {
  local path pattern matched
  if [ "$AUDIT_MODE" = explicit ]; then
    for path in "${AUDIT_TARGETS[@]}"; do
      matched=0
      for pattern in "$@"; do
        case "$path" in $pattern) matched=1 ;; esac
      done
      [ "$matched" -eq 0 ] || printf '%s\0' "$path"
    done
  elif [ "$AUDIT_MODE" = --staged ]; then
    git diff --cached --name-only -z --diff-filter=ACMRT -- "$@"
  else
    git ls-files --cached --others --exclude-standard -z -- "$@"
  fi
}
