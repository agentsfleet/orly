# Changelog

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
