# Milestone Specification Template

Two agents use this file. The authoring agent copies everything below the "Spec Body" heading into a new spec and fills it, following the `orly-spec-new` skill.

The implementing agent reads the filled spec from top to bottom. The body follows the order that agent needs: understand, prepare, build, prove and record.

`orly gate pr` checks a filled spec. `audits/spec-template.ts` checks its sections, leftover authoring markup and rubric commands; the `spec.*` criteria check status, baselines, deferrals and named tests.

Lifecycle stages and their timing live in `dispatch/lifecycle.md`. Current rules win over any older filled spec used as an example.

---

## Fill grammar

Three kinds of markup appear below the "Spec Body" heading.

| Marker | Meaning | Fate in the filled spec |
|---|---|---|
| `{{fill:description}}` | Authoring slot. Replace it with instance content; a slot that lists options, such as `{{fill:P0 \| P1}}`, means choose one. | Removed before staging. Runtime parameters such as `/items/{id}` stay when the spec defines them. |
| `<!-- tpl: … -->` | Guidance for the authoring agent. | Deleted after filling; the gate rejects any that remain. |
| SPEC AUTHORING RULES banner | Standing constraints for this spec. | The only comment that stays, unchanged. |

Every `##` section below the "Spec Body" heading is required and must not be empty. The gate finds sections by their heading's opening words, so keep each heading as written. A section that does not apply uses the N/A form its guidance gives.

The gates read the fields below mechanically. Write them exactly as shown.

| Field | Exact form | Checked by |
|---|---|---|
| `**Status:**` | `PENDING`, `IN_PROGRESS`, `DONE` or `DEFERRED`, nothing else. | `spec.moved` treats `DONE` as closed. |
| Dimension | `` - **Dimension 1.1** — <behaviour> → Test `<name>` ``. When complete, `DONE —` follows the first dash: `` - **Dimension 1.1** — DONE — <behaviour> → Test `<name>` ``. | `spec.dimensions`, `spec.gate` |
| Test name | Equals the Test cell of the Dimension's Test Specification row. Once the Dimension is DONE, a tracked test source names it: a `*.test.*`, `*.spec.*` or `*_test.*` file, `test_*.py`, a `tests/`, `test/` or `__tests__/` directory, or a Rust or Zig source. Rows of tier `manual` are exempt. | `spec.gate`, `spec.tests` |
| `**Baseline revision:**` | The full 40- or 64-character comparison commit. | `spec.baseline` |
| `**Test Baseline:**` | `unit=<n> integration=<n>`, one token per declared lane, or `n/a — <reason>`. | `spec.baseline` |
| `**Baseline evidence:**` | Only an existing repository path or an `https://` URL. | `spec.baseline` |
| Owner quote | A top-level blockquote in Discovery: `> Owner (<name>, <MMM DD, YYYY HH:MM>): "<quote>" — context: <item, why>`. The quote names each item it covers, such as `Dimension 2.1` or `R3`. The older `> Indy (…)` form is still accepted. | `spec.deferrals` |
| Rubric command | Each declared `conform` and `verify.*` command, its arguments joined by spaces, in backticks in a Verify cell, with an Expected value. | `spec.gate` |
| Read-first item | A numbered item that starts with a backticked existing repository path or a bare `https://` URL. | `spec.gate` |
| Open question | A literal `[?]` anywhere blocks the gate until it is resolved. | `spec.open-questions` |

## What a spec pins

A milestone spec is the rulebook the implementing agent plans and ships from, without repeated architecture questions. It pins intent, invariants, enforcement mechanisms, tests and source pointers. Leave routine variable names, imports and code layout to repository conventions.

Pin a detail when changing it could invalidate a proof. Such details include client and server versions, identity scope, uniqueness and null semantics, privilege boundaries, release ordering, failure behaviour and measured resource budgets.

Record the source revision behind each pinned detail and the proofs that must rerun when it changes. The dependency manifest stays the source of truth, and a compatibility claim names the manifest it checked.

> **Mechanism litmus.** Could an implementer follow this sentence and still violate the invariant? “Preserve single use” is incomplete without the state authority, guarded transition, commit-before-release boundary and failover assumption. Name those; omit a line-by-line implementation. A bounded prototype may choose a performance parameter, but an unchosen security mitigation is not implementation-ready.

## Anti-patterns (reject on sight)

