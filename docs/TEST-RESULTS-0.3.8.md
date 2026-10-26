# MHC Full Installer TEST 0.3.8 — Test Results

## Platform

Linux container / Node.js v22.16.0, Python3, shell tools, temporary synthetic HOME/SSH and MariaDB impostor where applicable. **Not real Android Termux, MariaDB production, or Cloudflare deployment.**

## PASS — ran against release source

- `bash bin/self-test.sh` exit code **0**.
- **52/52** Panel HTTP assertions including authenticated cluster view, remote telemetry labels, refusal of secret-bearing reports, CSRF, file manager and ZIP deployment restrictions.
- **23/23** pre-existing Cluster Summary assertions.
- **30/30** new member telemetry assertions: fake pinned-SSH enrollment, allowed backup/clone/SQL LAB/preview observation, server receipt, freshness/expiry alerts, forged `haEligible` and DB secret rejection, monotonic anti-replay, enrollment revocation, private metadata redaction and no HA claim.
- **43/43** pre-existing enrollment assertions (multiple nodes, one-use invites, pinned SSH, replay protection).
- Backup/restore, SSH peer transfer, static vhost/deploy/rollback, clone, Restore Lab and WordPress PHP CLI smoke tests all pass using synthetic data.
- Shell `bash -n`, JavaScript `node --check` and Python AST checks pass via self-test.

## Not executed / no inference

- No real Android 12/16 Termux install, new-device boot/restart/Doze acceptance, real SSH between phones or Cloudflare Access testing.
- No live MariaDB GTID, PHP-FPM/Nginx WordPress runtime, upload/Sheet replication or production backup integrity tests.
- No failover, switchback, fencing, quorum/lease, cloud routing, disaster recovery or Primary change.
- Telemetry reflects a member's authenticated **claims** about private metadata, not a controller challenge verifying DB integrity, HTTP service or site liveness.

## Safety invariants checked

- All HA authority booleans remain `false` on the Cluster Panel.
- Panel binds loopback, preserves login, CSRF, and sanitized JSON output.
- SSH heartbeat uses existing credential + monotonic sequence, no extra port or new secret.
- No production commands, SSH, tunnel, MariaDB mutations, or node role changes were performed during these tests.
