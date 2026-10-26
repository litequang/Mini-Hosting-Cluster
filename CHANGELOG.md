## TEST 0.5.0C-REMOTE-PANEL

Cloudflare Access JWKS JWT verification at origin, remote hostname configuration, authenticated Primary management via original Panel 9090, local SSH access preserved. No Cloudflare/tunnel auto setup. See `CHANGELOG-TEST-0.5.0C-REMOTE-PANEL.md`.

## TEST 0.5.0C-LAB — Dedicated DB write endpoint and switchover readiness

See CHANGELOG-TEST-0.5.0C-LAB.md.

# Changelog

## MHC Full Installer TEST 0.3 — 2026-10-24

**Base:** `MHC-Full-Installer-TEST-0.2.zip`; unchanged v0.3 HA Controller and unchanged v1.0 staged overlay in `vendor/`.

- Replaced misleading heading TEST 0.1 with explicit TEST 0.3 and separated features by source / laboratory verified / phone verified.
- Added `install.sh --plan|--self-test|--install`, strict clean-device guard, explicit consent, partial-install marker; never automatically resumes destructive upstream installers.
- WordPress now has an independent 127.0.0.1:18080 Nginx vhost aggregate + 127.0.0.1:19000 PHP-FPM pool, `serve configure|check|start|stop|status|probe`; existing main Nginx, Node, Tunnel/Panel untouched by these subcommands. Site and host validation prevents direct arbitrary shell/path injection; local probe checks dynamic PHP execution when device is available.
- Daily backup of registered WordPress SQL+files, with attempt to quiesce managed WP Nginx/PHP-FPM; lock, `snapshot-YYYYMMDD`, verified checksums and archive reads, existing-snapshot tamper refusal, seven-snapshot retention. Optional TPP archive only with explicit opt-in and stopped `mini-web`; skips external TPP sheets only if inside app storage, otherwise archives them separately.
- Read-only restoration plan, explicit offline extraction to a new empty directory, and gated SQL import only into a new `mhc_restore_*` test database (never auto-restores users or production DB). No automatic SQL import or production file overwrites.
- Peer configuration and SSH-pinned rsync push, per-source backup identity, `.pending` then checksum verify and atomic remote publish; does not import into peer MariaDB or change node role. Schedule optionally retries peer transfer hourly while Termux stays alive.
- Included Safe-Control v0.3 and WordPress DailyBackup staging sources ONLY under `reference/*-UNINSTALLED` for traceability; not co-activated with HA Controller or v1 overlay. MHC v0.2 Online Monitor source was already embedded under HA Controller vendor, not replaced.
- New fake WordPress SQL/file backup recovery tests; source JS and Bash tests; full known residual risks in docs.

**Not added/validated:** live MariaDB canonical GTID replication, robust all-writer quiescence, atomic DB/file global snapshot, actual Android installation, WP-CLI verification, HTTPS/vhost public setup, cloud Access authentication, full replica node enrollment, split-brain-safe HA/failover, remote encryption, genuine SQL restore on new Termux.

## TEST 0.4.0B4

GTID LAB end-to-end probe + readback and outage evidence; CLI and Panel 9090 read-only summary, private proof; not an Android replication attestation. See `CHANGELOG-TEST-0.4.0B4.md`.

## TEST 0.4.0C3

Operator-quiesced LAB checkpoint pairs file delta metadata with observed MariaDB GTID, binds checkpoint SHA into verified C2 receiver receipt and offers guarded OFFLINE versioned apply. Original Panel 9090 shows sanitized status. Not atomic cross-resource snapshot, live apply or HA. See `CHANGELOG-TEST-0.4.0C3.md`.

## TEST 0.4.0D
See `CHANGELOG-TEST-0.4.0D.md` for the read-only GTID/SSH/offline file acceptance evidence gate. Nothing touches production or enables HA.

### TEST 0.5.0B2 (LAB only; 2026-10-25)
- Durable Object LAB witness reference, epoch/lease state persisted in SQLite-backed DO storage; bootstrap once; non-resurrecting FROZEN state after expiry.
- Authenticated per-node diagnostic gate-check, strict nonce/HTTPS/TTL/timeout checks, zero real write-path enforcement.
- Original Panel 9090 read-only Witness LAB metadata endpoint; no tokens and no network calls from Panel.
- 61 unit tests including competing grants and witness outage; marker compatibility for B2 enrollment/readiness/clone.
- See `CHANGELOG-TEST-0.5.0B2.md` and `docs/CLOUDFLARE-WITNESS-LAB-0.5B2.md`.


## TEST 0.5.0B4 — Four Isolated LAB File Writer Adapters

Added witness-gated offline static preview, fake upload fixture and job receipt alongside canary. See `CHANGELOG-TEST-0.5.0B4.md`.

## TEST 0.5.0B5 — Loopback Real HTTP Fixture Gateway

Added standalone local-only HTTP server (127.0.0.1:19096), random 0600 bearer token, strict allowlisted POST routes, size/Origin/Content-Type/method guards, one in-flight writer and witness checks before/staging publication. Original Panel 9090 reports configuration only, never leaks token or claims the gateway is live. **No reverse proxy, PHP, MariaDB, WordPress or real hosting write fencing.** Tested loopback HTTP; no physical two-node witness acceptance. See `CHANGELOG-TEST-0.5.0B5.md`.
