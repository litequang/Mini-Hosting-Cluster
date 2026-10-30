# CF-OPT result — 30/10/2026

Execution status belongs only to LIVE-PROGRESS.md. This document records workload math, scope and reproducible evidence. Audit checkpoint a851b9a is pushed; optimization source is the commit containing this section. Android rollout/metrics after optimization are not implied by source tests.

## Verified causes and changes

Measured Cloudflare UTC29 baseline: MHC149,790Worker /98,906DO; account151,322/99,719, including1,532 other Worker requests. This was not a controlled steady workload. Plan read403; duration/SQLite rows UNAVAILABLE. Detailed audit: CF-OPT-REQUEST-AUDIT.md.

|Function|Before|After, same assumptions|
|---|---:|---:|
|10 successful heartbeat cycles|20HTTP|11HTTP (fixture counted); ambiguous reply reconciles before next publish|
|10 registered N1 ticks within provision window|40HTTP|0extraHTTP using already-returned heartbeat observation (fixture counted); on-demand proof adds event calls|
|Idle site job transport/node/day|28,800|≤1,440 nominal empty long polls; jobs/120s checks extra, wake immediately|
|Heartbeat/node/day|5,760|2,880+bootstrap/reconciliation, same30s deadline|
|N1 periodic proof status/status/publish|86,400/day/N1 plus28,800 tick status|0 periodic proof requests on trafficProtocol1; fresh signed request on demand; provision1,920/day unchanged|
|Technical Cluster duplicate reads|2simultaneous|1shared flight; display-only5s cache, invalidate on mutation|
|Hidden/terminal/overlapping modal|1/4s|0; pending modal still4s when visible|
|Primary guard / renew / per-HTTP|unchanged|unchanged; no P33/P4 safety module diff|
|Snapshot chunks/checksum/receipt/schedule|unchanged|unchanged,196,608raw bytes;2×ceil(bytes/chunk)|

Nominal model: N nodes, K=max(N−2,0) N1 nodes, P active managed sites: **6,480N +1,920K +89,760P HTTP/day**, plus site visitor HTTP, Panel activity, sync and event/retry calls. Cron adds1,440DO/day; conservatively include1,440scheduled Worker invocations separately from incoming HTTP. This is a cadence estimate, not a measured minimum or billing prediction; network/collector latency changes actual totals. On-demand events/failed attempts can increase traffic. Multiple active websites and extra Standby copy targets multiply the relevant costs.

## 3 / 5 / 10 node forecast (ESTIMATED)

Same controlled calculation workload before/after: one active managed site, one23,172,996byte backup each hour to one Standby (5,664chunk calls +768other sync calls/day),1,000managed HTTP requests/day, one Panel open8h at20s (1,440calls), two legacy members. Other account scripts, Manual actions, restart/retry and additional sites are extra.

|Nodes|Before Worker incl Cron|After Worker HTTP|After Worker incl Cron|After DO|After all-Standby incl Cron, no sync/visits/Panel|
|---:|---:|---:|---:|---:|---:|
|3|327,352|119,992|121,432|121,432|22,800|
|5|635,032|136,792|138,232|138,232|39,600|
|10|1,404,232|178,792|180,232|180,232|81,600|

DO column assumes authenticated incoming requests reach the DO; an actual network attempt can reach neither. Cron billing categories are kept explicit. Idle3/5 fit50k request target in this limited model;10idle is below100k but above50k. **Active hosting3/5/10 is NOT certified Cloudflare-Free-safe.** Protected1Hz nominal86,400safety reads/day and fresh per-HTTP fanout remain. Actual latency can reduce request rate, but is not a robust budget control. No24h after-optimization MEASURED result exists yet. Other Free CPU10ms, duration13,000GB-s/day, rows/storage limits also need measured verification; long polling holds the existing DO awake and may approach duration budget.

## Tests and practical limits

Windows fixtures PASS: cf-opt (sequence lost-reply/restart, targeted wake/races/timeouts, bounded classified backoff, sanitizer/coverage/forecast, actual UI hidden/terminal/single-flight behavior), N1self-service27cases (both protocol modes; management-only on-demand proof cannot grant SITE_READY/Primary), cluster-authority auth/replay/concurrency/storage failure, P33manual/P33node, P4gate source, site-standby, site-sync, authority-panel cache/dispatch, monitor telemetry. Remote-panel and legacy-panel-bridge encounter Windows POSIX-mode/shell prerequisites; native Android checks are required, not waived. HTTP TLS Panel/CSRF test is POSIX-only. No failover/partition/poweroff/Primary/Control change, SQL writer operation or new snapshot direction was performed for these tests.

## Deployment and rollback

Before live rollout: recheck important journals VERIFIED, no pending mutation/reservation; retain source transaction backup and private config/admin/SSH/site hashes on each device, never upload them. Immutable source package from committed Git blobs; old releases01–06 and P4packages unchanged. Roll source to three fenced Standby LABs using existing checksum-pinned updater, then existing Worker/DO code only; keep namespace/migrations/secrets/flags/cron/Access/DNS/Tunnels/data. Native isolated fixtures can execute on Android without touching real DB.

On rollback, prefer each recorded source-upgrade transaction after current fresh Standby proof and no job in flight. For Control compatibility, restore old node source and previous Worker version together; new clients also retain legacy Worker fallback. Existing SQL gates stay installed and require compatible keeper runtime. Do not drop triggers, reset identity, restore database or overwrite DO state as a source rollback shortcut. Runtime artifact/SHA/acceptance evidence will be recorded after C.

## Smallest follow-up if Free-only is mandatory

Do not weaken lease, freshness, fencing or visitor gate. Evaluate one persistent authenticated fresh read transport on the same existing Authority, with current nonce/context/CAS/TTL and fail-closed disconnect. It can avoid separate Worker HTTP invocations; it does not automatically remove DO/storage/CPU/duration cost. WebSocket20:1 billing is not raw-analytics20:1 or evidence about the Free hard quota. This is a proposal only, requiring proof before implementation/Free acceptance; no framework or new controller was introduced.
