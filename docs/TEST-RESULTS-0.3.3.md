# TEST 0.3.3 — verification report

**Environment:** ephemeral Linux sandbox with Node.js, Python3, Bash, mocked SSH/rsync/MariaDB and disposable HOME directories. No real Android/Termux device or production cloud credentials accessed.

| Suite | Result | Meaning |
|---|---|---|
| Node SSH enrollment and heartbeats | PASS, 43 assertions | Private identity, one-use invite and TTL, spoof/replay guards, strict host-key SSH args, local enrollment, monotonic token-auth heartbeat, no HA readiness, registry removal, production guard. SSH binary mocked; not real network acceptance. |
| Panel HTTP integration | PASS, 41 assertions | Loopback login/session/CSRF/Host/path checks, file operations, ZIP deployment and rollback, backup lock, new private node inventory route and HTML escaping. |
| WordPress/local Nginx config | PASS | Source/template tests only; PHP-FPM not launched under Android. |
| Static hosting ZIP/release/rollback | PASS | Disposable local files; traversal/symlink and safety guards. |
| Backup/verify/peer transport/restore lab | PASS | Scripted data and mocked SSH/rsync/database, not a real whole-cluster recovery. |
| Shell + JavaScript source checks | PASS | Syntax only, not runtime compatibility. |
| Real two-phone SSH enrollment | NOT RUN | Requires separate NEW lab Termux phones and host key acceptance. |
| Real MariaDB restore & live WordPress | NOT RUN | Needs end-to-end Android acceptance. |
| HA failover, dual-primary fencing, Cloudflare | NOT RUN / DISABLED | Not part of TEST 0.3.3; no deployment. |

**Result:** code and Linux mock integration pass, but release remains TEST-only. Verified pairing and heartbeat do NOT prove that databases/files are synchronized, phone is currently online or role is Primary.
