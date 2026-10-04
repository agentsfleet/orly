const TELEMETRY_CONFIG_KEY = "telemetry";
const ANONYMOUS_TELEMETRY_CONFIG = JSON.stringify({ [TELEMETRY_CONFIG_KEY]: "anonymous" });
const OFF_TELEMETRY_CONFIG = JSON.stringify({ [TELEMETRY_CONFIG_KEY]: "off" });

const HELP_TEXT = `orly — prove the boundary; carry the rules

Gates (read-only; no PR without every criterion green or a recorded override):
  orly gate [--accept-dirty]        run work → verify → pr; stop at first red
  orly gate <work|verify|pr>        run one gate
      work    does this commit conform? the declared conform command; no git
              state, so a commit hook's own dirty tree never blocks it
      verify  does the work hold up? configuration, docs language, and the
              non-test verify.* set; unfinished Sections may be pushed
      pr      can this ship? branch, tree, pushed, every spec criterion, and
              every declared verify.* command
  orly override <CRITERION> --reason <REASON>
                                    empty commit with an Orly-Override trailer

Advice (explicit; hooks stay offline):
  orly judge <plan|verify|review|document> --input <MANIFEST>
                                    exact replay of bounded Jev advice
  orly judge --help                 input selectors, questions and refresh

Install (the repository is the unit — no checkout of this package required):
  orly init [--force] [--no-hooks] [--with <PACK>] [--dry-run] [--json]
                                    materialise rules, gates, hooks, and a
                                    seeded .oracle/orly.json. A repository that
                                    already has an AGENTS.md keeps it: orly's
                                    rules land as AGENTS.orly.md, reached by a
                                    pointer block in the file you own. One
                                    import line lands per runtime that needs
                                    one (CLAUDE.md, opencode.json), so the
                                    rules load rather than wait to be noticed;
                                    a loader you wrote yourself is left alone.
  orly update [--force] [--with <PACK>] [--dry-run] [--json]
                                    re-materialise at the installed engine version

  --with <PACK>                     record an opt-in pack (repeatable) in
                                    .oracle/orly.json, so every clone selects it
  --dry-run                         show what would be written; change nothing

  orly doctor                       check this repository's installed rules
                                    against what orly would write today
  orly --version                    the installed package version

Usage telemetry (off by default):
  Consent file:                     ~/.config/agentsfleet/orly/.orly.json
  State-root override:              AGENTSFLEET_STATE_DIR
  Set ${ANONYMOUS_TELEMETRY_CONFIG} to send command, gate, and packaged Orly skill
  names, outcome, failed criterion, duration, Orly version, operating system, architecture,
  invocation type, timestamps, and random event, session, and installation IDs.
  Set ${OFF_TELEMETRY_CONFIG} to write and send nothing.
  ORLY_TELEMETRY=off|anonymous changes one process; ORLY_TELEMETRY_OFF=1 wins.
  Orly never collects source, paths, repositories, branches, arguments, prompts,
  output, environment values, raw errors, or personal and account details.

Ruleset authoring (an orly checkout only — refused from an installed package):
  orly verify                       the rules render the same twice, and the
                                    committed copy matches that render`;

export function printHelp(): void {
  // logging: command help is the program interface.
  console.log(HELP_TEXT);
}
