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

### Access 403 `JWT_HEADER_INVALID` trên Vsmart LAB (26/10/2026)
User log 12:17–12:18 UTC cho thấy browser request đến origin có JWT nhưng bị từ chối trước check issuer/aud/signature. Strict `header.typ==='JWT'` không theo RFC 7519 §5.1: typ optional. Patch cho phép typ vắng, typ JWT không phân biệt hoa/thường; vẫn bắt buộc RS256, kid có giá trị, JWKS RSA RS256, signature, issuer, aud, exp. Khi bị từ chối, log từng mã: `JWT_ALG_UNSUPPORTED`, `JWT_TYP_UNSUPPORTED`, `JWT_KID_INVALID`. Không bao giờ in JWT / claims / kid / token. Đây là source fix; chỉ coi 403 được giải quyết khi đăng nhập công khai thành công sau deploy.


## XZ3 reboot không phục hồi Panel/Agent (26/10)
- Sau lệnh thống nhất `scripts/update-existing-android-node.sh --apply`, chạy `~/mhc-full node-doctor --check` và `bash ~/.local/share/mhc-full-installer/bin/node-boot.sh --status`.
- `boot-last.log` không có dấu thời gian từ lần reboot gần nhất: Termux:Boot chưa được Android kích hoạt; mở app một lần, cấp autostart, không hạn chế pin cho Termux/Termux:Boot/Termux:API, Sony STAMINA OFF. Không thể cấp quyền này qua Shell không root. Không giải thích Android kill bằng giả định bug Cloudflare.
- Log `RUNSVDIR_MISSING`: `~/mhc-full node-doctor --repair`, kiểm tra `$PREFIX/etc/profile.d/start-services.sh`, `sv status ...`, và log runit; boot script cũ được backup trước khi thay.
- Agent RUNNING nhưng Monitor không có node: chẩn đoán `WORKER_NEEDS_MONITOR_DEPLOY` vs `MONITOR_SCHEMA_V2`, xác minh Worker đã deploy đúng `mhc-cluster-authority-lab`, Agent có private authority config, và heartbeat. Nếu chỉ dữ liệu cũ, đợi heartbeat mới; không đánh đồng máy offline.
- `termux-battery-status` không có JSON dù đã cài `pkg termux-api`: xác minh ứng dụng Termux:API từ nguồn ký tương thích, chạy mở ứng dụng, cấp quyền/battery unrestricted, kiểm tra lại. Không in secrets/tokens hay xóa dữ liệu.
