# TEST 0.3.6 — Results (2026-10-24)

Environment: Linux container, Node.js v22, Python 3, PHP CLI; **no Termux Android or real MariaDB service**. Input was `MHC-Full-Installer-TEST-0.3.5.zip` plus changes described in changelog.

- `bash bin/self-test.sh`: **PASS**.
- Existing suite `integration-backup.sh`, `site-config.sh`, `static-sites.sh`: **PASS** (fake/sandbox data).
- Existing Panel test: **41 assertions PASS**, Enrollment test: **43 assertions PASS**.
- Existing clone and offline readiness tests: **PASS**.
- New `tests/node-standby.mjs`: **PASS**; uses real loopback static HTTP, a disposable PHP CLI HTTP endpoint and a **fake MariaDB client**. Checks explicit confirmations, URL/path protections, static content status, no-HA flags, WordPress source wp-config replacement, PHP file syntax, generated lab DB credentials, preview no-overwrite, restored PHP execution opt-in, tamper rejection in old tests, active-site stop guard.
- `php -l bin/lab-wp-router.php`: **PASS**.
- `node --check` new source: **PASS**.

**Not tested:** real `pkg install` on Android, PHP-FPM Nginx integration, actual WordPress + MariaDB schema/content, Thờ Phượng Pro process, DB/file continuous replication, failover, Cloudflare routing, or full Android reboot/loss-of-network tests. Source tests are not production evidence.
