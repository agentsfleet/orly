# The audit recipe uses bash arrays and a here-string; /bin/sh has neither.
SHELL := /bin/bash

.PHONY: conform audit install-evals

# Run the deterministic audit chain (all green):
#   1. Registry and profile validation.
#   2. Oracle rules unit tests and byte-stable rendering.
#   3. The standards catalogue (inside the test suite).
#
# The steps do not touch each other: each reads the tree or works inside its own
# mktemp sandbox, and none writes back into the repository. So they run at once
# and their output is replayed in declaration order — a parallel chain that
# still reads like a serial one. The fan-out lives in the recipe because macOS
# ships GNU make 3.81, which has no --output-sync to keep `make -j` legible.
#
# `evals/install/run.sh` is deliberately NOT in this list. It packs a tarball
# and installs it into a scratch HOME once per case, and cost 35s of the chain's
# 66s — more than half the wall, for a proof about DISTRIBUTION that no branch
# push can break for anyone. It runs unconditionally in CI
# (.github/workflows/harness.yml) and by hand as `make install-evals`.
# `%` separates the steps, so no step command may contain one.
#
# CONFORM_STEPS is what this repository declares as `conform`, and CONFORM is a
# lifecycle stage that runs after every EXECUTE — so `orly gate work` runs it at
# every commit and it has to cost seconds: the render is current and every pack
# file matches its source.
CONFORM_STEPS := bin/orly verify
# Everything the rule corpus must survive before it can reach anyone else:
# CONFORM plus the type and test suite and every eval sandbox. This is what
# .githooks/pre-push runs, and what Continuous Integration (CI) runs. It used to
# BE the declared conform, which meant `orly gate` ran `bun test src` twice —
# once inside the audit chain and once as the declared verify.unit.
AUDIT_STEPS := $(CONFORM_STEPS)%bun run typecheck && bun test src

conform: STEPS := $(CONFORM_STEPS)
audit:   STEPS := $(AUDIT_STEPS)
conform audit:
	@set -uo pipefail; \
	IFS='%' read -r -a steps <<< "$(STEPS)"; \
	logs="$$(mktemp -d)"; pids=(); \
	trap 'rm -rf "$$logs"' EXIT; \
	for i in "$${!steps[@]}"; do \
	  ( eval "$${steps[$$i]}" ) > "$$logs/$$i.log" 2>&1 & \
	  pids+=("$$!"); \
	done; \
	rc=0; failed=(); \
	for i in "$${!pids[@]}"; do \
	  if ! wait "$${pids[$$i]}"; then rc=1; failed+=("$${steps[$$i]}"); fi; \
	done; \
	for i in "$${!steps[@]}"; do \
	  printf '\n\033[1m--- %s\033[0m\n' "$${steps[$$i]}"; \
	  cat "$$logs/$$i.log"; \
	done; \
	if [ "$$rc" -ne 0 ]; then \
	  printf '\n\033[31maudit FAILED:\033[0m\n'; \
	  for f in "$${failed[@]}"; do printf '  %s\n' "$$f"; done; \
	fi; \
	exit $$rc

# Installability in isolation — the payload boundary and a packed tarball
# proving itself against a scratch HOME with no dotfiles checkout in reach.
install-evals:
	@bash evals/install/run.sh
