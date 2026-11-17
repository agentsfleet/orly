# M17 repository review and verification costs

## Candidate and evidence limits

The candidate targets 0.50.0 on `feat/m17-scoped-verification-reuse`, based on 0.42.0 revision `9c177c333010b11fc83bb49bc2d00cadd549c6c3`.
The base was fetched again during review and remained unchanged.

Counters below come from disposable Git repositories and local processes. Provider tests use controlled AWS and E2E Networks responses; no paid machine was launched.

No consumer installation or live cloud acceptance is claimed. Wall-clock suite timings describe those test runs, not a speedup against a comparable consumer baseline.

## Measured reductions

| Change | Before | Candidate observation | Evidence |
|---|---|---|---|
| Default gate path | Fast verification runs in `verify` and again in `pr` | One execution in `work → pr`; a separate explicit `verify` still runs | `src/gate-determinism.integration.test.ts`, default gate counter |
| Documentation commit after a scoped pass | Exact-revision evidence causes another execution | Cumulative executions 1, 1, 2 after initial run, excluded documentation commit, selected input edit | `src/verification-scoped.integration.test.ts`, real command-line journey |
| Scoped selection | No cross-revision selection | Uses the existing tracked snapshot, with no extra file read for selection | `src/verification_identity.integration.test.ts`, file-open counter |
| Overlapping extra paths | Duplicate declarations reread a file | One file read per identity collection | Same counter, directory plus file plus repeated directory |
| Full skill delivery | Four private bodies plus twelve runtime pointers | Twelve full runtime bodies; no private managed skill copies | `src/installation/skill-migration.integration.test.ts` |
| Repeat install | Existing idempotence | Zero writes on a repeat install remains true | Same migration suite |
| Already-cancelled cloud run | Could prepare resources before noticing cancellation | Zero provider API calls | `src/burst/cancellation.integration.test.ts` |
| Captured process timeout | Leader termination could leave descendants holding pipes | Group termination and child reaping on deadline, cancellation and parent exit | `src/burst/process.integration.test.ts` |

The hashing claim applies within each collection. A tracked file also declared as an extra input is read in both collections.
Full snapshots before and after the work remain required.

The toolchain runs inside those observations, and source changes still block a result.

Scoped reuse needs both a reviewed repository policy and `--reuse-verification`. It is not enabled automatically in consumers or in this repository's configuration.
Engine changes, missing inputs, changed dependencies, failed or unsigned evidence, expiry and newer failed attempts require fresh work.

## Repository inventory

`git ls-files -z` at the opening revision listed 193 files. Subsystem reviewers read implementation, tests, settings and current guidance; this table records the limits.

| Inventory | Review performed |
|---|---|
| 96 tracked `src/` files | Execution, installation, verification, configuration and documentation scanners reviewed by subsystem; new candidate files reviewed with their owners |
| 21 standards, four skills, core, working notes and reviewer | Current instructions read; contradictions traced to authored sources |
| Registry, two schemas and six fixtures | Selection, validation, installed references and generated parity reviewed |
| Three installation evaluation scripts | Distribution tests and language isolation reviewed |
| Four workflows, two hooks, package, lockfile and build files | Read for repeated work, reproducibility and release recovery; workflows remain unchanged |
| Current architecture, installation guide and active specs | Read for implementation agreement; M15's remaining manual dimensions remain open |
| Fourteen historical done specs | Headers, status and purpose inventoried; M16 evidence spec read in full. Other historical bodies were not reread in full |
| Fourteen branding assets | Metadata, SVG structure and PNG dimensions inventoried; no new visual assessment claimed |

The inventory is a repository audit, not a claim that every historical prose line or image received a new visual review.

## Findings and dispositions

