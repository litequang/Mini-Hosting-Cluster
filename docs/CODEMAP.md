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
- `bin/legacy-panel-src/src/mhc-remote-access.mjs`: JWT Cloudflare Access RS256/JWKS và hostname; private-only rate-limited `MHC_REMOTE_ACCESS_DENIED` reason code for 403, including granular JOSE header failures; RFC-optional `typ` is accepted only with RS256/kid/signature/issuer/AUD/time checks (no JWT/cookie/claims in logs). `scripts/apply-remote-access-diagnostics.sh` patches only this origin module with backup and HTTP rollback.
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

## M2 SSO 26/10/2026 — đã cập nhật nguồn, chưa nghiệm thu Android
- `bin/legacy-panel-src/src/server.mjs`: `GET /api/session` tạo session từ JWT Access đã được xác minh, cookie Secure/HttpOnly/SameSite, session bound JWT hash. `POST /api/login` chỉ localhost, CSRF giữ nguyên.
- `bin/legacy-panel-src/public/app.js`: tự đăng nhập remote từ Access, logout qua `/cdn-cgi/access/logout`, local login form vẫn tồn tại.
- `bin/legacy-panel-src/src/mhc-remote-access.mjs`: bắt buộc chữ ký RS256/JWKS, issuer, AUD, hạn; notice phù hợp Access-only remote.
- `tests/access-sso-panel.mjs`: kiểm thử HTTP process và signed-JWT/JWKS mock, chỉ mới kiểm cú pháp, **chưa chạy**.
- `scripts/apply-panel-access-sso.sh`: rollout có backup/rollback và HTTP localhost check trên Vsmart LAB, chưa chạy trên Android.
- `docs/PANEL-ACCESS-SSO-PRIMARY-ROUTING-2026-10-26.md`: kiến trúc một hostname Panel đi theo Primary; M3/M4 writer/route chuyển thực **chưa triển khai**.

## M3 26/10 — UI chọn node ứng viên, chưa cutover
- `bin/legacy-panel-src/public/app.js` `mhcClusterPage()` trình bày dropdown và trạng thái shared Pending trên trang mặc định. `dynamicAction('primary-begin')` lấy shared status mới trước khi ghi CAS; `primary-abort` hủy pending.
- `scripts/apply-primary-candidate-ui.sh` sao lưu / xác minh Git blob SHA, triển khai riêng `public/app.js` trên Vsmart/XZ3 LAB. Không restart, không sửa backend DB/Cloudflare.
- `tests/manual-candidate-ui.mjs` xác nhận cấu trúc UI/authority fail closed (chưa thực chạy).
- `reference/cluster-authority/worker.mjs` vẫn chỉ `begin/abort` PREPARE_ONLY, không writer grant / declaredPrimary. M3 executor, route và guard thật còn thiếu.

## Monitor V2 toàn cụm (26/10/2026; source pushed, runtime NOT RUN)
- `bin/node-monitor.mjs`: thu thập giới hạn CPU/RAM/pin/nhiệt độ pin/storage mạng + 9 trạng thái runit, không gửi địa chỉ IP/SSID/log/process args.
- `bin/cluster-authority.mjs`: heartbeat mở rộng với telemetry allowlisted; panel token truy vấn `history` (512 KiB max response, GET), agent token không có quyền.
- `reference/cluster-authority/worker.mjs`: mô hình DO cũ vẫn `SHARED_AUTHORITY_PREPARE_ONLY`; lưu telemetry mới nhất và lịch sử 12h x 5 phút per-node; chỉ panel mới được xem history.
- `bin/legacy-panel-src/src/mhc-integration.mjs`: collector node chạy local và bridge history Cloudflare; có fallback khi chưa cài collector.
- `bin/legacy-panel-src/src/server.mjs`: API bảo vệ `/api/mhc/monitor/history?nodeId`; giữ Access/session/CSRF hiện hành.
- `bin/legacy-panel-src/public/app.js`: Monitor toàn cụm trong Panel gốc, CPU/RAM/pin/nhệt độ/storage/network/services, cảnh báo, đồ thị và khoảng thiếu báo cáo (không coi là proof offline).
- `scripts/apply-monitor-all-nodes.sh`: opt-in LAB installer SHA pin + backup/rollback, không triển khai Cloudflare Worker. `tests/monitor-all-nodes.mjs`: tests node/Worker từ dữ liệu giả (NOT RUN trong phiên ChatGPT).
- `docs/MONITOR-V2-ALL-NODES.md`: source map, hướng dẫn triển khai hai điện thoại và Worker cùng binding, checklist.

## 26/10 — fix monitor installer and legacy parity
- `scripts/apply-monitor-all-nodes.sh`: no longer mistakes server.mjs for JWT verifier; checks local `src/mhc-remote-access.mjs` RS256 guard, pins SHA of CPU-free all-node UI.
- `bin/node-monitor.mjs`: omits CPU, adds wifi RSSI, allowlisted Node.js processes RSS, local snapshot metadata, 12 runit service status values; no SSID/BSSID/process cmd.
- `reference/cluster-authority/worker.mjs`: strips unexpected private fields and persists sanitized metrics; history includes RSSI, not CPU.
- `bin/legacy-panel-src/public/app.js`: no CPU in dashboard, process list or Monitor; node cards include role, DB/Web/Tunnel/Panel/Sync badges, last snapshot; details include Wifi/RSSI/process RAM, verified-unknown handling.
- `docs/MONITOR-V2-PAIRING-DESIGN.md`: one-use 10min pairing target; current shared Cloudflare authority static membership cannot use old inventory-only invite unchanged.
