# Mini Hosting Cluster — MHC v1.0, fenced control plane

**Build date:** 2026-10-24. **Status:** Source release / staged upgrade. **NOT deployed to the user's phones or Cloudflare.**

For Samsung M51 (preferred primary) + HONOR X7b (warm standby), Thờ Phượng Pro, Termux + MariaDB + runit + Cloudflare Tunnel.

This is an **independent v1 overlay**, not an in-place patch to the currently running `~/mhc` v0.2 agent (its source archive was not supplied in this chat). The old agent and service files remain untouched during staging. Maintain backups and roll out in maintenance mode only.

## What is implemented

- **Two modes + two selection strategies:** manual (explicit verified handoff) and automatic (attempts a candidate only if safety policy permits); preferred node can be changed; automatic selection can prioritize M51 or sort eligible nodes by CPU cores, free RAM, storage, uptime and optional battery score; bootstrap M51 via control command.
- **Single coordination authority:** Cloudflare Worker + Durable Object, serialized persistent lease state, increasing term, 30-second lease and 12-second fencing window; no simultaneous valid coordinator leases.
- **Fail closed:** a device receiving no valid coordinator renewal stops its `mini-web` and marks MariaDB read-only; a separate localhost HTTP/WebSocket origin gateway checks a shorter (~12s) local grant on each new request and requires an edge-to-origin secret.
- **Cloudflare public ingress:** optional Worker proxy to two separate *dedicated* per-node Tunnel hostnames; switch owner at coordinator without rewriting DNS per failover. It is **not enabled or deployed** by default.
- **Control UI:** `/admin` in Worker (token required for API); mode, preferred primary, verified manual handoff, rejoin acknowledgment, risk switch. Also `tools/control.mjs` CLI on trusted workstation.
- **Data safety:** snapshot-only secondary is NEVER auto-promoted under strict default; MariaDB GTID health is read and required for explicitly risk-accepted auto promotion. An elected replica stops its replication SQL/IO and stops standby-sync before becoming writable; old primary is blocked on ownership change until verified rejoin.
- **Dry staging:** agent installer defaults `armed:false`; separate explicit Nginx cutover and local ARM steps. Does not alter `~/mhc`, Panel 9090, Monitor 9091, existing site, DB, Tunnel, backup or standby-sync in staging mode.
- Test suite covers lease, handoff, fencing, strict snapshot-only denial, degraded GTID, takeover, and rejoin.

## What is not yet available / critical boundaries

1. **This source package does NOT install/configure MariaDB GTID replication.** Current `standby-sync` takes periodic snapshots only. Until replication is configured and validated, safe automatic failover will stay blocked. Read-only preflight is included.
2. **Async GTID replication is NOT zero-data-loss.** Even with zero displayed lag, a sudden primary power loss can lose acknowledged transactions. The `risky on` mode is explicitly opt-in and is not suitable when zero RPO is required. True zero-loss requires a separately engineered synchronous write-ack/data plane; no such guarantee is made here.
3. **Public ingress requires manual Cloudflare setup:** create two dedicated origin hostnames/tunnels, protect both origins with the edge secret, and move `pro.thophuong.com` to the routing Worker. Existing production hostname must never also bypass MHC gateway. No Cloudflare account credentials were used.
4. **Not a global MariaDB firewall:** a localhost root client or any database and application route that bypasses the gateway can still write. Keep DB ports closed to LAN/public and bind Node to loopback. This code only fences traffic that goes through the gated route and the controlled runit service.
5. **Coordinator dependency:** if Cloudflare cannot be reached, nodes fail closed. Both phones on the same home Wi-Fi are still vulnerable to shared internet/router/power failures. No perfect always-available service is possible with only two devices and no external quorum.
6. **Not tested on real M51/X7b:** local Node syntax/tests passed, but deployment, Cloudflare Worker runtime, cloud Tunnel traffic, MariaDB version interoperability, Android background and crash-recovery require device tests.
7. **Failback:** automatic failback can be enabled, but M51 cannot retake service after X7b writes until its data is reconciled and rejoin is verified. This is intentionally fail-closed, not a blind role flip.

**See [docs/DEPLOY.md](docs/DEPLOY.md) before operating on real hosts.**
