# P4.0 — Đồng bộ website định kỳ Lite (quyết định 29/10/2026)

> Quyết định **mới nhất của chủ dự án**: chọn **backup → truyền → restore có kiểm chứng theo lịch**, không phát triển replication thời gian thực. Đây là một bước **nhỏ, có đầu ra sử dụng được**, dựa trên N1.3. Trạng thái nguồn/chạy thật chỉ xem `docs/LIVE-PROGRESS.md`; tài liệu này không khẳng định P4.0 đã được triển khai.

## Thứ tự ưu tiên bắt buộc

**P3.3 Manual (LAB đã nghiệm thu) → hoàn tất N1.3 (đang triển khai; KHÔNG ngắt/làm lại) → P4.0 Đồng bộ định kỳ Lite → P4 Lite Auto Primary/Control → HP1 Hosting Core + Restore thủ công ZIP/SQL → HP2 Domain/Cloudflare → HP3 backup và bảo trì nâng cao → chuyển M51/X7b khi được duyệt.**

Codex chỉ **đọc và lên kế hoạch** P4.0 lúc N1.3 còn đang chạy; không kéo yêu cầu P4.0 vào phạm vi N1.3 để trì hoãn nghiệm thu. Tại checkpoint tiếp theo sau khi N1.3 PASS mới làm P4.0.

## P4.0 MVP: đủ dùng, không phức tạp hóa

- Dùng **chính N1.3 authenticated relay, checksum, snapshot/restore, journal/retry và original Panel9090** đã có; không tạo hệ truyền dữ liệu hoặc Controller mới.
- Cho phép chọn **website LAB MHC-managed**, node Primary nguồn và node Standby đích. Mặc định **60 phút/lần**, có nút **Đồng bộ ngay**, bật/tắt theo website (mặc định OFF cho tới khi thử thực trên LAB). Bắt đầu với một nguồn + một Standby; không cố tối ưu nhiều node hay nhiều site ở lượt đầu.
- Tạo snapshot **đúng ứng dụng** (mã nguồn/build nếu có thay đổi, SQL dump nhất quán, uploads/media/storage cần thiết). Chỉ truyền/khôi phục theo hành động phù hợp với chính sách và dữ liệu đang tồn tại. **N1.3 WordPress content-only LAB không đồng nghĩa full-site production backup**; không tự nhận sẵn sàng cho Thờ Phượng Pro, WordPress tùy ý hoặc site khác cho tới khi kiểm full application/data/credentials requirements.
- Snapshot được đưa lên Standby **chỉ khi Standby không đang phục vụ/ghi** và đã xác nhận site/DB đích theo quyền/epoch/lease. Có staging, checksum, restore verification và dữ liệu cũ còn đường phục hồi; không restore đè DB đang hoạt động hoặc user data không được xác minh. Nếu node đích đã có dữ liệu, cần chính sách cập nhật bản sao Standby có backup/journal/rollback thật, không bypass guard N1.3 `no-overwrite`; nếu chưa bảo đảm an toàn, dừng ở PREPARED/NOT_APPLIED và hiển thị lý do.
- Hiện **bản sao được áp dụng & xác minh gần nhất** của từng node: thời điểm tạo snapshot, thời điểm restore PASS, checksum, bản build/db, RPO age và lỗi. Phân biệt **backup created / transferred / verified / applied**; RPO thực tế có thể lớn hơn chu kỳ hẹn giờ.
- Khi node offline/Relay lỗi/đầy disk, retry có giới hạn và báo lỗi; **không làm hỏng bản sao Standby cũ**, không tự đổi DNS/Primary/lease. Các node mạng khác LAN vẫn dùng Authority như N1.3; không mở SSH, SQL ra Internet.
- Đối với WordPress, chỉ node có quyền ghi mới được chạy background updates/WP-Cron; Standby không tự cập nhật code/plugin/theme độc lập rồi làm lệch dữ liệu.
- Kiểm trực tiếp Android LAB đúng loại site: snapshot → relay → apply → HTTP/PHP/SQL gate → lần thứ hai sau dữ liệu đổi → backup cũ/rollback → lịch chạy → offline/retry; báo PASS/FAIL/NOT RUN trung thực. Không tác động M51/X7b/production.

## Ranh giới tuyệt đối — KHÔNG LÀM TRONG MVP

**KHÔNG MariaDB/MySQL realtime replication, GTID, binlog streaming, CDC, Galera, master-master/multi-master, zero-RPO, filesystem real-time watchers, bidirectional sync, conflict merge, Raft/quorum mới, distributed filesystem, full data convergence, backup-to-cloud service mới.**

Không mở rộng thành nền tảng backup doanh nghiệp, không đổi toàn bộ source/Panel hoặc tái viết P3.3/N1.3. Không bắt buộc dữ liệu mọi node giống nhau 100%. Không để nghiên cứu replication hoặc những test ngoài phạm vi kéo dài P4 Lite.

## Liên kết P4 Lite

Sau P4.0, P4 Lite dùng **bản snapshot đã APPLY/VERIFY** làm ứng viên, có thông tin RPO. **An toàn chống 2 managed writers KHÔNG được giản lược**: P3.3 scoped writer lease/gates, Authority CAS/epoch, self-fencing khi mất Authority hoặc lease hết hạn, không auto failback, signed HTTPS proof, opt-in only sau fault test trên Android thật. Node mất heartbeat không có nghĩa writer đã ngừng. Thiếu chứng cứ thì fail-closed, không promote.

## Sau P4 Lite

HP1 có tạo site/Upload prebuilt ZIP/SQL/Restore đơn giản, File Manager, services, WordPress toolkit; HP2 domain/tunnel/HTTPS; HP3 backup scheduling nâng cao nếu thật sự cần. Migration M51→Xiaomi11T: user chủ trương giữ nguyên M51 trong khi lấy backup website/files+SQL, restore và nghiệm thu trên 11T; **không xóa/cài lại M51** khi chưa có backup được xác minh và phê duyệt rõ ràng.

## Để tránh Codex chạy sai roadmap

Trước mỗi phase/checkpoint: đọc `AGENTS.md`, `docs/ROADMAP-TO-V1.md`, `docs/HOSTING-PANEL-ROADMAP.md`, `docs/PERIODIC-SNAPSHOT-SYNC-LITE.md` và `docs/LIVE-PROGRESS.md`. Nếu tài liệu cũ trái với quyết định này, lấy quyết định 29/10/2026 làm chuẩn. Không reset/rebase/force-push hoặc ngắt checkpoint Codex đang làm; cập nhật Git an toàn khi worktree đã sẵn sàng.
