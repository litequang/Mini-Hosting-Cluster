# MHC Full Installer — TEST 0.3.8 (v0.3D.2)

**Release:** TEST only — code/source package, not deployed to M51/X7b; Android Termux runtime acceptance pending.
**Baseline:** Complete 0.3.7 All-in-One package. No patches layered over production.

## Added

1. **Authenticated remote observation on existing heartbeat:** enrolled LAB member computes an allowlisted local summary (`bin/member-telemetry.mjs`) and sends it alongside an existing token-authenticated, monotonic sequence heartbeat via pinned-key SSH. It does not open a listening port on a member.
2. Controller validates an exact schema before accepting report fields. Only sanitized snapshot ID, backup pointer state, clone receipt/stage/Restore Lab states, count of lab sites, SQL lab import records and WordPress preview preparation records are accepted. No paths, database identifiers, secrets, tokens, IPs or runtime auth information are transmitted.
3. `members.json` stores the allowlisted report, server-generated receipt timestamp and monotonic heartbeat sequence. No new enrollment credentials or HA authorization.
4. Cluster JSON and local Panel `/cluster` display last *reported* member evidence and freshness, plus `HEARTBEAT_NOT_RECENT`, `MEMBER_REPORT_NOT_RECENT`, `CLONE_RECEIPT_INVALID`, `CLONE_RECEIPTS_AMBIGUOUS` alerts. Reports stale after five minutes; heartbeat is recent for three minutes. Old report evidence is suppressed from the current-status view.
5. Readiness never changes: `replicated`, `primaryVerified`, `haEligible`, `standbyReady` all remain false. UI warns that report status is remote member metadata, not a verified database replication, live website or failover proof.
6. Completed TEST 0.3.8 marker accepted by enrollment, clone/readiness and optional heartbeat-service guards; source-only upgrade from prior TEST 0.3.x retained for isolated LAB phones.
7. Added `tests/member-telemetry.mjs` (SSH RPC integration, secret redaction, malicious fields, replay, revocation, freshness) and extended Panel HTTP integration tests. Existing test suite retained.

## Security behavior

- Any unknown field, including forged `haEligible`, raw `dbPassword`, or unknown clone state is rejected before heartbeat sequence is consumed.
- New reports never include user-managed site paths, arbitrary log content or database details; record counts are **metadata only** and not attested by controller.
- The controller's own inventory entry is excluded from remote-heartbeat alerts.
- No SSH host checking downgrade, no Cloudflare, MariaDB, `.env`, runit, actual website activation or HA changes.
- Existing completed 0.3.7 reports without member telemetry remain compatible: they produce a missing-report alert, not a false success.

## Not delivered

- No remote integrity/SQL/HTTP challenge and no independently verified readiness. A member with its own credentials could claim a misleading state; do not rely on telemetry for safety-critical decisions.
- No GTID, file replication, snapshot-catch-up, always-on Standby, quorum/lease/fencing, switchovers, auto-failover or WordPress/Thờ Phượng Pro production acceptance.
- No automatic route changes; Panel remains private loopback via SSH, not `monitor.thophuong.com` production.
- No validated Android clean-install/upgrade across real devices. Tests run on isolated Linux/synthetic data.

**Next:** v0.3D.3 Android field acceptance and integrated controller/member observations, then v0.4 GTID + incremental file replication only after validating ownership of single-writer fencing.
