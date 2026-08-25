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

# M05_001: Opt-in usage telemetry reaches PostHog

**Prototype:** v1.0.0
**Milestone:** M05
**Workstream:** 001
**Date:** Aug 25, 2026
**Status:** DONE
**Priority:** P1 — without consented usage signals, installation and gate friction remain invisible
**Categories:** CLI, OBS
**Batch:** B1 — one telemetry path from command completion to a mocked PostHog capture boundary
**Branch:** `feat/m05-opt-in-telemetry`
**Test Baseline:** unit=128 integration=0
**Depends on:** none
**Provenance:** LLM-drafted (Amp, Aug 25, 2026) from Indy's gstack consent and storage direction
**Canonical architecture:** `docs/ORLY_ARCHITECTURE.md` §Topology, §Gates, and §Usage telemetry

---

## Overview

**Goal (testable):** A direct interactive `orly` run asks once whether to keep telemetry off or enable anonymous telemetry. Consented commands append privacy-bounded events to an outbound spool under `~/.config/agentsfleet/orly/` by default. Invocations retry against PostHog without changing command output or exit status. A fixed retention window and byte ceiling bound local storage.

**Problem:** `orly` cannot currently count installations, distinguish active installs from one-time setup, or see which gate criterion repeatedly stops a workflow. Adding a general analytics platform would create more machinery than the Command-Line Interface (CLI) needs, while prompting from generated hooks could block commits and agent automation.

**Solution summary:** Follow gstack's invocation-driven local spool with only two consent choices, but close its unbounded-file gap. Resolve the agentsfleet state root exactly like the sibling CLI (`AGENTSFLEET_STATE_DIR`, otherwise `~/.config/agentsfleet`). Store Orly's consent in the isolated `orly/.orly.json` child and ask once only during eligible direct interactive use. Anonymous commands append one controlled JSON Lines (JSONL) event with a random installation identifier. After an append, Orly launches a detached sync attempt. The sync exits when another attempt ran within five minutes; otherwise it posts at most 100 events to Orly's dedicated PostHog project with its public capture token. A successful response removes the acknowledged records. Events expire after seven days, and the spool drops its oldest records before exceeding 10 MiB. Off means no event is written and no network call is attempted.

## PR Intent & comprehension handshake

- **PR title (eventual):** `feat(cli): add opt-in usage telemetry`
- **Intent:** Learn where consented `orly` installations reach or stop without collecting repository content or making telemetry part of command correctness.
- **Handshake:** Before EXECUTE, restate the intent and list `ASSUMPTIONS I'M MAKING: …`. A mismatch stops execution.

## Implementing agent — read these first

1. `src/cli.ts` — owns command dispatch, outcomes, help, and exit status.
2. `src/install.ts` — owns generated hook invocation and can mark hook-originated commands without changing gate behavior.
3. `docs/ORLY_ARCHITECTURE.md` — defines the CLI, installation, and gate boundaries this signal follows.
4. gstack `bin/gstack-telemetry-log` and `bin/gstack-telemetry-sync` — prior art for consent gating, invocation-driven JSONL upload, five-minute attempt spacing, and the accumulation gap this work closes.
5. agentsfleet CLI `src/lib/config-dir.ts`, `src/services/telemetry/consent.ts`, and `src/services/telemetry/analytics.layer.ts` — source of truth for the shared state root and the PostHog transport pattern; Orly uses a dedicated PostHog project.

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `docs/v1/pending/M05_001_P1_CLI_OBS_OPT_IN_USAGE_TELEMETRY.md` | CREATE, then MOVE through lifecycle directories | Record intent, tests, and evidence |
| `src/telemetry.ts` | CREATE | Own consent, identity, event validation, and best-effort outbound spooling |
| `src/telemetry_sync.ts` | CREATE | Own attempt spacing, bounded PostHog upload, and spool compaction |
| `src/telemetry.test.ts` | CREATE | Prove consent, schema, privacy, failure isolation, retry, and retention behavior |
| `src/cli.ts` | EDIT | Time command runs, classify outcomes, prompt when eligible, append, and trigger sync |
| `src/cli.test.ts` | EDIT | Prove help text and command exit status stay stable |
| `src/install.ts` | EDIT | Mark generated-hook invocations so they never prompt |
| `src/install.test.ts` | EDIT | Prove generated hooks carry the invocation marker |
| `skills/orly-*/SKILL.md` | EDIT | Record allowlisted packaged-skill invocations through the same consented spool |
| `audits/logging.sh`, `audits/agents-md.md`, `dispatch/write_any.md` | EDIT | Close the Rust daemon logging coverage hole directly on this branch |
| `docs/LOGGING_STANDARD.md`, `docs/RULE_ENFORCEMENT.md` | EDIT | Bind Rust tracing and record deterministic versus judgment coverage |
| `evals/dispatch/run.sh`, `evals/dispatch/fixtures/log_*.rs` | EDIT, CREATE | Prove Rust logging acceptance, rejection, and test carve-outs |
| `package.json`, `.oracle/orly.json` | EDIT | Release the completed work as Orly 0.7.0 and keep the installed-rules version synchronized |
| `docs/ORLY_ARCHITECTURE.md` | ALREADY EDITED | Keep the telemetry flow recorded by the specification commit; add no implementation-stage documentation |

