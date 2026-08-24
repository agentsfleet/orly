# Rust authoring

Use ownership and borrowing to make resource lifetime visible. Keep `unsafe`
blocks small and state the invariant they rely on. Preserve error variants until
the caller has enough information to decide whether to retry or stop.

Test the feature combinations the repository actually builds. Concurrency work
needs a deterministic contention test, not only a happy-path asynchronous test.

The repository owns formatting, Clippy, build, test, security, and benchmark
commands — it declares them in `.oracle/orly.json`.

## Reference guideline (mandatory in review)

Microsoft's Pragmatic Rust Guidelines are this pack's depth — thorough,
agent-facing, and continuously maintained upstream. The local copy lives at
`~/Projects/oss/rust-guidelines/all.txt`; fetch it when absent:

```bash
mkdir -p ~/Projects/oss/rust-guidelines && \
  curl -fsSL https://microsoft.github.io/rust-guidelines/agents/all.txt \
  -o ~/Projects/oss/rust-guidelines/all.txt
```

Every Rust REVIEW — and any adversarial pass over `*.rs` — reads it
**sectioned, never whole-file** (186 sections):
`grep -nE "^#+ " ~/Projects/oss/rust-guidelines/all.txt`, read the sections
the diff touches, and cite the guideline IDs (`M-…` mnemonics, e.g.
`M-UNSOUND`, `M-SIMPLE-ABSTRACTIONS`) applied or consciously diverged from.
Local convention wins on conflict, but the divergence is named in the review
output. Refresh the copy when the user asks or a cited rule looks stale
(re-run the fetch; upstream updates continuously).

## Constant discipline (RULE UFS)

`audits/ufs.sh` reads `*.rs`. It did not until this pack said so, and the cost
was concrete: a crate spelled a wire verb inline twice — `pong == "PONG" ||
pong.contains("PONG")` — while `write_any.sh` printed a green UFS row over the
file, because the façade had always declared `*.rs` and the leaf had never read
it. Bind the repeated literal to a `const` or `static` and use the name.

Three Rust shapes are held out of the count, because no rename can fix them:

- **`#[cfg(test)]` and `#[test]` blocks.** Rust keeps unit tests inside the file
  they cover, so fixture keys would otherwise read as that file's worst debt.
- **Attribute literals** — `#[serde(rename = "…")]`, `#[cfg(feature = "…")]`,
  `#[doc = "…"]`. An attribute takes a literal token by language rule; a const
  is not accepted in that position.
- **`tests/` and `benches/`** at the crate root, which are fixture trees.

Everything else counts, including `examples/`, which ships and compiles.

## Evolution

This pack is young next to the Zig façade and grows the same way: a Rust
incident worth keeping becomes a rule or **Example:** line via the
rule-extension protocol — never a memory file, never a milestone cite.
