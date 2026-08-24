# Go authoring

Return errors, do not panic across a package boundary. Wrap with `%w` so the
caller can still match the cause, and add context the caller does not already
have — never re-wrap the same fact twice.

Every goroutine needs a stated exit: a `context.Context` it honours, a channel
close, or a `WaitGroup` the caller waits on. A goroutine with no exit path is a
leak whatever the test says. Take a `context.Context` as the first parameter on
anything that blocks, and pass it down rather than storing it in a struct.

Defer the release beside the acquire — `defer file.Close()`, `defer mu.Unlock()`
— so the pairing survives an early return. Check the error from a deferred
`Close` on a writer; a dropped flush is a silent truncation.

Accept interfaces, return structs, and define the interface where it is
consumed. Keep zero values usable so a caller need not call a constructor to get
a working value.

Table-driven tests are the default shape. Concurrency work needs a `-race` run,
and a deterministic contention test rather than a sleep.

A string literal repeated in one file becomes a named constant — `audits/ufs.sh`
reads `*.go` and enforces it. Two Go shapes are held out, because no rename can
fix them: members of a `const ( … )` group, which state the binding keyword once
on the opening line rather than per member, and backtick struct tags, whose
quoted halves (`json:"id"`) are addressed by reflection and cannot hold a const.
Both are carve-outs for what the *language* makes unfixable, not permission —
a flag name or a label spelled inline twice is still the rule.

The repository owns formatting, vet, lint, build, and test commands — it
declares them in `.oracle/orly.json`.
