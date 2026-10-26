# CODEMAP — MHC checkpoint 0.5C-REMOTE-PANEL

## M1/M2 đang triển khai 26/10/2026
- `reference/cluster-authority/`: Worker/DO cho shared membership + pending preparation, chưa cấp writer/route.
- `bin/cluster-authority.mjs`: client private config, heartbeat/watch/runit agent, shared Panel request.
- `reference/cluster-authority/prepare-secrets.mjs`: gom enrollment private cho Wrangler, không xuất token.
- `bin/prepare-panel-tunnel-token.sh`: nhập Tunnel token ẩn trên TTY Termux LAB.
- `bin/panel-tunnel-service.sh`: connector runit riêng cho Panel giaouoc LAB, token-file và rotating logs, không thay named-tunnel.
- `tests/authority-http-panels.mjs`: hai Panel HTTP process + HTTPS client, DO storage fixture, chạy POSIX/Termux.
- `docs/SHARED-AUTHORITY-M2.md`: API, auth, cấu hình LAB và phần chưa hoàn thành.
- `docs/LIVE-PROGRESS.md`: nguồn trạng thái thực thi duy nhất, checkpoint và bằng chứng.
- `docs/CLUSTER-UI-HEARTBEAT-REMOTE-ACCESS-2026-10-26.md`: cập nhật 2 Android đã kết nối M2 theo bằng chứng người dùng; bản sửa heartbeat Cluster (commit `f0c94a4`), hướng dẫn deploy UI và kiểm tra HTTP 403 khi Cloudflare Access tới Panel.
- `docs/CONTINUE-MHC.md`: kết nối/phục hồi sau gián đoạn, GitHub branch.
- `tests/cluster-authority.mjs`, `tests/authority-panel.mjs`, `tests/guard-management.mjs`, `tests/service-environment.sh`: các regression mới.

- `install.sh`: Termux fresh install/upgrade guard, marker và rollback code.
- `bin/mhc-full-wrapper`: CLI dispatcher `~/mhc-full`; lệnh `primary-select`, `auto-primary`, `remote-panel`, `node-guard`, `hosting-panel`, `clone`, `node`, `file-sync`, `replication`, `sites`, `serve`, `backup`, `restore`.
- `bin/legacy-panel.sh`: bridge sửa **original Panel 9090**, plan/apply/rollback; phải bảo vệ `~/android-hosting-panel/data/admin.json`.
- `bin/legacy-panel-src/src/server.mjs`: HTTP routes/cookie admin/CSRF/Access guard của Panel 9090.
- `bin/legacy-panel-src/src/mhc-integration.mjs`: các API MHC liên kết vào Panel gốc, chỉ lộ trạng thái allowlisted.
- `bin/legacy-panel-src/src/mhc-remote-access.mjs`: JWT Cloudflare Access RS256/JWKS và hostname; private-only rate-limited `MHC_REMOTE_ACCESS_DENIED` reason code for 403 (no JWT/cookie/claims in logs). `scripts/apply-remote-access-diagnostics.sh` patches only this origin module with backup and HTTP rollback.
- `bin/legacy-panel-src/public/index.html`, `public/app.js`: UI nguyên gốc bổ sung Monitor/Cluster/Primary.
- `bin/manual-primary.mjs`: local controller/manual selection ghi nhận, chưa HA authority.
- `bin/auto-primary.mjs`: recommendation, scoring sơ bộ, Cloudflare DNS adapter, route journal, rejoin metadata.
- `bin/node-role-guard.mjs`: demote LAB via `sv down`, chưa bảo vệ mọi writer.
- `bin/node-enroll.*`, `bin/member-telemetry.mjs`, `bin/cluster-summary.mjs`: tham gia cluster, telemetry, overview.
- `bin/node-clone.mjs`, `bin/node-readiness.mjs`, `bin/node-standby.mjs`: clone snapshot, readiness và standby LAB.
- `bin/wordpress.sh`, `bin/site-serve.sh`, `bin/sites.sh`, `bin/daily-backup.sh`, `bin/backup-verify.sh`, `bin/restore.sh`: hosting, backup/restore.
- `bin/gtid-*.mjs`, `bin/replication-observer.mjs`: GTID LAB.
- `bin/file-*.mjs`, `bin/lab-acceptance-gate.mjs`, `bin/physical-lab-attest.mjs`, `bin/field-lab-coordinator.mjs`: delta/checkpoint/acceptance LAB.
- `reference/cloudflare-lab-witness/`: witness Cloudflare LAB, chưa triển khai account.
- `tests/`: 38 runner test Node (.mjs) + 3 test Shell, `bin/self-test.sh` chạy hồi quy tổng hợp.
- `vendor/`, `reference/`: lịch sử và module reference; không xóa vội trước khi đối chiếu package paths.

**Codex phải làm CODEMAP sâu hơn khi audit repo thật**, thêm vị trí registry, node config, data schema, API contract, test coverage. Đừng suy đoán từ tên file; đọc mã.

## Bổ sung tiếp quản hợp nhất 26/10/2026
- `docs/HANDOFF-PACKAGE-SELECTION.md`: provenance, baseline và nhánh PREFLIGHT.
- `docs/HANDOFF-SOURCE-AUDIT-2026-10-26.md`: state paths, giới hạn manual/auto/guard và thứ tự sửa.
- `docs/HANDOFF-ENVIRONMENT.md`: kết nối/thiết bị được ghi nhận và đầu vào chưa có.
- `docs/HANDOFF-ACCEPTANCE.md`: checklist PASS/FAIL/NOT RUN cho executor tiếp theo.

Đếm test từ tệp thực tế trong checkpoint; không hiểu số runner là số assertion hay bằng chứng Android.