| Finding | Repair or disposition | Proof |
|---|---|---|
| Documentation commits invalidate every lane | Optional literal `tracked_inputs` extends existing signed evidence | Cross-revision, add/delete/rename/mode and negative evidence tests |
| Default fast checks run twice | Default path runs work then pr | Invocation counter; explicit verify preserved |
| Toolchain probe can edit after final snapshot | Final observation follows probes | Second-probe edit regression blocks the result |
| Clean, pushed excluded edit during a lane could be confused with dirty-state handling | Test independently exercises the full-source comparison | Clean/pushed concurrent documentation commit is blocked |
| Ignored or index-hidden managed edits can be lost | Positive tracked/clean inspection for replacement and obsolete deletion | Ignored, skip-worktree and assume-unchanged migration tests |
| Interrupted migration misses a mode-only edit | Compare index and disk executable modes, independently of Git's mode display setting | Planning and recovery refuse hidden executable edits; journal remains |
| Skills require private bodies and pointer files | Full body at each runtime destination | Fresh install, migration, repeat install and recovery |
| Runtime reviewer citations skip owner instructions | Preserve root `AGENTS.md` citations in runtime guidance | Installed reviewer assertion |
| Linked architecture pages absent from governance pack | Ship the installation and burst pages | Fresh governance-pack installation |
| Scheduled deletion can satisfy a reference | Exclude obsolete files from fallback closure | Positive reference resolves; scheduled deletion refuses it |
| Two registry paths normalize to one destination | Detect conflicts using installed destination | Plain and `.orly/` target conflict tests |
| Missing merge base looks like no changes | Block PR commands and name the required fetch | Missing-history fixture starts no verification command |
| Build inputs evade slow-lane classification | Include entrypoints, Makefiles and lockfiles | Each input triggers declared integration verification |
| A remote default branch named develop passes | Compare with remote default ref | Default-branch refusal fixture |
| Override commit captures staged owner edits | Use an empty commit that leaves the index alone | Tree equality and staged file assertions |
| Digits or hyphens in override names cannot be read back | Align validation and trailer parsing; refuse multiline reasons | Override round trip and no-commit negative tests |
| Misspelled install flags can perform writes | Reject unsupported arguments before installation | Typo cases create no `.orly` directory |
| Failed ignored-file inspection looks clean | Refuse failed Git inspection | Non-repository negative case |
| Test Git defaults vary by machine | Explicit main branch, isolated global settings and synchronous fixture writes | Gate tests; child-process inherited-environment regression |
| Captured children can leave pipes open | Stop owned process group and reap leader | Real local descendant tests |
| Cancelled cloud work can still create resources | Check before mutation; cancel reads and retain bounded mutation replies for cleanup | Zero-call, catalogue and key/group/machine response-boundary fixtures |
| Key deletion failure prevents group cleanup | Attempt independent cleanup and report remaining key | Key failure leaves no fixture machine or group |
| Spot retry depends on price lookup | Track the market independently of the optional quote | Missing price still permits the requested retry |
| Snapshot names collide across hosts, accounts or shortened paths | Digest full origin identity and home-relative SSH account; timestamp plus random suffix | Host, account, punctuation, long path, absolute transport and same-instant cases |
| Paragraph exception text bypasses documentation checks | Require a reasoned HTML comment and keep its scope local | Bare text, code spans, missing reasons and page-budget tests |
| Renderer retains unused project-root branch | Remove unused parameter and branch | Existing render and parity checks |
| Installation language evaluation always includes Rust and shell | Start language-only cases without either seed | Isolated packed installation evaluation |
| Long AWS test module mixes lifecycle and market tests | Split around those responsibilities; keep shared fixture helpers | Existing cases retained; new missing-price case |
| Reviewer skips rules merely named as automated | Require actual checker evidence for reviewed inputs | Source and installed guidance assertions |
| Shipping omits lessons and stage outcomes | Add owner-approved learning proposal and stage reporting | Source and installed guidance assertions |

## Findings outside the implementation repairs

The workflow audit found duplicate full-suite runs in Harness and coverage jobs, floating tool installs, unused secret-scanner setup, and a partial-release recovery gap.
Changing `.github/workflows/**` requires explicit approval under the repository's operating model. No workflow was changed or check weakened.

