# Mini Hosting Cluster v0.3 — One-code, Manual/Auto POLICY + Cloud Arbiter

**Release type:** safety-gated upgrade to v0.2, designed for Samsung M51 and HONOR X7b on Termux. Includes existing inventory/snapshot/monitor scripts, a Cloudflare Durable Object control plane, an optional local control agent and independent process watchdog, GTID and Sheet digest checks, score/prioritization, Admin manual switch and conservative automatic preferred-primary *planned* failback.

## Precisely what is and isn't implemented

**New usable code:**

- Cloudflare Worker v0.3 adds `ClusterArbiter` Durable Object and authenticated `/api/control/{view,policy,switch}` to `monitor.thophuong.com`, `/v1/control` with existing per-node bearer token on `telemetry.thophuong.com`.
- Admin dashboard: modes `observe`, `manual`, `auto`; preference node; request switch; current leader, term, lease expiry, safety status and scores. ALL Admin POST requires Cloudflare Access and same-origin.
- Cluster authority: strictly increasing terms, 20-second lease, 4-second polling, 15-second *local maximum* serving grant; incumbent voluntarily stops Web/Tunnel, makes MariaDB read-only and reports final GTID + hashed Sheet checkpoint before authority changes.
- Local Agent `mhc-control` and independent `mhc-fence-guard`; after explicit arm, the guard fences local services when lease is expired or absent even if outbound Cloudflare requests fail; control-agent also fences on error.
- `mhc doctor`, `mhc control-status`, `mhc seal-files`, `mhc control-arm --confirm=FENCED`, `mhc control-disarm --confirm=FENCED`. Same installer, code, and agent on all nodes.
- Fails closed on unknown GTID/file data, unavailable MariaDB, unverified local fencing, offline incumbent without fencing attestation, stale CAS term, or incomplete replica.
- Never resets cluster ID, copies/replaces `.env`, touches Cloudflare Tunnel configuration, restarts MariaDB, or modifies the live website during code-only installation.

**NOT implemented/NOT certified yet:**

1. Automatic failover when old Primary **abruptly disappears**. An expired lease does *not* physically fence an Android node. The arbitrator deliberately refuses a new writer without old node fencing acknowledgement. Therefore `auto` means auto selection and safe planned failback where the incumbent can fence; not fault-proof split-brain-free offline failover.
2. End-to-end MariaDB GTID setup/replica reparenting. v0.2 snapshot sync still lags (often 24h); the new agent checks whether replication is operating but DOES NOT set it up. GTID strictness/server_id/binlog must be provisioned via maintenance, and the replica promoted to Primary must be reconfigured after a switch.
3. Ongoing near-real-time Sheet/Sheet+ file replication, atomic matching of DB commits with filesystem modifications, independent fencing appliance, WAN continuity, or guaranteed zero RPO/RTO. `seal-files` hashes the directory **at a point in time**, not while writes continue. Keep control DISARMED until an independently tested sync pipeline and write barrier are deployed.
4. Live testing on actual M51/X7b, or deployment to user Cloudflare account. Local tests cover controller state machine and existing v0.2 behavior only.

**No claim of fully autonomous production HA.** Any software that promotes a node simply because another phone has not sent a heartbeat risks dual-primary and losing Thờ Phượng Pro data.

## Installing CODE safely (no live service interruption)

Put the ZIP on each node (e.g. `~/Mini-Hosting-Cluster-v0.3-Safe-Control.zip`), then on **M51** and **X7b** separately:

```bash
unzip -o ~/Mini-Hosting-Cluster-v0.3-Safe-Control.zip -d ~
bash ~/mini-hosting-cluster-v0.3/bin/install.sh
~/mhc doctor
~/mhc control-status
```

The installer only replaces `~/.local/share/mini-hosting-cluster/` implementation files and adds the runit `mhc-control`, `mhc-fence-guard` services. The guard is **inert** until `control.json.armed=true`. The controller polls Cloudflare read-only until then; it cannot stop production services. M51 stays in its present active/stopped state; X7b stays in its present active/stopped state. Installer retains v0.2 UUIDs, cloud token, SSH config and standby snapshots.

