import { PROVIDER_NAMES } from "./burst/types";

const PROVIDERS = PROVIDER_NAMES.join("|");
const HELP_TEXT = `orly — prove the boundary; carry the rules

Gates (working tree unchanged; required checks must pass or carry an owner override):
  orly gate [--accept-dirty]        run work → pr; stop at first red
  orly gate <work|verify|pr>        run one gate
  orly gate pr --reuse-verification
                                   reuse only explicit hermetic policies with valid evidence
      work    does this commit conform? the declared conform command; no git
              state, so a commit hook's own dirty tree never blocks it
      verify  does the work hold up? configuration, docs language, and the
              non-test verify.* set; Sections in progress may be pushed
      pr      can this ship? branch, tree, pushed, configuration, docs,
              coupled paths, and every declared verify.* command; it also
              reports new tests that carry no fail-before proof
  orly override <CRITERION> --reason <REASON>
                                    empty commit with an Orly-Override trailer
  Commands default to 30 minutes and 64 mebibytes of combined output each.
  Set limits.<command>.timeout_ms and output_bytes in .orly/orly.json to override.
  Exceeding either limit fails the check and prints the saved output path.
  Prerequisite failures block commands; a command failure leaves later groups not_run.
  Results distinguish passed, failed, blocked, cancelled, skipped and not_run.
  Reuse is off by default. A reviewed reuse.<verify-command> policy must declare
  hermetic: true, max_age_ms, toolchain probes and any extra input paths; a
  hermetic command reads no Git history. Evidence is keyed to tracked content:
  a run before the commit (gate pr --accept-dirty) or the push (gate verify) is
  reused once that same tree is committed, clean and pushed. Optional
  tracked_inputs narrows the content to the tracked paths it names. An
  untracked file during the run, or any later change, forces a fresh run.
  Invalid prior completion runs fresh; lock or start-marker failures block commands.
  Private attempt history stays beneath Git metadata.
  coupled: [{"when": [<PREFIX>...], "then": [<PREFIX>...]}] in .orly/orly.json
  makes gate pr fail a branch that changes a path under when and none under then.

Records (the agent writes them; the pr gate reads them):
  orly proof <TEST_FILE> --test <NAME> -- <COMMAND>...
                                    with the code a new test covers reverted or
                                    mutated, run COMMAND, and keep the record
                                    only when it fails and an output line reports
                                    NAME failing. gate pr names new TypeScript,
                                    JavaScript, Rust, Go and Python tests without one
  orly note "<QUOTE>" [--context "<TEXT>"] [--spec <PATH>]
                                    append the owner's verbatim words, dated, to
                                    the Discovery section of the one active spec

Install (the repository is the unit — no checkout of this package required):
  orly init [--force] [--no-hooks] [--with <PACK>] [--dry-run] [--json]
                                    materialise rules, gates, hooks, and a
                                    seeded .orly/orly.json. A repository that
                                    already has an AGENTS.md keeps it: orly's
                                    rules land as .orly/AGENTS.md, reached by a
                                    pointer block in the file you own. One
                                    import line lands per runtime that needs
                                    one (CLAUDE.md, opencode.json), so the
                                    rules load rather than wait to be noticed;
                                    a loader you wrote yourself is left alone.
  orly update [--force] [--with <PACK>] [--dry-run] [--json]
                                    re-materialise at the installed engine version

  --with <PACK>                     record an opt-in pack (repeatable) in
                                    .orly/orly.json, so every clone selects it
  --dry-run                         show what would be written; change nothing

  orly doctor                       check this repository's installed rules
                                    against .orly/orly.json, and that each
                                    agent runtime has gstack and the Elephant-
                                    Goldfish Model (EGM) installed
  orly --version                    the installed package version

Burst (paid machines, run only when asked; the gates never run burst.* commands):
  orly burst                        list the burst.* lanes .orly/orly.json declares
  orly burst <lane>... --provider ${PROVIDERS} [--ref <REF>] [--no-snapshot]
                                    run burst.setup, then each lane with burst.secrets,
                                    read here and sent over SSH: one machine per lane,
                                    in parallel, from the newest warm snapshot of the
                                    configured image
  orly burst snapshot --provider ${PROVIDERS} [--ref <REF>]
                                    run burst.setup and burst.warm with no secrets on
                                    the base image, then save it as the repository's
                                    newest snapshot
  orly burst snapshot --prune --provider ${PROVIDERS} [--ref <REF>]
                                    keep the newest snapshot of the configured image
  Setup and costs: https://github.com/agentsfleet/orly/blob/main/docs/BURST.md

Ruleset authoring (an orly checkout only — refused from an installed package):
  orly verify                       the standards catalogue keeps its rules,
                                    the root AGENTS.md matches its render, and
                                    every pack copy matches its source`;

export function printHelp(): void {
  // logging: command help is the program interface.
  console.log(HELP_TEXT);
}
