# TROUBLESHOOTING / an toàn vận hành

## SSH Vsmart
- SSH Termux lần cuối: `ssh -p 8022 u0_a180@192.168.100.27`; IP có thể thay đổi. Kiểm tra fingerprint bằng kênh tin cậy, không `StrictHostKeyChecking=no`.
- Codex VS Code **chạy trên máy công ty cùng LAN/VPN** có thể SSH qua OpenSSH; Codex Cloud **không thể tự truy cập LAN** trừ khi có mạng riêng/tunnel được chuẩn bị. Nếu không thể truy cập, xuất bước kiểm tra cụ thể, không giả báo đã chạy.
- Dùng key riêng/cấu hình `%USERPROFILE%\.ssh\config`; **không chép private key vào repo/chat**.

## Vsmart đã có dữ liệu
- Kiểm tra `~/mhc-full doctor`, `sv status ...`, `ls ~/.config/mhc-full-installer`, `~/mhc-full sites list`, `~/mhc-full hosting-panel plan` chỉ đọc trước.
- `install.sh --install` dành cho Termux sạch. Trên Vsmart cũ phải xác minh `install.sh --upgrade` và snapshot/rollback, không xóa `demo` hay DB trước khi user duyệt.
- Mỗi thay đổi service cần health-check trước/sau và lệnh rollback đã được kiểm chứng; tránh restart toàn bộ.

## Panel 9090
- Kết nối từ LAN Windows có thể dùng `ssh -N -L 127.0.0.1:9090:127.0.0.1:9090 -p 8022 ...`; nếu local 9090 bận, cổng khác có thể đụng origin allowlist: khắc phục theo code, không disable CSRF/origin.
- Panel cũ lưu admin config `~/android-hosting-panel/data/admin.json`; nâng cấp Panel riêng bằng `hosting-panel plan/apply/rollback` theo output thực.
- Access 403 sau redirect: kiểm hostname, team/AUD/JWKS/JWT, Clock/CA, trust chain; không tắt kiểm JWT để sửa nhanh. Từ checkpoint 26/10, `mhc-remote-access.mjs` (nếu đã được triển khai) ghi private `MHC_REMOTE_ACCESS_DENIED <CODE>` tối đa mỗi reason/30 giây vào log dịch vụ Panel, không ghi token/host/claim. Xem **chỉ các dòng có prefix này** bằng `grep 'MHC_REMOTE_ACCESS_DENIED' "$PREFIX/var/log/sv/amh-panel/current" | tail -n 8`. Không gửi full log, JWT hoặc cookie. `JWT_MISSING` gợi ý header không đến origin; `HOST_MISMATCH` là Host ngoài whitelist; `JWT_AUDIENCE_MISMATCH` là ứng dụng Access sai; `JWKS_FETCH_FAILED` là truy xuất khóa lỗi; `JWT_SIGNATURE_INVALID` là chữ ký sai. 403 vẫn generic phía client; PATCH LAB bằng script trong `scripts/` có backup/rollback.

## Hosting và Cluster
- Đừng khẳng định web WordPress hoạt động chỉ vì `php-fpm` và MariaDB đang chạy. Cần bài test HTTP/DB/WordPress thật, quy trình cài WP-CLI và restore có rollback.
- SSH heartbeat stale không chứng minh máy offline. Dữ liệu mới nhất không thể biết nếu Primary mất kết nối mà có giao dịch chưa backup.
- Mất Cloudflare authority/witness phải dừng auto promotion. Controller ghi Primary mới không đồng nghĩa old primary đã ngừng DB write.
- Node cũ quay lại: mặc định quarantine/standby; không auto restart writer; cảnh báo snapshot diverged.
- Cloudflare Tunnel DNS có thể tiếp tục trỏ Tunnel offline -> 1016. Nếu muốn tự route phải có adapter thực sự cập nhật đích, xác minh và rollback.

## Nghiệm thu
- Unit/integration: chạy lần lượt `node tests/auto-primary.mjs .`, `node tests/manual-primary.mjs .`, `node tests/remote-panel.mjs .` (các file test nhận đường dẫn root qua tham số). Không gọi trực tiếp `node --test` cho ba script này vì chúng tự kiểm thử và cần argv[2].
- Shell test: `bash bin/self-test.sh` trên WSL/Linux hoặc thiết bị Termux, không trộn với cấu hình production.
- Cần log thật từ Vsmart, HTTP status, healthchecks và trạng thái sau reboot. Không xuất secrets/full dump/log cá nhân.
