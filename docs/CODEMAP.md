# CODEMAP — MHC

Đối chiếu source ngày 27/10/2026 trên branch `codex/m1-m2-foundation`, HEAD kiểm kê `da7d67a`; runtime snapshot `f73df61`, updater `764ba51`. Trạng thái đã cài/nghiệm thu chỉ ghi tại [LIVE-PROGRESS.md](LIVE-PROGRESS.md); bảng dưới mô tả source. [Báo cáo tiếp nhận](CODEX-RESUME-AUDIT-2026-10-27.md) có hash hai LAB và kế hoạch đồng bộ.

## Control plane và original Panel

| Module | Vị trí và contract |
|---|---|
| Shared authority | `reference/cluster-authority/worker.mjs`: Worker + SQLite DO binding `MHC_AUTHORITY`; API `/v1/clusters/:uuid/{status,heartbeat,history,invite,join,begin,abort,route,route-resume,complete}`. Status/history GET, các thao tác khác POST; panel/agent credentials tách vai; mutation dùng revision/request id/journal. |
| Authority state | DO key `state`: revision/epoch, membership động, heartbeat, history, invitation, pending/receipt/audit, declaredPrimary LAB và panelRecovery. Static membership từ private Worker config. Không có writer lease thực. |
| DNS adapter | `reference/cluster-authority/p3-route.mjs`: exact zone/record/Tunnel allowlist, site trước Panel, GET/PATCH/GET verify, replay/conflict checks. |
| Panel recovery | `reference/cluster-authority/p3-recovery.mjs`: lựa standby có heartbeat/telemetry/Panel/Tunnel tốt; `worker.mjs` scheduled → DO maintenance/journal; `wrangler.toml` cron mỗi phút, opt-in mới mutation. |
| Node authority client | `bin/cluster-authority.mjs`: private enrollment/config, HTTPS reply checks/512KiB cap, status/history/invite/join, shared begin/abort/P3 route, heartbeat watcher/runit Agent. Không fallback sang local Primary khi authority lỗi. |
| Telemetry | `bin/node-monitor.mjs`: RAM/storage/battery/temperature/Wi-Fi RSSI/network rates/Node RSS/12 services/snapshot metadata; bounded, không CPU/SSID/IP/process args. Snapshot `verified:false` cho tới khi có bằng chứng độc lập. |
| Panel server | `bin/legacy-panel-src/src/server.mjs`: original 9090, session/cookie/CSRF/Origin, local password, remote Access SSO. `/api/mhc/cluster`, `/api/mhc/primary-selection`, `/api/mhc/monitor/history` và invite dùng bridge chung. |
| Origin JWT | `bin/legacy-panel-src/src/mhc-remote-access.mjs`: RS256/JWKS/issuer/AUD/time, typ optional, hostname guard và private reason codes; JWT-bound remote session, local recovery password. |
| Panel bridge/UI | `bin/legacy-panel-src/src/mhc-integration.mjs`: local collector, shared status/history/pairing/actions. `public/app.js`, `style.css`, `index.html`: Cluster candidate/P3 LAB/recovery, Monitor nhiều node, 12h history/15s refresh. |

## Cài đặt, boot và state trên node

