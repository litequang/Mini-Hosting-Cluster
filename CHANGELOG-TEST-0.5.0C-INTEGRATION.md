# MHC TEST 0.5.0C-INTEGRATION — Release notes

## New — single larger v0.5C integration deliverable
- `bin/manual-switchover-e2e-lab.mjs`: real three-listener localhost HTTP drill, two synthetic fixture writers and ingress with strict fail-closed gating.
- Ordered drill: A writes → ingress freeze → A writes a distinct event → B copies/compares → A mocked fence tested by direct HTTP → mock term handoff → B receives writes → witness outage denies subsequent writes.
- Four fault scenarios: no old fence, divergent replica fixture, witness offline during handoff, crash immediately after fencing. All abort in frozen route state without granting a real Primary.
- Sensitive-data/permission guard: 0700 LAB directory, 0600 audit report and lock, symlink and site registration checks, exclusive lock, audit hash-chain verification.
- `~/mhc-full switchover-e2e plan|status|run --confirm=RUN_SYNTHETIC_LOOPBACK_SWITCHOVER_ONLY`.
- Read-only sanitized drill summary integrated into **existing Panel 9090**, Cluster view; no new Panel, no write APIs.
- Installer/marker compatibility updated for `TEST 0.5.0C-INTEGRATION`; source-only upgrades retain previous 0.5.0C-LAB support and rollback.
- `tests/manual-switchover-e2e-lab.mjs` 68 assertions, added to self-test. Existing hosting, clone, GTID, file replication, witness and Panel tests retained.

## Not implemented / not accepted
- No independent Android/DB fencing, MariaDB GTID takeover, real Cloudflare witness deployment, WordPress/TPP writer interception, Nginx or public domain routing, HA arm or actual manual switchover.
- In-memory fixture replication is NOT MariaDB replication or consistent DB/file snapshot; mocked term handoff is NOT a durable third-party lease.
- v0.4 physical Android end-to-end acceptance still pending; v0.5C does NOT qualify for production deployment.