## Applicable Rules

- `docs/greptile-learnings/RULES.md` — RULE NDC removes unused telemetry paths, RULE NLR cleans touched ambiguity, RULE NLG extends the CLI in place without aliases, RULE UFS names event and consent values, RULE FLL keeps modules bounded, and RULE TST-NAM keeps tests behavior-shaped.
- `dispatch/write_ts_adhere_bun.md` §1, §2, §5, §8, §9, and §11 — choose narrow functions-modules, validate JSON boundaries, use Bun tests, keep one error style, and cancel network work.
- `dispatch/write_any.md` — File & Function Length, LOGGING, UFS, Error Registry, and Greptile gates apply to new source.
- `dispatch/edit_rules.md` — `src/**`, generated hooks, architecture, and CLI semantics require the governance audit and evidence path.
- `docs/DOCUMENTATION_RULES.md` — CLI help privacy claims must match the emitted and transmitted bytes.

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| SPEC TEMPLATE GATE | yes | `bash audits/spec-template.sh --staged` passes before spec commits |
| TS FILE SHAPE DECISION | yes | both new TypeScript files are functions-modules with no mutable domain object |
| File & Function Length | yes | keep consent/spooling and synchronization in two bounded files; helpers remain leaf-sized |
| LOGGING | yes | telemetry never uses console output; events use allowlisted fields and outcomes |
| UFS | yes | consent tiers, event names, commands, limits, and URL are named constants |
| ERROR REGISTRY | delegated | `make audit` decides whether this repository's registry applies; telemetry errors remain swallowed internally |
| Invariance Suite | yes | run `make audit`, the governance questionnaire, and generated evidence before push |
| Documentation | yes | CLI help describes exactly what persists and leaves the machine; no new README or architecture edit |

## Prior-Art / Reference Implementations

- **gstack logger and sender:** `bin/gstack-telemetry-log` and `bin/gstack-telemetry-sync` provide the consent gate, random installation identifier, invocation-driven JSONL upload, five-minute attempt spacing, and 100-event batches. Orly keeps one anonymous mode and adds retention plus compaction because gstack's acknowledged local records remain forever.
- **agentsfleet CLI state path:** `src/lib/config-dir.ts` in `~/Projects/agentsfleet/cli` resolves `AGENTSFLEET_STATE_DIR` first and otherwise uses `~/.config/agentsfleet`; its telemetry service owns root-level `telemetry.json`, so Orly uses an `orly/` child instead of sharing that file.
- **agentsfleet PostHog sender:** `src/services/config.ts` and `src/services/telemetry/analytics.layer.ts` demonstrate sending product events with a public capture-only token and no user authentication. Orly uses the same transport pattern but targets its dedicated PostHog project with an `orly_command_run` event name and a closed property set.
- **Existing CLI boundary:** `src/cli.ts` already converts every command to one numeric outcome; telemetry observes that result rather than changing handlers.
- **Existing test style:** `src/cli.test.ts` and `src/install.test.ts` use subprocess and temporary repository boundaries that preserve real CLI behavior while isolating the network mock.