| # | Anti-pattern | Do instead |
|---|---|---|
| 1 | Implementation listings inside section bodies | State the mechanism and behavioural proof. Keep code to necessary interface examples, reproducible evidence commands or a referenced diagnostic. |
| 2 | Listing every variable name | Point at an existing implementation to mirror; names match local style. |
| 3 | SQL data definition (DDL) statements line by line | Pin identity, null/deletion semantics, atomic effects and grants; use new migrations according to the repository's current migration policy. |
| 4 | Assuming a client supports a server feature | Verify both sides at named revisions; pin the compatibility baseline and required reruns, including managed-service differences. |
| 5 | Circular Section dependencies | Declare an acyclic prerequisite order; pin commit, release, migration and deployment ordering when correctness depends on it. |
| 6 | Test code in the spec | Name tests and assert behaviour in prose; the implementing agent writes them in project style. |
| 7 | One rubric row per Dimension, or pasted evidence walls | Rows for outcomes, failure classes and repository checks; Graded holds ✅ or ❌ and one decisive output line. The Test Specification is the per-Dimension ledger. |
| 8 | Template guidance surviving in the filled spec | Delete every `tpl:` comment; the implementing agent reads instance content only. |

Use source pointers to avoid duplicating code, but do not delegate a missing safety mechanism to the implementer's imagination.

## Implementation readiness review

Before finalizing a spec, attack the proposed design with every row whose surface the change touches. Record the results in the existing Sections, Failure Modes, Invariants, Tests, Files Changed and Discovery. Do not copy this table into a spec or create another scoring surface.

| Surface | What the author must resolve |
|---|---|
| Outcome and value | Name the affected user, the observable problem and the result that makes the work useful. Support the problem with inspected or observed evidence; distinguish a worthwhile outcome from readiness to implement it. |
| Real execution path | Trace actual producers, readers, side effects, backgrounds and cleanup from the current supported entry point. Separate an implemented caller from a comment, fixture or proposed feature; a fixture or historical runbook does not establish the current setup path. State the starting condition (first installation, existing system or rebuild) and select its supported runbook; summarize prerequisite outputs before dependent actions. Verify critical claims regardless of who wrote the review. |
| Performance and scope | Budget the whole request path: round trips, fan-out, concurrency, memory, backlog and cost. Prefer the existing layout unless measurements require batching or another subsystem. Name each comparison reference and prove workload equivalence; keep planning inputs apart from measured thresholds. |
| Evidence and proof tier | Bind raw output to revision, environment, parameters, resources and run identity; include lockfile/resolved production dependency closure for bench-only baselines. Check the delivered user result, including a plausible incorrect result the check must reject. Label inherited evidence with its source and environment; keep new and inherited proof counts consistent across goal, Sections and rubric. Distinguish inspected, proposed, NOT RUN and observed results. Unit stubs do not prove deployments; local tests do not prove a deployed service. |
| Decisions and prerequisites | Record agent defaults, measured outputs and required user decisions separately. For each required input, permission, credential or dependency, name its source or executable resolution step and what it unlocks. Put human actions and readiness checks before dependent actions. Attribute only real quotes and explicit overrides; do not infer risk acceptance from reviewer advice. Name the first executable slice and the boundary each unresolved prerequisite blocks. |

<!-- oracle-packs:start domain.sql, product.agentsfleet -->

Repositories with `.sql` files or the `product.agentsfleet` pack also resolve these rows.

| Surface | What the author must resolve |
|---|---|
| Safety and authority | Name one authority per invariant, the guarded state change, commit/release point and retry behavior. Attack lost replies, concurrent calls, owner failover and snapshot rollback separately; an acknowledgment is not automatically durable failover proof. Preserve intentional idempotent response retries. |
| Identity and history | State identity scope across tenants/streams, ordering and cursor tie-breaks, nulls, deletion and expiry. Trace all conflict writers and downstream consumers such as billing enforcement. Separate pre-existing defects from new risks; name irrecoverable history and a bounded disposition instead of an impossible backfill. |
| Schema and privileges | Follow the current shipped-migration policy. For populated changes, cover fresh bootstrap, incremental upgrade, interrupted rerun and old/new build compatibility. Test successful operations under the actual role, including SELECT needed by UPDATE, as well as forbidden writes. |
| Client, server and platform | Check pinned client routing/reconnect/push behavior against the server and managed service. Probe advertised nodes, TLS, required commands and real access-control-list grants. Local source inspection and successful seed connection are not managed-service evidence. |
| Deployment and recovery | Identify the actual deployment graph, secret staging, writer fence, restart/autostart paths, import authorization and empty/nonempty deploy shape. Prove pre-mutation refusal, abort/forward recovery and later ordinary deploys; inventory ephemeral auth and provider deliveries during the fence too. |
| Stateful performance | Add transaction and commit rate, connection pools, write-ahead log growth and drain time to the request-path budget. Prefer the existing layout unless measurements require partitioning. |

