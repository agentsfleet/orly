# M10 pre-build amendment evidence

Scope: documentation changes for review items 1–4 and the owner-excluded item 5.
This record proves document checks and design dispositions only.
No runtime behavior, model accuracy or migration result is certified.

## Reviewed documents

Digests from `shasum -a 256` after the final document edit:

```text
04aa2a4c9b5b4c2c012620f3b964faa97f9ffb74bd73d5fdd14e27c7871b7591  docs/v2/active/M10_001_P1_CLI_DOCS_JUDGMENT_EVALUATION_012.md
41e0d6cdb83bc5ee7d11c6968679eeb39e8bbb80c65509e9da8b4fd18718ddb2  docs/architecture/judgment-evaluation.md
```

## Counterexample review

These are requirements examined against counterexamples, not runtime test results.

| Finding | Counterexample | Amended requirement and proof location |
|---|---|---|
| Independent labels | All labels pending; unsupported independence flag; fixture author self-review | Section 2 rejects these as minimum-corpus evidence; Dimension 2.1 and corpus acceptance require independently resolved cases |
| Scoring | Healthy code correctly answers yes to rule applicability; a 0.5 response is called insufficient | Interfaces separates native-answer correctness from task health and generic abstention from explicit insufficiency; Dimension 2.3 names both controls |
| Missing outcomes | Dropping invalid responses improves apparent accuracy; zero responses becomes a perfect score | Interfaces fixes denominators and conservative false-concern bounds; all attempts remain counted and empty metrics unavailable |
| Cleanup | Only the workspace is deleted, leaving receipts or owned children | Dimension 3.4 requires both temporary directories and owned processes cleared across five exits; unrelated sentinel survives |
| Abrupt owner loss | Immediate cleanup is claimed after the cleanup owner disappears | Section 3 requires incomplete evidence and ownership-verified recovery on restart; no immediate-cleanup claim |
| Hook identity | A different same-version package runs, or a missing package is called successful gate refusal | Interfaces and Dimension 5.1 bind real hooks to package/source digests and require the declared check's side effect |
| Upgrade scope | Synthetic update checks are presented as the intended consuming-repository migration | Out of Scope and Discovery exclude dedicated 0.11-to-0.12 proof and disclaim the separate 0.10.x-to-0.12 migration |

The parent reviewed label and scoring requirements.
A separate in-host reviewer rechecked cleanup, hook identity and the owner exclusion, finding no remaining high-confidence design gap in those areas.
The architecture page subsequently received blank-line-only paragraph corrections; its requirements did not change.

## Commands observed

`bash audits/spec-template.sh --file docs/v2/active/M10_001_P1_CLI_DOCS_JUDGMENT_EVALUATION_012.md`

```text
OK:   docs/v2/active/M10_001_P1_CLI_DOCS_JUDGMENT_EVALUATION_012.md — no prohibited patterns
OK: docs/v2/active/M10_001_P1_CLI_DOCS_JUDGMENT_EVALUATION_012.md — sections, references, test mappings, and declared commands checked
OK:   SPEC TEMPLATE GATE: clean (1 specs)
```

`wc -l docs/v2/active/M10_001_P1_CLI_DOCS_JUDGMENT_EVALUATION_012.md` reported 303 lines against the template's 320-line cap.

`bun -e 'import {scanDocument} from "./src/doc_rules.ts"; const p="docs/architecture/judgment-evaluation.md"; const findings=scanDocument(p,await Bun.file(p).text()); console.log(JSON.stringify({file:p,findings},null,2)); process.exit(findings.length ? 1 : 0);'`

```json
{
  "file": "docs/architecture/judgment-evaluation.md",
  "findings": []
}
```

The initial document check found six paragraph-length violations; blank-line edits resolved them without changing the checker.

`make conform` exited 0. Its output reported:

- Four renderer/source checks green.
- Named-symbol audit: no violations across 104 files.
- Rules audit: 19 dispatch entries, 10 trigger extensions, 29 scenarios, 20 expected checks.
- Generated rules size: 37,414 bytes against the 37,888-byte cap.
- `ALL CHECKS PASSED`; rule-enforcement ledger matches the tree.

`git diff --check` returned no findings after the final document edit.
Gitleaks directory scans of both documents reported no leaks before the blank-line-only edit.

## Not run

The planned comparison validator, task evaluator, hook-package controls and new behavior tests do not exist yet.
Full release verification and its unit/integration baseline remain pending.
No new model call, native build, live consuming-repository change, merge or publication was performed for this amendment.
