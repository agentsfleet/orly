# M18 reduction review

## Scope and method

The owner asked on Nov 26, 2026 for a review of the code Pull Request #90 changes. It also covers the skills, `AGENTS.md`, its sources, `SOUL.md` and the standards. The review looked for steps a command could take over, duplicated rules, rationale tails, dead instructions and code that can shrink.

Two fresh-context, read-only subagents on the session's model reviewed the rule text and the code at `9850d20`. The implementing agent verified every applied row against the tree before the cut. Class B rows carry the reviewer's evidence and wait for the owner, because rule changes need his sign-off.

Class A means exactly one form and no change of meaning. That is a dead line, or a duplicate whose rule survives verbatim where the same reader loads it. Line numbers refer to `9850d20`.

## Counts

| Measure | Before | After | Command |
|---|---|---|---|
| `AGENTS.md` (render cap 16,384 bytes) | 246 lines, 16,302 bytes | 245 lines, 16,257 bytes | `wc -lc AGENTS.md` |
| Rule text: `AGENTS.md`, core, `SOUL.md`, four skills, reviewer | 812 lines, 49,309 bytes | 805 lines, 48,935 bytes | `wc -lc` over the eight files |
| Standards | 4,320 lines, 275,307 bytes | unchanged | `wc -lc standards/*.md standards/*/*.md` |
| Code, ten files | baseline | 22 lines removed, 14 added | `git diff --numstat -- src/` |

## Applied (class A)

| file:line | Cut | Why it is one form | Saved | Risk |
|---|---|---|---|---|
| `skills/orly-build/SKILL.md:38-40` | gstack `/investigate` and the prefix note | gstack removed `/investigate` (its `CHANGELOG.md:202`); the prefix rule is `AGENTS.md:108` | 3 lines | low |
| `skills/orly-build/SKILL.md:28-30` | "Add an integration test when the diff crosses a module boundary…" | verbatim condition at `AGENTS.md:130`, always installed with the skills | 94 bytes | low |
| `skills/orly-build/SKILL.md:37` | "Never use `--no-verify`." | Hard Safety at `AGENTS.md:62` | 25 bytes | low |
| `skills/orly-ship/SKILL.md:20-21` | "(`gstack-review` outside Claude Code)" | `AGENTS.md:108` states it for every gstack skill | 41 bytes | low |
| `SOUL.md:5` | "Re-read when padding or burying an answer." | `AGENTS.md:13` says it, inside the same persona block | 45 bytes of `AGENTS.md` | low |
| `src/burst/types.ts:32`, `src/burst/index.ts:139` | `BurstRun.fetch` | written, never read since this branch removed its reader | 1 line | low |
| `src/burst/process.ts:12` | `export` on `Outcome` | no importer | 0 | low |
| `src/config_validation.ts:25` | comment for the removed `OP_TOKEN` | describes nothing | 1 line | low |
| `src/proof.ts:1-6,47` | `Verdict` annotation and default limits passed by hand | `runCommand` returns `Verdict` and defaults its limits | 3 lines | low |
| `src/verification_store.ts:59` | `saveProof` return value | its one caller ignores it | 1 line | low |
| `src/proof.ts:13,68`, `src/note.ts:9`, `src/burst/fake_tailscale.ts:16,46` | `export` on file-local names; unused `online = false` default | no other reader; both callers pass `online` | 0 | low |
| `src/burst/e2e.ts:308` | `now = Date.now()` parameter | its one caller never passes it | 0 | low |
| `src/burst/fake_tailscale.ts:133-137` | second tag check in `singleUse` | `#mint` already refuses any other tag set before storing a key | 2 lines | low |
| `src/burst/aws-test-support.ts:47,103` | optional `tailnet` | its one construction passes it | 0 | low |
| `skills/orly-spec/SKILL.md:55-56` | fixed in this branch's new step: the persona file is the one whose frontmatter `name` is the type | `egm-design` lives in `agents/design_critic.md`, so `<persona>.md` pointed nowhere | +30 bytes | low |
| `src/proof.ts:61-62` | fixed in this branch's new code: a hand-written Git error beside `gitOutput(…, true)` | `gitOutput` already raises `ORLY-GIT-001` | 2 lines | low |

