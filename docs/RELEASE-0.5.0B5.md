# Release scope: MHC TEST 0.5.0B5

B5 adds an actual HTTP request handling path on **loopback 127.0.0.1:19096 only** that forwards four fixture-only POST routes into witness-verifying writer. It does not attach to Nginx, PHP-FPM, MariaDB or production site storage. It cannot be used for HA decisions.

- Added `bin/lab-http-write-gate.mjs` and `tests/lab-http-write-gate-b5.mjs`.
- Updated original Panel 9090 read-only Cluster/Write Paths status; UI does not read tokens or start/stop gateway.
- Source-only upgrade with code backup and operator confirmation still mandatory. No automatic service restart or Cloudflare API calls.
- Critical missing gates: real Cloudflare witness independent fencing, SQL sessions and privileged DB writers, PHP/WordPress jobs, served file edits, shell and SSH access, backup restore, route control. GTID/file replication on two physical Android LAB nodes remains unaccepted.

Runbook: `docs/HTTP-WRITE-GATE-LAB-0.5B5.md`; Vsmart instructions `docs/UPGRADE-VSMART-0.5B5.md`.
