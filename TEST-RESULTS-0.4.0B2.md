# TEST 0.4.0B2 — kết quả thử nghiệm

Môi trường: Linux x86_64 / Node 22, giả lập MariaDB CLI & mariadb-dump trong thư mục tạm; chưa chạy MariaDB thật trên Android.

- `bin/self-test.sh` trên source: PASS, exit code 0.
- `tests/gtid-seed.mjs`: 66 assertions PASS (mock: dump gắn GTID, SHA, thời điểm/checksum, tamper, sai schema, binlog OFF, MyISAM, lỗi dump, production/partial guard).
- `tests/gtid-lab.mjs`: 85 assertions PASS; `tests/panel-http.mjs`: 70 assertions PASS; Node Enrollment 43, Telemetry 30, Cluster 23. Backup/restore, file scanner, clone, Web preview và Android acceptance chạy trong suite và PASS.
- SHA256 chỉ kiểm tra tính toàn vẹn nội dung, không chứng thực nguồn. Snapshot và replica là hai khái niệm khác nhau.

**Chưa nghiệm thu:** Live Termux MariaDB dump và GTID seed trên Vsmart; restore/replication thật giữa hai Android, SQL/IO apply, lag, reconnect; thiết lập GTID, SSH, MariaDB user, Cloudflare/HA. Không thay đổi M51/X7b.
