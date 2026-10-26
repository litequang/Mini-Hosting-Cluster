# TEST 0.3.7 — release test evidence

Execution environment: local Linux + Node.js/Python/Bash, synthetic HOME, mocked SSH/SQL where applicable. **No Android acceptance, no production deployment**.

- Shell syntax, Node.js syntax, Python AST parse: PASS.
- Local cluster summary: **23 assertions PASS** (role labeling, heartbeat freshness, clone offer expiry, snapshot pointer/permission guard, secret allowlisting, offline receipt/stage/lab status).
- Panel HTTP: **47 assertions PASS** (41 previous + 6 Cluster auth/HTML escape/JSON/credential exclusion assertions).
- Enrollment: **43 assertions PASS**, fake SSH controller/multi-node membership.
- Clone/Restore Lab/WordPress preview: existing synthetic suites PASS (no new real PHP-FPM/MariaDB claims).
- Backup/restore/peer/static hosting: existing suites PASS (mock transport/database; backup has known consistency limitations).
- `bash bin/self-test.sh`: PASS (see external release log).

Security boundaries: Panel localhost-only/session protected, `/cluster` and `/api/cluster-summary` are GET-only, no HA mutation or credential disclosure by design. The JSON is **not a signed attestation**. Node/member metadata is NOT real-time liveness or proof of promotion eligibility.

Known risks and next gates: real Android tests, cross-node tested telemetry, end-to-end WordPress and TPP recovery, off-node encrypted backup, GTID/file convergence and HA fencing chaos test.
