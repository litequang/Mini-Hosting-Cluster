# MHC: trạng thái và bối cảnh đầy đủ (26/10/2026)

> Cập nhật đóng gói 26/10: đây là hồ sơ bối cảnh trước đó, không phải kết quả kết nối mới. Runtime REMOTE-PANEL được giữ nguyên. PREFLIGHT mới hơn theo thời gian lưu nhưng thiếu 6 tệp có trong baseline và thay đổi 15 tệp khác; không áp tự động. Manual hiện chỉ ghi record, DNS verify là API-level, guard không tự bật candidate. Đọc `HANDOFF-*` và prompt hiện hành trước khi thực thi. Không chạy lại test ứng dụng/SSH/Cloudflare trong lượt tổng hợp này.

## Mục tiêu người dùng
- Tận dụng Android/Termux làm cụm máy chủ web/WordPress/Thờ Phượng Pro, nhiều node, backup/restore, truy cập Internet qua Cloudflare.
- Panel quản trị **phải có trên tất cả các node**; từ mạng ngoài, truy cập Panel có thể chủ động chỉ định node Primary.
- Khi node Primary offline, hệ thống bầu node khỏe nhất và có **bản dữ liệu sẵn có được ghi nhận mới nhất**, không yêu cầu checksum/GTID các node bằng nhau.
- Primary cũ trở lại chỉ được nhận **Standby/Quarantine**, không tranh quyền hoặc tự phục vụ lại.
- User sẵn sàng backup/restore thủ công; có thể chấp nhận mất phần dữ liệu chưa được backup, nhưng phải được thông báo.
- Người dùng chỉ làm các phần Cloudflare Codex không thể thao tác. **Codex được giao truy cập và test trực tiếp Vsmart**, không yêu cầu người dùng lặp lại những thử nghiệm Codex có thể tự làm.
- Khi hệ thống mới hoạt động đạt, **di chuyển hai web/node cũ M51 + X7b về cùng codebase MHC** theo một kế hoạch riêng, giữ rollback.

## Mốc thực tế
- v0.2 online monitor: có nền mã; nghiệm thu Internet chưa đầy đủ.
- v0.3 hosting/enrollment/clone: có mã, Vsmart từng chạy Nginx/PHP-FPM/MariaDB và static demo qua Termux.
- v0.4 GTID/file delta: nhiều module LAB và bộ mô phỏng, **chưa nghiệm thu replication thật giữa hai Android**; không bắt buộc để bắt đầu manual/auto chọn Primary có backup thủ công.
- v0.5: manual-primary / auto-primary / node-role-guard / route-recovery LAB; remote-panel bảo vệ JWT có mã; **chưa có multi-Panel distributed authority, hai node Android thật, route thật, all-path fencing**.
- v0.6 automatic failover production: **NOT READY**.
- v0.7 node scoring, replica placement, đánh giá sức khỏe: phần roadmap, chưa sản xuất.
- v1.0 migrate production: **chưa**.

## Nguồn mới nhất
Checkpoint ZIP `MHC-Full-Installer-TEST-0.5.0C-REMOTE-PANEL.zip`, 406 mục, có `install.sh`, `bin/`, `tests/`, `docs/`, `vendor/`, `reference/`, `CHANGELOG-*`. Kiểm CRC OK. Đây là baseline của cuộc bàn giao, không khẳng định mới hơn worktree tại công ty.

