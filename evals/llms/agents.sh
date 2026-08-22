# Agent I/O layer for evals/llms/run.sh — prompt construction, headless
# invocation, and answer parsing. Sourced, never executed: run.sh sets ROOT,
# AGENTS, DISPATCH_DIR, CTX_FILE and CALL_TIMEOUT before sourcing this file.
# Split out of run.sh per dispatch/write_any.md §File & Function Length Gate.

# Agent invocation — per-agent because their headless I/O differs. Each takes
# ($1=prompt_file, $2=answer_out_file) and must land the agent's reply text in
# answer_out_file. Most stream to stdout; codex needs --output-last-message
# (its stdout is event noise that drowns the VERDICT line). Wrapped in a
# portable timeout so a hung agent can't stall the suite. Add a case to extend.
invoke_agent() {
  local agent="$1" prompt="$2" out="$3" secs="$CALL_TIMEOUT"
  : >"$out"
  case "$agent" in
    # Each agent's headless I/O differs — established empirically:
    #   claude   : prompt on stdin, -p.
    #   codex    : prompt on stdin; stdout is event noise, so the answer is
    #              captured via --output-last-message.
    #   amp      : prompt on stdin with the LONG --execute form (the short
    #              `-x` and the positional-arg form both misbehave here).
    #   opencode : prompt as a positional ARG to `run` (default format; its
    #              `--format` only accepts default|json). ~100 KB << ARG_MAX.
    # amp/opencode stdout carries ANSI/control bytes — extract_verdict strips
    # them before matching. Credit/auth stderr stays visible to is_unavailable.
    # OpenCode buffers stdout until stderr is captured so its answer remains last.
    claude)   capture_answer_last "$out" timeout "$secs" claude -p < "$prompt" ;;
    amp)      capture_answer_last "$out" timeout "$secs" amp --execute < "$prompt" ;;
    opencode) capture_answer_last "$out" timeout "$secs" opencode run "$(cat "$prompt")" ;;
    # codex: answer lands in $msg via --output-last-message; event noise + any
    # error text go to $out so is_unavailable can see them; then the clean
    # answer is appended so the verdict remains the final semantic line.
    codex)    local msg="$out.msg" status
              capture_answer_last "$out" timeout "$secs" codex exec - --skip-git-repo-check \
                  --output-last-message "$msg" < "$prompt"
              status=$?
              [[ -f "$msg" ]] && { append_file_separated "$out" "$msg"; rm -f "$msg"; }
              return "$status" ;;
    *) return 127 ;;
  esac
}

