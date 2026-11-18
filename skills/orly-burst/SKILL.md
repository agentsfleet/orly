---
name: orly-burst
description: |
  Run requested burst lanes on AWS or E2E Networks, or on the current runner,
  and manage their snapshots. Use on "run acceptance on a burst box" or
  "capture a snapshot". Paid runs need explicit authorization; missing PR
  evidence does not authorize a run. Never run from a gate or hook.
---

# orly-burst

This skill owns one `orly burst` run, from choosing the lanes to reporting
the evidence. The lanes, setup, warm-up, secrets and result paths are the
repository's, declared in `.orly/orly.json`. One-time setup, settings and
costs are in orly's `docs/BURST.md`.

## When

- Only when the user explicitly authorizes the run. Missing Pull Request
  evidence is a reason to propose lanes, a provider and expected cost for
  approval. It never authorizes a cloud run, snapshot or paid retention.
- Never inside `orly gate pr`, a hook or a retry loop. The gates never run
  `burst.*` commands, and nothing runs them on the gates' behalf.

## Steps

1. **List the lanes.** Run `orly burst`. It prints the declared lanes and exits
   2; pick only lanes it lists.
2. **Pick the provider.** Use `aws-spot` or `e2e` where outbound SSH on port
   22 works, and the repository's burst workflow from an HTTP-only session.
   Inside a CI job, `--provider here` runs the lane on the runner itself.
3. **Warm once.** A snapshot serves only the region and OS it was captured in.
   Set `ORLY_BURST_E2E_LOCATION` for every run. A set `ORLY_BURST_E2E_IMAGE`
   skips snapshots, so leave it unset unless a lane must not use one.

   Prove a new provider path with one snapshot capture first, since the fake
   API proves nothing about the real one. Without a snapshot, every lane
   starts cold from a base image. Run `orly burst snapshot --provider <P>` after setup changes,
   and `orly burst snapshot --prune --provider <P>` to keep the newest two.
4. **Run.** Run `orly burst <lane>... --provider <P>`, with `--ref <branch>`
   for a ref other than the current branch. Lanes run in parallel, one machine
   each. `--keep` leaves machines running for inspection, and they keep
   billing.
5. **Stop and clean up.** Record orly's PID from `$!` and stop it with
   `kill -INT <pid>`. A `pgrep` pattern can match the wrapping shell, and
   `kill -9` skips cleanup. After a failed or interrupted run, list the
   provider's machines, keys and security groups, and delete what each
   🔴 line names.
6. **Report.** Quote every `orly burst: lane=…` summary line and the `total`
   line verbatim, with the evidence directory. Only a numeric `exit=` is
   evidence. `exit=interrupted`, `deadline`, `cancelled`, `unlaunched` or
   `not_run` proves nothing about the code; report that lane as not run.

## Progress

Before a run, print one block: lanes or snapshot, provider, region, image,
ref, and the hourly price. While it runs, relay each `orly burst:` line as it
arrives, so a step that takes minutes, such as an upload, is never silent.
After it, print one block: each `lane=` line, the `total` line, what was
deleted, and anything left to delete by hand.

orly marks each step: ⏳ under way, 🟢 done, 🔴 failed or left for a person.

```text
burst  snapshot · e2e · Chennai · Debian 13 · feat/x · ₹25/h + GST
  🟢 VM 30361 created → 🟢 ready → ⏳ sending bundle (70.1 MB)… → 🟢 saved
result 🟢 saved orly-burst-…  ·  🟢 VM, key and group deleted  ·  nothing left
```

## Credentials

- Never print a credential, pass one as a command-line argument, or write one
  to a file.
- `burst.secrets` holds `op://` references. orly uses a value already in the
  environment, or reads it with `op read`, on the caller. The value reaches
  the machine only over the SSH session's standard input.
- AWS credentials come from the caller's `aws` configuration or the job's
  cloud login step. E2E credentials are a TIR API token's `E2E_API_KEY`,
  `E2E_AUTH_TOKEN` and `E2E_PROJECT_ID` in the environment; MyAccount keys do
  not work.
- A snapshot never receives a secret: setup and warm run without one.
