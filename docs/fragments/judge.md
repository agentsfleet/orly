<!-- Contributor fragment for M07_001 release integration. -->

Jev is TypeSafe's System One decision model. Explicit live judging sends bounded evidence and versioned questions to its pinned HTTP API.
Choice selects a declared option, Noul estimates whether a condition holds, and Score rates ordered levels.
Rust validates every answer and retains authority over facts, approvals, commands, and gate results.

Live judging requires an enabled capability, an environment key, and permission from the outer invocation.
The complete request passes engine checks and native gitleaks scanning before upload.
This upload check uses engine-owned rules; repository suppressions cannot authorize disclosure.
Ordinary hooks use validated replay and need no provider credential.

The lane exposes behavior through roles:

| Role | Input and behavior |
|---|---|
| `DecisionEngine::infer` | Bounded state and versioned questions produce typed answers. `JevEngine` supplies the current provider implementation. |
| `Judger::judge` | A batch, deadline, refresh choice, and timestamp produce a recorded or incomplete judgment. `LiveJudger` and `ReplayJudger` share this interface. |
| `Invoker::invoke` | Runs a judger with pair, concurrency, and deadline limits; records requests through invocation-owned observations and collects deterministic result order. |
| `JudgmentStore` | Reads matching answers and writes validated refresh history. `StoreInput` carries the deadline through file locking; `ReplayStore` holds private Git state. |
| `Decider::decide` | Applies declared Rust policy to one answer. |
| `PlanComposer::compose` | Preserves exact required nodes and adds only known optional actions; keeps every constituent answer inspectable. |

Engine identity includes provider and pinned model. Changing either invalidates replay.
Another provider can implement `DecisionEngine` and return the same typed primitives without using Jev's transport.
This lane ships Jev; additional providers and aggregation need separate policy and evaluation evidence.
The foundation's per-question `Judge` interface uses an offline adapter until release integration connects the lane.

Requests contain at most 16 pairs. An invocation accepts at most 128 pairs and permits two concurrent requests.
State, request, and response limits are 16 kibibytes, 24 kibibytes, and 1 mebibyte.
The total invocation deadline is 30 seconds, including scan, replay locks, and eligible transient retries.
Live requests permit at most three attempts.
Missing evidence, failed authorization, invalid answers, and absent replay remain incomplete; they cannot turn an exact gate green.

Replay checks the complete canonical inference identity and typed response.
Refresh appends a run while ordinary replay selects the original retained run.
Question meaning and evidence changes invalidate replay; policy thresholds and routing change the plan digest instead.
Hosts select the ignore-local-records policy for Continuous Integration (CI).
Both the batch judger and the foundation adapter honor that policy.
Retention expires and evicts individual runs, so a fresh refresh can survive an older response's expiry.

A tuning candidate becomes usable calibration only after three passing held-out repeats.
Calibration binds question meaning, builder version, finding polarity, provider, and model.
Changed bindings and incomplete or failed held-out evidence cannot activate policy.

Validate the question bank and corpus without a key:

```sh
cargo xtask judge-check
```

Obtain your own API key from the [TypeSafe dashboard](https://console.typesafe.ai/keys), as described in its [quick start](https://docs.typesafe.ai/introduction/quickstart).
Both credential methods below provide `TYPESAFE_API_KEY` to the authorized process.
The native runner reads the process environment; it does not read a key from repository configuration.

For a vault-backed run, save the key in 1Password and copy the concealed field's secret reference.
Replace `<VAULT>`, `<ITEM>`, and `<FIELD>` with the locations in that reference:

```sh
export TYPESAFE_API_KEY='op://<VAULT>/<ITEM>/<FIELD>'
```

Expected output: none. The parent shell holds the reference.
Prefix the live evaluation command below with `op run --`.
[1Password's run command](https://www.1password.dev/cli/reference/commands/run) resolves the reference into the child process environment for that command.

An independent contributor can use their own TypeSafe account and a terminal session instead.
In Bash, run these lines interactively and enter the key at the prompt:

```bash
read -r -s -p 'TypeSafe API key: ' TYPESAFE_API_KEY
printf '\n'
export TYPESAFE_API_KEY
```

Expected output: `TypeSafe API key: ` followed by a newline; the entered value is hidden.
Start `bash` first when your current shell is Zsh.
Run the live command directly, then clear the terminal's credential variable:

```sh
unset TYPESAFE_API_KEY
```

Expected output: none. Future commands from that shell no longer inherit the key.
Keep credential values out of source, shell profiles, command arguments, and report output.
Offline validation and replay need no provider credential.

For live evaluation, first obtain owner approval of the labels at a frozen commit containing the exact bank and corpus.
Prepare independent coding-agent predictions for every complete held-out case, bound to the corpus digest.
Set `TYPESAFE_API_KEY` in the authorized process, then run:

```sh
cargo run --locked -p xtask --features orly/judge-transport -- judge-eval \
  --allow-upload \
  --reviewed-commit <REVIEWED_COMMIT> \
  --agent-report /host/private/agent-report.json \
  --scanner /absolute/trusted/gitleaks \
  --state /host/private/judge-state \
  --report /host/private/judge-report.json
```

`<REVIEWED_COMMIT>` is the full Git revision approved by the repository owner.
The runner checks the frozen Git inputs and independent predictions before inference.
Live transport requires the `orly/judge-transport` feature shown in the command.
It selects a threshold per question using tuning cases only.
Passing tuning permits three fresh held-out repeats, each checked independently.
The report retains tuning trials, raw answers, counts, disagreements, requests, tokens, and latency.
Failed tuning produces a failed report and leaves held-out cases unused.
Missing credentials or owner review leave live release proof pending; offline tests do not establish provider quality.

M07_001 owns public command routing, documentation assembly, and the 0.12 release.
