# MHC Full Installer TEST 0.3.4 — v0.3C.1 Offline Full Snapshot Clone

24/10/2026 — **LAB SOURCE ONLY; no verified real-device deployment**.

## Changes from TEST 0.3.3

- New `mhc-full clone offer|revoke|fetch|stage|status` CLI, shipped in the same All-in-One installer.
- Controller must explicitly authorize a **single named, previously verified daily snapshot** to a particular enrolled node UUID (24-hour offer expiry). No mass/anonymous access.
- Candidate downloads to `$HOME/hosting-clones/mhc-full/incoming/<controller-id>/snapshot-YYYYMMDD` **over already verified/pinned SSH**. Enrollment heartbeat credential authenticates the requested recipient against the controller registry; HMAC-SHA256 binds snapshot manifest to cluster/node/nonce. All streamed files are rechecked by SHA256 and byte length; incomplete copies stay pending; no overwrite of an existing successful clone.
- Uses the existing optional restricted SSH forced-command (`node-enroll.mjs rpc`) for enrollment, heartbeat, and these two clone RPC operations. No new public listener or separate patch needed.
- Optional `mhc-full clone stage` validates the received snapshot again and extracts it **offline** into `$HOME/hosting-clones/mhc-full/staged/<controller-id>/<snapshot-id>`. Database dumps and Sheet files stay files. No MariaDB import, no website activation, no automatic service start, no PRIMARY role, no Cloudflare edits.
- Daily snapshot now excludes MHC node identity, enrollment/heartbeat secret, controller membership, pending invite, clone authorization, Panel admin token, installer markers, and peer routing from `site-config.tar.gz`. Because older snapshots could leak cluster identity, **clone authorization rejects old snapshots containing these entries**. Create a new backup after upgrading and wait for a new day if today's existing snapshot was created by an older release; do not silently overwrite it.
- Source-only `install.sh --upgrade` accepts completed TEST 0.3 / 0.3.1 / 0.3.2 / 0.3.3 / 0.3.4 disposable installations and updates only managed scripts/launcher. No DB, `.env`, app data, Tunnel, runit or HA mutation.
- Extra 2-node fake-SSH integration tests: authorization required; revoke stops transfer; manifest token/HMAC; SQL + Sheet + static data copied; no existing websites overwritten; old identity-bearing backup rejected; offline extract tested.

## Critical limitations

- Controller is the only supported snapshot source in this TEST; members cannot yet clone each other. Generic N-node enrollment remains supported.
- This is **one point-in-time snapshot**, NOT GTID, continuous replication, catch-up, promotion or guaranteed current data.
- MHC `backup run` provides no global atomic cross-database/files snapshot. Other writers bypassing the managed ingress remain possible.
- Stored archives can contain WP/DB/application secrets. The transfer is encrypted by SSH, but **encrypted at-rest backup storage is not built in**; use lab-only trusted receiver and encrypted storage.
- Existing TEST 0.3.3 SSH joining, Panel, WP and standalone hosting have NOT yet passed an Android physical device acceptance test.
- No real Cloudflare, production DB, M51 or X7b access performed.
- Even after safe staging, restoring an actual live web server remains a *separate, destructive activity requiring a distinct runbook and manual approval*. `mhc-full restore sql-lab` can import SQL into a separately named throwaway MariaDB schema by explicit command, but is NOT run automatically by clone.
