# CF-OPT request audit — 30/10/2026

Checkpoint A: read-only source/runtime/Cloudflare audit. Source baseline de03947; no runtime/Cloudflare mutation in this checkpoint. LIVE-PROGRESS is the execution-status source; this file is the requested evidence/calculation specification.

## MEASURED versus ESTIMATED

One bounded, read-only Cloudflare GraphQL query, period **2026-10-29T00:00:00Z ≤ UTC < 2026-10-30T00:00:00Z**, returned2Worker groups and2DO namespace groups (limit100, no truncated group result):

|Scope|Worker requests|DO requests|
|---|---:|---:|
|MHC Worker / existing Authority namespace|149,790|98,906|
|Whole account|151,322|99,719|
|Other Worker scripts (aggregate only)|1,532|813 other DO requests|

MHC errors726, subrequests99,264. Errors are analytics outcomes, not proof that every HTTP503 was a quota error. Yesterday included changing roles/outages; totals are not a controlled24h steady workload. GraphQL metrics are actual reported analytics, not a promise of billable quota units. Account subscription read returned403/10000: Workers billing plan **UNAVAILABLE**, no plan change and no inference that >100k metrics proves Paid. DO SQLite backend is in the existing v1 migration; it is not being migrated.

On three LABs:11T node source1d1d0f3, XZ3/Vsmart a29eb27; actual Worker/DO5e82677. All three SSH/Panel/Agent/guard/Tunnel services running; all local managed sites STANDBY. Authority revision77/epoch14, Primary recordXZ3 but **no live writer lease**, Control11T, journal **AWAITING_PUBLIC** (Control recovery). AutoOFF; P4.0 runVERIFIED, schedule unchanged. This differs from yesterday's checkpoint: no recovery/failover was performed for CF-OPT. Live deployment must wait for the important journal to finish. Native checks read metadata/services plus one status/node; no SQL/writer/website mutation.

## Every request source

For authenticated HTTP actions: one incoming Authority Worker request → one DO stub.fetch. The direct JavaScript this.fetch(status) recursion after N1/site/P33 actions is **not** an additional DO invocation; it does add storage reads/serialization. Unauthorized static Worker requests can stop before DO; dynamic authorization is checked inside DO. Network attempts may never reach either service. Counters must preserve that uncertainty.

|Source / endpoint|Caller / code|Cadence or cost|Classification / optimization|
|---|---|---|---|
|status + heartbeat|cluster-authority.mjs heartbeat/watch|2/30s/node nominal:5,760/day|Health deadline preserved. Sequence can be bootstrapped/reconciled instead of GET before every successful heartbeat. Metrics already bundled, not one request/metric.|
|site-poll|site-standby.mjs siteAgentTick; Agent loop|1/3s/node nominal:28,800/day|No job still polls. Must preserve fast Manual delivery/15s proof TTL; bounded long-poll + wake on existing job commits is preferable to blindly slowing all polls.|
|N1 reconcile status|n1-self-service.mjs tick|1 per outer Agent loop (~3s plus work)|Called before retryAfter check; reads still storm during backoff. Use existing fresh heartbeat observation only for management capability hint, never lease/proof authorization.|
|N1 Control proof + publish|ControlNode.proof + n1-publish|2fresh status reads +1publish every Agent loop|Largest avoidable per-N1 load. Generate signed proof on demand through existing job relay; keep signature/epoch/TTL exactly, not stale-cache proof.|
|n1-provision|N1 own Agent|1/45s ≈1,920/day/N1, plus Cloudflare management API GETs|Own Tunnel verification90s freshness stays. CF API subrequests are not more incoming Worker invocations. No new token or Tunnel.|
|site full health|site-poll auto verify + verifyLocalSite|every120s:2fresh status + result ≈2,160/day/node, polls counted above|Standby read-only verification; active has ~2extra reads/check. Preserve checks/nextCheckAt/evidence expiry.|
|Primary supervisor status|p33-node.mjs watch|1fresh GET/cycle then sleep1000ms|Safety protected. Healthy nominal86,400/day/active site; actual includes network/local work latency. Not telemetry. No cached status or slower interval in CF-OPT.|
|p33-renew|same supervisor|remaining TTL<45s of90s grant:~1,920/day/active site|Protected protocol unchanged.|
|website Authority fanout|p33-node HTTP gate|+1fresh status per incoming managed HTTP request; proof routes add fresh signed context reads|Browser traffic routes directly Tunnel→origin, **but** managed origin gate calls Authority. Static assets through that gate also add reads. Cannot claim website traffic is currently free of Worker consumption or bypass it.|
|Cluster / primary-selection|original Panel bridge sharedView|normal Cluster1/20s visible; technical view can call both APIs; per open tab|Display-only single-flight/short cache; decision/proof/mutation paths must stay fresh.|
|Monitor / history|app.js / sharedHistory|cluster1/15s visible; history per displayed node cached90s|Already visibility guards for main pages; no requests after browser closes. Coalesce and refresh on visibility return.|
|Standby modal status|app.js interval|1/4s while modal open, even hidden and terminal job|Actual missing visibility/terminal/in-flight guards. Fix without blocking active jobs.|
|Cron maintenance|wrangler cron once/minute|1,440 scheduled invocations +1,440DO calls/day, one shared cluster|Not multiplied per node. No DO alarms/new scheduler found. Count Cron conservatively separately from incoming HTTP billing.|
|snapshot chunks|site-upload / site-download|2×ceil(bytes/196,608) incoming Worker+DO requests/snapshot|ACK is already in response, no extra per-chunk ACK. For23,172,996bytes:118chunks/236calls, plus metadata/progress/checks.24/day:5,664chunk calls.|
|snapshot extras|site-start/site-sync, progress, receipt, guard reads, job polling|bounded, workload dependent|Keep checksum/APPLIED+VERIFIED/RPO/reservation/rollback/retention; no direction/schedule change. Increasing raw chunk to393,216bytes already exceeds512KiB client reply bound after base64+metadata; do not increase blindly.|
|Manual / Control / onboarding|P33 coordinator, N1 registration|event driven; bounded readiness/job polls (50×500ms), N1 proof retries4×2s|Keep CAS/idempotency/pins and fresh proof. No blind retry after uncertain mutation.|
|network/auth/429/5xx|Agent catches +3s outer loop|heartbeat failures can retry every3s because last success never advances; N1 status precedes backoff|Classify errors and back off only background work; preserve fail-closed and explicit resume/reconcile.|
|legacy modules|p31/node-role-guard/witness and GTID/file LAB tools|only when configured/run; no live evidence they are active loops here|Not assumed to consume current MHC quota. Other account script names not queried/changed beyond aggregate metrics.|

