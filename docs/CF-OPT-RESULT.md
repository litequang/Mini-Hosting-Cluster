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

## C — native evidence, deployment boundary and current disposition

**Source a8ce706cbb59c346ba4667f16162910046c2acd5; final deployment acceptance BLOCKED by the shared production origin, not certified Free-ready.** The forecast above describes all nodes running the optimized protocol, not the mixed runtime retained below.

All three LAB source upgrades initially APPLIED/VERIFIED at98files; Worker/actual DO reached a8ce706 with trafficProtocol1 (version1d406ac5-02ef-4ebf-92d2-789c27cf3041). Native focused fixtures on physical11T PASS: CF-OPT, N1self-service27, cluster-authority, P33manual/node, P4gate source, standby/sync/sync-node, upgrade quiescence, authority-panel, monitor, Remote Panel57JWT/CLI assertions, two real isolated TLS Panel processes/auth/CSRF/replay/outage, legacy Panel bridge. Fixture DB/storage were isolated; this is not a real failover or SQL writer acceptance.

Live safe checks PASS: all3 heartbeat/telemetry, same revision78/epoch14, journalVERIFIED, no writer lease, localSTANDBY/closed managed HTTP; invalid Access JWT denied403 on each. Actual login→Cluster/usage→CSRF rejection→logout PASS on11T/Vsmart; XZ3 existing password file unavailable, so real local authenticated login onXZ3 NOT RUN (no reset requested). Display hidden/terminal/in-flight/visibility behavior was executed from actual app source in a DOM fixture; interactive visual browser acceptance NOT RUN. OriginalPanel enhanced budget is at Cluster on11T/XZ3; do not expose Panel9090 on LAN.

