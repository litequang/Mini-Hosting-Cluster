# MHC TEST 0.5.0C-LAB — B5 + C integration

- New `/v1/lab/mariadb-event` in existing loopback HTTP gate: dedicated SQL lab writer with strict parser, fixed schema and hex encoding; no arbitrary SQL or paths, two witness checks, file 0600 credentials.
- New `app-db-gate plan` and `switchover-readiness plan|status` read-only commands.
- Original Panel 9090 gets more accurate LAB/C disclaimer, no new panel.
- Source-only upgrade preserves existing Panel, sites, Nginx/PHP/DB, active Cloudflare setup.
- **No automatic or real manual promotion executor**; witness, GTID and delta on two Android LAB nodes still require physical acceptance.