## Cadence model before optimization (ESTIMATED)

24h healthy zero-latency scheduling envelope: N total nodes, K=N−2 N1 nodes (two legacy), one managed site, optional one active Primary P. No browser/sync/public traffic included. Real loops add collector/network/SQL time, and quota/failures cap activity; this model deliberately is not labelled a measurement.

- Agent base = N×(5,760 heartbeat +28,800 empty polls +2,160 health) =36,720N.
- N1 extra = K×(28,800status +57,600proof reads +28,800publish +1,920provision) =117,120K.
- Active add = P×(86,400supervisor +1,920renew +1,440extra health) =89,760P.
- DO scheduled +1,440/day. Conservatively add the same1,440 scheduled Worker invocations in upper-bound budget; keep it distinct from HTTP.

|Nodes|N1 count assumption|HTTP/day all Standby|HTTP/day one Primary|Conservative incl Cron/day|
|---:|---:|---:|---:|---:|
|3|1|227,280|317,040|318,480|
|5|3|534,960|624,720|626,160|
|10|8|1,304,160|1,393,920|1,395,360|

Active guard alone at0/100/500ms request+local latency is86,400/78,545/57,600reads/day nominal, before browser/renew/background. Thus the50k steady target is not achievable by telemetry tweaks alone while preserving this unchanged guard. Free100k headroom must also include ordinary site fanout and other account users. Multi-site cost scales with active guards + visitor requests; multi-Standby sync scales with copy count and bytes, not node CPU score.

## Other Free limits and evidence

Official limits checked30/10: Workers100k/day account-wide, CPU10ms/invocation,128MB and50subrequests; DO100k/day compute requests,13,000GB-s/day, SQLite5million rows read/day,100krows written/day,5GB account storage. Hidden SQLite KV methods still consume rows; deletes also count writes. One always-active128MB DO can be ~10,800GB-s/day, leaving limited duration reserve; do not create more DOs. Persisting N1 proof each3s costs28,800puts/day/N1 alone, independent of HTTP optimization. Metadata polling repeatedly reads node registries/history; chunks and retries add rows. Actual duration/SQLite row usage and current paid/free plan are **UNAVAILABLE**, not assumed zero. CPU10ms and row budgets require LAB evidence before a Free-ready claim.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [DO pricing/storage](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers metrics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/), [DO metrics](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/).

## Selected changes / alternatives

Prioritize idle site polling, periodic N1 proof publication, redundant heartbeat GET and Panel polling. Use existing DO/job relay, no new authority/controller/storage/scheduler. Keep all safety timings and predicates, snapshot chunk protocol, directions/schedules, Access/JWT/session/CSRF intact. Add local counters/piggyback metadata with no extra per-request network logging. Show ESTIMATED/UNAVAILABLE and forecast both Worker/DO in original Panel.

If the active guard still prevents the Free budget, report the remaining gap rather than slow or cache it. Smallest technical follow-up is a persistent authenticated read transport on **the same Authority**, one fresh nonce/reply per safety read and the same authorization/storage/lease protocol. WebSocket billing20:1 is not a reduction in raw DO analytics; Free enforcement and row/CPU budget must be verified before relying on that ratio. This is a proposal, not runtime completed or automatic permission to change P4. This checkpoint does not introduce that transport.

## Checkpoint cross-reference

Bphonea8ce706 and finalbackend ed3fab8 implement selected reductions. Cnative/live proof/rollback/authorization evidence is inCF-OPT-RESULT.md; all3namedLABs now upgraded under explicit sharedVsmartPanel permission. The optimized tables are cadence projections, not a24haftermeasurement. OriginalAstate is historical. Latest execution status is onlyLIVE-PROGRESS.md.
