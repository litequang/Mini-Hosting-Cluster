# Source audit / merge decision — 2026-10-24

**Authoritative original context:** `MHC-HANDOFF-2026-10-24.md`, `Mini-Hosting-Cluster-v0.3-Huong-dan.md` from transfer bundle.

| Source | Exact source comparison / role | Decision in TEST 0.3 |
| --- | --- | --- |
| MHC-Full-Installer-TEST-0.2 | Main working base; earlier WordPress creates DB/files, Nginx template not active, backup only WP local/SSH manual | **Updated** `install.sh`, `bin/`, README/tests/docs; vendor kept intact |
| v0.3 HA Controller | TEST 0.2 bundled v0.3 `mini-hosting-cluster-v0.1` source unchanged (32/32 files exact SHA256 in transfer) | **Kept untouched** as staged HA source; installer installs inactive agent but no ARM |
| v0.3 Safe Control | ~30 files, overlapping names diverge in core `cli.mjs`, `dashboard.mjs`, `install.sh`, Cloudflare Worker; control-agent/guard semantics different | **Separate reference**, no unsafe overwrite or joint daemon activation |
| MHC v1.0 staged | TEST 0.2 vendor overlay SHA-identical to 21/21 original files | **Kept staged**, never installed/armed |
| v0.2 Online Monitor | its online-monitor sources were already propagated into bundled v0.3; cloud deploy/Access remains manual | **No redeploy**. Cloud status requires observation and Access validation |
| WordPress-DailyBackup-STAGING | includes PHP staging wrapper and opt-in DB-list backup; lacks full site lifecycle; primary marker can become stale | **Referenced**, separate managed WordPress local and guarded backup implementation instead |
| Warm Standby / DR / other historical packages | baseline app-specific restore/snapshot and shell services | Embedded inherited baseline. **Never run their restore/promote on production via this installer** |

Important code findings from TEST 0.2: `site-serve.sh` only emitted inactive *single shared port* snippets without an actual PHP-FPM config or service; `daily-backup.sh` left WordPress ingress active and did not include application TPP; `peer-copy.sh` was manual and the receiver did not verify; `backup-verify.sh` only checked archive integrity; no restore command. These are addressed *partially* in TEST 0.3 as documented in CHANGELOG.

**Not consolidated:** HA Controller 0.3, Safe Control 0.3 and v1.0 have incompatible lease/fence/control models. Only after proof against the same test harness (Cloudflare DO, canonical GTID replication, write-path gate, Cloudflare edge cutover) may one be chosen and unified. Auto offline promotion of snapshot standby remains **forbidden**.

**Deployed vs code-only:** user's prior logs show M51 Thờ Phượng Pro, verified backup (93 tables, 5,155 Sheet files), X7b local restore, v0.2 Monitor heartbeats/Access. **No runtime logs from this TEST 0.3 on an actual Termux phone** and no proof of HA 0.3, v1 or canonical GTID on M51/X7b. Primary labels are not proof of lease, SQL freshness or edge routing. **Do not operate their production nodes based on this package.**