<!-- oracle-packs:end -->

After editing, run a separate adversarial pass. Search for stale requirements and circular dependencies, then try to violate each critical invariant while obeying the text. Record each remaining blocker in Discovery with its boundary and the action that resolves it.

Boundaries are start, dependent integration, load and rollout. Document checks do not prove runtime readiness, and a structural pass does not prove production wiring or meaningful tests.

Model reviews, such as `orly judge`, give advice only; a model score proves neither completion nor delivery. `orly judge` keeps its own replay records, which hold no source text or credentials (`docs/JUDGMENTS.md`). For every model review, Discovery records the model and version, finding counts and dispositions, and no record keeps the supplied text.

Send repository content to an outside model only with the owner's approval. Redact secrets and private data from supplied material and from every retained field. A linked file counts as supplied evidence only when its relevant content is included.

## Hierarchy & terminology

```
v<P>.0.0 (Prototype)                  major release; <P> names the docs/v<P>/ tree
└── Milestone (M40, M41…)             one demoable end-to-end capability + evidence
    └── Workstream (M40_001…)         one working function; ≤4 per milestone (a 5th
        │                             only for a cross-cutting concern)
        └── Section (§1, §2…)         implementation slice (what + why); 3–9 per spec
            └── Dimension (3.1, 3.2…) verifiable sub-unit; the unit of DONE
```

A **Dimension** is the smallest verifiable unit. Each Dimension maps to one test and is marked `DONE` in the same commit as its code. A Section is done when all its Dimensions are, and the Acceptance Rubric grades outcomes, never single Dimensions.

A **Batch** (B1, B2) groups Workstreams that run in parallel. Batches run in order: B2 starts after every B1 Workstream passes its gates.

A milestone is not complete until evidence is captured: commands, logs, screenshots, or a recorded walkthrough.

## Status markers

- `PENDING`: not started. `IN_PROGRESS`: being worked. `DONE`: complete, verified and tested.
- `DEFERRED`: designed or attempted and explicitly not shipped. The spec moves to `done/` as a record, and Discovery records the reason and the conditions for reopening it. A parked spec differs: it stays `IN_PROGRESS` in `active/`.
- These markers apply to the spec's `**Status:**` header. A Dimension is pending until it is marked `DONE`; ✅ is not a Dimension status.

## Prohibited (gate-enforced — `dispatch/write_spec.md`)

- No time/effort estimates ("5 min", "1 hour", "2 days"). No effort columns or complexity ratings. No percentage-complete. No assigned owners. No implementation dates.
- Sizing signal is **Priority** (P0/P1/P2/P3); sequencing is **Dependencies**.

## Guardrails

- **Length:** at most 500 lines once the `tpl:` comments are deleted. A spec that passes 500 lines before its Acceptance Rubric holds two specs, so split it.
- **Sections:** 3 to 9 per spec. **Workstreams:** at most 4 per milestone, plus a 5th only for a cross-cutting concern.
- **File naming:** `docs/v<P>/<stage>/M<N>_<WS>_P<priority>_<CATEGORIES>_<NAME>.md`, for example `docs/v2/pending/M40_001_P0_API_WORKER_SUBSTRATE.md`. `<P>` is the Prototype's major version and `<N>` the Milestone number; they are independent. `<stage>` is `pending`, `active` or `done`.
- **NAME:** upper snake case, at most six words, naming the outcome rather than the task.
- **Categories:** one or more codes from this table, alphabetised. Join them with `_` in the file name and with `, ` in the `**Categories:**` header.

| Code | Covers |
|---|---|
| `API` | Server endpoints and service interfaces |
| `CLI` | Command-line tools |
| `DOCS` | Documentation pages |
| `GOV` | Rules, gates, hooks and the operating model |
| `INFRA` | Build, deployment and infrastructure |
| `OBS` | Logging, metrics, tracing and dashboards |
| `SKILL` | Agent skill files |
| `UI` | User interfaces |

---

# Spec Body — Copy Everything Below This Line

<!--
SPEC AUTHORING RULES (load-bearing; the one comment that survives):
- Body order is the implementing agent's read order. Fill it with the
  orly-spec-new skill, then delete every "tpl:" guidance comment. The SPEC
  TEMPLATE GATE blocks tpl comments, unfilled fill slots and missing required
  sections (audits/spec-template.ts, run by orly gate pr and by
  audits/spec-template.sh).