## Sections (implementation slices)

### §1 — Ask once without interrupting automation — DONE

Consent has exactly two values: `off` and `anonymous`. Missing or malformed configuration resolves to off. On the first eligible direct interactive invocation, the marker is written before asking, so abort and prompt failure do not create a loop. Hooks, non-interactive processes, and Continuous Integration (CI) never prompt. Environment overrides can select a value for one process, and the hard-off override wins over every source.

The prompt must use this disclosure rather than a generic analytics question:

```text
Help improve Orly by sharing anonymous usage telemetry with PostHog?

If enabled, Orly records and sends only:
- command, gate, and packaged Orly skill names
- success, error, or abort outcome and the failed gate criterion
- duration, Orly version, operating system, CPU architecture, and invocation type
- timestamps and random event, session, and installation IDs
  (the installation ID persists so we can connect runs from the same Orly install)

Orly never collects or sends:
- source code, file contents, prompts, or command argument values
- file paths, working directory, repository names, or branch names
- environment variables, command output, or raw error messages
- name, email, username, hostname, account details, credentials, or tokens

Off — write and send no telemetry (default)
Anonymous — record and send only the fields listed above
```

The prompt does not hide collection details behind a documentation link. Help provides the configuration route, but the user sees the complete field boundary before choosing.

- **Dimension 1.1** — DONE — the consent resolver applies hard-off, process override, persisted setting, then default-off precedence → Test `resolves_telemetry_consent_in_precedence_order`
- **Dimension 1.2** — DONE — the one-time prompt persists the selected tier and marks attempted prompting even on abort; affirmative opt-in persists anonymous consent and a random identity without re-prompting → Tests `prompts_once_and_marks_aborted_prompt` and `anonymous_opt_in_persists_identity_and_does_not_reprompt`
- **Dimension 1.3** — DONE — hook, Continuous Integration (CI), and non-interactive invocation never prompt → Test `automation_never_prompts_for_telemetry`
- **Dimension 1.4** — DONE — the consent prompt names every collected field category, the persistent random installation identifier, every excluded private category, and the effect of both choices before accepting input → Test `consent_prompt_discloses_complete_collection_boundary`

### §2 — Spool one privacy-bounded event after a command or packaged skill invocation — DONE

After command completion, anonymous runs append one schema-versioned event to the outbound spool. Each packaged Orly skill makes a best-effort call at invocation start to the hidden, allowlisted `skill-event` ingestion route and uses the same spool. Allowed properties are event identifier, timestamp, command, optional gate, optional packaged skill name, outcome, optional failed criterion, duration, installed `orly` version, operating system, architecture, invocation kind, session identifier, and a random persistent installation identifier. No path, argument value, environment value, repository name, branch, prompt, command output, hostname, username, or raw error message enters the event.

- **Dimension 2.1** — DONE — successful and failed commands emit the allowlisted schema with a new session and event identifier; the real CLI records its selected gate and failed criterion → Tests `appends_one_valid_event_per_command` and `gate_command_records_its_selected_gate_and_failed_criterion`
- **Dimension 2.2** — DONE — anonymous events reuse a random locally persisted installation identifier that has no identifying inputs → Test `anonymous_installation_identity_is_stable_and_random`
- **Dimension 2.3** — DONE — telemetry storage failure, lock contention, and malformed local state cannot print, throw through the command, or alter its exit status → Tests `telemetry_failure_never_changes_command_result` and `spool_lock_drops_contention_without_losing_the_owner_write`
- **Dimension 2.4** — DONE — event serialization cannot contain command arguments, working directory, repository, branch, or environment values → Test `event_schema_rejects_private_context`
- **Dimension 2.5** — DONE — packaged skill invocations accept only the four shipped skill names and append to the command spool without prompting or blocking the skill → Tests `packaged_skill_uses_the_command_spool` and `skill_event_accepts_only_packaged_skills`

