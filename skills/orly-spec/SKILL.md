---
name: orly-spec
description: |
  Turn an idea into a reviewed spec under docs/v{N}/pending/: brainstorm, review
  and resolve with the Elephant-Goldfish Model (EGM), draft from the spec
  standard, and land it through a docs-only Pull Request. Use on "spec this",
  "create a spec", "new milestone", "spec out X", or any TODO.md attempt.
---

# orly-spec

A spec is the rulebook the building agent ships from. This skill owns the steps
and writes no code. The rules a spec must meet live in `.orly/standards/spec.md`,
and its shape in `.orly/standards/spec-template.md`.

## Steps

1. **Check the setup.** Run `orly doctor`. Stop on any red line and show it:
   the skill needs the repository's rules installed and gstack and EGM present.
2. **Explore.** Restate the idea in your own words. Find prior art in this
   repository and its siblings under `~/Projects`, then run EGM's
   `egm-brainstorm` on the idea.
3. **Choose.** Put two to four shapes with their costs to the owner through
   AskUserQuestion, with your call first. A question that times out is not an
   answer: wait. Record the owner's verbatim words in Discovery with
   `orly note "<QUOTE>" --spec <PATH>` once the spec file exists.
4. **Name.** Fetch `origin/main`, then take the next free `M{N}_{WS}` from
   `git ls-tree -r --name-only origin/main docs/`. The file is
   `docs/v{P}/pending/M{N}_{WS}_P{priority}_{CATEGORIES}_{NAME}.md`.
5. **Draft.** Copy the spec template and fill it in the order the spec standard
   gives. Delete every `tpl:` hint. Every Dimension names its test, and every
   failure mode its negative test.
6. **Review.** Run the EGM review yourself, because its `egm-review` and
   `egm-resolve` skills refuse model invocation. The EGM root is the
   `installPath` that `~/.claude/plugins/installed_plugins.json` records for
   `egm@egm`, or in Codex the folder under `$CODEX_HOME/plugins/cache/egm/egm/`.

   The feature range ends before `## Sections`, and the detailed range starts
   there. Run the stages in order, and a stage's reviewers in parallel:

   | Stage | Reviewers | Range | Standard |
   |---|---|---|---|
   | 5 | `egm:egm-zoom-out` | whole spec | `zoom-out-standard.md` |
   | 6 | `egm:egm-comprehension` | both ranges | `re-implementation-standard.md` |
   | 7 | `egm:egm-design`, `egm:egm-structural`, `egm:egm-style` | feature | `feature-spec-standard.md` |
   | 8 | `egm:egm-zoom-out`, given stage 5's findings | whole spec | `zoom-out-standard.md` |
   | 9 | `egm:egm-implementation-readiness`, `egm:egm-codebase-details`, `egm:egm-style` | detailed | `implementation-readiness-standard.md` |

   Each reviewer is a fresh subagent with no conversation. Its prompt holds
   `Mode: REVIEW`, the spec's absolute path and range, and two standards. They
   are the stage's file under `<EGM root>/resources/document_standards/` and
   `.orly/standards/spec.md`.

   The prompt asks for each finding's severity (Blocker, Major or Nit), lines
   and reason. Without the `egm:` agent types, start a general-purpose subagent
   that reads `<EGM root>/agents/<persona>.md` first. With no subagent tool, stop.

   Write each stage's deduplicated findings as table rows in
   `docs/v{P}/evidence/M{N}_{WS}_EGM_REVIEW.md`. Resolve them as `egm-resolve`
   does: PROPOSE FIX with the exact edit, or CONTEST with the code or rule that
   answers it.

   Apply the fixes after stages 7 and 9, before the next stage, and rerun a
   stage at most once. Scope and design calls go to the owner. Discovery
   records the model, its version, the finding counts and their dispositions.
7. **Land.** Cut `docs/m{N}-<slug>-spec` from the fetched `origin/main`,
   commit the spec, push, and open a docs-only Pull Request. The default
   branch requires pull requests.

## Stop conditions

- `orly doctor` is red, or EGM is missing: report the doctor lines.
- No subagent can be started: the review cannot run, so the spec stays unreviewed.
- The goal cannot be written as a test name: the intent is not understood yet.
- A `[?]` survives the golden-path walk: the spec stays in `pending/`.
