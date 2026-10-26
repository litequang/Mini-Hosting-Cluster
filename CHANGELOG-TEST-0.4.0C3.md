# MHC TEST 0.4.0C3 — v0.4C.3 Consistent-Apply LAB Foundation

**Base:** MHC-Full-Installer-TEST-0.4.0C2. **Status:** offline laboratory workflow; not production, not live HA, not a distributed atomic checkpoint.

## Added

- `file-sync checkpoint-create DELTA_ID --confirm=QUIESCED_LAB_ONLY`: on a dedicated source LAB only, check C1 outbound delta, verify that the source tree matches its exact next manifest, require MariaDB `read_only=ON` and an unchanged nonempty `gtid_binlog_pos` before/after file scan, record private `checkpoint.json` bound to bundle metadata and next manifest. Operator attests all writes are quiesced; software cannot independently establish global transaction/file atomicity.
- C2 receiver's immutable SHA-256 verified receipt now optionally binds the exact bytes of `checkpoint.json`; legacy C2 bundle without a checkpoint remains supported for C2-only transfer, but cannot enter C3.
- `file-sync apply-plan DELTA_ID`: receiver-only checks C2 verified receipt + pinned checkpoint SHA-256, C1 verified delta, candidate SHA-256, unchanged replica baseline, MariaDB `read_only=ON` and exact `gtid_slave_pos` match. No mutations.
- `file-sync apply-offline DELTA_ID --confirm=OFFLINE_LAB_APPLY`: rechecks invariants, copies the checked candidate to a *new versioned directory* under `~/mhc-file-lab/applied/<delta-id>`, rechecks GTID and baseline then publishes by rename. The existing `replica/`, websites, SQL DB, tunnel and HA are never altered. No overwrite of an existing version.
- `file-sync consistent-status`: read-only count of offline versions. Hosting Panel **9090** shows sanitized counts/status under Cluster, explicitly warns against HA claims.
- New `tests/file-consistent-lab.mjs` with independent fake LAB MariaDB for GTID mismatch, incorrect read-only, checkpoint tamper, receipt absence, changed source/candidate/baseline, restricted devices and no-overwrite checks.
- Source-only upgrade markers and installer version upgraded to TEST 0.4.0C3; all old functionality retained. `vendor/` HA staged sources remain inactive.

## Explicit limitations and acceptance gates

- `GTID match + file SHA-256 + operator-asserted quiescence` is **not cryptographic/transactional proof** of a cross-resource atomic snapshot. No DB/file capture transaction spans MariaDB and filesystem. For true service readiness, implement a coordinated write gate/freeze, recoverable checkpoint protocol, tested replay, independent verification and live Android chaos tests.
- No automatic periodic replication, live file/SQL apply, tombstone deletion on serving sites, database import, RPO/RTO claim, write fencing, HA promotion, Cloudflare routing or production changes.
- Source/receiver operations require *separate disposable TEST devices* with no registered managed website, production marker, or HA/cluster footprint. Do not use against Vsmart LAB if `demo` site remains registered; source-only **code upgrade** is allowed.
- C2 transfer via pinned SSH still needs validation on actual two Android LAB devices. Unit/integration tests simulate local MariaDB and C2 handoff.
