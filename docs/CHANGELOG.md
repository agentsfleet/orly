# Changelog

## 0.60.3 (2026-11-20)

A create keyed by a tenant-unique natural key takes no `Idempotency-Key`.

- **HTTP** — HTTP-IDEMKEY's workspace exception becomes a rule. A retry of such a create answers `409` naming the existing resource, and the client recovers by reading it. Workspace creation and runner registration are the examples.
- **Bun** — orly now needs Bun 1.4.5 or later (`engines.bun` is `>=1.4.5`); the harness, release and test workflows pin 1.4.5.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.60.3 update` after this version is published.

## 0.60.2 (2026-11-18)

SQL identity guidance leaves Universally Unique Identifier (UUID) version validation in the application.

- **Identity** — Applications mint UUID version 7 (UUIDv7) keys and decode them. The guidance removes database version checks, substring checks and UUID-version domains.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.60.2 update` after this version is published.

## 0.60.1 (2026-11-18)

Agents draw before they ask.

- **Drawing** — Every decision put to the owner, and any flow or comparison, opens with one ASCII picture. Saying "draw" asks for one.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.60.1 update` to take the new working notes.

## 0.60.0 (2026-11-18)

Burst lanes run on E2E Networks for real, take their placement from `.orly/orly.json`, and end each step deterministically.

- **E2E** — Launch, capture and cleanup work against the real TIR API, on `Debian 13` by default.
- **Placement** — Region, plan, instance types and image move to `burst.e2e` and `burst.aws`; a moved variable still set is refused.
- **Snapshots** — A snapshot records its base image, and lanes boot only a matching one. Snapshots from the Nov 17, 2026 release no longer match.
- **Clients** — The AWS software development kit (SDK) and `ky` replace hand-written cloud calls, and both retry busy answers.
- **Removed** — `--provider here`, `--keep`, `spot-then-on-demand` and Systems Manager access; nothing called them.

## 0.50.0 (2026-11-17)

Reviewed input scopes can retain verification evidence across documentation commits. Default `orly gate` runs fast checks once.

- **Reuse** — `tracked_inputs` declares tracked dependencies; `gate pr --reuse-verification` preserves original output, age and run revision. Live lanes stay fresh.
- **Skills** — Full instructions live in runtime folders. Updates remove only tracked, clean obsolete managed copies; owner files remain.
- **Shipping** — Skills report stages and outcomes, then propose evidenced lessons for owner approval after publication.
- **Burst** — Cancellation stops new requests and command descendants. New snapshot names separate repository ownership; older snapshots require manual inspection and cleanup.
- **Upgrade** — Commit managed edits before `bunx --bun @agentsfleet/orly@0.50.0 update`. Review dependencies before enabling [scoped reuse](ORLY_ARCHITECTURE.md#verification-evidence).

## 0.42.0 (2026-11-17)

AWS lanes can rent On-Demand machines, and can reach their machines through Systems Manager instead of SSH from one address.

- **Market** — `ORLY_BURST_MARKET=on-demand` rents lanes On-Demand. `spot-then-on-demand` runs a lane AWS took back once more On-Demand, with its own evidence.
- **Systems Manager** — `ORLY_BURST_AWS_ACCESS=ssm` opens no inbound port and carries SSH inside a Systems Manager session. A caller whose address changes keeps its lanes, and an HTTPS-only session can run them.
- **Setup** — `ssm` needs the role, instance profile, launcher policy statements and Session Manager plugin in `docs/BURST.md`, and `ORLY_BURST_AWS_INSTANCE_PROFILE`.
- **Branch check** — `git.branch` fails on a detached HEAD instead of passing it as a branch named `HEAD`.
- **Unusual paths** — Changed-file classification and the ignored-managed-file check read Git's NUL-separated output, so a name such as `src/café.ts` is judged as written.
- **Secrets** — A lane's `burst.secrets` are read from 1Password four at a time instead of one after another.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.42.0 update`.

## 0.40.1 (2026-11-16)

`orly-ship` now requires a live readiness check before Pull Request (PR) handoff.

