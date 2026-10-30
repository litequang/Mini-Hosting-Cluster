# CODEMAP — MHC

## CF-OPT (30/10/2026)

- bin/authority-traffic.mjs: heartbeat sequence reconciliation and background-only classified bounded backoff; bin/authority-usage.mjs: bounded local counters, sanitizer, explicit estimates and optional read-only historical metric snapshot.
- reference/cluster-authority/job-wake.mjs: targeted in-memory wakeups for existing site relay; worker site-poll waitMs60000 opts in, no new scheduler/storage. usage-safe.mjs accepts bounded piggyback counters only.
- n1-self-service.mjs trafficProtocol1: on-demand signed Control proof through existing site-call relay; legacy fallback retained. site-standby.mjs poll promise no longer blocks the Agent heartbeat loop.
- Original Panel sharedView display-only5s single-flight cache, invalidation on mutations, visible/in-flight/terminal modal polling and budget refresh60/120/300s. Tests/cf-opt.mjs plus N1/Panel regressions. No caching in writer/proof/lease paths.

Đối chiếu source ngày 27/10/2026 trên branch `codex/m1-m2-foundation`, HEAD kiểm kê `da7d67a`; runtime snapshot `f73df61`, updater `764ba51`. Trạng thái đã cài/nghiệm thu chỉ ghi tại [LIVE-PROGRESS.md](LIVE-PROGRESS.md); bảng dưới mô tả source. [Báo cáo tiếp nhận](CODEX-RESUME-AUDIT-2026-10-27.md) có hash hai LAB và kế hoạch đồng bộ.

## Control plane và original Panel

| Module | Vị trí và contract |
|---|---|
| Shared authority | `reference/cluster-authority/worker.mjs`: Worker + SQLite DO binding `MHC_AUTHORITY`; API `/v1/clusters/:uuid/{status,heartbeat,history,invite,join,begin,abort,route,route-resume,complete}`. Status/history GET, các thao tác khác POST; panel/agent credentials tách vai; mutation dùng revision/request id/journal. |
| Authority state | DO key `state`: revision/epoch, membership động, heartbeat, history, invitation, pending/receipt/audit, declaredPrimary LAB và panelRecovery. Static membership từ private Worker config. Không có writer lease thực. |
| DNS adapter | `reference/cluster-authority/p3-route.mjs`: exact zone/record/Tunnel allowlist, site trước Panel, GET/PATCH/GET verify, replay/conflict checks. |
| Panel recovery | `reference/cluster-authority/p3-recovery.mjs`: lựa standby có heartbeat/telemetry/Panel/Tunnel tốt; `worker.mjs` scheduled → DO maintenance/journal; `wrangler.toml` cron mỗi phút, opt-in mới mutation. |
| P3.3 Manual managed writer | reference/cluster-authority/p33-manual.mjs: signed fence tất cả node, scoped90s lease/Agent renew, durable activation/DNS/public-proof/commit, independent Control. Opt-in; runtime acceptance ở LIVE-PROGRESS. |
| P3.2 read-only route | `reference/cluster-authority/p32-lab.mjs`: journal/revision/audit riêng trong cùng DO, exact hai hostname LAB, signed P3.1 readiness và proof origin qua Access; p32-route/resume/confirm/rollback, Panel-only recovery, không sửa Primary/epoch/lease. `scripts/p32-cloudflare.mjs` chỉ GET audit và xuất plan, không mutate account. |
| Node authority client | `bin/cluster-authority.mjs`: private enrollment/config, HTTPS reply checks/512KiB cap, status/history/invite/join, shared begin/abort/P3 route, heartbeat watcher/runit Agent. Không fallback sang local Primary khi authority lỗi. |
| Telemetry | `bin/node-monitor.mjs`: RAM/storage/battery/temperature/Wi-Fi RSSI/network rates/Node RSS/12 services/snapshot metadata; bounded, không CPU/SSID/IP/process args. Snapshot `verified:false` cho tới khi có bằng chứng độc lập. |
| Panel server | `bin/legacy-panel-src/src/server.mjs`: original 9090, session/cookie/CSRF/Origin, local password, remote Access SSO. `/api/mhc/cluster`, `/api/mhc/primary-selection`, `/api/mhc/monitor/history` và invite dùng bridge chung. |
| Origin JWT | `bin/legacy-panel-src/src/mhc-remote-access.mjs`: RS256/JWKS/issuer/AUD/time, typ optional, hostname guard và private reason codes; JWT-bound remote session, local recovery password. |
| Panel bridge/UI | `bin/legacy-panel-src/src/mhc-integration.mjs`: local collector, shared status/history/pairing/actions. `public/app.js`, `style.css`, `index.html`: Cluster candidate/P3 LAB/recovery, Monitor nhiều node, 12h history/15s refresh. |

