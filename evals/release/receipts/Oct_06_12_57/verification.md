# 0.12 verification record

Recorded Oct 07, 2026. The source digests in `release-source.json` bind the package proof and published documentation.
The candidate is local and unpublished. The consumer branch is `chore/orly-012-migration`, commit `4fd67c465`.

| Check | Result | Receipt |
|---|---|---|
| Archived comparison revision, `bun test src` | 519 passed, zero failed; 2,287 assertions, 52 files | `baseline-unit.txt`, `baseline-source.json` |
| `make audit` | 519 passed, zero failed; type check and all audit groups passed | `audit-final.txt` |
| `make install-evals` | 25 passed, zero failed | `install-final.txt` |
| Real package hooks | Two successful hooks, two rejected checks, one package-resolution failure | `package-hooks.json` |
| Package identity controls | Altered same-version archive and two incomplete inventories refused | `package-hooks.json` |
| `make llmevals CHECK=1` | 73 valid fixtures; no live requests | `fixtures-final.txt` |
| Consumer migration | 70 managed writes; owner bytes, commands, surfaces and hooks preserved; repeat wrote nothing | `consumer-migration.json` |
| Published package comparison | Runtime unchanged; only documentation and version differ | `published-comparison.json` |

Unit test delta is zero against `153a3816b0713f1b0e5a7e363bad7d5b1bd5052d`.
No production code changed. New package-proof assertions run through the contributor command, outside `bun test src`.
The repository declares no separate integration or native memory lane. Its unit suite includes real filesystem, Git, HTTP and process checks.
The package proof adds real registry resolution, installation and generated-hook execution; owned temporary files and the server are cleaned.
These observations do not establish universal memory safety, application-suite success in `agentsfleet`, or model quality.

## Test skill review

Applied `orly-write-unit-test` to the changed source: archive identity and completeness have independent negative controls.
An altered gzip timestamp leaves unpacked package contents unchanged but fails the required archive digest.
An empty file inventory and omission of `src/cli.ts` both fail against independently derived archive contents.
The original missing-inventory implementation accepted the reviewer reproduction; the repaired implementation rejects both cases.

Applied `orly-write-integration-test`: real Bun resolves exact local tarballs and generated hooks invoke the actual package supervisor.
The proof follows registry → package cache → generated hook → declared check → marker and exit result.
A declared check first succeeds, then exits seven; both hooks must fail after writing the marker.
Registry refusal uses a fresh cache and requires a nonzero hook result with an empty marker, so setup failure receives no check-failure credit.
No database, remote worker, payment, lease or application concurrency change exists in this diff.

## Reproduce the package proof

Requires Bun, Python 3, Git and the exact package archives named in `package-archives.json`.
Fetch dependency archives at their recorded versions; create the local candidate with `npm pack`.
Copy `package-archives.json` to a temporary directory and replace each `tarball` path with its local archive path.
Keep the expected archive digests unchanged. Generate the complete input outside the repository:

```sh
python3 - /tmp/package-archives.json /tmp/package-manifest.json <<'PYTHON'
import hashlib, json, sys, tarfile
from pathlib import Path
manifest = json.loads(Path(sys.argv[1]).read_text())
for package in manifest["packages"]:
    archive = Path(package["tarball"])
    if hashlib.sha256(archive.read_bytes()).hexdigest() != package["sha256"]:
        raise ValueError("Package digest mismatch")
    with tarfile.open(archive) as source:
        package["metadata"] = json.load(source.extractfile("package/package.json"))
        package["files"] = {
            member.name.removeprefix("package/"):
            hashlib.sha256(source.extractfile(member).read()).hexdigest()
            for member in source if member.isfile()
        }
Path(sys.argv[2]).write_text(json.dumps(manifest))
PYTHON
bun evals/release/package-hooks.ts /tmp/package-manifest.json
```

The runner independently validates complete inventories with bounded archive parsing before running hooks.
The generated input stays outside the repository; durable receipts retain archive identities and measured outcomes.

The manifest records the tested candidate, not a promise that future repacks are byte-identical.
A changed archive needs a fresh manifest and a new proof; changing the version alone cannot establish identity.
The runner serves only the declared closure from an isolated loopback registry and sets fresh home, configuration and cache directories.

## Earlier unsuccessful attempts

An initial audit included the subsequently parked evaluator and failed; it is not credited here.
A later audit hit the existing cleanup deadline under load. The isolated suite passed four cases, then the full audit passed unchanged.
Another full audit passed all 519 tests but rejected repeated literals in the new proof. Named constants repaired those findings; the final audit passed.
No deadline, gate, hook or scanner suppression was changed.

## Remaining release boundary

Final review binding, commit, feature-branch push, exact-upstream gate and hosted checks are recorded in the Pull Request.
Merge and publication remain owner actions. The comparison evaluator remains parked for proposed 0.13 work.