**DO NOT** run `init-primary`, `join-standby`, `install-new-phone.sh` or restore snapshots as part of this upgrade.

## Cloudflare independent control-plane deployment

On Windows PC, unzip ZIP, then:

```powershell
cd "$env:USERPROFILE\Downloads\mini-hosting-cluster-v0.3\online-monitor\cloudflare"
npm install
npx wrangler login
npx wrangler deploy
```

Existing Cloudflare Access protection on `monitor.thophuong.com` and secret `ACCESS_ALLOWED_EMAIL` are REQUIRED. For a fresh deployment, configure them first as described in v0.2 `ONLINE-MONITOR-SETUP.md`. Migrations preserve `MonitorStore` and add a separate `ClusterArbiter` DO class. Custom Domains already in `wrangler.toml` must not point to the existing Named Tunnel. Deploy via your authorized account; this ZIP does not include tokens, credentials or DNS changes.

For nodes already cloud-enrolled, `mhc-control` starts automatically after code installation. On nodes not enrolled, first pair on the Monitor then run `~/mhc online-enroll PAIRING_CODE` and verify `sv status mhc-control mhc-online`.

The **default new cluster mode is `observe`**. Use Monitor UI to inspect. Setting `manual` or `auto` does not instantly switch the website; without explicit per-node `control-arm`, safe proof stays false.

## Safety-gated manual/auto lifecycle, for future commissioned deployment

1. Verify that MariaDB on both nodes has unique `server_id`, binlog ON, correct GTID/replication configuration and data freshness; run `~/mhc doctor`. Snapshot-only standby does not satisfy this.
2. Verify Sheet/Sheet+ replication independently and atomically; on both machines run `~/mhc seal-files` to hash contents and compare digests. The point-in-time seal alone is not continuous synchronization.
3. Configure the website runit service, Named Tunnel and guard so all write paths are fenced. Independently verify there are no orphan server processes or bypasses. Run fault-injection tests for network partition/Android Doze/process kill.
4. **Maintenance only**, shut down Web/Tunnel on the *particular node* to arm; ensure root can turn MariaDB to `read_only=ON`, then run `~/mhc control-arm --confirm=FENCED`. Never arm the currently serving production M51/X7b in a live session without an outage plan: this command explicitly requires Web/Tunnel to be down.
5. Via Monitor set manual, choose a vetted Primary. `switch` queues a safe drain; the old holder must acknowledge fencing and a **final** GTID/file seal. The target must show matching GTID/seal to get next term. In auto mode, the same handover can happen on vetted preferred node returning to service, provided last holder is accessible.
6. If Primary simply goes offline without fencing confirmation, the system refuses promotion. Restore/verify old Primary status and data; only a future externally verified fencing design can make unattended offline takeover safe.

## Source test (development PC with Node >=22)

```bash
node --test tests/*.test.mjs online-monitor/cloudflare/tests/*.test.mjs
```

## Runtime and log locations

- `~/.config/mini-hosting-cluster/node.json` — preserved identity
- `~/.config/mini-hosting-cluster/online.json` — cloud token (0600, never share)
- `~/.config/mini-hosting-cluster/control.json` — opt-in arm state (0600)
- `~/.config/mini-hosting-cluster/lease.json` — short-lived monotonic lease, boot-bound (0600)
- `~/.config/mini-hosting-cluster/file-seal.json` — directory checksum, point-in-time
- `~/.local/state/mini-hosting-cluster/control-log/current` — controller log
- `~/.local/state/mini-hosting-cluster/guard-log/current` — guardian log

**Offline failover is a safety boundary, not a missing UI toggle.** For actual automatic M51/X7b failover without acknowledged data loss and without split-brain, first implement replication + app-level fencing (e.g. enforce signed cloud lease at every write path) and independently verifiable public routing. A third arbitrator by itself does not stop a partitioned old node from writing its local DB.
