# MHC P3 — lựa chọn Primary thủ công / Operator-assisted LAB cutover

Date: 2026-10-26. **SOURCE MILESTONE ONLY**. This code is **not** approved for production website/data writes. Current Worker remains `SHARED_AUTHORITY_PREPARE_ONLY` and **never** grants writer lease or proves fencing. Cloudflare mutation is opt-in lab-only.

## Source components

- `reference/cluster-authority/p3-route.mjs`: Cloudflare API CNAME adapter for an **allowlist of 1–8 specific DNS records**, 2–20 node tunnel destinations each. Two-phase network behavior: reads ALL current records, rejects metadata mismatch and unknown targets, then patches and GET-verifies each record. Site first, Panel last, to preserve recovery time. Already-targeted records are not patched on retries. A partial failure leaves an operator-inspectable durable journal. No wildcard or zone enumeration.
- `reference/cluster-authority/worker.mjs`: Shared Durable Object transactional CAS / idempotent flow:
  `begin` -> `PREPARED_NO_WRITER_GRANT` ->
  `route` (operator confirmation + recent target heartbeat/Monitor/Panel and nginx) ->
  `ROUTING_REQUESTED` committed to DO **before** DNS PATCH ->
  `DNS_SWITCHED_AWAITING_HTTP_CONFIRM` after API GET verification ->
  `complete` with user-attested public HTTP+Panel test -> `declaredPrimary` **LAB operator record only**, `fencingVerified:false`, `writerLeaseGranted:false`.
  `route-resume` retry after >=30 seconds when DNS may have been partially changed. `abort` only permitted before route starts. No automatic rollback of DNS after database writes.
- `bin/cluster-authority.mjs`, `bin/legacy-panel-src/public/app.js`: client and Panel buttons for route, retry, final attestation; every write requires existing Cloudflare Access verified user, Panel CSRF+Origin checks.
- `tests/p3-route.mjs`: isolated fake DNS API tests incl. opt-in disabled, invalid token, correct site-before-panel order, PATCH verification, idempotent retry and unknown-target refusal.

## Worker configuration (private; not in repository)

This P3 LAB feature is disabled unless ALL of these secrets are configured by an authorized operator in the **existing** `mhc-cluster-authority-lab` Worker:
- `MHC_P3_LAB_ENABLED=OPERATOR_ASSISTED_DNS_ONLY`
- `MHC_P3_INITIAL_PRIMARY_NODE_ID` = known id from shared cluster
- `MHC_P3_CF_TOKEN` = narrowly scoped Cloudflare API token with DNS Edit for ONLY the LAB zones
- `MHC_P3_ROUTES_JSON` = JSON array containing exactly the chosen **LAB** CNAME records and permitted `nodeTargets` maps, never wildcard.

Example **schema** with placeholder IDs (do not paste literally):

```json
[
  {
    "zoneId": "32-hex-cloudflare-zone-id",
    "recordId": "32-hex-cname-record-id",
    "hostname": "demo.lab.example.com",
    "kind": "site",
    "nodeTargets": {
      "node-uuid-of-vsmart": "vsmart-tunnel-uuid.cfargotunnel.com",
      "node-uuid-of-xz3": "xz3-tunnel-uuid.cfargotunnel.com"
    }
  },
  {
    "zoneId": "32-hex-zone-id",
    "recordId": "32-hex-panel-record-id",
    "hostname": "panel.lab.example.com",
    "kind": "panel",
    "nodeTargets": {
      "node-uuid-of-vsmart": "vsmart-tunnel-uuid.cfargotunnel.com",
      "node-uuid-of-xz3": "xz3-tunnel-uuid.cfargotunnel.com"
    }
  }
]
```

Validate each node has its **own existing named Cloudflare Tunnel**, ingress routes and **original Panel with JWT Access verification** before enabling. A CNAME swap alone cannot create ingress, switch application processes or guarantee a working Panel on XZ3. Never configure a production hostname here until real end-to-end and safety approval. No token/IDs have been retrieved, and no actual Cloudflare account has been modified by ChatGPT.

**Cloudflare Access:** Route a protected hostname only to a node configured with the exact intended Access AUD/issuer/JWT verification; shared hostname must keep access policy. The DNS record target must be the configured Tunnel UUID for the target node. Don't use two arbitrary cloudflared connectors in one Tunnel as a Primary-aware router.

## Panel steps LAB only

1. Open `panel.giaouoc.com` or another protected LAB Panel in a verified admin browser. Check both node heartbeats; ensure target `amh-panel` and `nginx` show RUNNING in recent v2 metrics.
2. Back up old site+DB and RESTORE to candidate manually. Verify local HTTP, database, media and that independent Panel Access can reach candidate.
3. Independently stop old site's ALL write entry points (app, PHP, MariaDB write APIs, cron, uploads, jobs, shell); record evidence. Current code **cannot enforce or prove full fencing**. Do not use with meaningful production data.
4. Cluster -> choose candidate (new pending transaction) -> `Chuyển Cloudflare DNS (LAB)` -> confirm checked steps. Worker journals intent before Cloudflare changes and verifies DNS values. If interrupted, inspect live records before `Kiểm tra và tiếp tục DNS`; do not start a second transition.
5. Confirm external site HTTP and protected Panel from a separate network; confirm no new writes reached old node. Click final operator attestation. It records a **LAB administrative selection**, not safe service HA.
6. Old node rejoin is marked `STANDBY_REJOIN_REQUIRES_OPERATOR_REVIEW` only in authority metadata. Current Android role guard does not prevent every direct write; run a manual stop/restart check.

## Missing for real P3 completion

- Real ability to activate target web/DB services and enforce all-path old writer fencing.
- Independent reliable panel rescue routing even when incumbent phone is completely offline; DNS route from the Worker is possible only if you can still reach a Panel that can issue the request, or have a separate recovery controller.
- Public HTTP node identity proof / signed target health, and verification that target databases are serving expected site.
- Crash tests with real Cloudflare account and two phones, Access authentication+CSRF, rollback conditioned on no new writes.
- Fully automatic/manual-to-active Primary with verified lease; API DNS-only is insufficient.

**Status:** code pushed, syntax static check and mocked DNS adapter behavior tested locally in isolated JavaScript; `tests/p3-route.mjs` is authored but the actual Node test runner has not been executed here. On-device LAB and Cloudflare deployment **NOT RUN**. Production M51/X7b and live web domains untouched.
