# TEST 0.3.10 — Kiểm thử phát triển

- Kế thừa toàn bộ bộ self-test TEST 0.3.9.2 và nâng cấp Observer UI 19090 trong bản nguồn.
- Test HTTP thực với Panel gốc (đã sao chép vào môi trường sandbox): GET /api/mhc/modules khi chưa đăng nhập trả 401; đăng nhập cookie được cấp; hai API mới trả 200 và không chứa mật khẩu thử nghiệm hay trường nodeToken. Menu hosting cũ còn nguyên.
- Các bài syntax check Node.js và Bash đạt.
- Full `bash bin/self-test.sh` trên Linux phát triển đạt (xem log trong lần build).
- **Chưa chạy tự động `hosting-panel apply` trên Android Vsmart thật**; chưa nghiệm thu PHP-FPM/WordPress HTTP thực. Không khẳng định điều đó.
- Không khẳng định quyền HA / GTID hoặc khả năng failover.

## Kiểm thử ZIP phát hành
- ZIP chứa 214 mục, kiểm tra CRC không lỗi.
- Đã giải nén bằng `unzip` (giữ quyền thực thi của script) và chạy lại `bash bin/self-test.sh`: **PASS**, exit code 0.
- Không thể xác nhận `hosting-panel apply` / `sv restart amh-panel` trên Vsmart từ môi trường phát triển; bước đó cần nghiệm thu trên thiết bị.
