#!/bin/bash
# The start of every orly burst job: the standard input of `bash -s` on a
# fresh or warm machine, over SSH, as root. orly appends the WORK and BUNDLE
# paths, the BURST_* assignments and a main function built from
# .orly/orly.json, then calls main
# with standard input from /dev/null so no command can read the rest of the
# session. A lane's secrets are export lines inside main: they exist in this
# shell's memory and the lane's environment, and on no disk.
set -uo pipefail
readonly MARK=/var/lib/orly-burst/warm
# Each step is its own process, so a toolchain one step installs for root,
# such as rustup's cargo or Bun, is on PATH for every later step.
export HOME=/root PATH="/root/.cargo/bin:/root/.bun/bin:/root/.local/bin:$PATH"

# What a cold machine lacks. A warm snapshot already has it, marked by $MARK.
# Compose is part of Docker here: Ubuntu packages the plugin as
# docker-compose-v2 and Debian as docker-compose. Debian 13 also moved the
# docker command itself into docker-cli, which docker.io only recommends.
# Anything else a repository needs belongs in its burst.setup.
prepare() {
  export DEBIAN_FRONTEND=noninteractive
  exec_tmp
  if [ ! -e "$MARK" ]; then
    echo "== packages"
    apt-get update -qq
    local compose=docker-compose
    if apt-cache show docker-compose-v2 >/dev/null 2>&1; then compose=docker-compose-v2; fi
    apt-get install -y -qq --no-install-recommends ca-certificates curl git unzip docker.io "$compose"
    if ! command -v docker >/dev/null; then apt-get install -y -qq --no-install-recommends docker-cli; fi
    systemctl start docker
  fi
  echo "== docker probe"
  docker version --format '{{.Server.Version}}'
  docker compose version
}

# E2E's Debian 13 image mounts /tmp noexec, and installers such as rustup-init
# run what they download there. A warm machine boots with the same mount
# options, so every job checks.
exec_tmp() {
  if findmnt -no OPTIONS /tmp 2>/dev/null | grep -qw noexec; then
    echo "== remount /tmp exec"
    mount -o remount,exec /tmp
  fi
}

# One path for a cold and a warm machine: fetch from the bundle only when the
# checkout lacks the commit, then check out exactly that commit and remove
# untracked files. Ignored build output stays, which is what makes a warm
# run cheap; a warm machine's bundle holds only the commits it lacks.
checkout() {
  if [ -d "$WORK/.git" ]; then
    echo "== update the warm checkout to $BURST_REF"
  else
    echo "== checkout $BURST_REF"
    mkdir -p "$WORK"
    git -c init.defaultBranch=orly-burst init --quiet "$WORK"
  fi
  git -C "$WORK" cat-file -e "$BURST_COMMIT^{commit}" 2>/dev/null || git -C "$WORK" fetch --quiet "$BUNDLE" "$BURST_REF"
  git -C "$WORK" checkout --quiet --force --detach "$BURST_COMMIT"
  git -C "$WORK" clean -fdq
  rm -f "$BUNDLE"
  cd "$WORK"
}

step() {
  printf '== %s\n' "$*"
  "$@"
}

warmed() {
  mkdir -p "$(dirname "$MARK")"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$MARK"
  sync
}
