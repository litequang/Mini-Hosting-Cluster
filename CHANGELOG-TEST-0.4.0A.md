# TEST 0.4.0A — Continuous Replication / Phase A: Observer

## Roadmap placement
MHC v0.2 Monitor → v0.3 Multi-node registration/clone/Panel → **v0.4 Continuous Data Replication** → v0.5 Manual Switchover → v0.6 Automatic Failover → v0.7 Smart Cluster → v1.0 Production.

This is **the first read-only foundation of v0.4**, not completed continuous replication.

## Changes from TEST 0.3.11
- Introduce `mhc-full replication gtid`: read-only MariaDB global GTID/binlog/strict/read_only diagnostics via local socket. No credentials returned, no database changes.
- Introduce `mhc-full replication scan`: SHA-256 snapshot of content under explicitly registered static site roots, registered WordPress `wp-content/uploads`, and known Sheet folder when present. Hidden/secret files excluded. No restore or file transfer.
- Introduce `mhc-full replication status`: summarizes latest locally observed manifest, time/staleness and added/modified/removed file counts relative to earlier local scan. Private manifest uses file mode 0600; if scan fails it cannot overwrite last valid state.
- Fail closed on symlinks/special files, modified files during hashing, missing registered roots, invalid previous manifest, file count/size/depth limits.
- Add read-only authenticated `GET /api/mhc/replication` to the original 9090 Panel and a clearly labeled v0.4A subsection inside Cluster. Never export the file path list/hashes or raw GTID positions to the Panel; no additional login service.
- Update all-in-one installer upgrade marker and LAB enrollment/clone/readiness gates, retaining compatibility with TEST 0.3.11.
- Add dedicated integrity, GTID mock and Panel auth/redaction regression tests.

## Explicitly NOT delivered
- Real MariaDB GTID replica setup, continuous binlog streaming, replication users, cross-node GTID alignment, lag guarantees, reverse replication or automatic resync.
- File delta transfer, SSH pairing for replicas beyond existing snapshot clone, distributed checksum agreement or removal propagation.
- Atomic DB/files consistency, automatic backup verification, production WordPress acceptance on Android, Cloudflare route changes, write fencing, HA ARM, manual/automatic switchover.

## Security / rollout
- **No Vsmart/M51/X7b nodes have been modified from this package in this chat.**
- TEST source-only upgrade for a known isolated LAB only, then explicit `hosting-panel plan/apply` to update original Panel 9090; both leave `.env`, databases, website registry, runit/Cloudflare settings and SSH unchanged.
- Any archive/snapshot may contain secrets, but observer does not package files. SHA manifests still include relative content names and must be kept private.
