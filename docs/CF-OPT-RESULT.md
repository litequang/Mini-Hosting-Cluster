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

Windows fixtures PASS: cf-opt (sequence lost-reply/restart, targeted wake/races/timeouts, bounded classified backoff, sanitizer/coverage/forecast, actual UI hidden/terminal/single-flight behavior), N1self-service27cases (both protocol modes; management-only on-demand proof cannot grant SITE_READY/Primary), cluster-authority auth/replay/concurrency/storage failure, P33manual/P33node, P4gate source, site-standby, site-sync, authority-panel cache/dispatch, monitor telemetry. Remote-panel/legacy bridge require POSIX: their Windows prerequisite failures were resolved by native physical11T execution. TLS Panel/CSRF/security tests also PASS natively; these are isolated fixtures, not Internet-positive proof. No failover/partition/poweroff/Primary/Control change, SQL writer operation or new snapshot direction was performed for these tests.

## Deployment and rollback

Before live rollout: recheck important journals VERIFIED, no pending mutation/reservation; retain source transaction backup and private config/admin/SSH/site hashes on each device, never upload them. Immutable source package from committed Git blobs; old releases01–06 and P4packages unchanged. Roll source to three fenced Standby LABs using existing checksum-pinned updater, then existing Worker/DO code only; keep namespace/migrations/secrets/flags/cron/Access/DNS/Tunnels/data. Native isolated fixtures can execute on Android without touching real DB.

On rollback, prefer each recorded source-upgrade transaction after current fresh Standby proof and no job in flight. For Control compatibility, restore old node source and previous Worker version together; new clients also retain legacy Worker fallback. Existing SQL gates stay installed and require compatible keeper runtime. Do not drop triggers, reset identity, restore database or overwrite DO state as a source rollback shortcut. Runtime artifact/SHA/acceptance evidence will be recorded after C.

## Smallest follow-up if Free-only is mandatory

Do not weaken lease, freshness, fencing or visitor gate. Evaluate one persistent authenticated fresh read transport on the same existing Authority, with current nonce/context/CAS/TTL and fail-closed disconnect. It can avoid separate Worker HTTP invocations; it does not automatically remove DO/storage/CPU/duration cost. WebSocket20:1 billing is not raw-analytics20:1 or evidence about the Free hard quota. This is a proposal only, requiring proof before implementation/Free acceptance; no framework or new controller was introduced.

## C — final authorized LAB deployment

All3 phones now run **a8ce706cbb59c346ba4667f16162910046c2acd5**, immutable MHC-LAB-20261030-CFOPT98files. ActualWorker **and actualDO** report **ed3fab8411df40235abf4882e8ef79bd965da7d6**, trafficProtocol1; Worker version **5adf1340-a00b-44cc-b191-2c2ba89bf2f1** at100%. Backend has the legacy-client compatibility/race fixes; phone payload bytes are unchanged from the singlea8ce706 package. Do not rebuild an older immutable release with new bytes.

Revision78/epoch14, Control11T, PrimaryrecordXZ3 but **no writer lease**, all3localSTANDBY/managedHTTP closed, AutoOFF, P33journalVERIFIED. Existing sync runVERIFIED and schedule11T→XZ3 unchanged. No role/route/lease/SQL writer/snapshot apply or production website migration was performed. F3216 is an untouched fourth membership entry, so budget coverage3/4 is explicitly incomplete; its traffic and other account scripts are extra to the3/5/10 model.

|Evidence|Result / scope|
|---|---|
|Native focused/security fixtures on physical11T|PASS: CF-OPT, N1self-service27, cluster-authority, P33manual/node, P4gate source, standby/sync/sync-node, upgrade quiescence, authority-panel, monitor, RemotePanel57JWTassertions, real isolatedTLSPanels/auth/CSRF/replay/outage and legacy bridge. Final backend delta rerun PASS in an isolatedHOME. Not real outage/SQL writer acceptance.|
|All3 actualsource/SSH/Agent/Monitor/Standby|PASS; same revision/epoch, live heartbeat/telemetry, invalidAccessJWT denied403, closed managedHTTP without a lease.|
|ActualPanel login/Cluster/budget/CSRF/logout|PASS11T/Vsmart; XZ3 authenticated positive login NOTRUN because no local password file, no reset. All3 originJWT-negative PASS. UI hidden/terminal/in-flight polling executed from actual app code in a DOM fixture; visual browser acceptance NOTRUN.|
|Actual newVsmart→11T Controlproof|PASS pinnedEd25519/15sTTL/Control-only/no writer/jobDONE, no ownership mutation.|
|Exact old a29eb27client→final backend→11T|PASS after prior periodic proof expired: 2396ms, expiresIn11407ms at response, signedControl-only/no writer and revision/epoch unchanged. The original client API is preserved without requiring every out-of-scope node to upgrade.|
|Passive optimized11T counter observation|~260s: heartbeat+7, site-poll+3, n1-provision+4, status+2, site-result+1, **periodicn1-publish+0**. MEASURED_LOCAL_COUNTER_DELTA, includes acceptance calls/flush lag, not Cloudflare billing/24h rate.|
|Source/config/admin/SSH/site protection|PASS private hashes retained; SQL/Tunnel PIDs unchanged. No secrets/dumps retrieved intoGit. Vsmart rollback/reapply source entries verified100/98 respectively.|
|Snapshotnewapply / actualactivewebsite writes / partition / reboot / Auto|NOTRUN: no current source lease and no authorization to change roles/direction or exercise real failover for CF-OPT. Existing run provenance unchanged, source fixtures PASS.|
|24h optimizedCloudflare / CPU / duration / SQLite rows / billingplan|NOTRUN or UNAVAILABLE; actual UTC29baseline remains separate. No Free-ready claim.|

