# TEST 0.3.9.2 — Kết quả kiểm thử (2026-10-25)

Nguồn: full installer TEST 0.3.9.1 + mã sửa 0.3.9.2. Chạy trong Linux container; **chưa** nghiệm thu hotfix trên Android Vsmart sau upgrade.

- `node --check bin/local-panel.mjs`: PASS
- `node tests/panel-http.mjs .`: **PASS 61 assertions** bao gồm đăng nhập, sai token, redirect theo `/cluster`, chặn open-redirect, API 401, POST không xác thực, CSRF, Host, file paths, ZIP deploy và rollback.
- `node tests/termux-compat.mjs .`: PASS, nhận diện Android và TEST 0.3.9.1/0.3.9.2 markers.
- `bash bin/self-test.sh`: **PASS** — backup/verify/peer transfer, static site, Panel, cluster summary, member telemetry, enrollment, clone, offline Restore Lab, WordPress preview và Android acceptance test (giả lập).
- `unzip -t MHC-Full-Installer-TEST-0.3.9.2.zip`: PASS, no corrupt archive members.
- **Kiểm thử trực tiếp bản phát hành:** giải nén ZIP vào thư mục khác và chạy `bash bin/self-test.sh`: **PASS toàn bộ**. Trong đó Panel HTTP **61/61**, Cluster Summary **23/23**, Member Telemetry **30/30**, Enrollment **43/43**, các bài backup/restore/clone/standby/acceptance đạt.
- `bash -n install.sh bin/panel.sh` trên bản ZIP đã giải nén: PASS.
- Archive được xác nhận gồm **202 file**. Mọi kiểm thử ở môi trường Linux; kết quả trên Android Vsmart cần kiểm tra thực tế sau nâng cấp.

### Giới hạn nghiệm thu

Không có kết nối hay thao tác nào trên Vsmart, M51, X7b, Cloudflare hoặc MariaDB production từ môi trường này. PHP-FPM/Nginx thực trên Vsmart được xác nhận trước hotfix từ log người dùng; hotfix chỉ liên quan mã Panel và version guards. HA và GTID vẫn chưa nghiệm thu.
