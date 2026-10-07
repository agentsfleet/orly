# Changelog

## 0.13.0 — 2026-10-07

A source-checkout examiner checks unsupported completion claims through deterministic offline exercises.

- **Comparison** — freezes six runtime questions and evaluates five proposed checks with separately validated expected answers.
- **Task evidence** — hidden behavioral checks reject seeded false completions; reports retain failed and missing attempts.
- **Adoption** — keeps candidates evaluation-only because independent model and paired-task measurements remain unavailable.

The installed `.orly/` layout and 0.12.1 fixes remain unchanged. Publication requires a separate owner action.

## 0.12.1

Staged audits avoid copying repository files when their filename scope is empty.

- **Audit preflight** — selects filenames from a copied index before materialising repository files; relevant audits retain coherent staged reads.
- **Check diagnostics** — prints hosted job or pipeline states and links before reporting pending or failed checks.
- **Release status** — corrects documentation that still described published 0.12.0 as an unpublished candidate.

## 0.12.0 — 2026-10-07

Setup guidance now distinguishes the published package from the local release candidate.

- **Migration guidance** — names `.orly/` destinations and explains preserving repository-owned hooks with `--no-hooks`.
- **Release scope** — retains the six existing judgment questions and records the comparison evaluator as parked for proposed 0.13 work.

The `.orly/` layout and judgment commands already shipped in 0.11.0; this entry claims no new runtime behavior.
