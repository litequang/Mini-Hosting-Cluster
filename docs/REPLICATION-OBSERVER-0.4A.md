# v0.4A — Replication observer (LAB only)

- `mhc-full replication gtid`: queries only global variables through a local MariaDB socket, no replication configuration or credentials.
- `mhc-full replication scan`: read-only file hashing; stores only private local manifest, not a backup, not a file transfer. Selection: registered MHC static content, WordPress uploads, known Thờ Phượng Pro Sheet storage. No `.env` or dotfiles scanned.
- `mhc-full replication status`: cached local scan and delta vs previous local scan; stale after 5 minutes. **Local change counts cannot measure remote lag or replica consistency.**
- SHA256 is content verification, not authenticity; manifest storage chmod 0600. File hashes and paths intentionally never exposed through web API.
- Fail closed for symlinks, unsupported special files, missing root, scan mutations and limits (20,000 files, 8 GiB total, 512 MiB/file, 25 levels).
- Panel 9090 original app remains primary UI; `/api/mhc/replication` observes private summary through a read-only bridge behind original session.

## Next steps to v0.4B/C
1. Android acceptance on isolated devices for MariaDB socket read-only GTID and file digest; verify no data loss/symlink escapes.
2. Design canonical MariaDB server_id/binlog, dedicated replication user, constrained network/SSH route; separate preflight and reversible lab-only provisioning.
3. Implement continuous *file* incremental transport with authenticated peer pairing, snapshot generation IDs, staged apply, checksums, delete policy and crash recovery; compare nodes without leaking secrets.
4. Readiness cannot become `true` until continuous DB and content convergence with authoritative fencing/lease are proven.