- No time or effort estimates anywhere: no effort columns, complexity ratings,
  percentage complete, implementation dates or assigned owners.
- Priority (P0/P1/P2/P3) is the only sizing signal; Depends on is the only
  sequencing signal. A section that contradicts these rules loses; delete it.
-->

# M{{fill:Milestone}}_{{fill:Workstream}}: {{fill:Title — testable, not vague}}

**Prototype:** v{{fill:major}}.{{fill:minor}}.{{fill:patch}}

**Milestone:** M{{fill:Number}}

**Workstream:** {{fill:001 to 005}}

**Date:** {{fill:MMM DD, YYYY}}

**Status:** PENDING

**Priority:** {{fill:P0 | P1 | P2 | P3}}, {{fill:one-line reason}}

**Categories:** {{fill:codes from the Categories table, alphabetised and comma-separated}}

**Batch:** B{{fill:1 to 4}}, {{fill:parallel group context}}

**Branch:** pending, set at CHORE(open)

**Baseline revision:** pending, set to the full comparison commit at CHORE(open)

**Test Baseline:** pending, measured before the Pull Request

**Baseline evidence:** pending, set to a report path or run URL before the Pull Request

**Depends on:** {{fill:spec identifiers with one-line reasons, or none}}

**Provenance:** {{fill:human-written | LLM-drafted (model, date) | agent-generated (pre-spec, source doc)}}

**Canonical architecture:** {{fill:`docs/architecture/<doc>.md` §N, or none with the reason}}

<!-- tpl: Provenance records origin, not proof; LLM-drafted means drafted by a
large language model. Cross-check correctness-critical claims against the
actual caller, schema and pinned dependencies regardless of author.
Distinguish source-verified behaviour, proposed mechanisms and observed
runtime results. Canonical architecture names the docs/architecture/ section
that owns the detailed mechanism, or "none" with the reason when no page
covers it; keep spec defaults and acceptance tests consistent with it. A
deliberately folded workstream adds a Folded-into header (dispatch/lifecycle.md).
Status, Branch and the three Baseline headers change only through the lifecycle
stages; their exact forms are in the template's gate-parsed field table. -->

---

## Overview

**Goal (testable):** {{fill:one sentence that could be a test name}}

**Problem:** {{fill:observable symptoms, in user-facing terms}}

**Solution summary:** {{fill:one paragraph: what changes, at what layer, and the user-visible outcome}}

**Design flow:** {{fill:ordered flow of the components and data this change adds or alters, or "unchanged" with the architecture section it matches}}

<!-- tpl: State who benefits and what observed problem this outcome resolves;
do not invent evidence of demand or treat implementation readiness as value.
Goal: bad "Implement streaming." Good: "Server-Sent Events (SSE) handler
streams Redis pubsub messages as text/event-stream with stable ordering and
reconnection, p95 latency under 200ms." Problem: symptoms ("operators can't
see the agent's tool calls in real time"), never implementation language ("we
don't have a foo handler"). Design flow: a short numbered list or ASCII flow
of components, data and control in order, and where it meets existing
systems; a reader given only this spec must be able to follow it.
Implementation steps belong in Sections, not here. -->

## PR Intent & comprehension handshake

