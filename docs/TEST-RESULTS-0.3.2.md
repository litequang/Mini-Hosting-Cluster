# TEST 0.3.2 — Validation results

**Context:** container Linux x86_64 (not Android), Python 3, Node 22, Bash. No DB production, Cloudflare account or device SSH connection.

| Suite | Outcome | Evidence scope |
|---|---|---|
| `bash bin/self-test.sh` | **PASS** | Existing backup/verify/restore lab/peer-transfer fake adapters, static sites/ZIP/rollback and new Panel HTTP suite |
| `tests/panel-http.mjs` | **36 / 36 assertions PASS** | Actual Node HTTP server on disposable loopback test port and HOME; credential authentication, cookie, CSRF, Host & Origin checks, file CRUD subset, bad extension, traversal, symlink, ZIP deploy & rollback, backup lock and logout |
| `bash -n` | **PASS** | Installer and wrapper/bin/test shell scripts |
| `node --check` | **PASS** | New Panel JS and vendored Node core scripts |
| Python AST | **PASS** | ZIP/tar safety utilities |
| Re-extract ZIP & run self-test | **PASS** | All integration and syntax suites rerun from clean extraction of final ZIP |

**Not run and not claimed:** real Termux clean installation, `--upgrade` on a physical test phone, real Nginx/PHP-FPM, MariaDB transactional restore, actual WordPress login, real SSH peer, 24-hour Android background durability, HA/witness/GTID/split-brain tests.

Additional unchanged vendored tests: **43/43 PASS, 0 FAIL**, encompassing v0.3 HA Controller, alternate Safe Control, v1.0 staged logic and v0.2 Online Monitor. HA source remains inactive; these unit tests do **not** constitute production HA acceptance.