## Cài đặt, boot và state trên node

- `install.sh`: clean install và source-only `--upgrade` có guard/rollback; upgrade chạy full self-test rồi thay toàn bộ managed bin/launcher, không tự cập nhật live Panel.
- `bin/legacy-panel.sh`: original Panel plan/apply/rollback, source từ managed `bin/legacy-panel-src`; giữ `data/admin.json`. Live và managed phải đồng bộ, đặc biệt JWT module.
- `scripts/update-existing-android-node.sh`: entry của package thống nhất `update.sh`; `scripts/build-node-upgrade.mjs` lấy Git blobs ở commit cố định để tạo payload + manifest SHA-256. `bin/source-upgrade.mjs` thực hiện plan/apply/verify/rollback, toàn bộ managed bin/launcher + 7 live Panel assets + canonical Boot; kiểm hash/cú pháp trước mutation, private backup/journal, restart và health cả Panel/Agent. Thay updater 13 file thiếu JWT/bridge/index/helpers đã chỉ ra trong audit.
- N1 fresh installer: `bin/new-node-install.mjs` có preflight phần cứng/fresh/SQL, progress+private receipts và stage resume. `scripts/build-new-node-release.mjs` dựng bootstrap có embedded manifest SHA-256 từ Git blobs một commit, không lấy private data trên phone. `tests/new-node-install.mjs` kiểm journal/identity/guards trong fixture; trạng thái thật xem LIVE-PROGRESS.
- `scripts/bootstrap-new-android-node.sh`: thân bootstrap cần release constants do builder ghim, fresh-only aarch64 Termux; không dùng cho hai LAB đã cài. `scripts/apply-*`: các patch lịch sử có pin riêng, không chồng lên nhau để thay một release đầy đủ.
- `bin/node-doctor.sh`, `bin/node-boot.sh`, `bin/node-boot-entry.sh`: diagnostics, management repair/wake-lock/boot; canonical `10-mhc-start` một entry, package retire legacy đúng hash. Doctor không báo PASS khi essential service lỗi; boot --status trả trước mọi mkdir/chmod. Boot không gọi standalone sshd.
- `bin/mhc-full-wrapper`: dispatcher `~/mhc-full`; `bin/panel-tunnel-service.sh`, `prepare-panel-tunnel-token.sh`: connector Panel riêng với private token-file và log rotation.
- Managed source: `~/.local/share/mhc-full-installer/bin`; live Panel `~/android-hosting-panel`; private state `~/.config/mhc-full-installer/{installed,node-identity.json,authority.json,authority-enrollment.json}`. Chỉ ghi đường dẫn trong docs; không đọc/copy credentials để kiểm kê.
- Panel config/admin tại `~/android-hosting-panel/data`; hosting site registry tại `~/.config/mhc-full-installer/{sites,static}`; managed WordPress nginx/PHP tại `~/.local/share/mhc-full-installer/hosting`; snapshots `~/hosting-backups/mhc-full/snapshot-*`. Không copy identity/config giữa nodes.

## Hosting và legacy LAB

- P3.1: `bin/p31-node.mjs` là isolated read-only candidate supervisor/proof endpoint qua forced-command SSH; `p31-control.mjs` là peer allowlist + pinned-key verifier dùng từ original Panel, `p31-configure.mjs` tạo dedicated keys và service Standby. `scripts/p31-prepare-lab.sh` dựng dataset riêng, không restore credentials của node khác. `tests/p31-candidate.mjs` kiểm fault/idempotence/proof và POSIX child processes. Contract/cứu hộ/P3.2 ở [P3-INTERNAL-CANDIDATE.md](P3-INTERNAL-CANDIDATE.md); không có writer lease hoặc public cutover trong P3.1.

