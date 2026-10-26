# Kết quả kiểm thử TEST 0.3.5

24/10/2026. Môi trường Linux trong container, Node.js + Bash + Python; KHÔNG sử dụng điện thoại Android production.

## Nguồn và kiểm thử lại

- `bash bin/self-test.sh` — kiểm tra cú pháp shell/JS/Python; integration backup/restore/peer, static site/ZIP rollback, host guards, Panel HTTP, enrollment, clone, Restore Lab.
- Panel HTTP test nguồn cũ: 41 assertions (đạt).
- Enrollment nguồn cũ: 43 assertions (đạt).
- Clone test cũ: hai node giả lập, yêu cầu phê duyệt, xác thực request, SHA256, revoke, offline stage và file seal (đạt).
- Restore Lab test mới: phân loại WP/static, SQL dump, bắt buộc xác minh lại stage cũ, sao chép private offline, checksum, HTTP smoke localhost 200, tạo SQL lab schema qua `mariadb` giả lập, cấm nhập lại, phát hiện file bị sửa và symlink, cấm khi candidate có active websites (đạt).

## Chưa nghiệm thu

- Installer tải package/cài dịch vụ trên điện thoại Termux mới.
- MariaDB thực: quyền của user/schema, triggers/routines, SQL dump thực và restore WordPress không lỗi.
- Nginx/PHP-FPM/WordPress HTTP/admin/uploads, app TPP runtime và Sheet/Sheet+ consistency.
- Kết nối thật SSH giữa điện thoại, Cloudflare traffic, GTID, HA manual/auto, fencing/split-brain, DR ngoài cụm có mã hóa.

**PASS trong test giả lập != đã chạy thật trên Android hoặc production.**
