---
type: reference
audience: contributor
verified: 2026-10-07
product_version: 0.13.0
executable: false
---

# Jev judgment advice

## Synopsis

The 0.13.0 candidate retains the six questions shipped in 0.11.0.
The contributor [comparison examiner](architecture/judgment-evaluation.md) tests five evaluation-only additions with offline controls and explicitly requested TypeSafe Jev measurements.
Its results establish examiner behavior; model quality and autonomous agent improvement remain unmeasured.

`orly judge` asks one bounded question about evidence you select.
It accompanies planning, verification, review and documentation.
Its answer suggests an inspection or a fixed next action.

```text
orly judge <plan|verify|review|document> --input <manifest>
  [--project <root>] [--refresh] [--json]
```

Jev is TypeSafe's System One model.
The command pins `jev-1.13.0` and runs TypeScript source with Bun.
Use the same `bunx` installation as 0.10.x.
TypeScript 7 is development tooling; evidence selection uses a JavaScript parser.

Advice cannot approve work, change a gate result or run a suggested command.
Existing deterministic checks and owner decisions still apply.
Hooks do not request advice or upload source.

## Example with output

Save a manifest describing the required result and its evidence:

```json
{
  "stage": "verify",
  "items": [{
    "id": "locale",
    "question": "verify.assertion",
    "requirement": "The label matches the requested locale's formatted date, including year, month and day.",
    "evidence": [
      { "role": "implementation", "path": "src/label.ts", "selector": { "kind": "file" } },
      { "role": "test", "path": "src/label.test.ts", "selector": { "kind": "test", "name": "label respects locale" } }
    ]
  }]
}
```

Run without refresh to read an existing exact replay:

```sh
orly judge verify --input judgments.json
```

For inputs without a replay, the command reports:

```text
Jev advice — deterministic checks and owner decisions still apply.
locale: incomplete — No exact replay for these inputs. Use --refresh to permit scanned source upload.
```

This result has exit status `2` and makes no provider request.
To request live advice, supply `TYPESAFE_API_KEY` through your environment and install `gitleaks`.
Then explicitly permit the selected source upload:

```sh
bunx @agentsfleet/orly judge verify --input judgments.json --refresh --json
```

The report includes typed answers, selected source references, request counts, elapsed time and token usage.
The report excludes selected source text and credentials.

## Options

| Option | Meaning |
|---|---|
| Stage | Must match the manifest and each selected question |
| `--input` | Required JSON manifest path; maximum 64 KiB |
| `--project` | Evidence root; defaults to the current directory |
| `--refresh` | Permits secret-scanned evidence upload and one provider request per item |
| `--json` | Prints a structured report |
| `--help` | Prints usage, selectors and the question catalog |

Kibibyte (KiB) means 1,024 bytes.
A manifest contains at most 12 uniquely named items.
Each item has a question, requirement and at most eight evidence references.

Each reference names a role, relative path and selector.
Roles are `spec`, `implementation`, `test`, `rule`, `claim`, `result` and `context`.
Name necessary unchanged context explicitly; the command does not discover dependencies.

| Selector | Required fields | Selected evidence |
|---|---|---|
| `file` | `kind` | Whole bounded file |
| `function` | `kind`, `name` | One complete TypeScript or JavaScript function |
| `test` | `kind`, `name` | One named executable `test` or `it` call |
| `section` | `kind`, `heading` | One plain Markdown heading through its peer or ancestor boundary |

Duplicate matches, skipped tests, malformed syntax and escaping paths are refused.
Individual files have a 256 KiB cap; complete selected state has a 24 KiB cap.
Oversized evidence is refused rather than truncated.

### Atomic questions and timing

| Question | Run when | Required input | Jev criterion | Decision to take |
|---|---|---|---|---|
| `plan.prerequisites` | Before accepting a plan | One requirement and its `spec` evidence | Necessary inputs, credentials, fetch locations, permissions and ordering are explicit | Clarify a missing prerequisite |
| `plan.observable_result` | Before implementation | One requirement and its `spec` evidence | Success and refusal have concrete observable results | Add the missing expected result |
| `verify.assertion` | Before accepting a test as proof | Required behavior plus complete `implementation` and `test` evidence | The assertion checks that behavior, distinguishes a supplied wrong result, and targets the named operation | Keep the exact assertion or strengthen a weak, missing or misplaced assertion |
| `review.failure_path` | While disposing of a failure finding | One named failure requirement and `implementation` evidence | The path preserves the failure and handles acquired resources | Trace the path and add a failure test |
| `review.rule_applicability` | Before deciding a rule finding | One `rule`, its condition and `implementation` evidence | The selected code meets that rule's trigger | Apply the rule or inspect applicability; the owner decides exceptions |
| `document.claim` | Before publishing a claim | One `claim` plus `implementation` or measured `result` evidence | Evidence supports the exact scope, quantities and conditions | Narrow the claim or collect missing proof |

Choice answers classify assertions as `exact`, `weak`, `wrong_target`, `missing` or `insufficient`.
Noul answers provide a probability for the question's stated property.
The question catalog supplies fixed actions; the model cannot supply commands.

The experiment marks strength below `0.8` as uncertain.
This threshold has no independent calibration.
Uncertainty requires inspection and cannot waive a rule or satisfy verification.

### Replay and request limits

Default mode reads `.orly/judgments/` without contacting the provider.
Identity binds the project root, model, question definition, requirement, selectors and selected source bytes.
Changed inputs require an explicit refresh.

Live preflight checks every item before uploading any item.
Each request has a 15-second deadline, including response reading, and a 64 KiB response cap.
Requests are sequential and receive no automatic retries.

Replay files use private permissions and omit source text.
Their checksum detects accidental reply changes; a local owner can edit and reseal them.
Replay remains advisory and cannot prove independent model accuracy.

## Errors

| Result | Meaning and next step |
|---|---|
| Exit `0` | Every item has valid advice; concerns and uncertainty still require inspection |
| Exit `2` | An item or manifest is incomplete; inspect the reported reason |
| No exact replay | Use unchanged inputs or explicitly request refresh |
| Missing credential | Supply the provider key through the environment |
| Failed secret scan | Remove credentials from selected evidence before retrying |
| Missing or ambiguous evidence | Correct the reference or include necessary context |
| Invalid provider reply | No valid replay was saved; inspect the provider failure before retrying |

## Related pages

- [Architecture](ORLY_ARCHITECTURE.md)
- [Project overview](../README.md)
- [Unit test skill](../skills/orly-write-unit-test/SKILL.md)