## Proposed for the owner (class B)

### Rule text

| file:line | Proposal | Deterministic replacement | Saved | Risk |
|---|---|---|---|---|
| `skills/orly-spec/SKILL.md:20-22` | `egm-brainstorm` sets `disable-model-invocation`, so step 2 cannot run; run its procedure by hand as step 6 now does, or ask the owner to type it | none | 0 to 47 bytes | medium |
| `skills/orly-burst/SKILL.md:30-31` | "start the repository's burst workflow" names a workflow no repository has; point at `docs/BURST.md:272` | none | 78 bytes | medium |
| `AGENTS.md:118` | "an A/B/C consult" is defined nowhere; define it or cut it | none | 22 bytes | medium |
| `AGENTS.md:63` | `crypto_store.load()` contradicts VLT's `Vault::open` (`standards/domains/sql.md:179`); fixture-pinned | none | 35 bytes | medium |
| `SOUL.md:51-52` | "Corrections route by shape" restates `AGENTS.md:53` | none | 146 bytes of `AGENTS.md` | low |
| `SOUL.md:67-73` | the pre-send checklist repeats lines in the same file | none | 289 bytes of `AGENTS.md` | medium |
| `AGENTS.md:132` | PR budget, deferral and LAND restate PR-BUDGET, PR-DEFER and `orly-ship` step 11 | none | 237 bytes of `AGENTS.md` | medium |
| `AGENTS.md:122` | the non-trivial list disagrees with SPEC-TODO (`standards/spec.md:10`) | none | up to 90 bytes | medium |
| `AGENTS.md:112` | the status list omits blocked and cancelled, which `src/cli_help.ts:24` prints | the gate's status column | 71 bytes | low |
| `skills/orly-ship/SKILL.md:52-58,84-86,102-106` | near-verbatim copies of PR-BABYSIT (`standards/pr.md:189-204`) | none | up to 927 bytes | medium |
| `skills/orly-ship/SKILL.md:115-117` | repeats the `orly-burst` authorization rule under the Codex heading | none | 224 bytes | medium |
| `SOUL.md:63`, `AGENTS.md:128` | reuse sentences restate `orly-ship` step 6 and TEST-LANE | the CLI refuses reuse on other gates | 135 bytes | low |
| `AGENTS.md:35,76-77` | rationale tails after "Never truncate…", "Editing the harness…" and "…live credential" | none | 140 bytes of `AGENTS.md` | low to medium |
| `SOUL.md:9,20,33-34` | rationale tails: "Optimise for one thing…", "I pad ~2x reliably", "fewer visible settings…" | none | 132 bytes of `AGENTS.md` | low |
| `skills/orly-spec/SKILL.md:12,18-19,67-68,74` | rationale tails the doctor output and SPEC-GOAL already carry | none | 214 bytes | low |
| `skills/orly-ship/SKILL.md:43-44,50-51`, `skills/orly-burst/SKILL.md:36-37`, `agents/orly-standards-reviewer.md:13,22-23` | rationale tails and a repeated example | none | 321 bytes | low |
| `AGENTS.md:126` | the per-gate sentence restates `orly gate --help` | a one-line pointer | 180 bytes of `AGENTS.md` | medium |
| `AGENTS.md:90` | "Before commit or push, `gitleaks` passes" has no gate behind it | a gitleaks criterion in `gate work` | 42 bytes | low |
| `skills/orly-ship/SKILL.md:18-19,79` | the agent checks that the branch contains the fetched base; `git.base` always passes (`src/criteria.ts:58`) | make `git.base` fail unless `git merge-base --is-ancestor` holds | 265 bytes | low |
| `skills/orly-build/SKILL.md:22-23`, `skills/orly-ship/SKILL.md:34-36,76-77`, `skills/orly-spec/SKILL.md:75` | Status against directory, every Dimension `DONE` in `done/`, no `[?]` outside `pending/` | spec criteria in `gate pr` | 310 bytes | medium |
| `skills/orly-ship/SKILL.md:36-38` | `git status --porcelain=v1 -uall` is the `git.tree` criterion | `git.tree` | 58 bytes | low |
| `skills/orly-burst/SKILL.md:28-30` | orly already refuses an offline caller and reconnects | `orly burst` itself | 108 bytes | low |
| `skills/orly-burst/SKILL.md:46-47` | the agent assembles the pre-run plan line | `orly burst` prints it before renting | 110 bytes | low |
| `skills/orly-spec/SKILL.md:27-29` | the naming step re-derives SPEC-NUM and SPEC-NAME | a spec-name criterion | 207 bytes | medium |

