# MHC TEST 0.5.0C-DRILL — Three-Stage Physical LAB Acceptance

Bản hợp nhất kế thừa toàn bộ `0.5.0C-FIELD`, thêm `bin/field-recovery-drill.mjs` và `tests/field-recovery-drill.mjs`.

## Nội dung mới

- `field-drill collect CONFIG baseline|outage|recovered`: gọi SSH preflight và capture hiện có, lưu riêng biên nhận đã ký và metadata pha trong 3 thư mục riêng. Không ngắt mạng, không thay đổi SQL hay file fixture từ coordinator.
- `field-drill verify CONFIG BASELINE OUTAGE RECOVERED`: kiểm Ed25519 bằng hai identity đã PIN, challenge riêng, đồng hồ và thời hạn 15 phút, boot/node/server ID ổn định. So sánh GTID MariaDB theo domain/server ID/sequence **không giảm**; buộc source tiến lên khi replica IO dừng và replica bắt kịp sau phục hồi. Kiểm file SHA-256: baseline trùng; outage source đổi/replica không đổi; recovered trở lại trùng. Báo cáo blockers cụ thể, `canSwitchPrimary=false`, `canArmHA=false` trong mọi kết quả.
- Chống replay, GTID regression, missing IO outage, premature replica catch-up, stale time, changed boot/server, tampered receipt, unsafe private mode.
- Giữ nguyên Hosting Panel **gốc 9090**; không tạo Panel mới. Cập nhật installer, source-only upgrade, marker các lệnh enrollment/clone/readiness và nhãn giao diện. Tương thích marker FIELD cũ.
- Hướng dẫn nghiệm thu ngoài LAB chỉ đọc, diễn tập dừng/khởi động riêng MariaDB replication IO bằng thao tác quản trị chủ động trên **hai Android LAB riêng**, không thực hiện tự động.

## Phạm vi không làm

- KHÔNG cấp lease, promote MariaDB, write gate production, hard-fencing, đổi Cloudflare/DNS, HA.
- KHÔNG chạy hoặc kiểm chứng trên M51, X7b, Vsmart phục vụ `demo`, hay hai Android LAB thật; kiểm thử mới dùng SSH/MariaDB giả lập. Không có bằng chứng dữ liệu row-by-row hoặc snapshot nguyên tử.
