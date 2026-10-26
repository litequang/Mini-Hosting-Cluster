# TEST 0.3.1 — Server Feature Expansion

**Scope:** extends All-in-One TEST 0.3. Not a new HA milestone. No production device deployment.

## Added

- Static-site registry and isolated document roots (`sites create-static`, `list`) alongside WordPress registry.
- Safe static ZIP staging and deploy, previous-release preservation and explicit rollback. Reject traversal, symlinks, hidden paths, script/secret extensions, duplicates and excessive extraction sizes. Accept only ZIP with root `index.html`.
- Local-only Nginx virtual host generation for static sites; `serve reload`, `probe-static` and read-only `system status`.
- Snapshot coverage extended to static-only and mixed WordPress+static sites.
- Offline tar safety inspection before restore extraction, denies tar path escapes/links/special entries.
- TEST 0.3 -> TEST 0.3.1 safe **code-only** upgrade mode with version/partial install/backup/HA/TPP guards and a manually recoverable old code copy; installer can install Python 3 dependency. Future stable upgrade/auto rollback not implemented.
- Fixed WordPress Nginx routing to explicitly forbid direct access to `/wp-config.php` before the PHP handler.

## Retained, not enabled

- Existing TEST 0.3 local WP PHP-FPM, manual SSH backup, daily archive and SQL lab restore.
- v0.3 HA Controller and alternate Safe Control source, v1.0 staged code are kept separately and **never armed by this installer**.

## Explicit limits

- Local service integration and data migration on real Android have **not** been tested here; package names, PHP extensions, nginx reload, WP-CLI and reboot behavior need real-device acceptance.
- No automatic full-node join, MariaDB GTID, incrementally mirrored files, public WordPress HTTPS/vhost, secure Panel deploy, automatic failover or guaranteed 24h backup under Android suspension.
- Runtime remains loopback-only. TPP production M51 and X7b are never touched.
- Static files may still contain client-side untrusted code. Do not publish websites without security review.
