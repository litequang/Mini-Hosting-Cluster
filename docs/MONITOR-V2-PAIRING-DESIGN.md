# MHC: Monitor v2 node-card parity and future 10-minute pairing

Date: 2026-10-26. Source changes in `codex/m1-m2-foundation`. Original Panel 9090 retained. This is not a change to the old `monitor.thophuong.com` service.

## Legacy reference from user's screenshots

The old Monitor showed per-node role/last update, battery and temperature, RAM/disk free, uptime, Wi-Fi signal, status chips (DB/Web/Tunnel/Panel/Sync), last snapshot and Node.js processes with RSS. Its own pairing UX was **generate a one-time 10-minute code** then run `~/mhc online-enroll CODE` on a new node.

MHC Monitor v2 now adds: all-node cards with heartbeat and telemetry freshness, role, DB/Web/Tunnel/Panel status chips, last recorded snapshot, detailed local/remote RAM/storage/battery/wifi RSSI, 12 allowlisted service states, Node.js process count+RSS, 12h history (RAM, battery, pin temperature, storage, network and RSSI), sampled heartbeat gaps and clear unknown/unverified status for sync/readiness. Dashboard and Monitor UI hide CPU completely; the read-only collector no longer samples CPU. Old monitoring domain is not modified.

Privacy: no private network SSID/BSSID/IP, no raw process command line, no logs or secrets are forwarded to Cloudflare. Wi-Fi signal may be unavailable due to Android permissions; do not assert offline solely from unavailable Wi-Fi API. Snapshot file name/mtime is a metadata hint only, no checksum/restore verification. Sync remains 'Chưa xác minh' until a real replicated-data validator reports it. `STANDBY_NO_WRITER_GRANT` is the actual shared authority role until M3 is implemented.

## Current enrollment and why it is less convenient

Existing `reference/cluster-authority/worker.mjs` uses `MHC_MEMBERS_JSON` configured in Cloudflare (node UUID, agentKey, panelKey). Adding a new shared-authority node today requires `~/mhc-full cluster-authority prepare` on that node; trusted aggregation of private enrollment credentials; updating the Worker membership secret while preserving existing members/clusterId; then `cluster-authority configure` and Agent install. SSH `node invite` belongs to the old inventory-only architecture and **does not automatically enroll the new Shared Authority**. Do NOT tell user the old ten-minute code currently works for Shared Authority.

## Next milestone: one-use pairing code in the original Panel

Implement a **single Panel button** 'Tạo mã ghép 10 phút' under Cluster/Monitor and a single Termux command `~/mhc-full join CODE` for all future Android nodes. Requirements:

1. Only Cloudflare Access approved admin Panel (and explicit local admin recovery) may create one-use code, protected by Panel session + CSRF.
2. Shared Durable Object stores hashed invitation + expiresAt + redemption status (10m); never logs full code; rate-limit requests.
3. A new node generates its own keys and UUID locally, proves possession of code over TLS, server returns credentials for itself only; membership is durable in DO, does not require replacing the `MHC_MEMBERS_JSON` secret for every join.
4. Worker preserves existing static members and audit/revision to avoid breaking Vsmart/XZ3. Concurrency + replay, duplicate ID and one-code multi-redemption are rejected atomically.
5. New node appears as pending/standby with heartbeat and metrics; no Primary/writer lease, no website route and no automatic backup restore until operator approves later milestones.
6. Add ability to revoke node/invite, rejoin with new keys after device reset, and a manual fallback for Worker outage without exposing token through chat.
7. Integration tests for expired/redeemed invitations, two simultaneous attempts, and two Android devices.

**Status:** pairing is an accepted design proposal, not coded or deployed by this Monitor fix. Avoid promising one-click pairing until tests and Cloudflare deployment succeed.

## Release & evidence

Bug confirmed from user: `STOP: Unexpected auth module in Panel` during prior Monitor v2 installer. Cause was installer grepping for `crypto.verify` in `src/server.mjs` rather than the actual `src/mhc-remote-access.mjs`. Installer now verifies the original auth guard import in server and RSA signature check in the existing auth module **without copying a new auth module or relaxing protection**.

Script `scripts/apply-monitor-all-nodes.sh` pinned to commit `fdaea44c457e069549454a9f49685fa19d80ab99` (before script commit), checks exact five source blob SHAs, backs up locally, only restarts `amh-panel` and existing `mhc-authority-agent`, and rolls back original files on health check failure. Pinned file verification and isolated mocked V8 Worker test PASS. Runtime Termux install, actual Cloudflare Worker deploy, real Android phone readouts NOT RUN. Same Cloudflare Worker name and DO binding must be retained; do not rotate MHC_MEMBERS_JSON tokens.

Latest `tests/monitor-all-nodes.mjs` validates no CPU fields, no secrets or SSID, old heartbeat compatibility and Panel-only history.
