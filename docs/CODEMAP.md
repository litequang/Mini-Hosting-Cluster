# CODEMAP — MHC

Đối chiếu source ngày 27/10/2026 trên branch `codex/m1-m2-foundation`, HEAD kiểm kê `da7d67a`; runtime snapshot `f73df61`, updater `764ba51`. Trạng thái đã cài/nghiệm thu chỉ ghi tại [LIVE-PROGRESS.md](LIVE-PROGRESS.md); bảng dưới mô tả source. [Báo cáo tiếp nhận](CODEX-RESUME-AUDIT-2026-10-27.md) có hash hai LAB và kế hoạch đồng bộ.

## Control plane và original Panel

| Module | Vị trí và contract |
|---|---|
| Shared authority | `reference/cluster-authority/worker.mjs`: Worker + SQLite DO binding `MHC_AUTHORITY`; API `/v1/clusters/:uuid/{status,heartbeat,history,invite,join,begin,abort,route,route-resume,complete}`. Status/history GET, các thao tác khác POST; panel/agent credentials tách vai; mutation dùng revision/request id/journal. |
| Authority state | DO key `state`: revision/epoch, membership động, heartbeat, history, invitation, pending/receipt/audit, declaredPrimary LAB và panelRecovery. Static membership từ private Worker config. Không có writer lease thực. |
| DNS adapter | `reference/cluster-authority/p3-route.mjs`: exact zone/record/Tunnel allowlist, site trước Panel, GET/PATCH/GET verify, replay/conflict checks. |
| Panel recovery | `reference/cluster-authority/p3-recovery.mjs`: lựa standby có heartbeat/telemetry/Panel/Tunnel tốt; `worker.mjs` scheduled → DO maintenance/journal; `wrangler.toml` cron mỗi phút, opt-in mới mutation. |
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
- `scripts/bootstrap-new-android-node.sh`: fresh-only aarch64 Termux; không dùng cho hai LAB đã cài. `scripts/apply-*`: các patch lịch sử có pin riêng, không chồng lên nhau để thay một release đầy đủ.
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
- Recovery drill: tools/p32-recovery-drill.mjs chỉ XZ3, gate authority trước dừng Agent/Tunnel, private journal và timer rescue best-effort; giữ Panel/SSH/website, không test full Android power loss.
- Live LAB CLI: `tools/p32-live-panel.mjs` kiểm origin/Host/JWT/API denial bằng `origin-check` không cần password, hoặc thao tác read-only route/status qua session localhost+CSRF hiện có. Chỉ hai Android allowlist, từ chối production footprint; không thay public Access confirmation bằng SSH.
- P3.2: `tests/p32-lab.mjs` dùng Ed25519 thật và HTTP/DO/DNS fixtures; `tests/p32-cloudflare.mjs` kiểm GET-only/redaction/ingress plan. Panel `/api/mhc/p32-route` giữ auth/CSRF; `/api/mhc/p32-origin-proof` ký request context của chính origin, không lấy từ body SSH. Access config cho phép thêm exact LAB app/AUD bằng `remote-panel add-lab`, giữ primary app; session gắn JWT+Host. Runbook [P32-CLOUDFLARE-LAB.md](P32-CLOUDFLARE-LAB.md).
- Windows SSO fixture dùng file URL cho --import và emulation POSIX mode đúng một fake config, vẫn test unsafe mode bị chặn. POSIX HTTP fixture cần TMPDIR ngoài source/Git và đủ ngắn cho Unix sockets. Candidate UI assertion đã theo declaredPrimary LAB nhưng giữ no-writer/fencing checks.
- `tests/source-upgrade.mjs`: acquisition/hash/missing/syntax/partial-write/Panel/Agent failures, rollback file/process, idempotence, allowlist/production/symlink guards, live/managed và protected data. [NODE-SOURCE-UPGRADE.md](NODE-SOURCE-UPGRADE.md) là runbook package, không phải nguồn status thứ hai.
- `docs/HANDOFF-*`, `PROJECT-STATUS-2026-10-26.md`: hồ sơ lịch sử; `CONTINUE-MHC.md`: kết nối/recovery. Code clock-health riêng ở workspace cha chưa nhập Git, phải đối chiếu trước khi gộp.
