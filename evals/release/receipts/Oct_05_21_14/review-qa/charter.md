# Current consumer-repair review probes

Authority: current parent review on `feat/m09-verified-012`; report-only discovery after repair.
Source: active release specification, `repairs.json` and the current tests.

Surface: local command-line installation, process cleanup and inventory output.
Risk: owner bytes or settings can change during interrupted work; old review status can outlive its reviewed bytes; a repeated stop can lose a valid deadline result.
Entrypoints: `install`, the command supervisor and the executable inventory generator, invoked through existing native tests.
Isolation: repository-owned temporary fixture helpers; real Git/filesystem/process boundaries; synthetic data; no live consuming repository, model call, publication or native build.
Permitted writes: evidence files and test-owned disposable state only.
Budget: five minutes, at most twelve smoke probes, finite per-command capture deadlines.
Exit: independent previous configuration survives, conflicting owner metadata refuses before cleanup, a successful owned-group stop is not repeated, and stale review bytes become pending.

Commands, in order:

1. `bun test src/installation/migration.test.ts -t "a current installation preserves an independent previous configuration"`
2. `bun test src/installation/migration.test.ts -t "owner hook changes during destination writes"`
3. `bun test src/command_process.test.ts`
4. `bun test src/release_inventory.test.ts`

The full canonical and shuffled selections have separate receipts. This smoke does not replace those checks, the required subagent review, missing packed-hook proof or publication.
