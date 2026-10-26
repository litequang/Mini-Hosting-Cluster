# MHC Monitor v2 — all-node Panel (2026-10-26)

**State:** source pushed to `codex/m1-m2-foundation`; Android runtime deployment and Cloudflare Worker deployment still **NOT RUN** in this ChatGPT environment. `monitor.thophuong.com` was not directly readable from here; comparison is against the previous MHC Monitor requirements and source, not a measured feature-by-feature audit of that live site.

## Capabilities implemented in source

This upgrades the **original Panel 9090**, not a new app. The **Monitor** page presents the local device plus all nodes enrolled in the same Cloudflare Shared Authority. Select Vsmart/XZ3/any registered node to see:

- Android model/version, uptime, heartbeat freshness and telemetry age. Heartbeat age indicates **last contact**, not reliable proof that phone is powered off.
- CPU hidden due to Android restricted/unreliable readings; RAM total/used/free; Termux-home filesystem total/used/free; battery %, charging status, battery health, battery temperature (**not CPU temperature**).
- Network RX/TX speeds derived from `/proc/net/dev` when Android permits, 9 allowlisted Termux runit service states: Panel, SSH, Nginx, MariaDB, mini-web, Cluster Agent, Tunnel, PHP-FPM, WordPress Nginx.
- Wi-Fi connection/RSSI (SSID/BSSID/IP hidden), last recorded backup snapshot metadata, detailed 12-service running states, Node.js process count and RSS (no command arguments), explicit sync-unverified state. Threshold warnings (battery <20%, battery temperature >=42°C, RAM free <15%, disk free <10%), unavailable/stale telemetry distinct from real values.
- Up to 12h rolling history collected every 5 minutes for battery, RAM, battery temperature, free storage, network throughput and Wi-Fi RSSI; remote history lives in Cloudflare Durable Object.
- Local Monitor remains available during a Cloudflare outage. Nodes with old agents or older Worker show **no telemetry** instead of fabricated readings.
- Nothing sends IP, SSID, BSSID, process arguments, file paths, DB values, secrets or private log content through the Worker.

Limitations: Android 12+ may block global CPU ticks or `/proc/net/dev`; Termux:API is needed for battery readings. Filesystem capacity refers to the mounted filesystem containing Termux HOME, not separate SD card. Historical samples start only after both node agent and upgraded Worker are active; no retroactive data. Gaps between samples show time without received reports, NOT a verified phone-offline event.

## Architecture and source map

- `bin/node-monitor.mjs`: bounded read-only collector from os.cpus/ram, fs.statfsSync(HOME), /proc/net/dev, termux-battery-status, getprop and `sv status`. 10-second in-process cache; no raw identities.
- `bin/cluster-authority.mjs`: existing authenticated heartbeat adds optional `telemetry`, using installed collector; failure collecting metrics does **not** break heartbeat. `sharedHistory(nodeId)` requests history as Panel role.
- `reference/cluster-authority/worker.mjs`: strict allowlist validation, server timestamp, latest metrics on enrolled node; per-node 12h history (up to 144 points, every 5min) stored with existing SQLite Durable Object. New Panel-only endpoint `GET /v1/clusters/<clusterId>/history`, header `x-mhc-target` with registered node UUID. Agent key cannot read history.
- `bin/legacy-panel-src/src/mhc-integration.mjs`: local collector + failover to prior Monitor, shared history bridge.
- `bin/legacy-panel-src/src/server.mjs`: authenticated `/api/mhc/monitor/history?nodeId=...`. Existing login/Access JWT, CSRF, cookie policy retained.
- `bin/legacy-panel-src/public/app.js`: node cards, freshness, rich details, services, warning thresholds, SVG history charts and polling.
- `tests/monitor-all-nodes.mjs`: new source test for collector, Worker two-node telemetry, privacy, replay/auth role, history, no Primary rights. Not executed in this session.
- `scripts/apply-monitor-all-nodes.sh`: SHA-pinned 5-file installer to both **clean LAB** nodes only, with backup and automatic restore if original Panel fails to restart or serve expected UI.

## Rollout order — no Cloudflare credentials in ChatGPT

1. Ensure the MHC source is at the branch that contains these commits; do not overwrite uncommitted worktree files.
2. On Vsmart **and** Sony XZ3 Termux, install the Panel/Agent bundle:

```sh
curl -fLsS 'https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/2656d8b9cb4ddc330a850064567ff257cf4ab030/scripts/apply-monitor-all-nodes.sh' -o ~/apply-monitor-all-nodes.sh
bash ~/apply-monitor-all-nodes.sh --apply
```