- `bin/wordpress.sh`, `site-serve.sh`, `sites.sh`, `daily-backup.sh`, `backup-verify.sh`, `restore.sh`: site/HTTP/PHP/DB/backup/restore; cần kiểm dữ liệu thật tại LAB riêng.
- `bin/manual-primary.mjs`, `auto-primary.mjs`, `node-role-guard.mjs`: local legacy selection/recommendation/demotion; không thay shared authority. Guard không chứng minh fencing mọi writer và không tự bật candidate.
- `bin/node-enroll.*`, `member-telemetry.mjs`, `cluster-summary.mjs`, `node-clone.mjs`, `node-readiness.mjs`, `node-standby.mjs`: inventory/clone/readiness LAB.
- `bin/gtid-*`, `replication-observer.mjs`, `file-*`, `lab-acceptance-gate.mjs`, `physical-lab-attest.mjs`, `field-lab-coordinator.mjs`: nhánh LAB/replication nâng cao, không chặn MVP backup/restore thủ công.
- `vendor/`: baseline Panel/DR/cluster dependencies được giữ để installer và fixture resolve module; `reference/cloudflare-lab-witness/` là reference cũ, không mặc định là witness đang deploy.

## Tests và bàn giao

Có 49 runner Node `.mjs` và 6 Shell `.sh` tại tests root; số file không phải số assertion hay kết quả PASS. Self-test đã thêm p3-panel-recovery, access-sso-panel, manual-candidate-ui và source-upgrade. Kết quả cụ thể xem LIVE-PROGRESS.

- M2: `tests/cluster-authority.mjs`, `authority-panel.mjs`, `authority-http-panels.mjs`, `cluster-pairing.mjs`, `monitor-all-nodes.mjs`, `remote-panel.mjs`, `access-sso-panel.mjs`.
- P3: `tests/p3-route.mjs`, `p3-panel-recovery.mjs`, `manual-candidate-ui.mjs`; DNS/DO/JWT fixtures không chứng minh live cutover.
- P3.3 runtime: bin/p33-node.mjs quản lý scoped WordPress/HTTP gate/SQL quiesce và quarantine, bin/p33-control.mjs phối hợp pinned peer + durable phases/public signatures; scripts/p33-prepare-lab.sh fresh isolated dataset/restore probe, tools/p33-live-panel.mjs kiểm auth và HTTP WordPress write canary. Contract P33-MANUAL-PRIMARY.md.
- Recovery drill: tools/p32-recovery-drill.mjs chỉ XZ3, gate authority trước dừng Agent/Tunnel, private journal và timer rescue best-effort; giữ Panel/SSH/website, không test full Android power loss.
- Live LAB CLI: `tools/p32-live-panel.mjs` kiểm origin/Host/JWT/API denial bằng `origin-check` không cần password, hoặc thao tác read-only route/status qua session localhost+CSRF hiện có. Chỉ hai Android allowlist, từ chối production footprint; không thay public Access confirmation bằng SSH.
- P3.2: `tests/p32-lab.mjs` dùng Ed25519 thật và HTTP/DO/DNS fixtures; `tests/p32-cloudflare.mjs` kiểm GET-only/redaction/ingress plan. Panel `/api/mhc/p32-route` giữ auth/CSRF; `/api/mhc/p32-origin-proof` ký request context của chính origin, không lấy từ body SSH. Access config cho phép thêm exact LAB app/AUD bằng `remote-panel add-lab`, giữ primary app; session gắn JWT+Host. Runbook [P32-CLOUDFLARE-LAB.md](P32-CLOUDFLARE-LAB.md).
- Windows SSO fixture dùng file URL cho --import và emulation POSIX mode đúng một fake config, vẫn test unsafe mode bị chặn. POSIX HTTP fixture cần TMPDIR ngoài source/Git và đủ ngắn cho Unix sockets. Candidate UI assertion đã theo declaredPrimary LAB nhưng giữ no-writer/fencing checks.
- `tests/source-upgrade.mjs`: acquisition/hash/missing/syntax/partial-write/Panel/Agent failures, rollback file/process, idempotence, allowlist/production/symlink guards, live/managed và protected data. [NODE-SOURCE-UPGRADE.md](NODE-SOURCE-UPGRADE.md) là runbook package, không phải nguồn status thứ hai.
- `docs/HANDOFF-*`, `PROJECT-STATUS-2026-10-26.md`: hồ sơ lịch sử; `CONTINUE-MHC.md`: kết nối/recovery. Code clock-health riêng ở workspace cha chưa nhập Git, phải đối chiếu trước khi gộp.

