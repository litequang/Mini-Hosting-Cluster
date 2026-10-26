# MHC TEST 0.4.0B1 — Kiểm thử phát hành

**Môi trường:** Linux x86_64 container, Node.js 22; mô phỏng MariaDB CLI cho bài kiểm thử GTID. Không phải Android Termux, không có MariaDB replica thật hoặc Cloudflare production.

**Tổng hợp:** `bin/self-test.sh` chạy PASS, exit code 0, trên cây source sửa đổi. `tests/gtid-lab.mjs`: 85 assertion PASS; HTTP Panel: 70 assertion PASS; Node Enrollment: 43 assertion PASS; telemetry: 30 assertion PASS; Cluster summary: 23 assertion PASS. Các nhóm backup/restore, static site, clone, offline readiness, Android acceptance, JS syntax cũng PASS. Các con số đại diện cho **test assertions**, không phải tỷ lệ chức năng chạy production.

### Kịch bản mới đã thử

- Replica không cấu hình, đang có IO/SQL, IO lỗi, lag `NULL`, nhiều channels; luôn `continuousReplicationVerified=false`, `haEligible=false`.
- Output giả chứa `Master_Host`, `Master_User`, `Master_Password`: không xuất các chuỗi bí mật qua CLI.
- Mẫu source/replica `.cnf` 0600, có server-id duy nhất theo input, từ chối input nguy hiểm và từ chối ghi đè mẫu.
- STOP khi có `.env` Thờ Phượng Pro hoặc marker cài chưa hoàn tất.
- Giao diện Panel 9090 chạy test đăng nhập và API chỉ đọc trong fake HOME (không sử dụng production DB hoặc SSH thật).

### Chưa đạt bằng chứng nghiệm thu

- Chưa có thử nghiệm `START SLAVE` / `CHANGE MASTER` hay GTID catch-up trên hai MariaDB Android thật.
- Chưa thử PHP/WordPress mới, mở VPN/SSH tunnel LAN, độ trễ receiver thật, phục hồi sau ngắt mạng hoặc dữ liệu diverge.
- Chưa triển khai trên Vsmart; M51/X7b không bị truy cập/chỉnh sửa.

**Quy tắc báo cáo:** `STREAMS_RUNNING_UNVERIFIED` chỉ có nghĩa SQL+IO thread đã được quan sát từ kết quả truy vấn local và chưa có lỗi được báo; KHÔNG phải replica sẵn sàng chuyển Primary.
