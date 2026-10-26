# MHC TEST 0.4.0B3 — v0.4B.3 GTID Replica LAB foundation

## Thêm
- `bin/gtid-replica.mjs`: kiểm tra chặt seed/GTID đã phục hồi, schema MariaDB LAB đơn lẻ, server ID riêng, read-only, các điều kiện InnoDB, không có channel cũ hoặc GTID ghi cục bộ.
- `replica-attach` qua SSH forward **localhost-only** với profile 0600; chỉ chạy theo xác nhận; dùng `MASTER_USE_GTID=slave_pos`. Không nhập SQL, reset GTID, lập account, mở cổng DB hay ARM HA.
- `replica-observe` tóm tắt luồng IO/SQL và lag ở chế độ chỉ đọc; không hiển thị thông tin kết nối, đường dẫn seed hay secret. Panel gốc 9090 dùng observer GTID LAB đã có.
- Kiểm thử mock: trường hợp thành công qua TCP loopback giả lập, GTID không khớp, DB khác, mode writable, server ID trùng, file profile không kín, dữ liệu bị sửa, tunnel không có, channel đã tồn tại.
- Runbook `docs/GTID-LAB-0.4B3.md` và hướng dẫn nâng cấp LAB.

## Tương thích
- Kế thừa nguyên bộ TEST 0.4.0B2 (hosting, Panel 9090, Monitor, backup, enrollment, clone, replication observer/seed).
- Installer `--upgrade` hỗ trợ marker B2, **chỉ nâng cấp mã** và có thư mục rollback; không thay cấu hình MariaDB/website/Cloudflare/HA.

## Chưa hoàn thành/không công nhận
- **Chưa chạy thử với hai MariaDB Android thật**; không tự nhập seed, tạo account MariaDB hoặc cấu hình SSH.
- Chưa có kiểm chứng giao dịch đầu cuối, checksum dữ liệu hai node, test mất mạng/reconnect, file replication hay HA.
- Không dùng trên M51/X7b production hoặc Vsmart hiện có DB/website khác; yêu cầu hai LAB DB cách ly.