N1 onboarding: bin/join-input.mjs đọc mã ẩn/--stdin có timeout/bounds; bin/node-onboarding.mjs chỉ xuất allowlisted observations, không cấp eligibility. Node Monitor + Worker sanitize báo cáo này cho original Cluster UI; /api/mhc/onboarding yêu cầu session. Source upgrader nhận --node-id cho N1 đã cài/đã ghép, kiểm membership thật; chỉ management-only không có managed site được nâng khi node khác giữ lease. tests/new-node-onboarding.mjs và tests/new-node-install.mjs nằm trong self-test.

Control-only N1: bin/control-node.mjs ký management/public-origin proof không đụng DB; control-peer.mjs tái sử dụng forced-command SSH qua public pins N-node; control-configure.mjs prepare/configure có UUID/confirmation/membership/backup. reference/cluster-authority/control-nodes.mjs chỉ mở rộng Panel route. Site participants giữ cơ chế fence P33 riêng; tests/control-node.mjs và p33-manual.mjs kiểm ranh giới.

N1 self-service: reference/cluster-authority/n1-onboarding.mjs giữ approval từ invite, journal cấp Tunnel riêng, CF API allowlist, registry Control durable và signed proof relay trong cùng DO. bin/n1-self-service.mjs nối Agent với cơ chế này, chỉ cấu hình Tunnel token/origin Access/control-self-service trên node N1; không DNS/site/writer. tools/configure-cloudflare-n1.ps1/.mjs nhập token ẩn một lần vào Worker Secret; tests/n1-self-service.mjs kiểm lost-reply/retry/auth/signature/Control. Runtime và blocker chỉ ở LIVE-PROGRESS.

### N1.3 — chuẩn bị site Standby

- `reference/cluster-authority/site-standby.mjs`: job/backup chunk relay có role/key pin; site approval và sáu mức readiness, không đổi DNS/lease khi chuẩn bị.
- `bin/site-standby.mjs`: Agent/Panel bridge, checksum/retry/journal, backup/restore vào đích trống và kiểm runtime; `site-standby-data.php` chỉ chuyển bảng nội dung LAB, tạo credentials riêng; `site-standby-archive.py` kiểm toàn bộ archive trước ghi.
- Original Panel `/api/mhc/standby`: session + CSRF + mutation queue; UI Cluster/chọn node. Manual P33 dùng cùng relay để liên lạc N-node qua Internet, không SSH peer LAN.
- Tests: `tests/site-standby.mjs`, `tests/site-standby-archive.py`, `tests/site-job-retry.mjs`, bổ sung UI và regression P33/N1. Independent site health chỉ dời deadline sau verify/restore, không theo Manual polling; runtime/test thực ở LIVE-PROGRESS.

P33 receiver clock: bin/p33-control.mjs chỉ sau signature/nonce/context hợp lệ mới chờ tối đa2giây rồi kiểm lại strict future2s/TTL15s; không sửa timestamps/lease/Authority checks. tests/p33-peer-clock.mjs kiểm boundary/expiry/large skew/time-jump; đã thêm self-test.

P4.0 source: reference/cluster-authority/site-sync.mjs giữ một policy/run/CAS và lịch interval/daily UTC+7 trong cùng DO; site-standby.mjs dùng sync-backup/sync-apply trên relay hiện có. bin/site-sync.mjs thực hiện target staging/journal/checksum/local rollback và cache bounded, p33-node dataset từ chối maintenance. Original Panel Cluster dùng endpoint standby hiện có/session+CSRF. tests/site-sync.mjs và site-sync-node.mjs nằm trong self-test; runtime/test thực chỉ ở LIVE-PROGRESS.

### P4 SQL admission gate (source checkpoint 29/10)

- bin/p4-fence.mjs: private SQL trigger definitions/inspection, root keeper pipe, authoritative lease→boot-time deadline; bin/p4-fence-install.mjs: authenticated Standby job/private backup/resume. p33-node consumes gate only when installed, legacy Manual unchanged otherwise. site-standby dispatches installation and returns signed fence evidence; Worker blocks incomplete maintenance.
- tests/p4-fence.mjs: time/pipe/template fixtures. tests/p4-fence-sql.php: opt-in separate synthetic MariaDB fixture only, no managed-site setup or credentials in source. tests/source-upgrade.mjs: signed FENCED Standby may source-upgrade beside another writer; active writer denied. Runtime/tests/DoD only in LIVE-PROGRESS.

- tests/p4-fence-cli.mjs: opt-in native Termux fixture mhc_p4_probe_<8hex> only; reproduces CLI1064, checks source delimiter helper and exact trigger hash, never managed schema.
