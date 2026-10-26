# TEST 0.5.0B4 — v0.5B.4 Isolated LAB Write Adapters

## New code

1. Extended `bin/write-path-gate-lab.mjs` with three additional independent offline fixture adapters: `preview-write`, `upload-fixture`, `job-receipt`; original `canary-write` preserved. All use a shared, explicit witness verification before staging and again before atomic local file publication, reject changed epochs, symlink/unsafe directory, excessive payload and production/registered hosting node.
2. Four dedicated LAB subfolders under `~/mhc-writegate-lab` with restrictive permissions, random file basenames, per-write byte caps, no overwrite/delete, 24-artifact per-adapter quota, SHA-256 diagnostic audit, no user-chosen destinations.
3. Added `tests/write-adapters-b4.mjs` — **51 assertions** using a local mocked witness. `tests/write-path-gate-lab.mjs` regression **36 assertions**.
4. Updated original authenticated **Hosting Panel 9090** with "v0.5B.4 Write Gate Adapters LAB", indicating **four offline fixture types**, while explicitly preserving **nine UNGUARDED production write-path categories**. Read-only endpoints; no new role-control UI or Panel 19090 replacement.
5. Updated marker compatibility for completed TEST B4 installations across installer, clone, enrollment and readiness.
6. New detailed `docs/WRITE-PATH-ADAPTERS-0.5B4.md` and this changelog.

## Strict limitations

- No real HTTP/PHP/WordPress/MariaDB/Sheet/Sheet+/uploads/Panel/cron/SSH/backup/Cloudflare write path is gated or fenced by B4.
- Lease checks and local filesystem publish are **not one atomic distributed operation**. Double-check does not prove split-brain safety.
- No Cloudflare witness is deployed; two Android LAB replication has not been accepted; no routing changes or HA toggle.
- Production M51/X7b remain untouched. Vsmart only receives source-only upgrade after local preflight.

## Test status

- 51/51 new isolated adapter assertions; 36/36 old canary regression.
- Original Panel 9090 secured bridge; 70/70 Panel HTTP; enrollment/clone/readiness/Android acceptance test groups PASS.
- Other existing test groups through node-clone PASS in aggregated run. Aggregated run hit runner timeout before the last four groups, which each passed when run individually. **No false claim of a single completed full-suite run**.
- No physical Android/Cloudflare testing in this build.