Let the coverage job own the unit run and retain Harness configuration and distribution checks.
Pin fetched tools and resume missing release assets after publication.
Review those changes against `harness.yml`, `test.yml`, `gitleaks.yml` and `release.yml` before approval; this candidate makes no hosted-time saving claim.

E2E Networks lost-acknowledgement handling still warns that a virtual machine may exist and names it for inspection.
The existing simulated failure does not create a machine before losing the response, so it does not prove remote-effect recovery. A provider reconciliation design and real effect-then-lost-reply fixture remain separate work.

Process snapshots do not detect a transient edit restored between observations. Local signatures do not defend against another process with the same user's privileges.
These are stated limits, not newly claimed guarantees.

## Checks run

| Check | Result | Evidence |
|---|---|---|
| Base full suite at `9c177c3` | 507 passed, 0 failed; 2,209 assertions | [Harness run](https://github.com/agentsfleet/orly/actions/runs/44027560130) |
| Base packed installs | 24 passed, 0 failed | Same Harness run |
| Base coverage suite | 507 passed, 0 failed; 97.22% functions, 95.72% lines | [Test run](https://github.com/agentsfleet/orly/actions/runs/44027560287) |
| Gate and identity counters | 35 passed, 0 failed; 139 assertions | `bun test src/gate-determinism.integration.test.ts src/verification_identity.integration.test.ts src/verification-scoped.integration.test.ts` |
| Probe repair, guidance and document checks | 71 passed, 0 failed; 238 assertions | `bun test src/verification-scoped.integration.test.ts src/verification_identity.integration.test.ts src/learning_guidance.integration.test.ts src/doc_rules.test.ts src/references.test.ts` |
| Local process and config checks | 28 passed, 0 failed; 51 assertions | `bun test src/burst/process.integration.test.ts src/config.test.ts` |
| Cloud cancellation and AWS lifecycle | 22 passed, 0 failed; 127 assertions | `bun test src/burst/cancellation.integration.test.ts src/burst/aws.test.ts` |
| Review regressions before repair | 1 passed, 6 assertion failures; 27 assertions | Mode-ignore planning/recovery, home-relative account and three cancellation-after-effect cases |
| Review repairs | 56 passed, 0 failed; 252 assertions | Criteria, guidance, references, skill migration, repository ownership and cancellation suites |
| Nested fixture Git isolation | Before: 1 assertion failure; after: 1 passed, 0 failed, 5 assertions | Scoped concurrent-edit test with injected disposable global signing configuration |
| Packed installation before review repairs | 24 passed, 0 failed | `make install-evals`; migration changed afterward, so final distribution check remains due |
| Work gate | Passed configuration, catalogue, render and pack parity | `bin/orly gate work` |
| Final full gate, packed installation and final review | Not run yet | Updated after final candidate verification |

Earlier diagnostics found missing dependencies, a fixture missing its managed file, and an omitted test import.
A blocked concurrent-edit result also retained proof metadata.

Each was repaired; the affected tests passed afterward. Final verification remains distinct from these targeted observations.

## Review coverage and repairs

The full gstack review read all 73 candidate paths, 250 tracked hunks and ten new files. Seven specialists and a fresh native adversarial reviewer contributed.
Its candidate digest was `3380c3ea42bb5c043b481f5af5e90d78ef75952e`.

The review found seven defects: two imports, optional signal types, executable-mode preservation, cancellation ownership, home-relative account identity and nested fixture Git isolation.
The repairs have focused regression evidence above. Final review of the repaired candidate remains due.

The independent standards review read the same candidate and screened 326 rule blocks. It reported 16 findings covering imports, test assertions, size, source agreement and prose.
These findings were repaired in authored sources; generated instructions were regenerated afterward.

Outside structured and adversarial reviews were unavailable because the installed outside provider selected the active Codex harness. No outside or paid process ran.
Native reviews do not substitute for that missing outside coverage.
