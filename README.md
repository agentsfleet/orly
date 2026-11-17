<div align="center">

<img src="https://raw.githubusercontent.com/agentsfleet/orly/main/branding/agentsfleet-mark-glow.png" width="140" alt="agentsfleet" />

# orly

[![Bun ≥1.4.4](https://img.shields.io/badge/Bun-%E2%89%A51.4.4-black)](https://bun.sh)
[![MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Repository rules and verification gates for coding agents.

</div>

Works with Claude Code, Codex, OpenCode and Amp. **Agents:** read [llms.txt](llms.txt).

## Install

Needs Git and Bun 1.4.4 or newer. In the repository you want governed:

```bash
bunx --bun @agentsfleet/orly init
```

Commit what `init` writes, and run `init` in each checkout, because Git does not clone hooks.
Generated Git hooks invoke the pinned package through `bunx`, so no global install is needed; `bunx --bun @agentsfleet/orly doctor` checks the setup.

Declare the commands your repository already has in `.orly/orly.json`; at least one `verify.*` is required:

```json
{ "commands": { "conform": [["make", "conform"]], "verify.unit": [["make", "test"]] } }
```

## Gates

| `bunx --bun @agentsfleet/orly …` | Checks |
|---|---|
| `gate work` | configuration and the `conform` command |
| `gate verify` | documentation and the non-test `verify.*` commands |
| `gate pr` | branch, clean pushed revision, documentation and every `verify.*` command |

The default `gate` runs `work` then `pr`, with fast verification once. Checks run fresh unless reviewed policies explicitly permit evidence reuse.
Only the owner records an override.

[Architecture](docs/ORLY_ARCHITECTURE.md) covers limits, opt-in evidence reuse and overrides.

## Burst lanes

```sh
bunx --bun @agentsfleet/orly burst acceptance --provider aws-spot
```

Slow `burst.<name>` lanes run on a machine rented for the run, on AWS or E2E Networks, or in place with `--provider here`.
No gate runs them; [Burst lanes](docs/BURST.md) covers setup and costs.

## Update

```sh
bunx --bun @agentsfleet/orly update
```

Commit first: update replaces only managed files Git reports clean, and keeps your commands and settings.
[Installed content](docs/architecture/installation.md) explains what is managed and how a refused update recovers.

## Develop

```sh
bun install --frozen-lockfile
git config core.hooksPath .githooks
make audit           # rules, types and tests
make install-evals   # packed installs in scratch repositories
```

Edit the source rules, then regenerate with `bin/orly update --no-hooks`.

[Architecture](docs/ORLY_ARCHITECTURE.md) · [Changelog](docs/CHANGELOG.md) · [Configuration schema](schemas/profile.schema.json)
