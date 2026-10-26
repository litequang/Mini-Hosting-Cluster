# MHC 0.5C — Writer Path Inventory (READ ONLY)

## Purpose

An independently fenced manual switchover requires **all** externally reachable and local write paths to reject the old Primary. The preceding fence-probe tested only a localhost canary route. That alone is insufficient for WordPress, MariaDB, uploads or SSH. This milestone adds a **local, read-only** surface inventory to make bypass paths visible before touching actual machines.

## Commands

- `~/mhc-full writer-audit plan`: print read-only scope and caveats; no change.
- `~/mhc-full writer-audit scan`: collect allowlisted service status and presence of fixed, known config categories. It does **not** read the contents of files or query MariaDB, connect to Cloudflare or run any write probes.
- The original authenticated Panel 9090, Cluster page, reads a sanitized count through `/api/mhc/writer-audit`. The API never includes absolute paths, configuration content, secrets, account names, DB grants or IP addresses.

All 12 groups retain `fenceStatus: NOT_ATTESTED` even when a service is stopped, a port is unavailable or a configuration is absent. This is intentional: missing observations do not prove a writer is unable to bypass the lease gate.

## 12 classes to close **before** a real cutover

1. HTTP ingress and Nginx
2. PHP-FPM / WordPress
3. MariaDB socket/direct SQL clients
4. MariaDB privileged/local users
5. Direct uploads/filesystem writes
6. Sheet and Sheet+ file writes
7. Hosting admin Panel write APIs
8. Background jobs/cron
9. SSH/Termux shell
10. Backup and restore tools
11. Cloudflare ingress/routing
12. External clients/Android apps

## Android field procedure

Use **two separate disposable Android LAB nodes**, not M51/X7b production and not the Vsmart device hosting `demo`.

1. On each LAB, run `writer-audit scan` (no confirmed write side effects).
2. Compare the 12 groups. A group shown as `NOT_OBSERVED` is **unknown**, not passed.
3. Run v0.4 Field Drill and physical signed evidence steps with independently pinned identities to verify GTID/file catch-up after a real induced outage.
4. Run v0.5C signed Fence Probe canary only on the isolated LAB gateway.
5. For each of the 12 groups, design and independently execute a writer-bypass denial test: privileged SQL, socket clients, uploads, PHP, SSH/admin and out-of-band writers as applicable. This implementation does not automatically exercise or attest these paths.
6. Without hard fencing and verified cutover of EVERY path, **do not** promote the replica, change production routing, arm HA or treat the system as split-brain safe.

## Limits

- Service state is based on named Termux runit services and presence of metadata only; it is not a complete process/port privilege scan.
- A read-only audit can be safely run on an existing host, but that does not authorize other LAB-only commands on that host.
- No DB-grants auditing or mysql write-bypass testing is performed; those remain blocker categories.
- A lease checked at application request time does not fence a privileged direct SQL client or make the DB transaction atomic with Cloudflare witness.
- `scan` results are not signed physical attestation. If shared later, treat them as advisory only.

**Status: CAN_SWITCH_PRIMARY=false; HA=false; PRODUCTION_WRITE_PROTECTION_VERIFIED=false.**