- `install.sh`: clean install và source-only `--upgrade` có guard/rollback; upgrade chạy full self-test rồi thay toàn bộ managed bin/launcher, không tự cập nhật live Panel.
- `bin/legacy-panel.sh`: original Panel plan/apply/rollback, source từ managed `bin/legacy-panel-src`; giữ `data/admin.json`. Live và managed phải đồng bộ, đặc biệt JWT module.
- `scripts/update-existing-android-node.sh`: pin 13 file live/managed management, backup/health rollback; **không phải full source upgrade** và không bao gồm JWT module, bridge installer/index/helpers. Audit 27/10 phát hiện thiếu đồng bộ và rollback Agent/boot cần xử lý trước rollout.
- `scripts/bootstrap-new-android-node.sh`: fresh-only aarch64 Termux; không dùng cho hai LAB đã cài. `scripts/apply-*`: các patch lịch sử có pin riêng, không chồng lên nhau để thay một release đầy đủ.
- `bin/node-doctor.sh`, `bin/node-boot.sh`: diagnostics và management repair/wake-lock/boot; chỉ `node-doctor --check` là kiểm kê. `node-boot --status` có mkdir/chmod state trước status branch nên khi cần read-only tuyệt đối hãy đọc metadata/log đã lọc thay vì gọi repair/status helper mù quáng.
- `bin/mhc-full-wrapper`: dispatcher `~/mhc-full`; `bin/panel-tunnel-service.sh`, `prepare-panel-tunnel-token.sh`: connector Panel riêng với private token-file và log rotation.
- Managed source: `~/.local/share/mhc-full-installer/bin`; live Panel `~/android-hosting-panel`; private state `~/.config/mhc-full-installer/{installed,node-identity.json,authority.json,authority-enrollment.json}`. Chỉ ghi đường dẫn trong docs; không đọc/copy credentials để kiểm kê.
- Panel config/admin tại `~/android-hosting-panel/data`; hosting site registry tại `~/.config/mhc-full-installer/{sites,static}`; managed WordPress nginx/PHP tại `~/.local/share/mhc-full-installer/hosting`; snapshots `~/hosting-backups/mhc-full/snapshot-*`. Không copy identity/config giữa nodes.

## Hosting và legacy LAB

- `bin/wordpress.sh`, `site-serve.sh`, `sites.sh`, `daily-backup.sh`, `backup-verify.sh`, `restore.sh`: site/HTTP/PHP/DB/backup/restore; cần kiểm dữ liệu thật tại LAB riêng.
- `bin/manual-primary.mjs`, `auto-primary.mjs`, `node-role-guard.mjs`: local legacy selection/recommendation/demotion; không thay shared authority. Guard không chứng minh fencing mọi writer và không tự bật candidate.
- `bin/node-enroll.*`, `member-telemetry.mjs`, `cluster-summary.mjs`, `node-clone.mjs`, `node-readiness.mjs`, `node-standby.mjs`: inventory/clone/readiness LAB.
- `bin/gtid-*`, `replication-observer.mjs`, `file-*`, `lab-acceptance-gate.mjs`, `physical-lab-attest.mjs`, `field-lab-coordinator.mjs`: nhánh LAB/replication nâng cao, không chặn MVP backup/restore thủ công.
- `vendor/`: baseline Panel/DR/cluster dependencies được giữ để installer và fixture resolve module; `reference/cloudflare-lab-witness/` là reference cũ, không mặc định là witness đang deploy.

## Tests và bàn giao

Có 48 runner Node `.mjs` và 6 Shell `.sh` tại tests root; số file không phải số assertion hay kết quả PASS. `bin/self-test.sh` chạy regression/syntax, nhưng hiện chưa gọi `p3-panel-recovery`, `access-sso-panel`, `manual-candidate-ui`. Kết quả cụ thể xem LIVE-PROGRESS/audit.

- M2: `tests/cluster-authority.mjs`, `authority-panel.mjs`, `authority-http-panels.mjs`, `cluster-pairing.mjs`, `monitor-all-nodes.mjs`, `remote-panel.mjs`, `access-sso-panel.mjs`.
- P3: `tests/p3-route.mjs`, `p3-panel-recovery.mjs`, `manual-candidate-ui.mjs`; DNS/DO/JWT fixtures không chứng minh live cutover.
- Windows SSO fixture cần file URL cho `--import`; POSIX HTTP fixture cần TMPDIR ngoài source/Git. Candidate UI test còn assertion cũ.
- `docs/HANDOFF-*`, `PROJECT-STATUS-2026-10-26.md`: hồ sơ lịch sử; `CONTINUE-MHC.md`: kết nối/recovery. Code clock-health riêng ở workspace cha chưa nhập Git, phải đối chiếu trước khi gộp.
