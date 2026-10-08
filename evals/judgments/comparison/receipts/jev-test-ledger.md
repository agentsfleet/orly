# Actual TypeSafe Jev test ledger

Recorded Oct 07, 2026: 09:35 PM. Section 6 adds real provider measurement through the existing bounded transport. Deterministic expectations grade replies; they do not replace Jev.

| Changed behavior or failure boundary | Required proof | Status |
|---|---|---|
| Frozen baseline/candidate question selection; upload excludes labels and example identities | Exact input and question comparisons | Verified |
| Request schedule cap, duplicates, forged/malformed/oversized inputs | Refusal before scanner and network start | Verified |
| Missing credential or scanner failure at each ordered input | Zero uploads; every scheduled example retained unavailable | Verified |
| Real HTTP request/strict typed reply, refusal, invalid reply and transport failure | Native answers retained; one request each; later inputs continue | Verified |
| Retain-before-request and retention failure at each ordered write | In-flight durable record precedes upload; failed write prevents next upload | Verified |
| Consumer original/restored and owner digests; each submitted/hidden/repaired assertion | Verified actual receipt accepted; tampered/missing/stale/duplicate receipt refused | Verified |
| Noul and Choice uncertainty; actual answer disagreement; missing response | Native value preserved; graded uncertainty and red/missing rows visible | Verified |
| Replay input identity, source inventory, order, types and impossible reply/request combination | Tampering refused; replay performs zero requests | Verified |
| Candidate adoption and measured-result boundary | Actual Jev observations cannot claim independent paired improvement | Verified |
| Exclusive output directory, consumer preservation, replay bound and durable interrupted schedule | Existing files preserved; all scheduled attempts remain represented | Verified |

No live provider requests belong to automated tests. Local HTTP servers exercise the production transport; network and scanner failure injections sit at external boundaries.

Evidence: `audit-boundary.txt` runs all three Jev test files, including the stale-source regression. `jev-live.json` and `jev-replay.json` retain equal attempts, grades and source inventories; replay requests = 0.