- **Review readiness** — An authorized PR is ready for review unless the owner explicitly requests a draft.
- **Closure** — Completed specs move to `done/` and join the delivery commit; validation blockers stay visible.
- **Handoff** — Check the fetched base, pushed revision, companion PRs and review threads before reporting completion.
- **Evidence** — Classify failures as unrelated only with equivalent baseline evidence.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.40.1 update`.

## 0.40.0 (2026-11-16)

`orly burst` runs a repository's slow lanes on a machine rented for the run, or on the current machine inside a CI job.

- **Lanes** — `burst.<name>` commands and a `burst` object in `.orly/orly.json` declare setup, warm-up, secrets and result paths. The gates never run them.
- **Providers** — `--provider aws-spot` and `--provider e2e`, which rents E2E Networks TIR virtual machines, start one machine per lane, drive it over SSH and delete it after. `--provider here` runs the lanes in place.
- **Snapshots** — `orly burst snapshot` captures a warm image with no secrets, lanes start from the newest one, and `--prune` keeps the newest two.
- **Skill** — `orly-burst` tells an agent when a paid run is warranted and how to report its summary lines.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.40.0 update`. One-time cloud setup is in `docs/BURST.md`.

## 0.30.0 (2026-11-15)

The Rust standard names the `Option` and `Result` method for each intent.

- **Rust** — FN-RS lists the method for each shape, such as `map_or_default`, `map_or_else`, `is_some_and`, `ok_or_else` and `let`-`else`. It names the Clippy lints that enforce it: `option_if_let_else`, `manual_let_else`, `map_unwrap_or`, `manual_map`, `manual_ok_or` and `question_mark`.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.30.0 update`.

## 0.29.0 (2026-11-15)

Gates stop blocked work and distinguish verification outcomes.

- **Commands** — Inspect structural prerequisites first; leave later command groups unrun after failure. Preserve owner override reasons and original statuses.
- **Evidence** — Optional hermetic policies and `pr --reuse-verification` reuse only complete matching local evidence. Numbered attempts retain original output; interruption, stale identity and damaged records force fresh work.
- **Guidance** — Align parked-spec status, authorized cloud publishing, exact-base triage, review availability and visual evidence categories.
- **Upgrade** — Update the package and run `orly update`. Existing repositories continue fresh verification until they explicitly configure and request reuse.

## 0.28.1 (2026-11-12)

The agent proves a branch with one `orly gate pr` run on its final tree.

- **Working notes** — `SOUL.md` says a lane run by hand only diagnoses a failure. It never pre-checks a command the gate runs again.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.28.1 update`.

## 0.28.0 (2026-11-02)

orly collects no usage telemetry, and the spec template is a skeleton that cites the spec standard's rules.

- **Upgrade** — Remove calls to `orly lifecycle` and `orly skill-event`, and any `execution` key in `.orly/orly.json`; 0.28 refuses all three. Then run `bunx --bun @agentsfleet/orly@0.28.0 update`.
- **Telemetry** — Commands send no usage events and ask for no consent, and generated hooks stop exporting `ORLY_INVOCATION` and the unused `ORLY_INDEX_FILE`. Hooks pinned to an earlier version still read `~/.config/agentsfleet/orly/` until you update.
- **Spec template** — Each Dimension carries its test tier and result. The Test Specification table and the baseline headers are gone.
- **Leftover slots** — `docs.language` reports a `{{fill:` slot or `tpl:` comment left on a changed, committed spec line.
- **Ownership through git** — `.orly/orly.json` drops per-file `digests`, and `orly update` removes them. Update replaces a managed file only while git reports it clean, and `orly doctor` no longer reports hand edits. Migration from 0.10 `.oracle/` and `.githooks/` installations is gone.

## 0.27.0 (2026-10-29)

`orly doctor` checks that gstack and the Elephant-Goldfish Model (EGM) are installed, not which version. It no longer compares orly's own version with the repository's pin.

