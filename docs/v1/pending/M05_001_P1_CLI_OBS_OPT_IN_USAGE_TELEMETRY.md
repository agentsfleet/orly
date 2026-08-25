<!--
SPEC AUTHORING RULES (load-bearing — the one comment that survives):
- Body order = the executing agent's read order. Fill via the orly-spec-new
  skill (authoring order lives there); after filling, DELETE every "tpl:"
  guidance comment — the SPEC TEMPLATE GATE blocks tpl residue, unfilled
  slots, and missing required sections (audits/spec-template.sh --staged).
- No time/effort/hour/day estimates anywhere. No effort columns, complexity
  ratings, percentage-complete, implementation dates, assigned owners.
- Priority (P0/P1/P2/P3) is the only sizing signal; Dependencies are the only
  sequencing signal. A section that contradicts these rules loses — delete it.
-->

# M05_001: Opt-in usage telemetry reaches agentsfleet

**Prototype:** v1.0.0
**Milestone:** M05
**Workstream:** 001
**Date:** Aug 25, 2026
**Status:** PENDING
**Priority:** P1 — without consented usage signals, installation and gate friction remain invisible
**Categories:** CLI, OBS
**Batch:** B1 — one telemetry path from command completion to a mocked fleet ingestion boundary
**Branch:** added at CHORE(open)
**Test Baseline:** set at CHORE(open) — `unit=<N> integration=0` from `bun test src`; no integration command is declared
**Depends on:** none
**Provenance:** LLM-drafted (Amp, Aug 25, 2026) from Indy's gstack consent and storage direction
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §Topology and §Gates

---

## Overview

**Goal (testable):** A direct interactive `orly` run asks once whether to keep telemetry off or enable anonymous telemetry; consented commands append privacy-bounded events under the agentsfleet state root at `~/.config/agentsfleet/orly/` by default; and anonymous events retry safely against the agentsfleet fleet telemetry boundary without changing command output or exit status.

**Problem:** `orly` cannot currently count installations, distinguish active installs from one-time setup, or see which gate criterion repeatedly stops a workflow. Adding a general analytics platform would create more machinery than the Command-Line Interface (CLI) needs, while prompting from generated hooks could block commits and agent automation.

**Solution summary:** Follow gstack's small local-first path with only two choices. Resolve the agentsfleet state root exactly like the sibling CLI (`AGENTSFLEET_STATE_DIR`, otherwise `~/.config/agentsfleet`), store Orly's consent in the isolated `orly/.orly.json` child, ask once only during eligible direct interactive use, append one controlled JSON Lines (JSONL) event per anonymous command, and start a best-effort background sender. Anonymous events carry a random persistent installation identifier so a multi-command journey can be understood without identifying a person, machine, or repository. The sender batches unsent records, writes an egress receipt before transmission, and posts to the agentsfleet fleet telemetry URL through a fetch boundary mocked in tests. Off means no event is written and no network call is attempted.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(cli): add opt-in usage telemetry`
- **Intent:** Learn where consented `orly` installations reach or stop without collecting repository content or making telemetry part of command correctness.
- **Handshake:** Before EXECUTE, restate the intent and list `ASSUMPTIONS I'M MAKING: …`. A mismatch stops execution.

## Implementing agent — read these first

1. `src/cli.ts` — owns command dispatch, outcomes, help, and exit status.
2. `src/install.ts` — owns generated hook invocation and can mark hook-originated commands without changing gate behavior.
3. `docs/ORLY_ARCHITECTURE.md` — defines the CLI, installation, and gate boundaries this signal follows.
4. gstack `bin/gstack-telemetry-log` and `bin/gstack-telemetry-sync` — prior art for consent gating, local JSONL, cursor retry, and background upload.
5. agentsfleet CLI `src/lib/config-dir.ts` and `src/services/telemetry/consent.ts` — source of truth for the shared state-root default, environment override, and ownership of the sibling CLI's root-level `telemetry.json`.

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `docs/v1/pending/M05_001_P1_CLI_OBS_OPT_IN_USAGE_TELEMETRY.md` | CREATE, then MOVE through lifecycle directories | Record intent, tests, and evidence |
| `src/telemetry.ts` | CREATE | Own consent, identity, event validation, and best-effort local append |
| `src/telemetry_sync.ts` | CREATE | Own cursor-based batching, egress receipt, and fleet upload |
| `src/telemetry.test.ts` | CREATE | Prove consent, schema, privacy, failure isolation, and retry behavior |
| `src/cli.ts` | EDIT | Time command runs, classify outcomes, prompt when eligible, append, and trigger sync |
| `src/cli.test.ts` | EDIT | Prove help text and command exit status stay stable |
| `src/install.ts` | EDIT | Mark generated-hook invocations so they never prompt |
| `src/install.test.ts` | EDIT | Prove generated hooks carry the invocation marker |
| `README.md` | EDIT | Publish consent choices, collected fields, excluded fields, and disable commands |
| `docs/ORLY_ARCHITECTURE.md` | EDIT | Record the local-to-fleet data flow and failure boundary |

