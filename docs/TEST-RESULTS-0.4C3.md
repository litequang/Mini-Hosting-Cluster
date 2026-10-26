# TEST 0.4.0C3 — Test results

Test surface: Linux Node.js + Bash + mock MariaDB, isolated temporary source/receiver homes, pinned C2 transfer receipt simulation, and original Panel 9090 HTTP tests. Does not qualify as proof of live Android MariaDB/filesystem or cross-resource atomic snapshot.

- C3 LAB checkpoint: 27 new assertions covering explicit quiescence confirmation, source SHA/GTID before-after, read-only requirement, tampered checkpoint SHA, missing receiver receipt, candidate/baseline tamper, exact GTID equality, no overwrites, no impact on original replica, production/registered-site refusal.
- Full source tree self-test (all historical TEST modules): PASS on Linux (see release log).
- Final ZIP validation: ZIP CRC check passed; extracted release ran complete `bin/self-test.sh` successfully (exit code 0) and the separate C3 regression test passed (27 assertions).
- **Not tested:** two real Termux phones with GTID catch-up + failure/reconnect, deterministic DB/file atomic freezing, production ingress fencing, cloud routing, app restore, WordPress PHP-FPM on C3, Android process survivability. No HA authorizations.