### Thành phần đang có trong source
- `bin/manual-primary.mjs`: local-only controller registry và lựa chọn bởi quản trị viên; **chỉ ghi nhận**, không tự đổi route/stop writer/verify website. Code ràng buộc `cluster.controllerNodeId===self.nodeId`.
- `bin/auto-primary.mjs`: chọn ứng viên từ heartbeat/backupStamp, Cloudflare DNS adapter, journal phục hồi, RECOMMEND_ONLY mặc định, best-effort opt-in.
- `bin/node-role-guard.mjs`: `sv down` dịch vụ được ARM trên LAB nếu local node không còn vai trò; chưa là fencing đầy đủ.
- `bin/remote-panel.mjs`, `bin/legacy-panel-src/src/mhc-remote-access.mjs`: host configuration/JWT Cloudflare Access ở Panel.
- `bin/legacy-panel-src/`: bản sửa **Panel nguyên gốc 9090**; API authenticated cho cluster/modules/monitor/primary/auto/status.
- `bin/node-enroll.*`, `bin/node-clone.mjs`, `bin/member-telemetry.mjs`: enrollment/telemetry/clone LAB.
- `bin/replication-observer.mjs`, `bin/gtid-*.mjs`, `bin/file-*`: replication/seed/delta, phần lớn LAB/offline.
- `bin/wordpress.sh`, `bin/site-serve.sh`, `bin/daily-backup.sh`, `bin/backup-restore.sh`, `bin/sites.sh`: hosting/backup phục vụ triển khai.
- `bin/legacy-panel.sh`: nâng cấp source Panel có preflight/rollback; không sửa password/data admin.

### Vấn đề hiện có cần Codex sửa
1. Nút lựa chọn Primary từ Panel node khác không thể điều phối vì `manual-primary.mjs` chỉ cho controller bản địa; trạng thái mỗi node có thể khác nhau.
2. Panel 9090 đã sửa trên mã nguồn nhưng chưa chắc mọi node có **một phiên bản** Panel; cần đóng gói/cài trên Vsmart mới, sau này M51/X7b.
3. Controller đơn lẻ chạy trên Primary mất điện thì Auto Primary dừng, trái mục tiêu. Authority phải tách khỏi node đang phục vụ, node agents/watchers trên tất cả node.
4. Auto Primary lựa snapshot `backupStamp` có thể chỉ là thông tin khai báo (không chứng minh đủ, không chứng minh data mới nhất). Phải phân biệt measured/verified/claimed.
5. Cloudflare route adapter có journal nhưng chưa kiểm chứng thay CNAME thật; có thể dùng tunnel riêng, worker/router hay LB tùy giới hạn/chi phí tài khoản.
6. `node-role-guard.mjs` LAB mới dừng một số dịch vụ bằng `sv down`, không ngăn DB privileged writers, direct IP, cron, root shell, và không có quyền fence độc lập.
7. Remote Access JWT chỉ test giả lập; chưa Cloudflare thực và chưa proof routing.
8. Chưa có nghiệm thu WordPress end-to-end và chưa kiểm chứng việc quản lý nhiều web/DB thật trên Vsmart mới.

## Máy móc/địa chỉ đã biết (có thể thay đổi)
- **Vsmart LAB:** LAN IP gần nhất `192.168.100.27`, SSH Termux port 8022, user `u0_a180`; source-only upgrade từng được test, site `demo` và original Panel 9090, chưa phải máy sạch.
- **M51 legacy:** `192.168.1.43`, Termux user `u0_a288`; đang phục vụ production/legacy. KHÔNG CHẠM.
- **X7b legacy:** `192.168.1.35`, Termux user `u0_a210`; standby/legacy. KHÔNG CHẠM.
- Windows project workspace: `E:\CODE\MHC`.
- Cloudflare domain: `thophuong.com`; ví dụ hostname chung `panel.thophuong.com` hoặc `admin.thophuong.com`; dùng tên thực sau khi user chọn/cấu hình.

## Data policy
- Chuyển Primary không đòi cùng data; hiển thị thời điểm backup đã **xác minh được** cùng mức độ rủi ro RPO.
- Nếu máy A offline mà vẫn ghi dữ liệu (partition), chuyển B có thể split-brain. PHẢI có ngăn hai write routes / fencing thực cho chế độ production; không khẳng định heartbeat mất = máy chết.
- Khi A trở lại: không restore ngược/merge dữ liệu tự động, quarantine và so sánh, admin duyệt phục hồi.
- Production migration: backup M51/X7b, dry-run restore vào Vsmart/test, checksum/smoke test, freeze writes tại thời điểm chuyển, change route, postcheck, rollback nếu chưa có ghi mới hoặc có kế hoạch dữ liệu rõ.
