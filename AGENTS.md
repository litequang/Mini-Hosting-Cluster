# AGENTS.md — MHC

> Bổ sung bàn giao hợp nhất 26/10/2026: sau TROUBLESHOOTING, đọc `docs/HANDOFF-PACKAGE-SELECTION.md` và `docs/HANDOFF-SOURCE-AUDIT-2026-10-26.md`; trước triển khai đọc `docs/HANDOFF-ENVIRONMENT.md`, `docs/HANDOFF-ACCEPTANCE.md` và prompt hiện hành. Hướng dẫn quyền trong hồ sơ cũ không tự tạo quyền truy cập mới; dùng quyền/kết nối thực đang có. Thiết kế Worker/DO là đề xuất kỹ thuật để chọn phương án đơn giản phù hợp, không phải runtime đã hoàn thành. Manual backup/restore và dữ liệu lệch được chấp nhận trong MVP; không để replication nâng cao chặn việc ship. Guard/route hiện tại cần bổ sung candidate activation và duy trì Panel/agent trên Standby.

> Áp dụng cho `E:\CODE\MHC`. Ưu tiên yêu cầu **mới nhất** từ người dùng hơn các mô tả LAB cũ, nhưng không bỏ các điều kiện an toàn dữ liệu.

> **QUYẾT ĐỊNH ƯU TIÊN MỚI NHẤT 29/10/2026 — PHẢI ĐỌC TRƯỚC CHECKPOINT:** Chủ dự án chốt **đồng bộ website định kỳ bằng backup → relay → restore có kiểm chứng, KHÔNG replication thời gian thực**. Đọc `docs/PERIODIC-SNAPSHOT-SYNC-LITE.md` và `docs/LIVE-PROGRESS.md`. Thứ tự: P3.3 Manual LAB (đã nghiệm thu) → **hoàn thành N1.3 đang chạy, không ngắt/làm lại** → **P4.0 Snapshot Sync Lite** (mặc định 60 phút/website LAB, một nguồn–một Standby, nút Đồng bộ ngay + báo RPO; tái dùng N1.3) → **P4 Lite Auto Primary + Control** (một website và một cặp máy đã xác minh trước, tái dùng P3.3, scoped writer self-fencing vẫn bắt buộc) → **HP1 Hosting Panel thiết yếu** (prebuilt dist ZIP cho Node, WordPress/PHP, Restore ZIP+SQL, File Manager, basic remote operations) → **HP2 Cloudflare domain/tunnel one-zone** → **HP3 optional/maintenance** → M51/X7b migration sau phê duyệt. **KHÔNG** GTID/binlog/CDC realtime, đồng bộ hai chiều, tự merge DB, cluster Raft/quorum, scheduler nhiều tầng, file watcher realtime, dựng cPanel song song, tự build Node source trên Android mặc định. Hoãn các tính năng nâng cao đến sau khi website thật chạy. Không kéo P4.0 vào N1.3; không để test chưa cần trên Android mới chặn checkpoint hữu dụng. Website/DB managed phải tự chặn ghi khi mất Authority/lease, new Primary chỉ nhận quyền khi có chứng cứ, không tự failback; không thay đổi production.

**Điểm kiểm soát trước mỗi checkpoint:** so khớp `docs/PERIODIC-SNAPSHOT-SYNC-LITE.md`, `docs/HOSTING-PANEL-ROADMAP.md` và `docs/LIVE-PROGRESS.md`; chỉ triển khai mốc hiện hành, báo rõ phần làm/hoãn và PASS/FAIL/NOT RUN; không tự mở lại realtime replication hoặc kiến trúc đã bị loại.