- **Helpers** — Any installed gstack or EGM passes; a missing one prints its install command.
- **orly version** — One global orly runs in every repository, whatever `.orly/orly.json` records. `orly update` still records the version that wrote the files.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.27.0 update`.

## 0.26.1 (2026-10-28)

The standards reviewer reads where a repository keeps its files, and `orly-ship` pushes before it gates.

- **Reviewer** — `orly-standards-reviewer` reads the repository's own instructions and matches **Applies to** through them. A repository that keeps its schema in `schema/*.sql` now gets the SQL rules scoped to `**/migrations/*.sql`.
- **Ship order** — `orly-ship` pushes the branch before `orly gate pr`, which needs `HEAD` to be the pushed revision. The `verify.*` commands run once, inside the gate.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.26.1 update`.

## 0.26.0 (2026-10-28)

Rules now ship as standards, applied by three skills and a reviewer agent; `orly gate pr` checks code and Git only.

- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.26.0 update`. Remove calls to `.orly/audits/` or `.orly/dispatch/`, and `language.zig` from `.orly/orly.json`, first. An edited retired file stops the update.
- **Standards** — Rules live in `.orly/standards/` as Applies to, Checked by, Bad, Good and Why. The always-on `AGENTS.md` stays under 16 KiB.
- **Skills** — `orly-spec`, `orly-build` and `orly-ship` replace the four earlier skills; `orly-standards-reviewer` checks a diff against the standards.
- **Gate** — Spec criteria, `orly judge` and the audit scripts are gone. A repository may declare no `conform` command.
- **Doctor** — `orly doctor` fails when an agent runtime runs a gstack or Elephant-Goldfish Model (EGM) version other than orly's pin.

## 0.25.0 (2026-10-27)

`orly judge spec` reviews a whole spec before implementation, and `orly gate pr` checks that the tests a spec names exist.

- **Upgrade** — Requires Bun 1.4.4 or later. Run `bunx --bun @agentsfleet/orly@0.25.0 update` to refresh the template, skills and generated hooks; add `--no-hooks` to keep your own hooks.
- **Readiness review** — `orly judge spec <SPEC> --refresh` asks six questions and reports `READY`, `REVIEW` or `INCOMPLETE`. Omit `--refresh` to replay saved answers; live review needs `gitleaks` and `TYPESAFE_API_KEY`.
- **Named tests** — `spec.tests` fails when a test that a DONE Dimension names, outside tier `manual`, appears in no tracked test source. Copy each Test cell from the code; the failure names the closest match.
- **Owner quotes** — A deferral or a `MOVED to` rubric row needs an owner quote in Discovery, `> Owner (<name>, <date>)`; the older `> Indy (` form still works.
- **Commit checks** — Staged audits and the doc-read check now see files committed with `git commit -a` or `git commit <path>`.

## 0.15.0 (2026-10-19)

Documentation now requires an editing pass that cuts filler and repeated facts
while keeping required actions clear.

- **Changelog** — Default to five bullets and 120 prose words; keep necessary
  upgrade and safety instructions even when they exceed that budget.
- **Language gate** — `orly gate verify` and `orly gate pr` reject mechanical
  language errors in changed Markdown and Markdown JSX (MDX) prose.
- **Scope** — Checks include complete edited paragraphs and new pages.
  Unchanged history and installed snapshots stay outside the check.
- **Upgrade** — Run `bunx --bun @agentsfleet/orly@0.15.0 update --no-hooks`
  to keep your repository's custom hooks.

## 0.14.7 — 2026-10-17

API instants become RFC 3339 strings, and agentsfleet's schema stores them as `TIMESTAMPTZ(3)` under a clock rule that reads the time after a lock wait.

- **REST guide** — `_at` fields are RFC 3339 strings in UTC, OpenAPI `format: date-time`; epoch integers no longer represent instants, and filters state their boundaries.
- **Schema conventions** — timestamps are `TIMESTAMPTZ(3)`; lifecycle stamps come from `now()`, locking validity checks lock first and then read `clock_timestamp()`, and sweeps compare against `statement_timestamp()`.

## 0.14.6 — 2026-10-17

agentsfleet's schema conventions no longer require migrate to refuse an older migrator's ledger.

- **Schema conventions** — agentsfleet's databases start empty under SQLx's `Migrator`, so no earlier ledger exists to refuse.

## 0.14.5 — 2026-10-17

agentsfleet's schema conventions carry the owner-signed Postgres rules, and specs may run to 500 lines.

- **Schema conventions** — placement in owned schemas, key and counter naming, RULE STS in full, timestamp categories, runtime SQL in `PREPARE`-checked `.sql` files, and SQLx's `Migrator` inside a bounded lock. Entities are named `fleet.*`.
- **Spec cap** — the spec template gate allows 500 lines, up from 320.
- **Schema guard** — the teardown flow no longer names the retired `schema/embed.zig`.

## 0.14.4 — 2026-10-16

The milestone-ID and UI-substitution audit no longer forks per staged file. A pre-commit stage of ~1,600 files that ran over 27 minutes now finishes in about two seconds, with verdicts unchanged.

- **Scan** — one `git diff` and one `awk` cover the whole staged set. Reading the line above an added line now costs at most one `git show` per file with a candidate hit, down from one fork pair per added line.
- **Compatibility** — verdicts, hit order and exit codes match 0.14.3 byte-for-byte across staged, `--diff` and explicit-file modes, including spaced, quoted and non-ASCII filenames, renames re-scanned as whole-file additions, and absolute explicit paths.

## 0.14.3 — 2026-10-15

The REST API guide carries agentsfleet's conversation and reviewed-setup exceptions, and the TypeScript rules name how timestamps are labelled.

- **Conversation sends** — fleet and draft `/messages` sends take one UUIDv7 `operation_id` in the body and refuse an `Idempotency-Key` header; replay, conflict and `202` answers are defined.
- **Stale reviews** — a reviewed setup mutation refused with `409` also returns the current `review_digest` and `current_state`.
- **Record dates** — creation timestamps are labelled **Created**; other timestamps name their event.

## 0.14.2 — 2026-10-15

The release inventory reads npm 12's pack output, and the API and logging guides cite agentsfleet's current module paths.

- **npm 12** — `npm pack --dry-run --json` now prints one object keyed by package name instead of an array; the release inventory reads both, so `make audit` passes on npm 12.
- **Guide citations** — the REST API and logging guides cite agentsfleet's `x/mod.rs` module paths, and request parsing points at `fleet/message_steer/mod.rs`.

## 0.14.1 — 2026-10-11

The logging standard names the field for a second failure's code.

- **Role-prefixed codes** — §5 defines `cause_error_code`, `rollback_error_code` and `config_error_code`, and the `<role>_error_code` shape for new roles.
- **Rust binding** — §8A points a record that reports a second failure at §5.

## 0.14.0 — 2026-10-08

Retained TypeSafe Jev measurements now carry per-attempt explanations and explicit adoption limits.

- **Diagnosis** — accounts for all 188 saved attempts and separates native-answer agreement from confidence withholding and grading.
- **Evidence** — preserves original replies and labels; names uncertain fixture meanings and unavailable provider explanations.
- **Guidance** — links contributors to the source diagnosis while keeping all five proposed checks evaluation-only.

## 0.13.0 — 2026-10-07

A source-checkout examiner checks unsupported completion claims and grades actual TypeSafe Jev answers against frozen expectations.

- **Comparison** — freezes six runtime questions and evaluates five proposed checks with separately validated expected answers.
- **Task evidence** — hidden behavioral checks reject seeded false completions; reports retain failed and missing attempts.
- **Measurement** — retains typed Jev replies, uncertainty, failures and per-example grades; replay sends no new requests.
- **OpenAPI guidance** — names the two surviving parity tests and makes build regeneration plus a clean diff an explicit verify step.
- **Adoption** — keeps candidates evaluation-only because independent provenance and paired-task improvement remain unproved.

The installed `.orly/` layout and 0.12.1 fixes remain unchanged.

## 0.12.1

Staged audits avoid copying repository files when their filename scope is empty.

- **Audit preflight** — selects filenames from a copied index before materialising repository files; relevant audits retain coherent staged reads.
- **Check diagnostics** — prints hosted job or pipeline states and links before reporting pending or failed checks.
- **Release status** — corrects documentation that still described published 0.12.0 as an unpublished candidate.

## 0.12.0 — 2026-10-07

Setup guidance now distinguishes the published package from the local release candidate.

- **Migration guidance** — names `.orly/` destinations and explains preserving repository-owned hooks with `--no-hooks`.
- **Release scope** — retains the six existing judgment questions and records the comparison evaluator as parked for proposed 0.13 work.

The `.orly/` layout and judgment commands already shipped in 0.11.0; this entry claims no new runtime behavior.