## Applicable Rules

- `docs/greptile-learnings/RULES.md` — RULE NDC removes unused telemetry paths, RULE NLR cleans touched ambiguity, RULE NLG extends the CLI in place without aliases, RULE UFS names event and consent values, RULE FLL keeps modules bounded, and RULE TST-NAM keeps tests behavior-shaped.
- `dispatch/write_ts_adhere_bun.md` §1, §2, §5, §8, §9, and §11 — choose narrow functions-modules, validate JSON boundaries, use Bun tests, keep one error style, and cancel network work.
- `dispatch/write_any.md` — File & Function Length, LOGGING, UFS, Error Registry, and Greptile gates apply to new source.
- `dispatch/edit_rules.md` — `src/**`, generated hooks, architecture, and CLI semantics require the governance audit and evidence path.
- `dispatch/write_documentation.md` and `docs/DOCUMENTATION_RULES.md` — README privacy claims must match the emitted and transmitted bytes.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| SPEC TEMPLATE GATE | yes | `bash audits/spec-template.sh --staged` passes before spec commits |
| TS FILE SHAPE DECISION | yes | both new TypeScript files are functions-modules with no mutable domain object |
| File & Function Length | yes | keep consent/logging and synchronization in two bounded files; helpers remain leaf-sized |
| LOGGING | yes | telemetry never uses console output; events use allowlisted fields and outcomes |
| UFS | yes | consent tiers, event names, commands, limits, and URL are named constants |
| ERROR REGISTRY | delegated | `make audit` decides whether this repository's registry applies; telemetry errors remain swallowed internally |
| Invariance Suite | yes | run `make audit`, the governance questionnaire, and generated evidence before push |
| Documentation | yes | README and architecture describe exactly what persists and leaves the machine |

## Prior-Art / Reference Implementations

- **gstack logger and sender:** `bin/gstack-telemetry-log` and `bin/gstack-telemetry-sync` provide the consent gate, random installation identifier, local JSONL, receipt-before-send, and cursor-on-success shape. Orly intentionally collapses gstack's anonymous and community choices into one clearly described anonymous mode with a random installation identifier.
- **agentsfleet CLI state path:** `src/lib/config-dir.ts` in `~/Projects/agentsfleet/cli` resolves `AGENTSFLEET_STATE_DIR` first and otherwise uses `~/.config/agentsfleet`; its telemetry service owns root-level `telemetry.json`, so Orly uses an `orly/` child instead of sharing that file.
- **Existing CLI boundary:** `src/cli.ts` already converts every command to one numeric outcome; telemetry observes that result rather than changing handlers.
- **Existing test style:** `src/cli.test.ts` and `src/install.test.ts` use subprocess and temporary repository boundaries that preserve real CLI behavior while isolating the network mock.

## Sections (implementation slices)

### §1 — Ask once without interrupting automation

Consent has exactly two values: `off` and `anonymous`. Missing or malformed configuration resolves to off. On the first eligible direct interactive invocation, the marker is written before asking, so abort and prompt failure do not create a loop. Hooks, non-interactive processes, and Continuous Integration (CI) never prompt. Environment overrides can select a value for one process, and the hard-off override wins over every source.

- **Dimension 1.1** — the consent resolver applies hard-off, process override, persisted setting, then default-off precedence → Test `resolves_telemetry_consent_in_precedence_order`
- **Dimension 1.2** — the one-time prompt persists the selected tier and marks attempted prompting even on abort → Test `prompts_once_and_marks_aborted_prompt`
- **Dimension 1.3** — hook, CI, and non-interactive invocation never prompt → Test `automation_never_prompts_for_telemetry`

### §2 — Append one privacy-bounded event after a command

