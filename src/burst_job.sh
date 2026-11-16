#!/bin/bash
# The start of every orly burst job: the standard input of `bash -s` on a
# fresh or warm machine, over SSH, as root. orly appends the BURST_*
# assignments and a main function built from .orly/orly.json, then calls main
# with standard input from /dev/null so no command can read the rest of the
# session. A lane's secrets are export lines inside main: they exist in this
# shell's memory and the lane's environment, and on no disk.
set -uo pipefail
readonly WORK=/opt/orly-burst/work MARK=/var/lib/orly-burst/warm BUNDLE=/tmp/orly-burst.bundle
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

# A warm checkout fetches the ref from the bundle and keeps its ignored build
# output, which is what makes a warm run cheap; a cold one clones.
checkout() {
  if [ -d "$WORK/.git" ]; then
    echo "== update the warm checkout to $BURST_REF"
    git -C "$WORK" fetch --quiet "$BUNDLE" "$BURST_REF"
    git -C "$WORK" checkout --quiet --force --detach FETCH_HEAD
  else
    echo "== checkout $BURST_REF"
    mkdir -p "$(dirname "$WORK")"
    git clone --quiet --branch "$BURST_REF" "$BUNDLE" "$WORK"
  fi
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
