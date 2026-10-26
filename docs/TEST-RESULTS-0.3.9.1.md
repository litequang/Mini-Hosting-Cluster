# TEST 0.3.9.1 — Verification report

Environment: Linux development container, Node.js. **No access to Vsmart/M51/X7b runtime.**

- `bash -n` for installer, recovery script and vendored cluster installer: PASS.
- `node --check` for all `.mjs` scripts and regression test: PASS (full self-test includes this).
- `tests/termux-compat.mjs`: PASS for Android platform guard, release marker handling and runit warning path (source-level checks).
- Full `bash bin/self-test.sh`: PASS, including HTTP Panel synthetic tests (52), SSH enrollment (43), member telemetry (30), cluster summary (23), backup/restore/clone/WordPress lab simulated tests.
- Test from repackaged release ZIP: PASS (check in build log).
- Recovery on actual Termux, PHP-FPM live WordPress, MariaDB SQL lab restore, Android runit restart, 24h scheduled backup, GTID/file replication and HA: NOT TESTED.
- Do not interpret unit tests as Android functional acceptance.