After command completion, anonymous runs append one schema-versioned event. Allowed properties are event identifier, timestamp, command, optional gate, outcome, optional failed criterion, duration, installed `orly` version, operating system, architecture, invocation kind, session identifier, and a random persistent installation identifier. No path, argument value, environment value, repository name, branch, prompt, command output, hostname, username, or raw error message enters the event.

- **Dimension 2.1** — successful and failed commands emit the allowlisted schema with a new session and event identifier → Test `appends_one_valid_event_per_command`
- **Dimension 2.2** — anonymous events reuse a random locally persisted installation identifier that has no identifying inputs → Test `anonymous_installation_identity_is_stable_and_random`
- **Dimension 2.3** — telemetry storage failure and malformed local state cannot print, throw through the command, or alter its exit status → Test `telemetry_failure_never_changes_command_result`
- **Dimension 2.4** — event serialization cannot contain command arguments, working directory, repository, branch, or environment values → Test `event_schema_rejects_private_context`

### §3 — Push consented records through the fleet boundary

After a local append, a background sender may process unsent records. It reads a cursor next to the JSONL file, builds a bounded batch, and writes a receipt containing destination, consent tier, payload hash, byte length, and attempted timestamp before fetch. Receipt failure blocks the send. A confirmed successful response advances the cursor atomically; timeout, rejection, or malformed response leaves it unchanged for retry. Telemetry work remains silent and detached from command completion.

- **Dimension 3.1** — off consent performs zero fetches and anonymous consent sends only allowlisted fields → Test `sync_is_consent_gated_and_schema_safe`
- **Dimension 3.2** — every fetch is preceded by a receipt for the exact payload bytes and receipt failure prevents fetch → Test `sync_receipts_exact_payload_before_send`
- **Dimension 3.3** — only confirmed success advances the cursor; network and response failures retry the same event identifiers → Test `sync_retries_without_losing_or_renaming_events`
- **Dimension 3.4** — the agentsfleet fleet endpoint is exercised through a deterministic fetch mock with no live network dependency → Test `sync_posts_expected_batch_to_mock_fleet_endpoint`

### §4 — Make collection legible and command behavior stable

CLI help and README state the default, tiers, storage location, transmitted fields, excluded fields, environment overrides, and disable route. Generated hooks declare hook invocation before executing `orly gate`. Existing command text and exit status remain unchanged apart from the one-time eligible consent question and the new help section.

- **Dimension 4.1** — generated hooks identify themselves and cannot reach the consent prompt → Test `generated_hooks_mark_telemetry_invocation`
- **Dimension 4.2** — help and README describe the same consent and privacy behavior the tests prove → Test `telemetry_help_names_tiers_storage_and_privacy`

## Interfaces

```text
Default state root:  ~/.config/agentsfleet/orly/
Override state root: <AGENTSFLEET_STATE_DIR>/orly/
Consent:    <state root>/.orly.json
Marker:     <state root>/.telemetry-prompted
Identity:   <state root>/installation-id
Events:     <state root>/analytics/orly-usage.jsonl
Cursor:     <state root>/analytics/.sync-state
Receipts:   <state root>/analytics/egress-receipts.jsonl

POST https://api.agentsfleet.net/fleets/telemetry
Request: JSON array of no more than 100 allowlisted telemetry events
Success: 2xx JSON response confirming the accepted event count
Failure: non-2xx, timeout, invalid response, or receipt refusal retains the cursor

Configuration: {"telemetry":"off|anonymous"}
Overrides: ORLY_TELEMETRY=off|anonymous; ORLY_TELEMETRY_OFF=1
```

The fleet endpoint is a client boundary in this repository. Tests replace fetch with a deterministic mock; deploying or changing the agentsfleet service is not part of this workstream.

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|------|-------|--------------------------------------------------------|
| Consent unavailable | Config, marker, or prompt cannot be read or written | Resolve to off, do not ask repeatedly, and preserve the command result |
| Local append unavailable | State directory or JSONL file is unwritable | Drop the event silently; no sender starts; command output and exit status stay unchanged |
| Receipt unavailable | Receipt cannot be durably appended before fetch | Refuse the send and retain the cursor |
| Fleet unavailable | Fetch times out, rejects, or returns non-success | Retain the cursor and retry on a later eligible run |
| Response ambiguous | Fleet returns success without the expected accepted count | Treat as failure and retain the cursor |
| Cursor unavailable | A successful send cannot persist the next offset | Re-send stable event identifiers later so ingestion can remain idempotent |
| Automation prompt | A hook or automated process reaches consent code | Invocation eligibility returns false before prompt access |

