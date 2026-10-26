# MHC TEST 0.5.0C-WRITER-AUDIT — Changelog

- Added `~/mhc-full writer-audit plan|scan`, a truly read-only local writer-path inventory covering 12 possible bypass classes, including HTTP/PHP, direct MariaDB/privileged SQL, uploads, Sheet/Sheet+, shell/SSH, Panel, background jobs, backups and Cloudflare routing.
- No SQL, network calls, service restarts, config reads, credential reads, or write tests; service statuses and allowlisted file *presence* only.
- `NOT_OBSERVED` and stopped services **never** count as fencing. Always return `canSwitchPrimary=false` and `canArmHA=false`.
- Added authenticated, sanitized `/api/mhc/writer-audit` to existing original 9090 Panel, with a read-only Cluster summary. No new Panel is created.
- Version marker compatibility extended for TEST 0.5.0C-WRITER-AUDIT in installer/enrollment/clone/readiness/recovery; existing `demo`, MariaDB, WordPress files, Panel password and other service configurations are not modified by source-only upgrade.
- Added regression tests for unsafe optimistic results, secret redaction, symlinks, service observations and original Panel authentication.

**Not shipped:** MariaDB hard fencing, revoking direct SQL privileges, Cloudflare deploy/route mutations, automatic or manual real Primary promotion, full physical acceptance on two separate Android devices.
