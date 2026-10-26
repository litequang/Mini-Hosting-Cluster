# MHC TEST 0.5.0B5 — Loopback HTTP Write Gate LAB

## Code changes (compared with TEST 0.5.0B4)

- `bin/lab-http-write-gate.mjs`: standalone actual HTTP listener, **binds 127.0.0.1:19096 only** when operator explicitly starts it. No runit auto-enablement, no Nginx reverse-proxy, no Cloudflare route.
- `http-gate plan|status|init|serve`: `init` requires prepared isolated fixture workspace and `--confirm=ISOLATED_HTTP_WRITE_GATE_LAB_ONLY`, generates 256-bit random bearer token stored in private 0600 file. Neither Panel nor CLI prints the token.
- Fixed allowlist of four HTTP POST routes for existing fixture adapters. Token authentication, max body sizes, strict Content-Length/Content-Type, no Origin/CORS, single concurrent writer, no arbitrary URL, file destination, delete, SQL or command execution.
- Each successful request calls existing per-artifact 2-step witness verification and private offline filesystem writer; response includes hash, size, epoch, random basename. Denials produce no new artifact.
- Panel **gốc 9090**: read-only `write-paths` summary now reports whether isolated HTTP gate has a local configuration file. It **never reads the token or calls witness**, nor checks whether the HTTP listener is currently running. Shows **9 production write-path groups unguarded**.
- Improved version-marker acceptance for B5 through installer, enrollment and clone/readiness entrypoints. Preserves B4 as acceptable upgrade origin.
- `tests/lab-http-write-gate-b5.mjs`: **63 assertions** exercising real loopback HTTP transport and fake witness under denial, outage, epoch change, auth failures, concurrency, malicious headers, production footprint and insecure token permissions. All old tests retained.

## Not added / not verified

- No interception of WordPress, PHP, MariaDB, Nginx, public HTTP ingress, real Sheet/uploads, hosting Panel mutations, shell, backup/restore or other writers.
- Double verification is NOT an atomic distributed gate and is NOT independent fencing.
- No actual Cloudflare deployment, two-device Android LAB runtime test, or production replication/switchover/failover acceptance.
- No changes made to existing Android devices by packaging/testing these sources; operator-controlled source-only upgrade is a separate manual step.
