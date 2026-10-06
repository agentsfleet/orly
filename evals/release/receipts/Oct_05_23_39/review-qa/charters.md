# Local release review smoke

- Caller: gstack review, functional command-line smoke, five-minute and twelve-probe limit.
- Scope: installation owner preservation and bounded command supervision.
- Source: docs/architecture/installation.md; src/command_runner.test.ts.
- Isolation: repository tests create and clean disposable roots and owned process groups. No external service or deployment.
- Success: the native preservation test returns success and preserves exact edited bytes.
- Risk: the command supervisor must preserve complete output and terminate owned work on its deadline.
- Commands: bun test src/installation_preservation.test.ts; bun test src/command_process.test.ts.
- Exit: both checks complete; later source changes require affected revalidation.
