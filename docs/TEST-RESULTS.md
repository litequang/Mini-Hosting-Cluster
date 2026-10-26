# Verification result — 2026-10-24, Linux development sandbox

- `node --test` HA Controller + v0.3 witness + cloud monitor: **15 pass, 0 fail**.
- `node --test` Safe Control + cloud monitor: **15 pass, 0 fail**.
- `node --test` staged v1.0 gateway/lease/policy: **13 pass, 0 fail**.
- `bash bin/self-test.sh`: Bash syntax, bundled HA core `node --check`, locally mocked MariaDB backup, SHA256 verify, file extraction, mocked SQL import guard, mocked SSH/rsync atomic remote validation, idempotent one/day, tamper refusal and malicious config rejection, local nginx vhost construction and invalid host/slug guard: **PASS**.
- None of these uses a real Android phone, a running PHP-FPM, MariaDB service, WordPress UI/admin, live SSH receiver, real Cloudflare Worker/DO, or physical failover.
- HA test suites are inherited **source tests**, not proof the design prevents split-brain when all write paths are considered.

**Pending:** Termux package support, nginx -t/php-fpm -t on device, HTTP→PHP smoke, WordPress full UI, live SQL restore to an *empty* test MariaDB, SSH host fingerprint and remote verified push, Android Doze/reboot persistence, encrypted external backup, and dangerous failures (lease loss/partition/runit death/dual tunnels). No production acceptance.
