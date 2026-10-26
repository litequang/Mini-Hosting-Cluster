# TEST 0.3.1 — Source validation report

Execution date: 2026-10-24. Environment: container Linux x86_64, Bash, Python 3, Node.js. **Not Android Termux** and no access to M51/X7b/cloud production. No real MariaDB, Nginx, PHP-FPM, Cloudflare or SSH peer service was started.

## Actual checks

| Check | Result | Scope |
|---|---|---|
| `bash bin/self-test.sh` | PASS | Shell syntax, local fake DB SQL archive, verify, offline extraction and lab import with fake MariaDB, simulated SSH receiver, re-send idempotence, corrupt backup failure, path/config injection guard |
| `tests/site-config.sh` | PASS | WP local vhost template and invalid slug/host validation |
| `tests/static-sites.sh` | PASS | Create static site, local vhost, valid ZIP deployment, traversal/unsafe ZIP and secret/script extension rejection, release rollback, concurrent operation lock, tar malicious path and link rejection, static-only backup and checksum verification |
| `bash -n install.sh bin/*.sh tests/*.sh` | PASS | Shell syntax only |
| Python AST parse (`bin/*.py`) | PASS | Python syntax only |
| Node v0.3 HA controller (witness + agent) | 11 PASS / 0 FAIL | Existing source; inactive |
| Node v0.3 Safe Control | 15 PASS / 0 FAIL | Existing source; inactive |
| Node v1.0 staged | 13 PASS / 0 FAIL | Existing source; inactive |
| Node v0.2 Online Monitor | 4 PASS / 0 FAIL | Existing source; no Cloudflare deployment |
| `bash install.sh --plan` | PASS | Preview only; no changes |

**Total existing Node tests executed: 43 PASS / 0 FAIL.** These results do **not** prove safe manual or automatic HA failover; they test isolated source logic.

## Device-specific blockers / not tested

1. Fresh `aarch64` Termux install, package availability and MariaDB root initialisation, runit lifetime, Termux:Boot.
2. WordPress official WP-CLI installation, live PHP-FPM and Nginx `serve probe`, WP admin/media/permalinks, user login and upgrades.
3. Code-only `--upgrade` and manual rollback on a completed TEST 0.3 **actual** Android phone.
4. Local daily run across Android sleep/restart and on-disk storage limits; backup cannot fence direct DB writes.
5. Real peer SSH/rsync with pinned host keys and encrypted receiver and full cross-device restore.
6. Cloudflare Access/DNS, canonical GTID replicas, cross-node file catch-up, write fencing, HA lease/edge routing and failure injection.

Status: **source/test candidate only**, not device acceptance or production-ready.