build_context() {
  # The full embed — used for fixtures with no "ctx" allowlist.
  {
    echo "===== BEGIN AGENTS.md ====="
    cat "$AGENTS"
    echo "===== END AGENTS.md ====="
    echo "===== BEGIN DISPATCH FAÇADES (dispatch/) ====="
    cat "$DISPATCH_DIR"/*.md
    echo "===== END DISPATCH FAÇADES ====="
  }
}

# Fixture-scoped context: __FULL__ = the whole embed above; __NONE__ =
# AGENTS.md alone; otherwise a comma-joined façade allowlist. Scoping cuts a
# ~213KB prompt to the files a fixture actually interrogates.
build_ctx_for() {
  local spec="$1" file
  if [[ "$spec" == "__FULL__" ]]; then cat "$CTX_FILE"; return; fi
  echo "===== BEGIN AGENTS.md ====="
  cat "$AGENTS"
  echo "===== END AGENTS.md ====="
  if [[ "$spec" != "__NONE__" ]]; then
    echo "===== BEGIN DISPATCH FAÇADES (dispatch/) ====="
    local -a ctx_files=()
    IFS=',' read -ra ctx_files <<< "$spec"
    for file in "${ctx_files[@]}"; do cat "$ROOT/$file"; done
    echo "===== END DISPATCH FAÇADES ====="
  fi
}

build_prompt() {
  # $1 = question · $2 = ctx spec (__FULL__ | __NONE__ | comma-joined paths).
  build_ctx_for "${2:-__FULL__}"
  cat <<EOF

===== TASK =====
You are validating comprehension of the operating model above. Answer the
question using ONLY the text above. Do NOT use any tools or read any files.
Think silently, then output your answer as the LAST line, in EXACTLY this
format with no extra words:

VERDICT: YES
or
VERDICT: NO

QUESTION: $1
EOF
}

# An agent's answer file shows it is UNAVAILABLE (not wrong) when it carries a
# credit/auth/quota error rather than a verdict — e.g. amp on the free tier:
# "402 ... require paid credits ... non-interactive" or Amp's current
# "Out of Credits". Such an agent is logged
# and EXCLUDED from the pass/fail gate, never scored 0 (which would wrongly
# sink the whole suite). Empty output after a clean timeout counts as a miss,
# not unavailability — that's a real non-answer.
UNAVAILABLE_PATTERN='^[[:space:]]*([-*>|][[:space:]]*)?((error|fatal):[[:space:]]*(402([^[:alnum:]]|$)|out of credits([^[:alnum:]]|$)|.*(paid credits|require.*credits|daily free usage limit|purchase additional credits|quota (exceeded|exhausted)|rate.?limit(ed| exceeded)|unauthorized|not (logged in|authenticated)|invalid api key|please (log ?in|sign ?in)))|http[[:space:]]*(401|402|429)([^[:alnum:]]|$)|402([^[:alnum:]]|$)|out of credits([^[:alnum:]]|$)|rate.?limit(ed| exceeded)([^[:alnum:]]|$)|unauthorized([^[:alnum:]]|$)|not (logged in|authenticated)([^[:alnum:]]|$)|invalid api key([^[:alnum:]]|$))'
ZERO_STATUS_UNAVAILABLE_PATTERN='^[[:space:]]*([-*>|][[:space:]]*)?error:[[:space:]]*out of credits([^[:alnum:]]|$)'

is_unavailable() {
  local status="${2:-0}"
  [[ "$status" -ne 124 ]] || return 1
  [[ "$(extract_verdict "$1")" == "?" ]] || return 1
  if [[ "$status" -eq 0 ]]; then
    LC_ALL=C tr -cd '[:print:]\n' < "$1" \
      | sed -E 's/\[[0-9;?]*[[:alpha:]]//g' \
      | grep -qiE "$ZERO_STATUS_UNAVAILABLE_PATTERN"
  else
    LC_ALL=C tr -cd '[:print:]\n' < "$1" \
      | sed -E 's/\[[0-9;?]*[[:alpha:]]//g' \
      | grep -qiE "$UNAVAILABLE_PATTERN"
  fi
}

capture_answer_last() {
  local out="$1" answer_file status
  shift
  answer_file="$(mktemp)" || return 1
  "$@" >"$answer_file" 2>"$out"; status=$?
  append_file_separated "$out" "$answer_file"
  rm -f "$answer_file"
  return "$status"
}

append_file_separated() {
  local out="$1" input="$2"
  [[ -s "$input" ]] || return 0
  [[ -s "$out" ]] && printf '\n' >>"$out"
  cat "$input" >>"$out"
}

require_skill_markers() {
  local skill="$1" marker
  shift
  for marker in "$@"; do grep -Fq "$marker" "$skill" || return 1; done
}

validate_partial_completion_rules() {
  local integration="$ROOT/skills/orly-write-integration-test/SKILL.md"
  local unit="$ROOT/skills/orly-write-unit-test/SKILL.md"
  local -a markers=(
    'Write the matrix before the tests:'
    'Failure timing / remote outcome'
    'acknowledgement-loss'
    'exactly one effect'
    'workflow ordinal'
    'boundary-call ordinal'
    'residual state'
    'retry'
    'Unsafe external mutation ordering is a design defect.'
    '**Partial completion:**'
  )
  require_skill_markers "$integration" "${markers[@]}" \
    'Any operation that touches multiple systems or acquires the same resource more than once is **Standard at minimum** and must run T4' \
    'Draining a resource pool proves the first acquisition and nothing after it.' || return 1
  require_skill_markers "$unit" "${markers[@]}" \
    'when one operation touches multiple systems or acquires the same resource more than once' \
    'Draining a whole resource pool proves only the first acquisition and cannot cover a later one.' || return 1
  printf '✓ partial-completion skill rules valid\n'
}

write_fake_agent() {
  local path="$1"
  cat >"$path" <<'EOF'
#!/usr/bin/env bash
set -u
agent="$(basename "$0")"
prompt="${ORLY_FAKE_PROMPT:?}"
case "$agent" in
  claude) [[ "$#" -eq 1 && "$1" == '-p' ]] || exit 31; [[ "$(cat)" == "$prompt" ]] || exit 32 ;;
  amp) [[ "$#" -eq 1 && "$1" == '--execute' ]] || exit 33; [[ "$(cat)" == "$prompt" ]] || exit 34 ;;
  opencode) [[ "$#" -eq 2 && "$1" == 'run' && "$2" == "$prompt" ]] || exit 35 ;;
  codex)
    [[ "$#" -eq 5 ]] || exit 36
    [[ "$1" == 'exec' && "$2" == '-' && "$3" == '--skip-git-repo-check' && "$4" == '--output-last-message' ]] || exit 37
    [[ "$(cat)" == "$prompt" ]] || exit 38
    printf '%s\n' 'VERDICT: YES' > "$5"
    ;;
  *) exit 39 ;;
esac
printf '%s\n' 'diagnostic before verdict' >&2
if [[ "$agent" == 'codex' ]]; then
  printf '%s\n' 'event stream noise'
else
  printf '%s\n' 'event stream noise' 'VERDICT: YES'
fi
exit "${ORLY_FAKE_AGENT_STATUS:-0}"
EOF
  chmod +x "$path"
}

validate_fake_agent_success() {
  local agent="$1" prompt="$2" out="$3" status
  invoke_agent "$agent" "$prompt" "$out"; status=$?
  [[ "$status" -eq 0 ]] || return 1
  [[ "$(extract_agent_verdict "$out" "$status")" == 'YES' ]] || return 1
  [[ "$agent" != 'codex' || ! -e "$out.msg" ]]
}

validate_fake_agent_failure() {
  local agent="$1" prompt="$2" out="$3" status
  ORLY_FAKE_AGENT_STATUS=7 invoke_agent "$agent" "$prompt" "$out"; status=$?
  [[ "$status" -eq 7 ]] || return 1
  [[ "$(extract_agent_verdict "$out" "$status")" == '?' ]] || return 1
  [[ "$agent" != 'codex' || ! -e "$out.msg" ]]
}

validate_agent_adapters() {
  local fixture_dir fake_agent prompt out agent expected_prompt='adapter prompt'
  local ORLY_FAKE_PROMPT="$expected_prompt"
  export ORLY_FAKE_PROMPT
  fixture_dir="$(mktemp -d)" || return 1
  fake_agent="$fixture_dir/fake-agent"; prompt="$fixture_dir/prompt"
  printf '%s' "$ORLY_FAKE_PROMPT" > "$prompt"
  write_fake_agent "$fake_agent" || { rm -rf "$fixture_dir"; return 1; }
  for agent in "${AGENTS_ALL[@]}"; do
    ln -s "$fake_agent" "$fixture_dir/$agent" || { rm -rf "$fixture_dir"; return 1; }
  done
  local PATH="$fixture_dir:$PATH"
  for agent in "${AGENTS_ALL[@]}"; do
    out="$fixture_dir/$agent.out"
    validate_fake_agent_success "$agent" "$prompt" "$out" || { rm -rf "$fixture_dir"; return 1; }
    validate_fake_agent_failure "$agent" "$prompt" "$out" || { rm -rf "$fixture_dir"; return 1; }
  done
  rm -rf "$fixture_dir"
}

validate_agent_io() {
  local sample status
  sample="$(mktemp)" || return 1
  printf '%s\n' 'Error: Out of Credits Add credits to keep using Amp.' > "$sample"
  is_unavailable "$sample" 1 || { rm -f "$sample"; return 1; }
  is_unavailable "$sample" 0 || { rm -f "$sample"; return 1; }
  printf '%s\n' 'Error: Out of Credits; unable to produce VERDICT: NO' > "$sample"
  is_unavailable "$sample" 1 || { rm -f "$sample"; return 1; }
  printf '\033[31m  Error: Out of Credits\033[0m\n' > "$sample"
  is_unavailable "$sample" 1 || { rm -f "$sample"; return 1; }
  printf '%s\n' 'Rate-limit behavior is covered.' > "$sample"
  if is_unavailable "$sample" 1; then rm -f "$sample"; return 1; fi
  printf '%s\n' 'The operating model says unauthorized access must be rejected.' > "$sample"
  if is_unavailable "$sample" 7; then rm -f "$sample"; return 1; fi
  printf '%s\n' 'Error: Out of Credits' > "$sample"
  if is_unavailable "$sample" 124; then rm -f "$sample"; return 1; fi
  printf '%s\n' 'Rate-limit behavior is covered.' 'VERDICT: NO' > "$sample"
  if is_unavailable "$sample" 1; then rm -f "$sample"; return 1; fi
  [[ "$(extract_verdict "$sample")" == "NO" ]] || { rm -f "$sample"; return 1; }
  printf '%s\n' 'Error: Out of Credits' 'VERDICT: NO' > "$sample"
  if is_unavailable "$sample" 1; then rm -f "$sample"; return 1; fi
  printf '%s\n' 'VERDICT: NO ' > "$sample"
  [[ "$(extract_verdict "$sample")" == "NO" ]] || { rm -f "$sample"; return 1; }
  printf '%s\n' 'VERDICT: YES' > "$sample"
  [[ "$(extract_verdict "$sample")" == "YES" ]] || { rm -f "$sample"; return 1; }
  printf '%s\n' 'VERDICT: YES' 'trailing diagnostic' > "$sample"
  [[ "$(extract_verdict "$sample")" == "?" ]] || { rm -f "$sample"; return 1; }
  printf '\033[31mVERDICT: NO \033[0m\n\033[0m\n' > "$sample"
  [[ "$(extract_verdict "$sample")" == "NO" ]] || { rm -f "$sample"; return 1; }
  capture_answer_last "$sample" sh -c \
    'printf "%s\n" "diagnostic" >&2; printf "%s\n" "VERDICT: YES"; exit 7'
  status=$?
  [[ "$status" -eq 7 ]] || { rm -f "$sample"; return 1; }
  [[ "$(extract_agent_verdict "$sample" "$status")" == "?" ]] || { rm -f "$sample"; return 1; }
  printf '%s\n' 'VERDICT: YES' > "$sample"
  [[ "$(extract_agent_verdict "$sample" 124)" == "?" ]] || { rm -f "$sample"; return 1; }
  capture_answer_last "$sample" sh -c \
    'printf "%s" "diagnostic" >&2; printf "%s\n" "VERDICT: YES"'
  [[ "$(extract_agent_verdict "$sample" 0)" == "YES" ]] || { rm -f "$sample"; return 1; }
  capture_answer_last "$sample" sh -c 'printf "%s\n" "Error: Out of Credits" >&2; exit 9'
  status=$?
  [[ "$status" -eq 9 ]] || { rm -f "$sample"; return 1; }
  is_unavailable "$sample" "$status" || { rm -f "$sample"; return 1; }
  validate_agent_adapters || { rm -f "$sample"; return 1; }
  validate_partial_completion_rules || { rm -f "$sample"; return 1; }
  rm -f "$sample"
}

extract_agent_verdict() {
  local file="$1" status="${2:-0}"
  [[ "$status" -eq 0 ]] || { printf '?'; return; }
  extract_verdict "$file"
}

extract_verdict() {
  # The last printable nonempty line must be the verdict. This prevents credit
  # or auth diagnostics that mention the requested format from becoming answers.
  # Strip ANSI residue before selecting the final semantic line; some CLIs emit
  # a standalone reset after their answer.
  local v
  v=$(LC_ALL=C tr -cd '[:print:]\n' < "$1" \
        | sed -E 's/\[[0-9;?]*[[:alpha:]]//g' \
        | awk 'NF { last = $0 } END { print last }' \
        | sed -E 's/[[:space:]]+$//' \
        | grep -oiE '^VERDICT:[[:space:]]*(YES|NO)[[:space:]]*$' \
        | grep -oiE '(YES|NO)$' | tr '[:lower:]' '[:upper:]')
  [[ -n "$v" ]] && printf '%s' "$v" || printf '?'
}
