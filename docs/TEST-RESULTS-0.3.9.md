# TEST 0.3.9 — Release test report

## Scope / environment

- Host: build container Linux, **not** Android Termux.
- Source: `MHC-Full-Installer-TEST-0.3.8.zip` plus new TEST 0.3.9 acceptance module, CLI routing, test and documentation updates.
- Baseline TEST 0.3.8 full self-test: **PASS** before modifications.
- Modified TEST 0.3.9 full self-test: **PASS** before packaging.
- Release ZIP: integrity verified (`ZipFile.testzip`); unpacked exact release ZIP into a separate directory and reran `bin/self-test.sh`: **PASS**.
- Release build includes 194 regular file entries (directory records intentionally omitted); complete source tree and vendored references retained.

## Functional synthetic results

- Existing Panel HTTP: 52 assertions PASS.
- Existing member telemetry: 30 assertions PASS.
- Existing SSH enrollment: 43 assertions PASS.
- Existing Cluster Summary: 23 assertions PASS.
- Existing backup/static/clone/restore/standby smoke tests: PASS (synthetic filesystem, stubbed network/DB).
- NEW `tests/android-acceptance.mjs`: PASS — Linux/Termux differences not conflated, HA fail-closed, sanitized mode `0600` report without tokens, HTTP loopback and Host-bound registered site, no response-body leakage, refusals of malformed slugs / mismatched hosts / symlinked registry.
- Shell syntax, Node syntax and Python AST: PASS.

## Unverified

No Android phone was accessed. NOT VERIFIED: actual installer `pkg install`, service uptime after Doze or reboot, PHP-FPM WordPress live behavior, `wp core install` and admin functions, MariaDB real restore, SSH between phones, external encrypted backups, GTID, filesystem replication, Cloudflare routing, HA automatic/manual takeover or split-brain resistance.

No production state, DNS, Tunnel, DB or HA policies were modified.
