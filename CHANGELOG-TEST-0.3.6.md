# MHC Full Installer — TEST 0.3.6 — CHANGELOG

Date: 2026-10-24. Scope: **v0.3C.3 Running Standby Foundation (LAB HTTP preview, NOT HA Standby)**.
Base: `MHC-Full-Installer-TEST-0.3.5.zip`; complete combined installer, no patches required.

## Added

- `bin/node-standby.mjs` and CLI commands `clone standby-status|serve-static|wp-plan|wp-prepare|wp-probe`.
- Read-only HTTP static-site preview from the verified private restore lab, bound **only to 127.0.0.1**. Requires explicit confirmation, serves HTTP GET/HEAD only, has no directory listing, refuses dotfiles/configuration/active code and path escape, and terminates with Ctrl+C. It does NOT reconfigure system Nginx.
- Evidence-based `standby-status` JSON per site; clearly reports no GTID, file catch-up, write fencing, Cloudflare route or HA eligibility. Thờ Phượng Pro file/SQL presence is only inventory; no TPP process is started.
- WordPress `wp-plan` and `wp-prepare`: require an existing verified SQL lab import, parse the restored WordPress table prefix without executing source `wp-config.php`, copy WordPress files into a **separate private preview tree** (no overwrite), replace the original `wp-config.php` with generated lab-only DB credentials, and seal the preview tree with SHA256.
- `wp-probe`: **separate high-friction opt-in** executes restored PHP on a dedicated disposable test phone using a temporary loopback PHP CLI development server and a bundled denylist router; checks local lab DB reachability, HTTP code and local-only redirect; stops PHP afterwards. Any changed preview tree fails closed.
- `bin/lab-wp-router.php` and regression tests with real HTTP and a **fake** MariaDB client.
- `install.sh` code-only upgrade guard extends to TEST 0.3.5; fresh installs copy the PHP preview router along with other MHC-managed scripts. HA remains unarmed.

## Safety limits / explicit non-goals

- A Termux process is **NOT an OS sandbox**. Restored PHP/plugin/theme code executes as the same Termux user and may read files or access the network. Do **NOT** run `wp-probe` on M51, X7b or any phone containing real credentials or production data; prefer offline checks until using a disposable lab device.
- A PHP CLI HTTP 200 response does **not** prove a real WordPress install, correct DB table content, PHP-FPM/Nginx, admin login, media upload, permalinks, email/cron, backups, or app isolation. All require hands-on Android tests.
- Static preview is an on-demand test listener, **not a continuously running standby**. HTTP code cloned from the source is not activated automatically. Thờ Phượng Pro is not run/connected to the database.
- Cloned snapshots can contain SQL, wp-config and private site data; only share with trusted encrypted lab receivers.
- Not yet present: continuously caught-up MariaDB GTID, incremental Sheet/Sheet+, automatic site activation, public HTTPS, fencing/lease/quorum, automatic/manual switchover and safe failback.

## Files changed

- New: `bin/node-standby.mjs`, `bin/lab-wp-router.php`, `tests/node-standby.mjs`.
- Updated: `bin/node-readiness.mjs` (verified lab context export/version marker), `bin/mhc-full-wrapper`, `bin/node-clone.mjs`, `bin/node-enroll.mjs`, `bin/self-test.sh`, `install.sh`, README and current documentation.
- Historical vendor HA/Cloudflare branches unchanged; they remain staged and inactive.

## Tests

See `docs/TEST-RESULTS-0.3.6.md`. No Android device, production database, Cloudflare configuration, or existing M51/X7b service was accessed.
