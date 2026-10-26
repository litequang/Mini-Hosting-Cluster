# MHC TEST 0.4.0B1 — v0.4B.1 MariaDB GTID LAB Foundation

Nền: `MHC-Full-Installer-TEST-0.4.0A.zip`. Một mã nguồn/bộ cài chung, không phải patch.

## Added
- `bin/gtid-lab.mjs`: `replication lab-status` đọc địa phương `SHOW ALL SLAVES STATUS` (fallback nếu không khả dụng), phân biệt không cấu hình, chưa quan sát được, IO/SQL stopped/error, và IO/SQL hoạt động chưa xác minh dữ liệu.
- Redact master hostname, username, password, SQL errors và nhãn kênh; không xuất raw replica status. Giới hạn số channel, bộ đệm và thời gian truy vấn; không có lời gọi thay đổi SQL.
- `replication lab-plan source|replica SERVER_ID`: mẫu `.cnf` chmod 0600; tách binlog/relay, đề xuất read_only/skip_slave_start cho replica; chặn marker TEST không hợp lệ, dấu production/HA, symlink và ghi đè mẫu cũ.
- Panel 9090 gốc → Cluster thêm khối Receiver GTID LAB chỉ đọc, giữ session cũ, qua quy trình `hosting-panel plan/apply/rollback`.
- `tests/gtid-lab.mjs`: 85 assertion cho status, lag, nhiều channel, chặn secrets, id lỗi và dấu production.
- Runbook 2 node LAB `docs/GTID-LAB-0.4B1.md`.

## Retained
- V0.4A observer cục bộ (GTID variables và content SHA-256), WordPress LAB, Static Hosting, backup/restore, enrollment, clone, Monitor, Panel gốc.
- Source-only LAB upgrade, bản sao rollback mã, và upgrade Panel chỉ khi `hosting-panel plan` đạt.

## NOT done
- Chưa tự tạo MariaDB GTID replication, chưa áp `CHANGE MASTER`, chưa cấp replication credentials, chưa có snapshot+GTID handoff đã nghiệm thu.
- Chưa có nguồn/replica test 2 Android thật, chưa file delta replication, chưa chạy traffic edge fencing, chưa quyền Primary/failover.
- M51/X7b production không được sửa.
