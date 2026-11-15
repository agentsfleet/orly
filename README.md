<div align="center">

<img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agentsfleet-mark-glow.png" width="140" alt="agentsfleet" />

# orly

[![npm](https://img.shields.io/npm/v/@agentsfleet/orly)](https://www.npmjs.com/package/@agentsfleet/orly)
[![Bun ≥1.4.4](https://img.shields.io/badge/Bun-%E2%89%A51.4.4-black)](https://bun.sh)
[![MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Repository rules and verification gates for coding agents.

</div>

Supports Claude Code, Codex, OpenCode and Amp. **Agents:** read [llms.txt](llms.txt).

## Install

Requires Git and Bun 1.4.4 or newer. Run inside the repository you want governed:

```bash
bunx --bun @agentsfleet/orly init
```

Complete `init`'s setup items, commit generated files, and run `init` in every checkout because Git does not clone hooks.
Run `bunx --bun @agentsfleet/orly doctor` to check setup. Generated Git hooks invoke the pinned package through `bunx`; no global installation is required.

Declare your existing commands in `.orly/orly.json`:

```json
{
  "commands": {
    "conform": [["make", "conform"]],
    "verify.unit": [["make", "test"]]
  }
}
```

Choose commands your repository actually provides. At least one named `verify.*` command is required; `conform` is optional and documentation repositories can use `verify.docs`.

## Verify

| Command after `bunx --bun @agentsfleet/orly` | Checks |
|---|---|
| `gate work` | Configuration and the declared conform command |
| `gate verify` | Documentation and non-test verification commands |
| `gate pr` | Branch, clean/pushed revision, documentation and declared verification |

Prerequisite failures block commands, and a failed command leaves later groups `not_run`.
Output distinguishes passed, failed, blocked, cancelled and conditional skips; only the owner authorizes overrides.
Invocations default to 30 minutes and 64 mebibytes; exceeding either limit stops the workload and preserves a private output receipt.

## Optional reuse

Checks run fresh by default. A reviewed hermetic lane can opt in:

```json
{
  "reuse": {
    "verify.unit": {
      "hermetic": true,
      "max_age_ms": 3600000,
      "toolchain": [["bun", "--version"]],
      "inputs": []
    }
  }
}
```

```sh
bunx --bun @agentsfleet/orly gate pr --reuse-verification
```

Both opt-ins are required; evidence binds source, revision/base, commands, configuration, environment and toolchain while retaining original output and run time.
Inputs must be exclusively owned and fully identified, including ignored dependencies.
Stale, damaged, failed or incomplete evidence requires a fresh run; live integration and memory lanes cannot opt in.

Private history lives beneath Git metadata. [Architecture](docs/ORLY_ARCHITECTURE.md#verification-evidence) documents integrity, interruption recovery, input limits and cleanup.

## Update and ownership

```sh
bunx --bun @agentsfleet/orly update
```

Commit managed-file changes before updating; existing instruction files retain owner content as Orly refreshes generated rules, selected standards and skills.
Repository-owned commands and settings survive updates.
[Installation details](docs/architecture/installation.md) explain ownership refusals and recovery.

## Develop

```sh
bun install --frozen-lockfile
git config core.hooksPath .githooks
make audit
make install-evals
```

`make audit` checks source/rule parity, types and tests; `make install-evals` exercises packed installations in scratch repositories.
Shipping runs the final `gate pr` once on the pushed tree.
Edit source rules and regenerate with `bin/orly update --no-hooks`; keep generated files synchronized.

[Architecture](docs/ORLY_ARCHITECTURE.md) · [Changelog](docs/CHANGELOG.md) · [Configuration schema](schemas/profile.schema.json)
