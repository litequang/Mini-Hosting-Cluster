# MHC TEST 0.5.0C-FIELD — SSH two-node field observation

Kế thừa toàn bộ MHC TEST 0.5.0C-PHYSICAL, v0.5B write-gates LAB, v0.4 data observers, Hosting Panel gốc 9090 và installer nguồn.

## Mới

- `bin/field-lab-coordinator.mjs`: điều phối từ máy quản trị có Node.js/OpenSSH; gọi `preflight`, `capture` và đọc bản JSON ký trên hai Android LAB qua SSH.
- Chỉ IP LAN RFC1918, port 8022, user Termux `u0_aNN`; loại trừ IP M51, X7b, Vsmart đang chạy website. Host key SSH bắt buộc có trong known_hosts ghim thủ công; xác thực công khai Ed25519 qua fingerprint đã đối chiếu ngoài băng.
- Mỗi lần thu có challenge ngẫu nhiên chung, bản ghi riêng mode 0600 trong thư mục 0700; tự đối chiếu chữ ký, hai danh tính, boot ID, GTID, trạng thái IO/SQL và SHA-256 fixture.
- `physical-accept preflight` mới để kiểm tra LAB cách ly và khóa Ed25519 trước khi thu bằng chứng; không đọc hay thay đổi database.
- `field-accept plan|collect CONFIG|verify CONFIG RUN_DIR` trên launcher; có thể chạy CLI `node bin/field-lab-coordinator.mjs` trên laptop.
- Ngăn dữ liệu thu thiếu chữ ký, khóa không khớp, SSH thất bại, file quá lớn, symlink, host production và kết quả bị sửa. Dọn kết quả dang dở khi lỗi; giữ báo cáo có blocker (không đánh dấu PASS).
- Sửa các case `physical-accept` bị đặt nhầm trong router CLI replication/file-sync/clone của bản trước; bổ sung test mới.

## An toàn và giới hạn

- Không can thiệp M51/X7b/Vsmart demo; không áp dụng MariaDB/Cloudflare, không cấu hình replication, không chuyển Primary, không bật HA.
- Không chứng minh hai thiết bị vật lý độc lập bằng mật mã; hai host SSH/boot khác nhau vẫn có giới hạn. Không chứng minh transaction A/B qua mất mạng, fencing độc lập mọi writer hay DB/filesystem snapshot nguyên tử.
- SSH field test chạy trong mô phỏng transport; **chưa có hai Android LAB thật để nghiệm thu**, không phải v0.5C production-ready.
