# MHC TEST 0.4.0A — Test results

## Môi trường
- Tự chạy tại sandbox Linux với Node.js, Python3, shell, dữ liệu và HOME thử nghiệm tạm thời. Không có quyền truy cập hệ thống Termux Vsmart, M51, X7b hay DB/Cloudflare production.
- Không giả định một script PASS là chứng cứ tính năng Android đã chạy thật.

## Kết quả ở nguồn
- `bash bin/self-test.sh` → PASS, exit code 0.
- Original Panel 9090: HTTP integration với cookie login + unauthenticated 401; API replication chỉ trả tổng hợp, không xuất file paths/SHA, không tuyên bố HA.
- 0.4A observer: mock MariaDB GTID SELECT, snapshot hash initial, so sánh thêm/sửa/xóa, bỏ qua `.env`, symlink fail-closed, scan lỗi không thay manifest trước, mode 0600.
- Hồi quy cũ: 70 Panel HTTP assertions; 43 Enrollment assertions; 30 Telemetry assertions; 23 Cluster summary assertions; snapshot clone/restore/backup, site configs, Android acceptance giả lập đều PASS.

## Giới hạn
- Không nghiệm thu MariaDB/GTID truy vấn socket trên Vsmart thực, performance của SHA quét Sheet/Sheet+, hoặc thao tác upgrade + apply Panel 9090 trên Android thật.
- Không thực hiện GTID replication, đồng bộ delta SSH, restore MariaDB production, switchover, failover, Cloudflare hoặc HA ARM.

## Hướng nghiệm thu trên Vsmart
`~/mhc-full replication gtid`, `~/mhc-full replication scan`, `~/mhc-full replication status`, `~/mhc-full hosting-panel plan/apply` (chỉ khi preflight PASS), `sv restart amh-panel`, kiểm 9090 Cluster + `serve probe-static demo local.test`. Không gửi `.env`/token/full manifest.