## Invariants

1. `off` performs no local event append and no network call — enforced by logger and sender entry guards plus zero-fetch tests.
2. Anonymous identity is random and never derived from hostname, username, repository, machine, or environment — enforced by the identity generator's closed input and tests.
3. Anonymous payloads contain only the closed event schema — enforced by event construction and payload-schema tests.
4. Every network attempt has a durable receipt for the exact bytes first — enforced by sender ordering and refusal tests.
5. Telemetry cannot print, throw through CLI dispatch, or change an `orly` exit code — enforced by the top-level best-effort boundary and subprocess tests.
6. Private context is absent by construction rather than redacted later — enforced by a closed event type and serialization tests.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|----------------|-------|------------|--------------------|---------------|------------|
| `command_run` | product | an anonymous CLI command finishes | command, gate, outcome, failed criterion, duration, version, operating system, architecture, invocation, session, random installation ID | closed schema; no paths, repositories, arguments, prompts, output, hostname, username, environment, or raw errors | `appends_one_valid_event_per_command` and `event_schema_rejects_private_context` |

The first funnel is installation → first gate → verify gate → PR gate, grouped by the random anonymous installation identifier. Review-specific events and a dashboard remain outside this workstream.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|-----------|------|------|---------------------------------------------|
| 1.1 | unit | `resolves_telemetry_consent_in_precedence_order` | conflicting config and environment inputs resolve hard-off first and unknown values to off |
| 1.2 | unit | `prompts_once_and_marks_aborted_prompt` | first eligible run writes the marker before input; later runs do not ask |
| 1.3 | unit | `automation_never_prompts_for_telemetry` | hook, CI, and non-interactive contexts make zero prompt calls |
| 2.1 | unit | `appends_one_valid_event_per_command` | fixed command result appends one parseable versioned event with controlled fields |
| 2.2 | unit | `anonymous_installation_identity_is_stable_and_random` | two anonymous events share a generated installation identity with no hostname, username, repository, machine, or environment input |
| 2.3 | end-to-end | `telemetry_failure_never_changes_command_result` | unwritable state leaves representative success and error subprocess exit codes unchanged |
| 2.4 | unit | `event_schema_rejects_private_context` | sentinel path, argument, repository, branch, and environment values are absent from serialized bytes |
| 3.1 | unit | `sync_is_consent_gated_and_schema_safe` | off yields zero fetches; anonymous payloads contain only the allowed schema |
| 3.2 | unit | `sync_receipts_exact_payload_before_send` | fetch observes an existing matching receipt; receipt rejection yields zero fetches |
| 3.3 | unit | `sync_retries_without_losing_or_renaming_events` | failure retains offset and stable event IDs; confirmed retry advances it once |
| 3.4 | integration | `sync_posts_expected_batch_to_mock_fleet_endpoint` | mocked agentsfleet URL receives one bounded JSON batch and returns an accepted count |
| 4.1 | integration | `generated_hooks_mark_telemetry_invocation` | installed pre-commit and pre-push scripts export hook origin before gate execution |
| 4.2 | end-to-end | `telemetry_help_names_tiers_storage_and_privacy` | CLI help names all tiers, the state root, collected fields, and excluded fields |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | Consent defaults off and never prompts automation (§1) | `bun test src/telemetry.test.ts --test-name-pattern 'consent|prompt|automation'` | exit 0 | P0 | |
| R2 | Local events are useful and contain no private context (§2) | `bun test src/telemetry.test.ts --test-name-pattern 'event|identity|private|command result'` | exit 0 | P0 | |
| R3 | Fleet sync is receipted, retryable, and tested only against a mock (§3) | `bun test src/telemetry.test.ts --test-name-pattern 'sync|receipt|fleet'` | exit 0 | P0 | |
| R4 | CLI and docs tell the same privacy story (§4) | `bun test src/cli.test.ts --test-name-pattern telemetry && rg -n 'off|anonymous|\.config/agentsfleet/orly|AGENTSFLEET_STATE_DIR' README.md` | exit 0 and both consent terms found | P0 | |
| R5 | Diff stays inside Files Changed | `git diff --name-only origin/main...HEAD` | 0 paths missing from the Files Changed table | P0 | |
| S1 | Conform gates green | `make audit` | exit 0 | P0 | |
| S2 | Unit tests pass | `bun test src` | exit 0 | P0 | |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 | |
| S4 | No oversize source file | `git diff --name-only origin/main...HEAD | grep -v '\.md$' | xargs wc -l 2>/dev/null | awk '$1>350 && $2!="total"'` | no output | P0 | |
| S5 | Orphan sweep | `git diff --diff-filter=D --name-only origin/main...HEAD` | no output | P0 | |

