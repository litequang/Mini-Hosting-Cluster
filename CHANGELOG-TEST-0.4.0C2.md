# MHC Full Installer TEST 0.4.0C2 — Peer Transfer & Resume LAB

Tiếp tục trực tiếp từ **TEST 0.4.0C1**, theo roadmap **v0.4C.2**.

## Mã nguồn mới

- Thêm `bin/file-peer-lab.mjs`: `file-sync peer-init`, `peer-info`, `peer-config`, `peer-send`, `peer-prepare`, `peer-finalize`, `peer-status`.
- Trên receiver, tạo định danh random 128-bit cho **LAB receiver**; sender xác minh đúng ID này qua SSH sử dụng `StrictHostKeyChecking=yes` và `BatchMode=yes`. Đây không phải chứng nhận quyền Primary hay cluster membership.
- Sender xác minh **gói delta outbox cụ thể** trước khi chuyển; bên nhận `peer-prepare` kiểm tra LAB-only, tránh symlink, dung lượng dự kiến (tối đa 8 GiB và tối thiểu 64 MiB phần trống dự phòng).
- `rsync` sử dụng SSH, `--partial --append-verify` để thử lại sau mất kết nối. Giữ bản chưa hoàn tất ở `~/mhc-file-lab/inbox/pending-<delta-id>/`.
- Sau khi gửi đủ, receiver tự chạy lại xác minh checksum nội dung + schema C1, đổi tên từ pending sang inbox đã kiểm chứng, ghi receipt riêng; nếu xác minh thất bại quay lại pending để thử lại. Không tự `stage`, không đè replica, không xóa file đang chạy.
- Lưu nhật ký kết quả ở `~/mhc-file-lab/transport/journals/`; trạng thái: `TRANSFER_IN_PROGRESS`, `INTERRUPTED_RETRYABLE`, `REMOTE_CHECKSUM_VERIFIED`. Mã và báo cáo không xuất hostname/username trong API Panel.
- Panel gốc 9090 (Cluster) có mục C2 **chỉ đọc**: verified/retryable/active/received từ journal cục bộ, bảo toàn session, UI và các chức năng quản lý trước đây.
- Mở rộng marker/CLI/version của installer và node/clone sang `TEST 0.4.0C2`.

## Mặc định an toàn

**KHÔNG** áp dụng delta vào website phục vụ, cơ sở dữ liệu, file Sheet production; không dùng `rsync --delete`, không tự lên lịch, không mở tunnel hay truy cập public, không ARM HA/failover, không đồng nhất checkpoint file và MariaDB GTID.

Vẫn chỉ là LAB; chưa có kiểm thử end-to-end trên hai thiết bị Android thật hoặc xác minh tốc độ truyền qua Wi-Fi. SHA256 chỉ kiểm tra toàn vẹn; xác thực nguồn đến từ SSH host key đã xác minh và định danh LAB đã ghim. Tài khoản SSH bên nhận hiện chưa bị giới hạn bằng forced-command, chỉ dùng account LAB đáng tin cậy.

## Giới hạn còn lại / roadmap

- Baseline manifest C1 còn do quản trị viên chuyển thủ công lần đầu.
- Chưa tự động background sync, giới hạn băng thông/ưu tiên pin, hiển thị %byte, journal tự phục hồi khi process bị kill đúng lúc rename, dọn pending/retention tự động.
- Chưa áp dụng delta và tombstone nhất quán với GTID trên Standby (v0.4C.3).
- GTID replication thật trên hai node Android chưa nghiệm thu; không thể tiến tới v0.5 chuyển Primary an toàn chỉ bằng gói này.