Actual Vsmart→11T on-demand Control proof PASS: pinnedEd25519, scopeMHC_CONTROL_ONLY,15sTTL, writerGranted=false/siteReady=false, relay jobDONE, epoch/revision/lease/route unchanged. Local counter observation 2026-10-30T02:01:52.163Z: ~260s between observations, heartbeat+7/site-poll+3/n1-provision+4/status+2/site-result+1/**n1-publish+0** on11T. This is MEASURED_LOCAL_COUNTER_DELTA, includes acceptance calls and≤60s flush lag; it is not Cloudflare billing or24h rate measurement. Counter files created by fixture processes were archived privately before11T runtime upgrade so they do not contaminate runtime totals.

### Production-origin conflict and safe rollback

Read-only Tunnel configuration confirmed **panel.giaouoc.com → Vsmart127.0.0.1:9090**, the same originalPanel used for its LAB. Initial source update therefore also affected the shared origin even though DNS/Access never changed. To respect the explicit no-production-impact boundary, Vsmart source was restored using transaction rollback, then all original source-entry checksums/private config/admin/SSH/site hashes and SQL/Tunnel/SSH PIDs were checked. Do not call the initial rollout zero-impact production work. User choice is pending: keepVsmart baseline/test only the two isolated LABs, or explicitly allow the shared-origin source upgrade. No implicit authorization from the previous LAB label.

WhileVsmart stays old, restore existing Worker **dc2d816f-7dcb-408c-842d-3fd5d532e843 / source5e82677** for its legacy cached-Control-proof compatibility. New11T/XZ3 clients retain tested legacy-Worker fallback; heartbeat GET reduction and display cache remain, but on-demand/long-poll reductions are **not fully active** on the retained old Worker. Actual DO changes may require the platform grace period; do not reset/redeploy storage to accelerate it. Settings hash verified namespace/bindings/secret metadata/flags/cron unchanged; productionAccess/policy/DNS/nonLAB ingress fingerprints match throughout. No M51/X7b/F3216 operation, role/route switch, SQL writer change, snapshot apply or schedule-direction change.

On11T, runsvdir/SSHD supervision was missing before source apply while an orphanSSH master still served access. A first handover stopped that master but service startup failed; user ransshd once to restore access. Final guarded handover (independent rescue timer/finally fallback) succeeded: supervisedSSHDpid22510 stable>290s, fresh SSH works, same key/password/port; SQLpid30337 andTunnelpid31962 unchanged. Private config/admin/SSH/site hashes PASS. Do not hide this maintenance incident as a clean PID-preservation PASS; reboot/Doze recovery is NOT RUN.

### Immutable artifact / exact rollback

- releases/MHC-LAB-20261030-CFOPT.tar, sourcea8ce706,98files, manifestSHA **475e67339828dea1ea0f84e1d8e1466ec752710fc727651e1fc42090fe805124**, tarSHA **5625629c07e5dc5f41d08361c63b0f6dba209da0af4c1b2ae1eebea17c72e020**. Source-upgrade package, not a newly accepted fresh Android installer. Existing releases01–06/P4 are unchanged.
- Vsmart incoming release.x9h4Wo, tx-20261030014705663-48fdf4 **ROLLED_BACK** to a29eb272043910b464c6d681bf8ddb4e78efdfb9.
- XZ3 incoming release.bTE2WW, tx-20261030014845706-67935f **DONE** baselinea29eb27.
-11T incoming release.F3sG6K, tx-20261030014917294-d53ded **DONE** baseline1d1d0f3 (keeper compatible).
- Incoming paths are under ~/.local/state/mhc-source-upgrade/incoming/; source/config transaction backups are under ~/.local/state/mhc-source-upgrade/. Private config tar/hash records remain on each device, not Git.

After fresh Standby proof/no important job, use that device's package entry, e.g. bash <incoming-release>/update.sh --rollback <transaction> --node-id <own-uuid> --manifest-sha256 475e67339828dea1ea0f84e1d8e1466ec752710fc727651e1fc42090fe805124. Vsmart actual rollback PASS; XZ3/11T actual rollback NOT RUN because not needed. Existing Worker prior version selection was performed without data/namespace/migration rollback. Do not restore database/identity/tokens or remove SQL gates. Before resuming full CF-OPT, resolve the Vsmart shared-origin boundary, reuse this exact artifact, and activate the existing tested Worker version; do not redo P3.3 or installer setup.

### Not accepted / next decision

Active website200/write traffic, new physical snapshot backup/apply, network partition/poweroff/real timeout/failover,24h optimized Cloudflare metrics/DOduration/SQLite rows and current billing plan **NOT RUN/UNAVAILABLE**. All managed sites were alreadyStandby/no lease before CF-OPT, and the existing sync policy11T→XZ3 lacks an active source lease; do not change roles/direction or write data merely for this test. Fixtures PASS do not replace those acceptance items. Free request target50k **NOT MET** by the unchanged active guard model, and retained mixed runtime is not the optimized projection. Next action: resolve the shared-origin choice, then complete only the permitted rollout/measurement; the persistent fresh transport remains a proposal requiring separate evidence.

## Legacy Panel compatibility completion (source in this commit)

The old n1-control-proof API now reuses a fresh signedControl result from the existing site-job relay. On a missing/stale proof it authorizes the original Panel role, requires registered/freshN1Tunnel and stableP33journal, queues at most one existing control-ready job with current epoch/revision/operation and cryptographic nonce, wakes that target and returns the existing N1_CONTROL_PROOF_PENDING response. The old client's bounded2s retries then read the signed result. It never preempts restore/sync or grants writer, and every returned proof still passes the original signature/15sTTL/context verifier. Bad signature/management errors remain terminal. No new endpoint/controller/scheduler/token.

This allows the optimized Worker to serve the unchanged Vsmart production-origin Panel while optimizing the two isolatedLAB agents. Windows N1/P33/standby/authority regressions PASS; native delta tests and old-Vsmart-client→new11T proof acceptance are pending before reactivating this Worker commit. Vsmart source remains a29eb27; no shared-origin source reapply without the pending explicit choice. Thus full3uniform source performance is still blocked, but backend activation need not depend on changing production. For the three namedLABs with one legacyVsmart and two optimized agents, idle nominal estimate is53,040 Worker-conservative/DO per day before events and the untouched fourth member; actual whole-account usage must not be inferred from that lower-coverage model.

Legacy proof race guard: a control-ready site-result verifies the inner Control signature/context/15sTTL and event-publishes into the existing n1-proof key. This survives periodic health replacing the site-job slot; no periodic publication is reintroduced. Regression replaces the job slot before the old-client read and still requires the fresh pinned proof.

## Subsequent scope authorization

User explicitly approved source upgrade of the shared VsmartPanel, without DNS/Access/data changes. The earlier precautionary rollback remains recorded; it is no longer a permission blocker. Reapply the same immutable phonea8ce706 package after fresh preflight/backup, then deploy the final legacy-compatible Worker source. This does not grant a role/route change or certify Free50k.
