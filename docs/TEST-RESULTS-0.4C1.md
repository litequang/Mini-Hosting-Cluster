# Kết quả kiểm thử MHC TEST 0.4.0C1

**Môi trường:** Linux synthetic, Node.js/Python/Bash; không có SSH node thật hoặc MariaDB GTID hai máy.

## Đã chạy

- `bash bin/self-test.sh` trên source C1: **PASS / exit 0**.
- `bash bin/self-test.sh` từ chính ZIP phát hành được giải nén: **PASS / exit 0** (sau cùng chạy lại khi đóng gói).
- Kiểm tra ZIP: `ZipFile.testzip() = None`.
- `tests/file-delta-lab.mjs`: **22 kiểm tra PASS**, bao gồm baseline, chỉ truyền file mới/sửa, xử lý xóa trong candidate, SHA256, không ghi đè replica, gói bị sửa, baseline lệch, bundle vào inbox, symlink, path traversal và secret.
- Panel gốc 9090: **70 HTTP assertions PASS** và bài `legacy-panel-bridge.mjs` (đăng nhập, thông tin đã lọc, không lộ paths/hash, không suy diễn HA).
- Các nhóm GTID từ B1 đến B4 tiếp tục PASS: **85 B1, 66 B2, 59 B3, 40 B4** (đều synthetic).
- Node enrollment 43, Cluster 23, telemetry 30 và các bài clone/backup/restore/Termux compatibility vẫn PASS.

## Chưa được nghiệm thu

- SCP thực giữa hai máy Android LAB, Doze, đường truyền gián đoạn, cache/incremental/large files.
- MariaDB GTID replication chạy thật, ánh xạ checkpoint MariaDB ↔ file manifest, full replica.
- Chuyển candidate sang website/Sheet đang phục vụ, phân quyền metadata, rollback khi đang ghi, giới hạn disk trên điện thoại thật.
- HA lease/fencing, manual/automatic switchover, split-brain tests.

Không gọi C1 là file replication production hay `HA-ready` chỉ vì script/test giả lập đạt.
