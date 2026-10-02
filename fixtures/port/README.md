---
type: explanation
audience: contributor
verified: 2026-10-02
product_version: 0.12.0
executable: false
---

# Native foundation fixtures

## What it is

These files record the source inventory, proof references, and candidate native
command declarations for the Rust port.

| File | Purpose |
|---|---|
| `inventory.json` | Assigns each path at the recorded Git revision a disposition, successor, and required proof references. |
| `proofs.json` | Links inventory obligations to native tests or exact comparison files. |
| `native-orly.json` | Declares native Cargo formatting, lint, and test commands using the current configuration schema. |
| `interfaces.json` | Freezes examples of shared snapshot, decision, plan, registry, coverage, delivery, and evidence types. |

## Why it exists

The port needs repeatable inputs before the live verification setup changes.
Tests consume these fixtures through the same parsers used by the native engine.

## How it behaves

The relocated-binary tests copy the executable into a temporary directory.
Its cleared environment exposes only that directory on its executable search path.
Git is the only additional executable provided there.

The tests check rendering, validation, dry-run installation, actual installation,
and doctor results. Negative cases remove Git, invalidate command declarations,
and change installed rules. Assertions check exit codes, JSON results, and files.

Interface tests parse the frozen examples into the production types and serialize
them back to the same JSON values. They reject unknown fields, invalid decision
probabilities, and stale inputs. Published schemas must match Schemars output for
their Rust types.

Snapshot source and decision primitive tags use empty struct variants.
Serde then rejects extra fields even when the tag has no declared fields.
For example, `{"kind":"choice","extra":true}` fails parsing.

The native configuration's `releases` field selects repository-relative shared
document storage. Omitting it uses `.orly/rels/`; `"releases": "release-docs"`
selects another contained root ([storage settings](../../src/core/storage.rs)).

Installation preserves shared documents and leaves their Git tracking unchanged.
Changing `releases` does not move existing documents. Installation rejects roots
that overlap generated files, recorded prior files, or Git's private directory
([storage tests](../../tests/migration/storage.rs)).

Doctor leaves completed specs under `<releases>/v*/done/` and `docs/v*/done/`
unchanged. It checks current shared documents for stale references
([doctor](../../src/install/mod.rs)).

The recorded installation fixture contains each resource named by its managed
inventory. A migration test checks the full embedded replacement payload.
The interruption matrix uses smaller replacement bytes for the same destinations.
Each operation is interrupted before its effect, after its effect, and after its
journal update. Retry must remove verified old copies and preserve consumer text.

Three project fixtures cover Rust, TypeScript, and mixed source roots.
Tests change selectors through pack data and check uncertain answers remain unresolved.
The mixed fixture pins inspected source evidence; it does not run the external project.

## Limits

The native command fixture is a development input. It does not replace the live
`.oracle/orly.json` or prove that every existing enforcement check has a native successor.
Release integration owns that replacement after the remaining checks are implemented.

The relocation test proves behavior on the host running it. It does not prove
release packaging or execution on other operating systems. Restricted executable
search paths do not prevent absolute-path process launches.

Unix file modes preserve executable bits. Windows uses inherited permissions
and supported file attributes; it does not provide Unix permission semantics.

Inventory reference validation proves that a named test exists or comparison
bytes match. Each behavior still requires a meaningful test and a recorded result.

Interface examples use labeled sample identities rather than captured repository
evidence. They pin serialization and validation behavior; runtime execution still
needs its own tests.

## Related pages

- [Native architecture](../../docs/ORLY_ARCHITECTURE.md)
- [Relocated-binary tests](../../tests/foundation/payload.rs)
- [Inventory tests](../../tools/xtask/src/manifest_tests.rs)
- [Shared interface tests](../../tests/foundation/interfaces.rs)