**Command source rule:** `make audit` and `bun test src` are copied verbatim from `.oracle/orly.json`; VERIFY grades only their actual output.

**Grading protocol:** Run each Verify command from the repository root. Every row must carry one decisive output line before CHORE(close). Any P0 failure returns to EXECUTE.

## Dead Code Sweep

N/A — no files, commands, flags, or public symbols are deleted or renamed.

## Out of Scope

- Deploying the agentsfleet fleet ingestion endpoint; this repository supplies and tests the client boundary only.
- Tracking code, prompts, arguments, paths, repository names, branch names, command output, environment values, or raw error messages.
- Authentication, human identity, fleet membership, or a customer-visible telemetry dashboard.
- Review-specific events, skill instrumentation, inactivity monitoring, or claims that a user is definitively stuck.
- A general analytics framework, plugin system, daemon, queue database, or new runtime dependency.

---

## Product Clarity (authoring record)

1. **Successful user moment** — a consenting user runs `orly gate verify`, sees unchanged gate output, and the next local event records the failed criterion for later aggregate diagnosis.
2. **Preserved user behaviour** — all commands, generated hooks, output, exit codes, installation files, and gate ordering work unchanged when telemetry is off or broken.
3. **Optimal-way check** — authenticated fleet analytics could identify people and repositories, but that would require accounts and more sensitive data. A consented pseudonymous command funnel is the direct useful slice.
4. **Rebuild-vs-iterate** — iterate at the CLI boundary. Command dispatch already owns outcomes, and generated hooks already pass through it.
5. **What we build** — one consent/logger module, one sender module, focused CLI and hook wiring, tests, help, README, and architecture text.
6. **What we do NOT build** — backend deployment, authentication, review instrumentation, a daemon, PostHog, or a dashboard.
7. **Fit with existing features** — events observe `init`, `update`, `doctor`, `gate`, and `override`; they must not alter materialisation or the PR boundary.
8. **Surface order** — CLI-first because `orly` is a CLI and the consent decision belongs where collection occurs.
9. **Dashboard restraint** — no dashboard ships until real consented event volume proves a useful funnel.
10. **Confused-user next step** — `orly --help` explains tiers, location, overrides, and how to disable collection.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Two source modules separate local consent/event ownership from off-machine retry ownership, with existing CLI and generated-hook boundaries providing the only wiring.
- **Alternative considered:** One telemetry file. Rejected because consent, filesystem persistence, cursor batching, receipts, and fetch cancellation would push one source beyond its single job and length ceiling.
- **Alternative considered:** A telemetry service or local database. Rejected because append-only JSONL plus one cursor fully serves the initial funnel.
- **Alternative considered:** Authenticate every event through agentsfleet. Rejected because it changes onboarding and collects human identity before aggregate usage proves the need.
- **Patch-vs-refactor verdict:** this is a focused extension. Existing command handlers and gates remain intact; telemetry observes their final result through one best-effort boundary.

## Discovery (consult log)

- **Consults** — Indy chose two consent states, `off` and `anonymous`; anonymous retains a random installation identifier so Orly can connect workflow steps without identifying a person, machine, or repository. Orly stores its `.orly.json` under the agentsfleet state directory and tests the agentsfleet fleet endpoint through a mock. Inspection of `~/Projects/agentsfleet/cli` corrected that shared root to `~/.config/agentsfleet` by default or `AGENTSFLEET_STATE_DIR` when set, and confirmed Orly must not reuse the sibling CLI's root-level `telemetry.json`. The authoring call keeps review events outside M05 to avoid over-engineering the first signal path.
- **Metrics review** — adds `command_run` and the installation-to-PR-gate funnel; `docs/ORLY_ARCHITECTURE.md` becomes the local analytics flow record.
- **Skill-chain outcomes** — `/orly-write-unit-test`, `/review`, and `orly-babysit-prs` remain to be populated during implementation.
- **Deferrals** — none.