## Quy trình bắt buộc
1. Trước khi sửa code, đọc lần lượt: `AGENTS.md`, `docs/CODEMAP.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TROUBLESHOOTING.md`, `docs/ROADMAP-TO-V1.md`, `docs/VSMART-LAB-RUNBOOK.md`, `docs/PROJECT-STATUS-2026-10-26.md`.
2. Kiểm tra Git/worktree trước; không xóa, reset cứng, rebase, force-push, chạy install phá dữ liệu nếu không được cho phép riêng. Tạo commit cho mỗi mốc độc lập và push chỉ khi remote/branch được xác nhận.
3. Codex **được phép chạy test, typecheck, build và deploy trên Vsmart LAB** (theo yêu cầu mới). Ưu tiên thực thi trên máy công ty hoặc Vsmart được người dùng cho phép; Cloud Codex không tự truy cập IP LAN nếu không có kết nối mạng thích hợp.
4. KHÔNG bao giờ sửa M51/X7b/Cloudflare production mặc định. Chuyển web production cần backup độc lập + xác nhận cụ thể trên từng mốc.
5. Không đọc/đăng/đẩy lên Git các file `.env`, mật khẩu, DB dump thật, token Cloudflare, khóa SSH/Witness/Access, hồ sơ cá nhân, dữ liệu Thờ Phượng Pro. Nếu cần secrets, hướng dẫn user nhập trực tiếp qua file riêng quyền hạn chế, không trong chat/commit/log.
6. Vsmart từng chạy `demo`, PHP/Nginx/MariaDB/Panel 9090: **không dùng `install.sh --install`, `rm -rf`, drop DB hoặc restore đè** nếu chưa chụp backup và có sự đồng ý rõ khi xóa. Ưu tiên `--plan` / nâng cấp source-only khi phù hợp.
7. Bất kỳ node offline nào có thể chỉ bị chia mạng, không chắc tắt writer. Việc chọn snapshot khác nhau được chấp nhận, nhưng không được đánh đồng với fencing đảm bảo. Nhãn `Primary` trên Panel khác với bằng chứng route/lease/write gate đang có hiệu lực.
8. Mọi node đều chạy **original Panel 9090** + node agent; UI phân tán không được phụ thuộc vào controller chạy trên Primary hiện tại. Trạng thái Primary/epoch phải dùng authority chung, có concurrency control, revision và audit.
9. Khi authority/witness không truy cập được: ưu tiên fail-closed, không tự bầu ra hai Primary; chuyển lỗi thành thông tin cụ thể trên Panel. Best-effort chỉ có thể được bật theo cảnh báo rủi ro và xác nhận riêng trong LAB, không âm thầm dùng trên production.
10. Mỗi PR/mốc cập nhật docs liên quan, test/mô phỏng sự cố, báo cáo PASS/FAIL/NOT RUN có bằng chứng; không khẳng định nghiệm thu hai Android thật nếu mới test giả lập.
11. Không phát hành một chuỗi bản vá nhỏ không hướng mục tiêu: gom theo milestones hữu dụng (LAB node chạy thật -> all-node panel -> manual -> auto -> migration).
12. Cấu hình Cloudflare: Codex chuẩn bị script, runbook, kiểm tra cấu hình đã được áp dụng; người dùng tự thao tác đăng nhập/thiết lập trong tài khoản khi cần. Không yêu cầu người dùng gửi token vào chat.

## Mô hình mục tiêu
- N-node, không giới hạn 2 máy; mỗi node có panel/agent/Tunnel riêng nếu cần.
- Một cluster authority độc lập (có thể là Cloudflare Worker + Durable Object) giữ revision/epoch và quyết định Primary một cách nhất quán.
- Manual Primary từ **bất kỳ Panel**; Auto Primary có health, thời điểm snapshot **đã xác minh**, cooldown/hysteresis, rollback có điều kiện; node cũ rejoin phải quarantine/standby.
- Snapshot/restore thủ công trước, replication tự động là nhánh nâng cao có thể làm sau.
- Web chính và Panel chung có thể được định tuyến độc lập; Panel cần còn truy cập được khi Primary mất mạng.
- `http://127.0.0.1:9090` local-only; Cloudflare Tunnel + Access + origin JWT + mật khẩu Panel/CSRF, không mở port LAN công khai.

## Tiêu chí hoàn thành
Đọc `docs/ROADMAP-TO-V1.md`. Phải có test thực Vsmart; không trình bày mô phỏng như production-ready.