### §3 — Sync the outbound spool by invocation and bound local storage — DONE

After a local append, Orly launches a detached sync process and lets the command exit. The process exits without a fetch when the last-attempt marker is newer than five minutes. Otherwise it sends at most 100 records in one PostHog batch and records the attempt time. A successful PostHog response removes the exact acknowledged prefix atomically. Timeout or rejection leaves those records unchanged for a later invocation. Spool maintenance removes records older than seven days and drops the oldest records before the file exceeds 10 MiB. Orly runs no telemetry daemon.

- **Dimension 3.1** — DONE — off consent performs zero fetches and anonymous consent sends only allowlisted fields → Test `sync_is_consent_gated_and_schema_safe`
- **Dimension 3.2** — DONE — invocations attempt at most once per five minutes and send no more than 100 records → Test `sync_spaces_attempts_and_bounds_batches`
- **Dimension 3.3** — DONE — only confirmed success compacts acknowledged records; rejected fetches and unsuccessful responses retain the same event identifiers → Tests `sync_retries_without_losing_or_renaming_events` and `sync_retains_events_when_fetch_rejects`
- **Dimension 3.4** — DONE — retention and byte limits bound acknowledged and unsent records without live network access → Test `sync_compacts_and_bounds_local_spool`
- **Dimension 3.5** — DONE — skill records use the same batching and retry path but arrive in PostHog as `orly_skill_run` → Test `sync_names_skill_events_separately`

### §4 — Make collection legible and command behavior stable — DONE

CLI help repeats the prompt's default, choices, storage location, transmitted fields, excluded fields, environment overrides, and configuration route without adding a telemetry command. Generated hooks declare hook invocation before executing `orly gate`. Existing command text and exit status remain unchanged apart from the one-time eligible consent question and the new help section.

- **Dimension 4.1** — DONE — generated hooks identify themselves and cannot reach the consent prompt → Test `generated_hooks_mark_telemetry_invocation`
- **Dimension 4.2** — DONE — help describes the same consent and privacy behavior the tests prove → Test `telemetry_help_names_tiers_storage_and_privacy`
- **Dimension 4.3** — DONE — `skill-event` stays absent from help and accepts only packaged skill names, so it is an ingestion seam rather than a telemetry configuration command → Test `skill_event_accepts_only_packaged_skills`

## Interfaces

```text
Default state root:  ~/.config/agentsfleet/orly/
Override state root: <AGENTSFLEET_STATE_DIR>/orly/
Consent:    <state root>/.orly.json
Marker:     <state root>/.telemetry-prompted
Identity:   <state root>/installation-id
Events:     <state root>/analytics/orly-usage.jsonl
Last attempt: <state root>/analytics/.last-sync-time

POST https://us.i.posthog.com/batch
Request: PostHog batch of no more than 100 `orly_command_run` and `orly_skill_run` events using Orly's public project token
Success: 2xx response removes the exact sent prefix
Failure: non-2xx or timeout retains the same records for a later invocation
Attempt interval: at most once per five minutes; no daemon
Retention: seven days and 10 MiB maximum local event storage

Configuration: {"telemetry":"off|anonymous"}
Overrides: ORLY_TELEMETRY=off|anonymous; ORLY_TELEMETRY_OFF=1; ORLY_POSTHOG_HOST=<URL>; ORLY_POSTHOG_KEY=<PUBLIC_PROJECT_TOKEN>
```

The PostHog project token is public and capture-only. Tests replace fetch with a deterministic mock and make no live network request. A future Orly Insights Fleet may query PostHog with a private key; creating that Fleet is not part of this workstream.

## Failure Modes

