# TEST 0.3.4 — Source-level test report

Environment: Linux sandbox, Node.js + Bash + Python + mock SSH, **not Termux/Android**. No M51/X7b/Cloudflare deployment. Generated on 24 October 2026.

Run from extracted `MHC-Full-Installer`:

```bash
bash bin/self-test.sh
```

## Tests

- Existing backup + verify + TPP-safe lab DB-name guard + ZIP safety and peer push mock: PASS.
- Existing static website deploy/rollback and localhost Nginx vhost generation: PASS.
- Existing local Panel integration: **41 assertions PASS**.
- Existing multi-node SSH enrollment: **43 assertions PASS**.
- New two-node SSH RPC clone fixture: **PASS** for explicit offer, revoke, deny unapproved clone, offer-bound token/HMAC, transfer WordPress/static, database.sql.gz and Sheet tar, checksum, no active web restore, no overwrite, offline safe extraction and rejection of snapshot containing a controller identity/token.
- Shell/Node/Python syntax: PASS.
- Archive re-extraction self-test: see final release check log.

## Not tested / not claimed

- Real Termux package install, PHP-FPM, Nginx, WP-CLI, MariaDB restore; Android watchdog/Doze/reboot.
- Real inter-phone SSH transfer rate, constrained authorized_keys behavior on Android, storage encryption and WAN failure.
- SQL/Sheet/app atomic backup, delta replication, GTID, HA lease or fencing, Cloudflare edge routing, production failover/failback.
- Clone activation as running WP or Thờ Phượng Pro website (intentionally unimplemented).

No generated file here constitutes production deployment evidence.
