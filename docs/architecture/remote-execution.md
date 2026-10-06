---
type: explanation
audience: contributor
verified: 2026-10-06
product_version: 0.11.0
executable: false
---

# Commander work and future workers

## What it is

Claude, Codex or OpenCode acts as commander. It reads the rules, selects work, gathers evidence and prepares a pull request. `orly` supplies deterministic boundaries and bounded Jev advice.

`orly lifecycle --json` describes the stages, declared commands and resource ownership. Inspection runs no verification or worker command. The production gate and inspection share command selection in `src/execution/plan.ts`.

## Why it exists

Builds, dependency caches, test fixtures and worktrees consume local storage. The command declarations determine what runs; the commander needs that information before deciding where later workers should run it.

Version 0.11.0 provides a disabled extension point. It does not move builds off the laptop or claim disk savings.

## How it behaves

The repository may declare this optional configuration:

```json
{
  "execution": {
    "remote": {
      "mode": "disabled",
      "launcher": ["agentsfleet", "run"]
    }
  }
}
```

The launcher is an argument array reserved for later activation. No shell evaluates it. Unknown properties, empty arguments and every mode except `disabled` are refused.

Omission also means disabled. A disabled adapter has no evidence and launches no process. Required local checks still run, including failures.

Commit runs the declared conformity lane. Push runs non-test verification lanes. The pull-request boundary runs every declared verification lane; integration and memory lanes apply when code changes.

Agent-owned stages remain agent work: inspection is not a scheduler.

Caches and output sizes remain the declared tools' responsibility. Inspection does not measure them.

The commander removes its own temporary baseline workspace and completed stream resources. It must not delete user worktrees or caches by inference.

### Requirements before later activation

The future adapter must bind each result to the source revision or content digest, lane, exact arguments, run identity and executor identity. The commander must reject stale, incomplete or mismatched results. Output, deadlines, concurrency and retained files need explicit limits.

Cancellation must stop the worker and clean up its owned resources. Failed or unreachable workers must remain failures. Retries must not silently duplicate side effects.

Credentials stay on the worker boundary and must not enter receipts.

An adapter may invoke a user-selected command-line tool such as `agentsfleet`. Transport and virtual machine setup remain outside this disabled interface. Real worker trials are required before any remote result can satisfy a gate.

## Limits

Remote work supplies no pass, machine, credential or storage saving. Local command supervision stops owned workloads when the gate owner exits or the supervisor receives a stop signal.

## Related pages

- [Installed ownership](installation.md)
- [Release report](../../evals/release/release-report.md)