| Mode | Cause | Handling (system response + what the caller observes) |
|------|-------|--------------------------------------------------------|
| Consent unavailable | Config, marker, or prompt cannot be read or written | Resolve to off, do not ask repeatedly, and preserve the command result |
| Local append unavailable | State directory or JSONL file is unwritable | Drop the event silently; no sender starts; command output and exit status stay unchanged |
| PostHog unavailable | Fetch times out, rejects, or returns non-success | Retain the same records and retry on a later eligible run |
| Sync launch unavailable | The detached process cannot start | Keep the event in the spool for a later invocation; preserve command behavior |
| Compaction unavailable | A successful send cannot replace the spool atomically | Keep stable event identifiers so PostHog can deduplicate a later retry by `$insert_id` |
| Spool at limit | Unsent records reach seven days or 10 MiB | Drop oldest records until both bounds hold; preserve command behavior |
| Automation prompt | A hook or automated process reaches consent code | Invocation eligibility returns false before prompt access |

## Invariants

1. `off` performs no local event append and no network call — enforced by spool and sender entry guards plus zero-fetch tests.
2. Anonymous identity is random and never derived from hostname, username, repository, machine, or environment — enforced by the identity generator's closed input and tests.
3. Anonymous payloads contain only the closed event schema — enforced by event construction and payload-schema tests.
4. Telemetry cannot print, throw through CLI dispatch, or change an `orly` exit code — enforced by the top-level best-effort boundary and subprocess tests.
5. Private context is absent by construction rather than redacted later — enforced by a closed event type and serialization tests.
6. Local telemetry storage is bounded by age and bytes — enforced before append and after acknowledged upload.
7. Sync attempts are invocation-driven and spaced by five minutes — enforced by the detached launch path and attempt-marker tests.

## Metrics & Observability

| Metric / event | Owner | Fires when | Properties allowed | Privacy guard | Test proof |
|----------------|-------|------------|--------------------|---------------|------------|
| `orly_command_run` | product | an anonymous CLI command finishes | command, gate, outcome, failed criterion, duration, version, operating system, architecture, invocation, session, random installation ID | closed schema; no paths, repositories, arguments, prompts, output, hostname, username, environment, or raw errors | `appends_one_valid_event_per_command` and `event_schema_rejects_private_context` |
| `orly_skill_run` | product | an opted-in installation invokes a packaged Orly skill | allowlisted skill name, outcome, version, operating system, architecture, invocation, session, random installation ID | four-name allowlist; same closed schema and spool as commands; best-effort invocation count only | `packaged_skill_uses_the_command_spool` and `sync_names_skill_events_separately` |

