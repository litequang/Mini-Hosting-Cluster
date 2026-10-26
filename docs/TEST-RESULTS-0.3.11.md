# TEST 0.3.11 — Báo cáo kiểm thử mã nguồn

- Trên Linux phát triển: `bash bin/self-test.sh`: **PASS**, exit 0.
- HTTP bảo vệ phiên Panel gốc 9090: 401 khi chưa đăng nhập cho 5 endpoints; xác thực cookie đúng mới có dữ liệu; cấm xuất nội dung secret `ADMIN_TOKEN`, manifest nội bộ hay thuộc tính lạ từ Termux:API.
- Mô phỏng thiết bị: Vsmart LAB (pin 68%, 35.1°C) qua shim Termux:API và `getprop`; đo CPU trả null nếu chưa có mẫu.
- Mô phỏng metadata: website static `demo`, snapshot MHC `snapshot-20261025`, có SHA256SUMS nhưng `integrityVerifiedNow=false`.
- Tất cả bộ self-test di sản đã PASS: Backup/verify/restore giả lập, static hosting, Panel HTTP 70 assertions, enrollment 43 assertions, telemetry 30 assertions, clone/restore LAB, Android acceptance.
- Chưa kiểm tra tự động `hosting-panel apply` hoặc khởi động lại Panel trên Vsmart thật; chưa nghiệm thu WordPress PHP-FPM, MariaDB thật hoặc HA.

Thử nghiệm trên thiết bị thật được cập nhật thủ công theo runbook; tránh khẳng định PASS trên Android khi chưa có log.
