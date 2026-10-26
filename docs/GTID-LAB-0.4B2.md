# MHC v0.4B.2 — Seed snapshot/GTID + kiểm chứng tại node LAB

**Phạm vi:** Hai thiết bị thử nghiệm Termux độc lập. **KHÔNG dùng trên M51/X7b đang có dịch vụ/dữ liệu production, không dùng snapshot `thophuong_standby_a/b`, không ARM HA.** Đây là bước tiếp theo sau v0.4B.1 (observer/mẫu `.cnf`), chưa phải nghiệm thu MariaDB replication end-to-end.

## Mã mới cung cấp

- `mhc-full replication seed-capture mhc_lab_seed --confirm=CAPTURE_CONSISTENT_LAB_GTID_SEED`: trên **SOURCE LAB**, yêu cầu marker cài LAB đã hoàn tất, không có dấu production/HA, MariaDB đang ghi với `log_bin=ON`, `binlog_format=ROW`, `gtid_strict_mode=ON`, `server_id` khác 0, chưa có kênh replication, và **chỉ có đúng một schema ứng dụng `mhc_lab_seed`** bên cạnh các schema nội bộ. Mọi BASE TABLE trong schema phải là InnoDB. Lệnh `mariadb-dump --single-transaction --master-data=2 --gtid ... --databases mhc_lab_seed` tạo một bản SQL 0600 tại `~/.local/share/mhc-full-installer/gtid-seeds/seed-<UUID>/`, chứa cả `seed.json` 0600. Thời điểm/GTID được lấy **từ dump có `--master-data`**, không gắn một phép đọc GTID phát sinh sau đó. `--master-data` có thể giữ khóa đọc toàn cục ngắn khi lấy tọa độ; chỉ chạy lúc LAB nhàn rỗi, có sao lưu.
- `mhc-full replication seed-verify PATH`: chỉ đọc, kiểm SHA256, kích thước, metadata và GTID gắn trong chính dump. Phát hiện thay đổi/nội dung hỏng, từ chối symlink và quyền file không riêng tư. **SHA256 không chứng minh nguồn gửi đáng tin.** Dấu xác thực SSH cần kiểm tra riêng.
- `mhc-full replication seed-review PATH`: sau khi seed đã được chuyển đến replica LAB, đối chiếu vị trí GTID trong seed với `@@global.gtid_slave_pos` tại local, trạng thái receiver IO/SQL của v0.4B.1 (chỉ đọc). Sự bằng nhau GTID vẫn **không chứng minh SQL đã restore, DB giống nhau hoặc đủ điều kiện HA**.
- `mhc-full replication seed-summary`: chỉ tóm tắt số bản seed nội bộ; trạng thái này đưa vào Panel gốc 9090 → Cluster, không hiển thị SQL, danh sách bảng, đường dẫn, hash hoặc password.

## Quy trình thử nghiệm đúng thứ tự

1. **Hai node LAB riêng**, đã qua nghiệm thu bản 0.4B.1. Trên mỗi máy xác nhận ổn định SSH, MariaDB, backup có thể phục hồi, và dùng `replication gtid`, `replication lab-status`, `replication lab-plan source|replica SERVER_ID` như runbook B1. Tránh dùng cùng `server_id` cho 2 MariaDB. Mọi thay đổi MariaDB config/restart chỉ khi có kế hoạch bảo trì LAB; B2 không tự sửa cấu hình.
2. Tại SOURCE dành riêng GTID, tạo schema `mhc_lab_seed` cùng bảng InnoDB dữ liệu giả, bật log_bin/ROW/strict GTID theo kiểm tra thực tế. **Không** chạy capture nếu MariaDB còn chứa WordPress hoặc ứng dụng thật; công cụ sẽ từ chối.
3. Trên SOURCE: `mhc-full replication seed-capture mhc_lab_seed --confirm=CAPTURE_CONSISTENT_LAB_GTID_SEED`. Lưu đường dẫn thư mục được trả về. Chạy `replication seed-verify <đường-dẫn-được-trả-về>`.
4. Sao chép thư mục seed đến **HOME riêng tư** của REPLICA LAB qua SSH với pinned host key (ví dụ dùng `scp -rp` sau khi xác minh fingerprint), tuyệt đối không gửi SQL vào chat, web public, GitHub hay Cloudflare. Phải bảo toàn quyền 0700 thư mục, 0600 file; dùng đường dẫn mới in từ lệnh sao chép trên replica. Trên REPLICA chạy `replication seed-verify <thư-mục-seed>` lần nữa; không tiếp tục nếu SHA sai.
5. **Import/GTID chỉ theo runbook riêng sau khi kiểm tra MariaDB thật**: B2 không thực hiện restore hoặc `SET GLOBAL gtid_slave_pos`, `CHANGE MASTER`, `START SLAVE`. Dump có thể chứa lệnh thay đổi GTID và KHÔNG được pipe thẳng vào `mariadb` trên instance đang phục vụ dịch vụ. Cần schema rỗng, kiểm GTID dump tương ứng, account replication quyền tối thiểu và SSH local forward bảo vệ. Không tự dùng `MASTER_USE_GTID=current_pos` để bỏ qua dữ liệu chênh lệch.
6. Khi quản trị viên đã cấu hình replication trên 2 máy LAB độc lập, chạy `replication lab-status` và `replication seed-review <path>`. Sau đó **phải** thực hiện thử thay đổi bản ghi từ source, đối chiếu bảng thực tế/hash, GTID apply, lag, ngắt/reconnect mạng và kiểm tra hồi phục. Chỉ coi replication đã được nghiệm thu sau các bước thật đó và có log, không dựa vào `lag=0`.

## Điều kiện dừng

- **Dừng ngay** nếu preflight phát hiện database ngoài `mhc_lab_seed`, thiếu binlog/GTID strict/ROW, engine phi InnoDB, kênh replication sẵn có, snapshot thiếu GTID nhúng, tệp SQL/manifest đổi, thiếu host-key pin, hoặc có dấu production/HA. Không sửa lách guard.
- Không tự cấp quyền ghi, không chuyển Primary, không mở MariaDB qua Internet, không bật Cloudflare public traffic. Đảm bảo snapshot SQL có thể chứa dữ liệu nhạy cảm dù schema được đặt tên LAB; không cho snapshot rơi vào nơi công cộng.
- `--master-data=2`/`--single-transaction` bảo vệ tọa độ đối với InnoDB nếu không có DDL đồng thời; không phải snapshot nguyên tử cho các ứng dụng có file đang được ghi. B2 chỉ nói về SQL LAB. MariaDB phiên bản/đặc quyền khác nhau có thể khiến dump không nhúng GTID mà parser nhận được; công cụ sẽ **fail closed**, không tạo seed sai.

## Phần còn lại theo timeline

- **v0.4B.3:** Quy trình nhập seed và cấu hình GTID replica trên MariaDB LAB cách ly, sau đó chạy kiểm thử dữ liệu/lag/reconnect thật trên 2 Android; tài khoản, SSH port forward, backup và rollback phải được người quản trị kiểm tra.
- **v0.4C:** Incremental File Replication của Sheet/Sheet+ và uploads (checksum, retry, conflict guard).
- **v0.5:** Manual switchover với fencing và Cloudflare routing đã được chứng minh.

Nguồn kỹ thuật: https://mariadb.com/docs/server/ha-and-performance/standard-replication/gtid ; https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/replication-statements/change-master-to