The first funnel is installation → first gate → verify gate → PR gate, grouped by the random anonymous installation identifier in PostHog. Skill invocation counts show which packaged workflows are reached. Skill completion claims, dashboards, and the Orly Insights Fleet remain outside this workstream.

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|-----------|------|------|---------------------------------------------|
| 1.1 | unit | `resolves_telemetry_consent_in_precedence_order` | conflicting config and environment inputs resolve hard-off first and unknown values to off |
| 1.2 | unit | `prompts_once_and_marks_aborted_prompt` | first eligible run writes the marker before input; later runs do not ask |
| 1.3 | unit | `automation_never_prompts_for_telemetry` | hook, CI, and non-interactive contexts make zero prompt calls |
| 1.4 | unit | `consent_prompt_discloses_complete_collection_boundary` | rendered prompt lists every allowed and prohibited category, explains the persistent random installation ID, labels off as default, and states that off writes and sends nothing |
| 2.1 | unit | `appends_one_valid_event_per_command` | fixed command result appends one parseable versioned event with controlled fields |
| 2.2 | unit | `anonymous_installation_identity_is_stable_and_random` | two anonymous events share a generated installation identity with no hostname, username, repository, machine, or environment input |
| 2.3 | end-to-end | `telemetry_failure_never_changes_command_result` | unwritable state leaves representative success and error subprocess exit codes unchanged |
| 2.4 | unit | `event_schema_rejects_private_context` | sentinel path, argument, repository, branch, and environment values are absent from serialized bytes |
| 2.5 | unit | `packaged_skill_uses_the_command_spool` | an allowlisted skill invocation appends one `command=skill` record to the existing spool and rejects an unknown skill in parsing |
| 2.5 | end-to-end | `skill_event_accepts_only_packaged_skills` | hidden CLI ingestion accepts a shipped skill silently and rejects an unknown name without exposing a help command |
| 3.1 | unit | `sync_is_consent_gated_and_schema_safe` | off yields zero fetches; anonymous payloads contain only the allowed schema |
| 3.2 | unit | `sync_spaces_attempts_and_bounds_batches` | two invocations within five minutes make one fetch; 101 records send only the first 100 |
| 3.3 | unit | `sync_retries_without_losing_or_renaming_events` | failure retains the same records and event IDs; confirmed retry removes the sent prefix once |
| 3.4 | unit | `sync_compacts_and_bounds_local_spool` | acknowledged records are removed; records older than seven days and bytes past 10 MiB are dropped oldest-first |
| 3.5 | unit | `sync_names_skill_events_separately` | a spooled skill record shares the batch sender and maps to `orly_skill_run` with the allowlisted skill property |
| 4.1 | integration | `generated_hooks_mark_telemetry_invocation` | installed pre-commit and pre-push scripts export hook origin before gate execution |
| 4.2 | end-to-end | `telemetry_help_names_tiers_storage_and_privacy` | CLI help names all tiers, the state root, collected fields, and excluded fields |
| 4.3 | end-to-end | `skill_event_accepts_only_packaged_skills` | hidden ingestion accepts the four-name allowlist, rejects other names, emits no output, and stays absent from help |

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | Consent defaults off and never prompts automation (§1) | `bun test src/telemetry.test.ts --test-name-pattern 'consent|prompt|automation|opt_in'` | exit 0 | P0 | PASS — 6 pass, 0 fail |
| R2 | Command and skill events are useful and contain no private context (§2) | `bun test src/telemetry.test.ts src/cli.test.ts --test-name-pattern 'event|identity|private|command_result|packaged_skill|gate_command|skill_event'` | exit 0 | P0 | PASS — 12 pass, 0 fail |
| R3 | PostHog sync is shared, invocation-driven, retryable, bounded, and tested only against a mock (§3) | `bun test src/telemetry.test.ts --test-name-pattern 'sync|PostHog|spool|skill events'` | exit 0 | P0 | PASS — 8 pass, 0 fail |
| R4 | CLI help tells the complete privacy story (§4) | `bun test src/cli.test.ts --test-name-pattern telemetry` | exit 0 | P0 | PASS — 2 pass, 0 fail |
| R5 | Diff stays inside Files Changed | `git diff --name-only origin/main` | 0 paths missing from the Files Changed table | P0 | PASS — every changed path maps to a declared row |
| S1 | Conform gates green | `make audit` | exit 0 | P0 | PASS — all checks passed |
| S2 | Unit tests pass | `bun test src` | exit 0 | P0 | PASS — 148 pass, 0 fail; baseline delta +20 |
| S3 | No secrets | `gitleaks detect` | exit 0 | P0 | PASS — no leaks found across 566 commits |
| S4 | No newly added oversize source file | `git diff --diff-filter=A --name-only origin/main | grep -v '\.md$' | xargs wc -l 2>/dev/null | awk '$1>350 && $2!="total"'` | no output | P0 | PASS — no output; `src/telemetry.ts` is exactly 350 lines |
| S5 | Orphan sweep | `git diff --diff-filter=D --name-only origin/main` | no output | P0 | PASS — no deleted path |

**Command source rule:** `make audit` and `bun test src` are copied verbatim from `.oracle/orly.json`; VERIFY grades only their actual output.

**Grading protocol:** Run each Verify command from the repository root. Every row must carry one decisive output line before CHORE(close). Any P0 failure returns to EXECUTE.

## Dead Code Sweep

N/A — no files, commands, flags, or public symbols are deleted or renamed.

## Out of Scope

- Creating a first-party telemetry endpoint or database in agentsfleet.
- Tracking code, prompts, arguments, paths, repository names, branch names, command output, environment values, or raw error messages.
- Authentication, human identity, fleet membership, an Orly Insights Fleet, or a customer-visible telemetry dashboard.
- Skill completion or failure claims, review-specific events, inactivity monitoring, or claims that a user is definitively stuck.
- A general analytics framework, plugin system, daemon, queue database, or new runtime dependency.

---

## Product Clarity (authoring record)

