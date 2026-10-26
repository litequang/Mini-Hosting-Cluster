# MHC TEST 0.4.0A — v0.4A Replication Observer

Nâng cấp All-in-One từ TEST 0.3.11. Giữ Panel gốc 9090, hosting static/WordPress LAB, backup/restore, enrollment và clone. Bổ sung:

- Truy vấn **chỉ đọc** MariaDB GTID, binary log, read-only, server ID, strict mode tại local.
- Quét nội dung website/Sheet được phép và lưu SHA256 manifest riêng tư (0600), so sánh các lần quét để phân loại **added/modified/removed**.
- Panel 9090 mục Cluster có khối **v0.4A Observer**, API `/api/mhc/replication` yêu cầu đăng nhập, chỉ hiện số liệu tổng hợp, không hiện tên file/đường dẫn/hash GTID.
- Từ chối symlink, file đặc biệt, file thay đổi trong lúc quét và vượt giới hạn. Giữ trạng thái cũ nếu lỗi.
- Hỗ trợ nâng cấp từ TEST 0.3.11 trong chế độ LAB; giữ quy trình `hosting-panel plan/apply/rollback`.

**Chưa triển khai replication liên tục thật**, chưa có GTID receiver, file delta SSH, RPO, fencing, traffic switch hoặc HA. Chưa nghiệm thu bản này trên Android Vsmart. Không cài lên M51/X7b production.
