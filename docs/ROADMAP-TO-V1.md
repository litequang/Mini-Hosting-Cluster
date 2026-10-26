# Roadmap còn lại — rút gọn, không tạo phiên bản TEST liên tục

## P0 — Audit & protect existing workspace (bắt đầu ngay)
- Đọc Git/AGENTS/docs, kiểm checkpoint vs `E:\CODE\MHC` thực tế; backup worktree và Vsmart trước.
- Kiểm installer marker, lỗi compatibility và lệnh ảnh hưởng dữ liệu; chạy test nền. Khắc phục lỗi P0 trực tiếp.
- Kết quả: báo cáo hiện trạng và danh sách thao tác an toàn.

## P1 — Vsmart single-node MHC hosting thật (Codex làm)
- Kết nối SSH có fingerprint ghim trước; inspect site demo và DB/Panel, snapshot full + khả năng restore.
- Tạo/cập nhật server mới trên Vsmart theo chiến lược **không phá dữ liệu** cho tới khi user xác nhận xóa demo nếu thật sự cần clean.
- Nginx/PHP-FPM/MariaDB, static + WordPress LAB, backup/restore ZIP/SQL, boot recovery, Panel 9090, CPU/RAM/pin/nhiệt/lưu trữ, logs đã lọc.
- Nghiệm thu: reboot, website HTTP, query DB, WP actions, Panel login, backup->restore test, tự chạy services, không hỏng SSH.

## P2 — Distributed Panel + Shared Cluster Authority (phần kiến trúc ưu tiên)
- Mỗi node cài Panel 9090 + node agent; node enrollment hoạt động từ Panel trên mọi node, role không lưu divergent local per-controller.
- Thiết kế API/Worker + Durable Object (hoặc một authority chung tương đương) with durable atomic revision/epoch, node membership, health, backups, manual request, election, route intent, audit; auth cho mỗi node và Panel.
- Panel remote via Tunnel/Access JWT + existing admin auth+CSRF; URL panel chung độc lập trạng thái website Primary. Không cần hostname từng node trong MVP.
- User xử lý tạo Access/Tunnel/Worker/domain nếu Codex không có quyền, Codex cung cấp `wrangler` source, hướng dẫn chính xác và test sau user deploy.
- Nghiệm thu: từ Panel ở 2 node thấy cùng dữ liệu, cập nhật không tạo hai Primary, mất một node vẫn dùng Panel node còn lại.

## P3 — Manual Primary usable end-to-end
- Backup/restore có thể do user làm; thao tác chọn từ bất kỳ Panel, health target, RPO warning, quiesce old writer và cảnh báo nếu không xác minh được.
- Route switch via Cloudflare adapter đúng record/host, durable intent, idempotent resume, auth/audit, postcheck và rollback chỉ khi không phát sinh ghi mới không thể đảo an toàn.
- Rejoin old node as standby/quarantine; nó không tự bật lại route/DB writer.
- Nghiệm thu: switchover và rollback giữa hai LAB độc lập, cả khi controller/Panel của Primary chết.

## P4 — Auto Primary healthy + newest verified snapshot
- Heartbeat agent, active web probe, timestamp+hash verified backups, storage/capacity+online reliability scoring.
- Election cooldown, tie breaker deterministic, durable epoch, multiple health checks; không tự bầu nếu authority unavailable.
- Candidate có snapshot gần nhất, có thể stale so với node offline; hiển thị RPO/loss warning, không ép đồng bộ GTID trước khi bầu.
- Route cutover + old node quarantine; test mất kết nối, reboot, mạng chập chờn, crash giữa update route/record state; không auto failback.
- Production AUTO chỉ khi không thể có hai writers đồng thời (chặn direct paths) và đã test thực. Nếu chỉ có best effort, gắn nhãn rủi ro và giữ opt-in disabled by default.

## P5 — Unified production migration M51 + X7b (sau khi user duyệt)
- Đóng băng code version, audit các dịch vụ/domains/DB/sheet/static media của hệ cũ.
- Full backups (mã/hình ảnh/DB/Panel/Cloudflare config), checksum và dry-run trên Vsmart/môi trường phụ.
- Người dùng duyệt maintenance window, đổi tuyến có rollback, smoke-test TPP/WordPress, giám sát; node cũ giữ nguyên dự phòng cho tới khi qua hậu kiểm.
- Khi được phép, cài cùng một unified MHC source lên M51/X7b không xóa cấu hình cũ trước verify; tham gia cluster như standby với từng site đã restore.

## P6 — Sau MVP
- Replication liên tục GTID/file (tùy chọn), backup policy replicas N, node scoring v0.7, alerting, battery/network watchdog, Android process lifecycle, performance, production hardening.

### Definition of done
Đối với mỗi P: source + test tự động + bằng chứng **Android thật** + phiên bản ZIP/repo commit + changelog + rollback. Chỉ cần 1 release per milestone, không phát hành 5-10 bản nhỏ mà mục tiêu vẫn chưa usable.