Installer must report `APPLIED_OK`, backup path, and whether `mhc-authority-agent` was running/restarted. It preserves Panel admin data/credentials, secrets, Cloudflare Tunnel, services other than Panel/Agent, database and website. Agent does not auto-install if absent; check `sv status "$PREFIX/var/service/mhc-authority-agent"` on both phones. Do not initialize/reset node UUID/keys.
3. **Existing Cloudflare Worker needs a compatible code deployment**, else it will ignore the extra heartbeat telemetry and `history` requests will 404. Deploy the updated `reference/cluster-authority/worker.mjs` with **existing** `reference/cluster-authority/wrangler.toml` / same Worker name and same Durable Object namespace. From the existing authorized Wrangler workspace:

```sh
cd reference/cluster-authority
npx wrangler deploy --config wrangler.toml
```

Do **not** create a new Worker, wipe Durable Object storage, rotate membership keys or rerun `prepare-secrets`. Existing Cloudflare secrets `MHC_CLUSTER_ID`, `MHC_MEMBERS_JSON` remain stored in the same Cloudflare deployment; verify in Cloudflare before proceeding. No need to alter the Panel Access policy or public Tunnel route.
4. From `https://panel.giaouoc.com`, sign in through Access, open **Monitor**, select Vsmart then Sony XZ3. Allow up to the next agent heartbeat for the first metrics and at least 5min for history to have more than one sample. If unavailable, check agent state and current Worker version. Keep clear that Monitor v2 does not grant Primary.
5. Run `node tests/monitor-all-nodes.mjs` and existing `node tests/cluster-authority.mjs .` on a trusted local worktree or Codex runner before production migration. These tests are not substitutes for a two-Android screen-off outage/rejoin test.

## Rollback

On each LAB phone the installer prints `BACKUP=/.../mhc-monitor-v2-backups/<timestamp>`. To roll back, use the per-node backup documented by installer; do not revert Cloudflare secrets or create a new Worker. For Cloudflare source rollback, deploy the prior Worker code with the **same** name and DO binding; the old code ignores telemetry already stored. Avoid bulk deletion of unknown private files. Script automatically restores Panel/Agent source if HTTP health fails during install; remote auth validation is a separate acceptance check.

## Non-goals

Monitor does not select Primary or establish website/DB health or replication. Shared Authority is still PREPARE_ONLY; `declaredPrimary:null`, `writeLeaseGranted:false` until real M3 executor and fencing are built and verified.

## Current validation status (2026-10-26)

- **PASS in isolated JavaScript fixture:** loaded modified Cloudflare Worker and Durable Object in a V8 mocked Request/Response/storage environment; 2-node signed-role calls returned heartbeat HTTP 200, shared status HTTP 200 with telemetryRecent and device field, history HTTP 200 with 1 point, agent attempting Panel-only history HTTP 403, legacy heartbeat HTTP 200, malformed telemetry HTTP 400; no leaked private field, no declared Primary or writer lease. This does **not** represent a Cloudflare deployment.
- **PASS in isolated collector fixture:** mock Android Node/os/fs/Termux subprocesses produced expected CPU/ram/storage/battery/network/service shape, 9 known service entries, with no interface-name disclosure. CPU and network rate correctly unobserved on first sample.
- **PASS static JS parses** for updated original Panel UI/bridge/server/collector/authority client/Worker (imports/exports normalized only for syntax parse). Installer's five pinned Git blob IDs were compared with the corresponding exact GitHub commit revision and all matched. 
- **NOT RUN:** real Node test runner `node tests/monitor-all-nodes.mjs`, Android Shell installer, hardware battery/CPU, web-browser CSS, Cloudflare Worker deployment, 2-device cluster history, persistence after screen-off/reboot. Do not advertise those as passing.

### 26/10/2026 — installer bug fixed

User saw `STOP: Unexpected auth module in Panel`. Previous script checked for `crypto.verify` inside `server.mjs` although JWT signature verification resides in `mhc-remote-access.mjs`. The corrected installer validates both (a) server imports the existing auth module and (b) the installed auth module still verifies RS256 JWTs. It does not modify that auth module and does not weaken Cloudflare Access SSO. Script exits before writing any Panel source when the check fails. Corrected download URL now references installer commit `2656d8b9cb4ddc330a850064567ff257cf4ab030`; discard/re-download the old local installer file.

The all-node UI hides CPU from every Panel view including local Dashboard and Node.js process table, as requested. CPU is not collected in the revised remote node telemetry. See `MONITOR-V2-PAIRING-DESIGN.md` for screenshot feature comparison, current manual Shared Authority membership, and the planned ten-minute one-use pairing flow. Full new pairing is NOT implemented yet.
