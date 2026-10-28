# Go

This standard covers Go packages: errors, goroutines, contexts, resource release, interfaces and tests.
A coding agent reads it before editing a `*.go` file, and a reviewer judges a diff against it.

## Errors

### GO-PANIC — A package returns errors to its callers, and no panic crosses its boundary.
- **Applies to:** `**/*.go`
- **Checked by:** review
- **Bad:** `func ParseConfig(b []byte) Config` that calls `panic(err)` on malformed input
- **Good:** `func ParseConfig(b []byte) (Config, error)`
- **Why:** a caller can handle a returned error, but a panic from another package takes the whole process down.

### GO-WRAP — An error is wrapped with `%w` and context the caller lacks, and no fact is wrapped twice on the way up.
- **Applies to:** `**/*.go`
- **Checked by:** review
- **Bad:** `return fmt.Errorf("load config: %v", err)`, under a caller that adds "load config" again
- **Good:** `return fmt.Errorf("read %s: %w", path, err)`
- **Why:** `%w` keeps the cause matchable with `errors.Is` and `errors.As`, and repeated context buries the cause under noise.

## Concurrency

### GO-EXIT — Every goroutine has a stated exit: a context it honours, a channel close, or a `WaitGroup` its starter waits on.
- **Applies to:** `**/*.go`
- **Checked by:** review
- **Bad:** `go func() { for job := range jobs { handle(job) } }()`, where nothing ever closes `jobs`
- **Good:** `go func() { defer wg.Done(); for { select { case <-ctx.Done(): return; case job := <-jobs: handle(job) } } }()`
- **Why:** a goroutine with no exit path leaks, whatever the test says.

### GO-CTX — A blocking function takes a `context.Context` as its first parameter and passes it down, and no struct stores one.
- **Applies to:** `**/*.go`
- **Checked by:** review
- **Bad:** `type Client struct { ctx context.Context }` with `func (c *Client) Fetch(id string) (Project, error)`
- **Good:** `func (c *Client) Fetch(ctx context.Context, id string) (Project, error)`
- **Why:** a stored context outlives the request it belonged to, so cancellation reaches the wrong work or none.

### GO-RACE — Concurrent code has a deterministic contention test that passes under `go test -race`, with no sleep standing in for synchronisation.
- **Applies to:** `**/*_test.go`
- **Checked by:** review
- **Bad:** `go claim(); time.Sleep(100 * time.Millisecond); assertClaimed(t)`
- **Good:** 16 goroutines released together by closing a `start` channel, then `wg.Wait()` and one assertion, run with `-race`
- **Why:** a sleep is slow on a fast machine and flaky on a busy one, and it never forces the race.

## Resources

### GO-DEFER — A release is deferred on the line after its acquire.
- **Applies to:** `**/*.go`
- **Checked by:** review
- **Bad:** `mu.Lock()`, then an early `return err`, then `mu.Unlock()` at the end
- **Good:** `mu.Lock(); defer mu.Unlock()`
- **Why:** the pairing survives every early return, including the ones added later.

### GO-CLOSE — The error from closing a writer is checked, including a deferred `Close`.
- **Applies to:** `**/*.go`
- **Checked by:** review
- **Bad:** `defer f.Close()` on a file the function writes
- **Good:** `defer func() { if cerr := f.Close(); cerr != nil && err == nil { err = cerr } }()`
- **Why:** `Close` flushes buffered data, so a dropped error is a silent truncation.

## Types and tests

### GO-IFACE — Functions accept interfaces and return structs, and an interface is declared in the package that consumes it.
- **Applies to:** `**/*.go`
- **Checked by:** review
- **Bad:** `package store` declaring `type Store interface { … }` and `func New() Store`
- **Good:** `func New() *PostgresStore`, while the consumer declares `type projectReader interface { Project(ctx context.Context, id string) (Project, error) }`
- **Why:** the consumer names only what it uses, so its tests fake a small interface and the producer stays free to grow.

### GO-ZERO — A type's zero value is ready to use, so no caller needs a constructor to get a working value.
- **Applies to:** `**/*.go`
- **Checked by:** review
- **Bad:** `var r Registry; r.Add(f)`, which panics on a nil map until `NewRegistry()` runs
- **Good:** `func (r *Registry) Add(f Project) { if r.byID == nil { r.byID = map[string]Project{} }; r.byID[f.ID] = f }`
- **Why:** a usable zero value removes a whole class of forgotten-constructor panics.

### GO-TABLE — Tests are table-driven by default, with one row per case and one `t.Run` per row.
- **Applies to:** `**/*_test.go`
- **Checked by:** review
- **Bad:** `TestParseEmpty`, `TestParseSpaces` and `TestParseUnicode`, each copying the same body
- **Good:** `for _, tc := range cases { t.Run(tc.name, func(t *testing.T) { … }) }` over a slice of named cases
- **Why:** a new case is one row, and every case reports under its own name.