1. **Successful user moment** — a consenting user runs `orly gate verify`, sees unchanged gate output, and the outbound spool records the failed criterion for later aggregate diagnosis.
2. **Preserved user behaviour** — all commands, generated hooks, output, exit codes, installation files, and gate ordering work unchanged when telemetry is off or broken.
3. **Optimal-way check** — PostHog already accepts public capture-only product events and supplies funnel analysis. A first-party endpoint and database would duplicate that machinery before traffic justifies it.
4. **Rebuild-vs-iterate** — iterate at the CLI boundary. Command dispatch already owns outcomes, and generated hooks already pass through it.
5. **What we build** — one consent/logger module, one sender module, focused CLI and hook wiring, tests, and help text.
6. **What we do NOT build** — backend deployment, authentication, review instrumentation, a daemon, an Insights Fleet, or a dashboard.
7. **Fit with existing features** — events observe `init`, `update`, `doctor`, `gate`, and `override`; they must not alter materialisation or the PR boundary.
8. **Surface order** — CLI-first because `orly` is a CLI and the consent decision belongs where collection occurs.
9. **Dashboard restraint** — no dashboard ships until real consented event volume proves a useful funnel.
10. **Confused-user next step** — the consent prompt itself explains the complete collection boundary; `orly --help` repeats the choices, location, overrides, and disable route.

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** Two source modules separate local consent/spool ownership from invocation-driven PostHog upload and compaction, with existing CLI and generated-hook boundaries providing the only wiring.
- **Alternative considered:** One telemetry file. Rejected because consent, filesystem storage, spool compaction, attempt spacing, and fetch cancellation would push one source beyond its single job and length ceiling.
- **Alternative considered:** A telemetry service or local database. Rejected because a bounded outbound JSONL spool plus atomic prefix compaction serves the initial funnel.
- **Alternative considered:** Authenticate every event through agentsfleet. Rejected because it changes onboarding and collects human identity before aggregate usage proves the need.
- **Alternative considered:** Send every event to a dedicated Fleet. Rejected because a public package cannot protect a Fleet webhook secret, each event would create agent work, and event history would grow with command volume. A later Insights Fleet can query closed PostHog windows with a private key.
- **Patch-vs-refactor verdict:** this is a focused extension. Existing command handlers and gates remain intact; telemetry observes their final result through one best-effort boundary.

## Discovery (consult log)

- **Consults** — Indy chose two consent states, `off` and `anonymous`; anonymous retains a random installation identifier so Orly can connect workflow steps without identifying a person, machine, or repository. Fleet review found that direct Fleet ingress would expose a credential or require an unauthenticated model-execution path. Indy selected PostHog because telemetry is high priority and a new backend would consume time without improving the first funnel. He then selected gstack's invocation-driven outbound spool over direct command-end capture. Inspection of `~/Projects/agentsfleet/cli` confirmed the shared state root and the public capture-token transport pattern. Indy created a dedicated US-region Orly PostHog project as the event destination. Orly adds seven-day and 10 MiB bounds because gstack's cursor leaves local and remote records accumulating forever.
- **Metrics review** — adds `orly_command_run`, `orly_skill_run`, the installation-to-PR-gate funnel, and allowlisted packaged-skill invocation counts; `docs/ORLY_ARCHITECTURE.md` becomes the local analytics flow record.
- **Implementation scope decision** — Indy chose no user-facing telemetry configuration command and no new README or architecture edit. Persisted consent changes through `.orly.json`; CLI help explains the file and process-only environment overrides. Packaged skills call a hidden allowlisted ingestion seam and share the command spool.
- **Skill-chain outcomes** — unit coverage review found the affirmative-consent and real-command gaps; both landed with lock-contention, rejected-fetch, and all-skill parity tests. The pre-landing review caught and fixed Bun's unbound `crypto.randomUUID` failure. `make install-evals` supplied the repository's 23-test integration lane. Post-push `orly-babysit-prs` remains a Pull Request (PR) operation and will be recorded there.
- **Follow-ups** — none; Indy redirected the Rust logging gap from a pending specification into this branch as a direct rules-and-audit fix.