### Compatibility and budget behavior

Existing n1-control-proof now obtains fresh proof over the same authenticated relay if its signed cache is absent/stale: require registeredfreshN1Tunnel, stableP33context and originalPanel role; queue at most one control-ready job, wake target, return existingPENDING for the original client's bounded2s retries. No restore/sync preemption. Every response keeps original signature/context/15sTTL validation. Bad signature/management errors stay terminal. A verified control-ready result event-publishes into the existing n1-proof key, so a later health job cannot erase it; regression replaces the job slot before the old-client read. This is event-only, not periodic publication or an extra controller/scheduler.

Counters are best-effort local attempts with no extra network logging: daemon flush≤60s, capped512process files; a short-lived CLI may lose buffered tail counts. Coverage/cap problems are flagged; the sum is not billing. Historical sanitizedGraphQL snapshot is labelled with exact UTCperiod, not today/live. Warning40k/High50k/Critical90k slows automatic display refresh60/120/300s only; manual actions/proofs/leases/fencing/CAS are never blocked by that soft display budget. Real Cloudflare rejection still fails closed.

Beyond requests: source-level steady write-call estimate (not measuredSQLite rows) is about4,608N+5,760K/day from heartbeat/history, health-job state and registeredN1provision; preparedN1site enable adds up to720K. For3/5/10 withK=N−2: ~20,304/42,480/97,920put calls/day before Cron, renewals, sync, audit and storage implementation effects. This shows how10nodes can approach row-write limits even idle; actual billed rows are UNAVAILABLE. CPU/duration/read rows/storage also remain unverified. A continuously active128MB DO is roughly10,800GB-s/day, close to the13,000Free allowance before other namespaces; long polling is not a free-duration guarantee.

### Scope correction and explicit authorization

Read-only config confirmed panel.giaouoc.com shares Vsmart127.0.0.1:9090. Initial source rollout affected that origin; Vsmart source and backend were precautionarily rolled back, with original source-entry/private hashes verified. Do not describe that initial rollout as zero production impact. User then explicitly approved **source upgrade of the shared VsmartPanel**, keeping DNS/Access/data unchanged. The same immutable package was reapplied under that authorization; no further permission is needed for this completed checkpoint. ProductionAccess/policy/DNS/nonLAB ingress fingerprints and namespace/bindings/secrets/flags/cron hashes match baseline throughout. No M51/X7b/F3216 operation.

On11T, runsvdir/SSHD supervision was missing before source apply while an orphanSSH master served access. A first handover stopped that master but service failed; user ransshd once to restore access. Final guarded handover with independent rescue/finally fallback succeeded: supervisedSSHDpid22510 stable, freshSSH works, same key/password/port; SQLpid30337 andTunnelpid31962 unchanged. Private config/admin/SSH/site hashes PASS. This is a maintenance incident, not an all-PID-unchanged PASS; reboot/Doze recovery remains NOTRUN.

### Release and rollback

- releases/MHC-LAB-20261030-CFOPT.tar: phone sourcea8ce706,98files, manifestSHA **475e67339828dea1ea0f84e1d8e1466ec752710fc727651e1fc42090fe805124**, tarSHA **5625629c07e5dc5f41d08361c63b0f6dba209da0af4c1b2ae1eebea17c72e020**. Source upgrade only; no fresh phone installer acceptance here. Existing releases01–06/P4 unchanged.
- Vsmart current incoming **release.6uaxa9**, tx-20261030021804543-affde1DONE, baselinea29eb27. Earlier tx-20261030014705663-48fdf4ROLLED_BACK successfully and all100originalsource entries independently verified.
- XZ3 incoming release.bTE2WW, tx-20261030014845706-67935fDONE, baselinea29eb27.
-11T incoming release.F3sG6K, tx-20261030014917294-d53dedDONE, baseline1d1d0f3 (keeper compatible).

Incoming under ~/.local/state/mhc-source-upgrade/incoming/; transaction/private backups remain on devices, notGit. After freshStandby proof/no important site/sync/Control job: bash <incoming>/update.sh --rollback <transaction> --node-id <own-uuid> --manifest-sha256 475e67339828dea1ea0f84e1d8e1466ec752710fc727651e1fc42090fe805124. ActualVsmartrollback PASS; XZ3/11Tactualrollback NOTRUN as unnecessary. Backend fallback: priorstableWorker dc2d816f-7dcb-408c-842d-3fd5d532e843/source5e82677; newphone clients retain legacyWorker fallback. Select code version only, never restore/resetDO storage/identity/secrets/database or removeSQL guards. Allow platformDO grace and verify actualsource, not just deployment metadata.

## Conclusion and next step

The requested waste reductions are implemented and safely accepted on the three namedLABs, with the stated NOTRUN limits. **The50k target and Cloudflare-Free-safe active hosting are NOT accepted for3/5/10nodes.** Current protectedguard/per-HTTP validation makes the nominal optimized single-site workload121,432/138,232/180,232Worker-conservative andDO requests/day. Physical latency can change actual rates, but cannot be treated as budget control. Full-day optimized/account-wide metrics are still needed, and the untouched fourth node adds unknown traffic. No safety mechanism was weakened or Paid plan enabled.

Next: observe one full UTCday under the deployed source and assess a fresh authenticated persistent read transport on the sameAuthority only if Free-only remains mandatory. It may reduce separateWorkerHTTP invocations; DO raw requests/Free enforcement/rows/CPU/duration must be proven. WebSocket20:1billing is not a raw analytics or hard-quota guarantee. This remains a proposal, no framework/controller or P4redesign was implemented.