- **PR title (eventual):** {{fill:imperative title of at most 72 characters for the merged Pull Request (PR)}}
- **Intent (one sentence):** {{fill:why this PR exists, in user-facing-outcome terms}}
- **Authoring handshake:** {{fill:the author's restatement of the requester's intent, then ASSUMPTIONS I'M MAKING: …}}
- **Implementer handshake:** recorded in the Pull Request Session Notes at PLAN, before any edit. A restatement that differs from the Intent stops the work until the two are reconciled.

## Implementing agent — read these first

1. `{{fill:path/to/file.ext}}` — {{fill:why this is the right pattern to mirror}}
2. `{{fill:path/to/spec_or_doc.md}}` — {{fill:what canonical knowledge lives there}}
3. {{fill:external doc URL, if relevant}} — {{fill:what convention to follow}}

<!-- tpl: Prefer 3–5 useful pointers; include enough to resolve the existing
implementation and governing requirements. This is where judgment is
preserved without pseudocode: point at code/docs to read BEFORE touching any
file. Greenfield (no existing pattern)? Say so explicitly and point at the
docs/architecture/ doc that defines the shape. Every pointer must resolve
in THIS repository (`test -f` each) or be a URL; a pack this repository
never selected materialised nothing here. Each item starts with a backticked
path or a bare https:// URL; a Markdown [text](url) link is not read, and
files this spec creates belong in Files Changed instead. State
correctness-critical requirements briefly in the relevant spec section as
well as citing their source; a reader or model given only the spec cannot
inspect the linked file's contents. -->

## Files Changed (blast radius)

| File | Action | Why |
|------|--------|-----|
| `{{fill:path}}` | {{fill:CREATE \| EDIT \| DELETE}} | {{fill:one line on how this file's role changes}} |

<!-- tpl: Every file created, modified, or deleted, including this spec, its
move to done/, the changelog entry and any docs/architecture/ page the close
updates. Scopes the length gates, orphan sweeps, and review effort; per
AGENTS.md the implementing agent may only edit files in this table without
explicit override. List FILES and ROLES, never line numbers or function names
(they drift). Teardown/rename/flip specs open with a blast-radius grep first:
git grep -rn -w '<token>' from repo root, no path filter (dispatch/write_spec.md,
Authoring discipline). Include all real writers/readers, schema registration,
role grants, recovery tools, fixtures, deployment/secret references and
protocol docs affected by the chosen mechanism. Distinguish source references
from files to edit; do not schedule edits to frozen migration history. Expand
planned file scopes before implementation. -->

## Applicable Rules

- **`docs/greptile-learnings/RULES.md`** — {{fill:specific rule IDs this diff trips: e.g. UFS, NDC, NLR, ORP, FLL}}
- {{fill:per-surface rule file}} — {{fill:why it applies to this diff}}

<!-- tpl: The rule files the implementing agent re-reads before implementation
and re-checks during VERIFY. Name the exact rule IDs the diff will trip;
generic "follow RULES.md" earns a review finding, while named IDs give the
implementing agent exact rules to check. Per-surface menu = the dispatch table
in THIS repository's generated AGENTS.md plus the docs/ rule files those
façades cite, all materialised locally by the selected packs; a rule file
absent from this repository is not applicable by definition. Fully greenfield:
write "Standard set only: docs/greptile-learnings/RULES.md; no other rule files
apply." -->

## Applicable Gates

| Gate | Fires? | Satisfaction strategy |
|------|--------|-----------------------|
| {{fill:gate from this repository's AGENTS.md dispatch index}} | {{fill:yes/no — why}} | {{fill:how the diff stays clean}} |
| File & Function Length (file ≤350 lines, function ≤50, method ≤70) | {{fill:yes/no}} | {{fill:split plan if a file approaches the cap}} |

<!-- tpl: Which Action-Triggered Guards this Pull Request (PR) WILL trip, and
how each stays clean, pre-declared so the agent plans for them instead of
stalling mid-implementation. The menu is THIS repository's generated AGENTS.md
dispatch index: one row per materialised gate the diff can trip; never cite a
gate from a pack this repository lacks. Rules ≠ Gates: rules are knowledge to
read; gates are guards that fire on edits. Touch nothing a gate watches:
replace the table with "N/A: docs/markdown only." -->

## Prior-Art / Reference Implementations

- **Reference:** {{fill:path / codebase}} — {{fill:one line on alignment, or the justified divergence}}

<!-- tpl: Before proposing architecture, find a reference implementation and
name it, so the implementing agent mirrors a known-good pattern instead of
inventing one. Command-line interface (CLI) work: state which of these six
practices the design follows and any divergence: command, handler and error
layers kept separate; handlers free of console output and process exit; output
rendered by one layer (human text, JSON or environment form); structured JSON
errors with suggestion and retry fields; tests at three tiers (handler unit,
in-process integration, subprocess end-to-end); JSON output by default when
stdout is not a terminal. API work: docs/REST_API_DESIGN_GUIDELINES.md and the
closest existing handler. Schema work: the nearest migration and
docs/SCHEMA_CONVENTIONS.md. UI work: design-system primitives and theme
tokens. Cite each doc only where this repository has it. No prior art: say so
and point at the docs/architecture/ page that defines the shape. -->

## Sections (implementation slices)

### §1 — {{fill:Slice title}}

{{fill:what this slice delivers, why it exists, and what it unblocks}}. Non-obvious choice → **Implementation default:** `{{fill:choice}}` because `{{fill:reason}}`.

- **Dimension 1.1** — {{fill:smallest verifiable behaviour}} → Test `{{fill:test_name}}`
- **Dimension 1.2** — {{fill:…}} → Test `{{fill:test_name}}`

### §2 — {{fill:Slice title}}

{{fill:Same shape.}}

<!-- tpl: Copy the §1 shape for every Section; a spec has 3 to 9. State
prerequisites and who resolves each decision: agent choice, measured
preparation output, or required human decision. A preparation Section may
establish budgets or fixtures needed by later Sections; name its completion
condition and what missing evidence blocks; prerequisites must be acyclic.
For required inputs, credentials, permissions and connections, name the actual
source or the action that resolves them before use; never include secret
values. Distinguish configuration accepted, setup pending, runtime active and
the final user result where those are separate states. Preserve required human
actions. Pin release and version inputs to the selected revision and say when
to recheck them. Each Section names the delivered behaviour, required
mechanism and proof, without coding recipes. For prototypes, name setup,
fault, pass/fail evidence and the selected safe design or bounded decision
rule before dependent integration. Do not leave a security invariant as
"prototype, then find a mitigation". Dimension lines use the exact form in the
template's gate-parsed field table and are marked DONE with their code. The
implementing agent follows each Implementation default unless evidence
requires an amended design. Good: "§3 Retry-safe import. Each record carries
its source identity; a rerun after a crash skips records already committed.
Dimensions prove a crash midway and a duplicate submission." Bad: "add a
dedupe key" with no rule for what a crash leaves behind. -->

## Interfaces

```
{{fill:HTTP endpoints, request/response shapes, internal signatures other code depends on}}
```

<!-- tpl: Lock the interface: the surface the implementing agent must NOT change
without amending the spec. Specify input/output/error shapes; use a real
example payload where shape isn't self-evident. Write the interface, not the
implementation. No interface change: replace the block with "N/A: no interface
changes." -->

## Failure Modes

| Mode | Kind | Cause | Handling (system response + what the caller observes) | Test |
|------|------|-------|--------------------------------------------------------|------|
| {{fill:short name}} | {{fill:failure \| security \| capacity}} | {{fill:trigger}} | {{fill:response + observable}} | `{{fill:test_name}}` |

<!-- tpl: Every failure path the implementing agent must handle, plus security
implications and capacity limits (Kind security or capacity), each with the
test that proves its handling. Cover at minimum: timeout, malformed input,
auth failure, network blip, race, replay, exceeded quota and dependency
unavailable where applicable. Distinguish timeout from rollback and
acknowledgment from durable recovery. State which protected response or side
effect stays closed on uncertainty; name recovery instead of promising to
resolve it later. For partial setup or delivery, state what is retained,
which action resumes it, how a retry avoids duplicate effects and which
dependent action stays blocked. A known limit with no mitigation in this spec
needs an owner disposition in Discovery. -->

## Invariants

1. {{fill:Invariant}} — {{fill:how it's enforced}}

<!-- tpl: Each MUST be enforceable by code (compiler, lint, compile-time
assertion, runtime check), never by review discipline. Name the authority,
enforcement mechanism and failure assumptions. Test the shortest
counterexample across the commit and release boundary. An operator procedure
is an operational prerequisite, not a runtime guard. None: write "N/A: no
invariants." -->

## Metrics & Observability

| Metric / event | Audience | Fires when | Properties allowed | Privacy guard | Test proof |
|----------------|----------|------------|--------------------|---------------|------------|
| `{{fill:event_name}}` | {{fill:product \| operator}} | {{fill:exact user or system action}} | {{fill:coarse product context, resource id, duration, outcome}} | {{fill:no raw email, password, token, One-Time Password (OTP) or Secure Shell (SSH) key material}} | `{{fill:test_name}}` |

<!-- tpl: Declare what product or operator signal this spec adds, renames or
leaves unchanged. No signal changes: replace the table with one sentence,
"Not applicable: no product or operator signal changes." If the repository
documents an analytics design or funnel playbook, follow it and update the
playbook in the same Pull Request when a funnel changes; otherwise Discovery
records why no update is needed. The implementing agent revisits this table
after implementation and during review; a missing event is an implementation
gap, not a note for later. -->

## Test Specification (tiered)

| Dimension | Tier | Test | Asserts (concrete inputs → expected output) |
|-----------|------|------|---------------------------------------------|
| 1.1 | {{fill:unit \| integration \| e2e \| manual}} | `{{fill:test_name}}` | {{fill:one-line behavioural claim}} |

<!-- tpl: Prose and assertions only, no test code. One row per Dimension, using
the Dimension's exact test name; regression, replay and failure-mode rows name
the Dimension they protect. The /orly-write-unit-test skill audits these rows
at VERIFY. At least half of the rows test failure paths, and every Failure
Mode and Metrics row has a test. Tiers: unit (pure logic, handlers,
boundaries: empty, null, max, malformed, unicode); integration (real stack,
mocks only at system boundaries, deterministic failure injection per Failure
Mode); end-to-end (e2e): any user-facing Category (CLI, UI, API) gets at least
one user-centric scenario through the real path (subprocess command, real HTTP
request or rendered UI); a unit test is not a substitute. Human acceptance
uses tier manual, with its procedure, required person and durable evidence; an
agent cannot manufacture sign-off, and spec.tests skips manual rows. Label
stubbed decisions as unit proofs, local multi-process behaviour as
integration, and deployed results at their operational boundary. For each
promised result, try a plausible false pass: a processed event without the
promised reply must fail the reply check. Record the observable result and
correlate it with the triggering input; a status or link alone may not prove
the outcome. Use the same target and success condition in the Dimension, test
and rubric; a response from the wrong resource or environment must fail. Label
inherited proofs with their source and environment. For state replacement,
include concurrency, ambiguous commit, expiry or deletion, identity collisions
and fresh or populated upgrade where relevant. N/A applies only to
demonstrably unnecessary assertions, never to an unrun base behaviour.
Non-self-evident input shape: point at a fixture file instead of inlining
JSON. Behaviour that is hard to describe in prose means the Goal is fuzzy;
fix the Goal, not this table. -->

## Acceptance Rubric (single scoring surface)

| # | Criterion (observable outcome) | Verify (copy-paste) | Expected | Priority | Graded (VERIFY) |
|---|--------------------------------|---------------------|----------|----------|-----------------|
| R1 | {{fill:outcome the user can observe}} (§1) | `{{fill:command}}` | {{fill:exit 0 / substring / 0 matches}} | P0 | |
| S1 | Conform gates green | `{{fill:conform command from .orly/orly.json, verbatim}}` | exit 0 | P0 | |
| S2 | Unit tests pass | `{{fill:verify.unit command from .orly/orly.json, verbatim}}` | exit 0 | P0 | |
| S3 | Remaining declared lanes green | `{{fill:one row per remaining declared verify.* command, verbatim}}` | exit 0 | P0 | |
| S4 | No secrets | `gitleaks detect --redact --no-banner` | exit 0 | P0 | |

`dispatch/lifecycle.md` defines grading, the ship rule and transfers to a successor spec (`MOVED` rows) in its "Rubric grading and transfers" section.

<!-- tpl: The single scoring surface; no other scoreboard. Keep 5 to 12 rows
in total, counting R and S rows together. R rows grade this spec's outcomes:
one per Section outcome or failure class, never one per Dimension (the Test
Specification is that ledger). S rows are repository checks: every declared
conform and verify.* command from .orly/orly.json, verbatim, plus the secret
scan. Expand S3 for each remaining lane, including conditional ones; the final
gate decides applicability from the branch diff. Expected must be mechanically
checkable: an exit code, a literal substring or a match count; otherwise the
criterion is fuzzy, so fix the criterion. A Verify command must not need a
pipe character, because Markdown tables escape it and the copied command
breaks. Wrap pipelines in a script. Authoring fills every column except
Graded. -->

### Behaviour evals

- **Grounding rule:** {{fill:one sentence the output must never violate}}
- **Golden set:** {{fill:N}} cases in `tests/fixtures/{{fill:path}}`, covering {{fill:3 to 5 axes, including the worst known case}}. Every failure found in use becomes a new case.
- **Ship threshold:** grounding holds in every case, at least {{fill:N}}% of cases pass, and the worst known case never fails. Each threshold is an R row whose command computes it.
- **Fallback:** {{fill:the recoverable behaviour when a threshold is missed}}. Fabricated output fails a P0 row.

<!-- tpl: Delete this subsection unless the diff changes a prompt, a model
choice or agent instructions. Grounding means the output states only facts
present in its inputs; example: "responses cite only retrieved rows, never
invented identifiers." The worst known case is the input that failed worst in
past runs. -->

## Dead Code Sweep

**1. Orphaned files — deleted from disk and git.**

| File to delete | Verify |
|----------------|--------|
| `{{fill:path/to/old_file.ext}}` | `test ! -f {{fill:path/to/old_file.ext}}` |

**2. Orphaned references — zero remaining imports/uses.**

| Deleted symbol/import | Grep | Expected |
|-----------------------|------|----------|
| `{{fill:old_symbol}}` | `git grep -n -w "{{fill:old_symbol}}"` | no output |

<!-- tpl: Mandatory when the spec deletes or replaces files: for every deleted
file and removed/renamed public symbol, search the repository; any match is
stale. Use the same word-boundary pattern as the discovery grep. No deletions:
replace both tables with "N/A: no files deleted." -->

## Out of Scope

- {{fill:Item explicitly not in this spec — points at a follow-up spec or "future work"}}

<!-- tpl: Nothing excluded: write "None beyond the Files Changed table." Each
item points at a follow-up spec or says it is not planned. -->

---

<!-- tpl: Product Clarity and Decomposition are the authoring record: written
before the implementation sections above, read once by the implementing agent
at PLAN for intent, and not reopened during implementation. Discovery is the
running log the work keeps current. They sit last so the working sections stay
first. -->

## Product Clarity (authoring record)

1. **Successful user moment** — {{fill:the single observable moment that proves this worked — a scene, not a metric}}
2. **Preserved user behaviour** — {{fill:what users do today that keeps working unchanged; breaking any of it is a redesign}}
3. **Optimal-way check** — {{fill:is this the most direct way to deliver moment #1? name the gap to the unconstrained-optimal shape and why it's acceptable now}}
4. **Rebuild-vs-iterate** — {{fill:would a larger refactor serve better? verdict here; rationale in Decomposition below. A refactor that trades run-to-run determinism away is wrong by default}}
5. **What we build** — {{fill:the shortest artifact list that delivers moment #1}}
6. **What we do NOT build** — {{fill:adjacent scope rejected, one-line reason each — seeds Out of Scope}}
7. **Fit with existing features** — {{fill:what this compounds with; the one feature it must not destabilize}}
8. **Surface order** — {{fill:CLI-first (repo default), UI-first, or both; justify divergence}}
9. **Dashboard restraint** — {{fill:what the UI must hide until the signal behind it is real: no controls before evidence, no quality claims before counters}}
10. **Confused-user next step** — {{fill:the self-serve move (a command, an error message, a doc); "file a ticket" means a surface is missing from item 5}}

<!-- tpl: The owner's ten product questions, answered in order at authoring
BEFORE the implementation sections are written, so the authoring agent holds
the product behaviour, not just the file list. One short paragraph or list
item each. A question that can't be answered yet is an open question that
blocks the spec (golden-path rule, AGENTS.md). Internal-only work: answer 1–7
compactly; 8–10 may be "N/A: no user surface" with the reason. -->

## Decomposition & alternatives (patch vs refactor)

- **Chosen shape:** {{fill:why this Section/Workstream split — the decomposition rationale}}
- **Alternatives considered:** {{fill:one or more different mechanisms, each with its deciding criterion: complexity, cost, performance, scale or security}}
- **Patch-vs-refactor verdict:** this is a **{{fill:patch | refactor}}** because {{fill:reason}}. {{fill:If a larger refactor is the right long-term answer but out of scope, name its follow-up spec.}}

<!-- tpl: Match the solution's size to the problem's size and surface that call
before approval, not mid-Pull Request. A different mechanism is another way to
deliver the outcome, not a bigger or smaller version of the same design. -->

## Discovery (consult log)

- **Consults** — {{fill:architecture, legacy-design and gate-flag consults: source revision, question, decision and who decided}}
- **Model reviews** — {{fill:each model review with model and version, finding counts and dispositions, or none}}
- **Open blockers** — {{fill:each unresolved blocker with its boundary and resolving action, or none}}
- **Metrics review** — {{fill:events added, events found during review, or the reason no signal changed}}
- **Skill-chain outcomes** — pending until VERIFY and REVIEW.
- **Deferrals and transfers** — none. Each one needs an owner quote as a blockquote below this list, in the form `> Owner (<name>, <MMM DD, YYYY HH:MM>): "<quote>" — context: <item, why>`.

<!-- tpl: Keep the bullet labels. At authoring, record consults, source
findings and owner decisions already supplied; leave later skill and runtime
outcomes pending and every Graded cell empty. Separate direct quotes, confirmed
decisions, reviewer suggestions and agent choices; never manufacture
authorization. A confirmed planning input is not a measured service-level
objective, and a proposed risk exception is not approval. Record superseded
requirements explicitly and update canonical docs and tests so old
alternatives cannot be mistaken for current requirements. An agent-unilateral
deferral is incomplete scope, not a deferral, and blocks CHORE(close). Keep raw
model-review output out of the spec. -->
