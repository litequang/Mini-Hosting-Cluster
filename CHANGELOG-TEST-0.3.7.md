# MHC Full Installer TEST 0.3.7 — v0.3D.1 Cluster Overview (LOCAL / READ-ONLY)

**Scope:** additive, code-only upgrade of TEST 0.3.6 on disposable Termux LAB nodes. No M51/X7b production changes.

## Delivered

1. New `mhc-full cluster status`: allowlisted local JSON containing inventory roles, heartbeat observation freshness, approved clone offers, latest local backup marker, and local offline clone/restore metadata.
2. Added authenticated `GET /cluster` to the loopback-only Panel (`127.0.0.1:19090`), displaying local backup status, enrollment count, node hardware fields, heartbeat status, clone offers and missing HA prerequisites.
3. Added authenticated `GET /api/cluster-summary` (JSON) for diagnosis; **never returns heartbeat credentials, admin tokens, SQL or `.env`**, despite sensitive fields in underlying JSON.
4. Safe interpretation: a recent authenticated heartbeat is an observation, **not proof of current online status**; offer approval is not a successful clone; a backup pointer is not a fresh checksum check; restored LAB files are not a live standby.
5. Rejects world/group-readable private JSON files and unsafe snapshot pointer metadata; does not execute remote commands, read DB, transfer bytes or change Cloudflare.
6. Extended the version marker guards in enrollment/clone/readiness/heartbeat to accept completed TEST 0.3.7 installations.
7. Added 23 cluster-summary assertions and 6 additional Panel HTTP assertions. Old features carried forward without changing HA code.

## Not delivered / limitations

- Controller does **not** have remote candidate's live restore/SQL/HTTP evidence. Candidate reports are local only. No new telemetry transport or sync.
- No GTID/file replication, primary lease, fencing, manual/auto failover, automatic failback or WAN Panel.
- No UI for issuing invitation tokens, granting clone approval, deleting members, selecting Primary or running restore. Use existing explicit CLI commands on isolated lab nodes.
- No cryptographic re-verification on page load; run `mhc-full backup verify` or `mhc-full clone readiness` on the appropriate LAB node.
- Android Termux/PHP-FPM/MariaDB end-to-end acceptance remains pending. This ZIP is **TEST**, not production.

## Compatibility / security

- **New disposable Termux**: `bash install.sh --install` after `--plan` + `bin/self-test.sh`.
- **Existing installed disposable TEST 0.3.x**: `bash install.sh --upgrade`; code-only, no DB, site, HA or Cloudflare changes. Panel process must be intentionally restarted to load new JS code.
- **M51 / X7b production**: prohibited. Never run installer, upgrade or restore on existing live nodes without separate approved migration plan.
