# MHC TEST 0.4.0B2 — v0.4B.2 GTID Seed Handoff (LAB)

Nền: TEST 0.4.0B1. Một bộ source/installer All-in-One; không phát hành patch chồng nhau.

## Mới

- `bin/gtid-seed.mjs`: `seed-capture`, `seed-verify`, `seed-review`, `seed-summary`; tạo dump SQL LAB InnoDB có tọa độ GTID được ghi cùng snapshot, manifest SHA256 riêng tư và chốt không chạy trên DB sản xuất hoặc instance chứa schema ngoài LAB.
- Chỉ xuất seed sau xác nhận cụ thể; giới hạn 256 MiB/120s; thư mục 0700, file 0600; từ chối file bị sửa/symlink, thiếu hoặc mâu thuẫn GTID.
- `tests/gtid-seed.mjs`: 66 assertion cho dữ liệu/metadata, hash, manifest, dump không có GTID, thư viện dữ liệu không cho phép, binlog tắt, MyISAM, marker production và lỗi dump giả lập.
- Panel gốc 9090 → Cluster hiển thị số seed LAB (metadata được lọc); không có nút restore/START SLAVE/promote.
- `docs/GTID-LAB-0.4B2.md` và `docs/UPGRADE-VSMART-0.4B2.md`; đổi version marker 0.4.0B2, hỗ trợ nâng cấp LAB từ 0.4.0A/B1 và 0.3.x đã nghiệm thu.

## Không thay đổi

- Không đụng MariaDB của người dùng trong quá trình `--upgrade`; không restart MariaDB, Nginx, PHP, SSH; không ảnh hưởng hosting `demo` hay Panel 9090 cho đến khi người dùng quyết định `hosting-panel apply`.
- HA OFF; GTID seed **chưa** là GTID replica; không có auto failover/failback.

## Chưa nghiệm thu

- `mariadb-dump --master-data=2 --gtid` trên Termux Vsmart thật và trên node thứ hai, truyền/verify SSH thực, nhập SQL/GTID vào replica thật, đo catch-up/lag hoặc đối chiếu row/checksum. Không khẳng định continuous replication đang hoạt động.