### Code

| file:line | Proposal | Smaller form | Saved | Risk |
|---|---|---|---|---|
| `src/burst/tailnet.test.ts:278`, `src/burst/aws.test.ts:28` | assertions that cannot fail: the fake no longer records `AuthorizeSecurityGroupIngress` | delete them, or register the command so they can fail | 2 lines | low |
| `src/burst/tailnet.ts:163-179`, `src/burst/tir.ts:44-51,204-208` | `TailscaleRequestFailed` matches `E2eRequestFailed`; the error readers overlap | one `RequestFailed` and one reader | about 10 lines | low to medium |
| `src/burst/tailnet.ts:152-155`, `src/burst/tir.ts:190-192` | empty-body JSON parsing by hand | ky's `parseJson` and `.json(schema)` | 2 to 4 lines | low |
| `src/burst/e2e.ts:16,308-316`, `src/burst/types.ts:11-12,98-102` | `RUN_ID_TAIL` repeats `RUN_TAIL_CHARS` plus a hyphen | derive it from `runTail` | about 2 lines | low |
| `src/burst/ssh.ts:49,205-207,225` | `address ?? id` fallbacks no machine reaches | a `Joined` type with a required address | about 4 lines | low |
| `src/burst/aws.ts:128-135`, `src/burst/e2e.ts:130-136` | `ready()` waits for a public address the tailnet address replaces | decide on instance state alone | about 2 lines | medium |
| `src/burst/fake_ssh.ts:20-23,64`, `src/burst/fake_tir.ts:27` | fakes copy exit codes and headers from `job.ts`, `ssh.ts` and `fake_tailscale.ts` | import them | about 3 lines | low to medium |
| `src/burst/ssh.ts:161-164,180-183` | no test reaches the lost-job and missing-exit branches | add fake scenarios and tests | 0 | low |
| `src/verification_store.ts:54-58,127-131` | `saveProof` and `completeAttempt` repeat the signed write | one `writeSigned` helper | about 4 lines | low |
| `src/burst/e2e-test-support.ts:29-31`, `src/burst/aws-test-support.ts:166-168` | the first-fake-machine lookup is written three times | one helper in `test_support.ts` | about 5 lines | low |
| `src/burst/tailnet.ts:17`, `src/burst/process.ts:128` | two identical wait types | one exported `Wait` | 1 line | low |
| `src/command_process.ts:37-89` | `run()` is 53 lines, over FLL's 50, unchanged by this branch | extract the signal wiring | 0 | low |

## Highest-value proposals

1. Turn spec and PR bookkeeping into `gate pr` criteria: Status against directory, `DONE` Dimensions in `done/`, `[?]` outside `pending/`, base ancestry and gitleaks. The matching skill steps shrink to "run the gate".
2. Drop the `SOUL.md` lines that repeat `AGENTS.md`, freeing 435 bytes under the render cap.
3. Rewrite `orly-spec` step 2 the way step 6 now runs `egm-review`, since `egm-brainstorm` also refuses model invocation.
