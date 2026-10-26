# Database/data-plane requirements for actual auto failover

Existing M51 -> X7b sync snapshots are valid disaster recovery but are NOT a zero-RPO replica.

To implement continuous sync safely, keep this exact order:

1. Preserve current complete M51 backup and X7b restore. Record MariaDB major version and server IDs. Backup live config before changes.
2. Set distinct server_id and row-format binary logging on M51; enable log_slave_updates, gtid_strict_mode as appropriate to **MariaDB version**. Requires controlled MariaDB restart. Verify startup before changing downstream.
3. Create a narrow replication-only account reachable over a secure LAN connection/Tailscale-like private link; avoid exposing database 3306 to public Internet. Use TLS or protected transport. Credentials stay outside source tree.
4. Reseed X7b from a transactionally consistent binlog/GTID-coordinated snapshot, not from arbitrary SQL dump + guessed position. Configure MariaDB replica using correct `MASTER_USE_GTID=slave_pos` (or version-specific syntax). Test `MASTER_GTID_WAIT()` for exact target positions.
5. Handle mutable sheet files and non-DB assets continuously, atomically, with file manifests/hashes. DB and files must represent a consistent application checkpoint; a DB-only GTID check does NOT guarantee the Sheet files are current.
6. Run failover drill with a test dataset; record last acknowledged writes, lease expiry, restored GTID, filesystem manifest, test login and upload, application revision; verify RPO/RTO without touching live writes.
7. To fail back to M51 after X7b has taken writes, X7b is now the source of truth. Rebuild/repoint M51 as its replica, wait for its exact current GTID and files, verify, then acknowledge rejoin and controlled switchover. NEVER start outdated M51 as primary merely because it came online.
8. For strict zero data loss, asynchronous MariaDB replication is not sufficient; add a truly synchronous acknowledgment design/cluster, durable quorum/witness and failure testing. Even then, define outages that intentionally sacrifice availability to preserve consistency.

`tools/replication-preflight.sh` only observes server state. This release deliberately does not run destructive ALTER/CHANGE MASTER actions or expose unknown real production passwords.

## Acceptance criteria for turning on automatic write failover

- Primary read/write path exclusively behind lease gate; old public route removed.
- Coordinator DO reachable and persistence verified from both nodes.
- MariaDB GTID replication configured, last source/applied checkpoints audited.
- File replication and application releases in sync.
- DB no divergent writes across recovery tests, no replica replay after promotion.
- Forced outage test confirms only one writer, term increase, old writer fenced.
- Clear user-selected RPO policy. Strict zero-loss + unknown missing acks => no auto promotion.
- Failback blocked until rejoin test completes.
