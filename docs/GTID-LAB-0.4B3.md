# MHC v0.4B.3 — LAB Replica Attach & Observation

**Mức nghiệm thu:** Đã có mã và mock tests Linux. **CHƯA có bằng chứng hai MariaDB Android thật đang replicate**. Không áp dụng lên M51, X7b production hoặc Vsmart đang chạy Hosting Panel 9090 + site `demo`.

## Điểm nối tiếp v0.4B.2

B2 tạo seed SQL InnoDB nhất quán theo tọa độ GTID nằm trong **chính dump**, checksum SHA-256 và file `seed.json`. B3 bổ sung:

- `mhc-full replication replica-plan <SEED_DIR>`: **chỉ đọc**. Xác minh seed và schema LAB đã khôi phục, source `server_id` khác replica, `log_bin/gtid_strict_mode/ROW`, `read_only=ON`, `gtid_slave_pos` chính xác seed, `gtid_binlog_pos` rỗng, 1 schema ứng dụng LAB duy nhất, số bảng InnoDB tương ứng seed, không có channel replication cũ.
- `mhc-full replication replica-attach <SEED_DIR> <PRIVATE_PROFILE> --confirm=ATTACH_ISOLATED_GTID_REPLICA_LAB`: **có tác động MariaDB**. Sau khi `replica-plan` đạt và kiểm tra SSH local port, thực thi `CHANGE MASTER TO ... MASTER_USE_GTID=slave_pos` rồi `START SLAVE`. Không đặt lại GTID, không nhập dump, không chạy `RESET SLAVE` và không mở cổng ra mạng. Nếu bước đầu thành công nhưng bước thứ hai thất bại, có thể để lại channel đã cấu hình: cần quản trị viên xử lý thủ công, **không lặp lại lệnh mù quáng**.
- `mhc-full replication replica-observe`: chỉ đọc, xuất thông tin IO/SQL/lag/GTID mode đã lọc, không xuất địa chỉ nguồn hoặc mật khẩu. Panel gốc 9090 → Cluster tiếp tục sử dụng quan sát `lab-status` có sẵn; không có Panel quản trị thứ ba.

**Không tự động nhập SQL, không tạo account replication hoặc SSH Tunnel, không coi lag 0 là GTID/bảng giống nhau; chưa có switchover/failover.**

## Điều kiện nghiêm ngặt TRƯỚC KHI dùng `replica-attach`

1. **Hai điện thoại LAB độc lập, KHÔNG chứa dữ liệu cần bảo toàn**, dùng bản MariaDB mới cách ly. Mỗi máy có backup/rollback đã thử và `server_id` duy nhất. Không dùng M51/X7b hoặc Vsmart đang chạy WordPress/website khác để thử trực tiếp GTID.
2. Source LAB chỉ có schema `mhc_lab_seed`, InnoDB; cấu hình `log_bin`, `gtid_strict_mode`, `binlog_format=ROW`. Dùng B2 `seed-capture` khi không có DDL đồng thời. Seed SQL có thể chứa GTID và lệnh tác động hệ thống, KHÔNG pipe trực tiếp vào MariaDB có dữ liệu khác.
3. Chuyển seed qua SSH đã xác minh host fingerprint. Node nhận chạy `seed-verify` và phục hồi **thủ công** vào một MariaDB LAB trống, hoàn toàn cách ly, với runbook/kiểm tra quyền phù hợp. `--gtid` trong mariadb-dump có thể tạo câu lệnh GTID: đọc dump trước khi thực thi. Đảm bảo sau restore `@@global.gtid_slave_pos` đúng GTID từ seed, `@@global.gtid_binlog_pos` rỗng (ví dụ tắt session binlog cho import trong instance LAB được phê duyệt). Nếu không thể bảo đảm điều này, STOP — không cố sửa vị trí GTID.
4. Đảm bảo node nhận **read_only=ON** và không còn DB ứng dụng nào khác ngoài `mhc_lab_seed`. `replica-plan` phải PASS. Seed checksum chứng minh toàn vẹn, **không chứng minh danh tính nguồn**; xác thực fingerprint SSH và nguồn seed riêng.
5. Source tạo tài khoản replication quyền tối thiểu (`REPLICATION SLAVE`), không dùng root. Thiết lập SSH **local** forwarding độc lập để MariaDB ở replica kết nối source qua `127.0.0.1:<PORT>`; không mở port MariaDB ra LAN/WAN. Khi dùng forward trên node khác phải xác minh fingerprint và account, không gửi bí mật trong chat. Nếu forwarding đứt, MariaDB sẽ thử reconnect; điều này không tự bảo đảm an toàn/failover.
6. Tạo profile **trên replica LAB** (file riêng quyền `0600`), ví dụ ở `~/gtid-lab-profile.json`:

```json
{
  "scope":"MHC_GTID_REPLICA_LAB_ONLY",
  "host":"127.0.0.1",
  "port":33307,
  "user":"mhc_repl_lab",
  "password":"REPLACE_WITH_STRONG_RANDOM_SECRET_20PLUS"
}
```

Đây chỉ là ví dụ cấu trúc; mật khẩu trong ví dụ **không được dùng thật**. Không đưa mật khẩu vào CLI history, file ZIP, GitHub, Cloudflare hoặc chat. `chmod 600 ~/gtid-lab-profile.json`. `replica-attach` từ chối password quá ngắn, host khác loopback, tên account không theo `mhc_repl_*`, file thiếu quyền riêng tư. Các biến môi trường sản xuất/`.env` không được đọc.

## Trình tự lệnh ở REPLICA LAB (sau khi restore seed được nghiệm thu)

```bash
~/mhc-full replication seed-verify "$HOME/gtid-seeds/seed-<UUID>"
~/mhc-full replication replica-plan "$HOME/gtid-seeds/seed-<UUID>"
~/mhc-full replication lab-status
```

**Chỉ khi plan PASS, source tunnel hoạt động và đã phê duyệt việc MariaDB bị thay đổi**, dùng:

```bash
~/mhc-full replication replica-attach \
  "$HOME/gtid-seeds/seed-<UUID>" \
  "$HOME/gtid-lab-profile.json" \
  --confirm=ATTACH_ISOLATED_GTID_REPLICA_LAB

~/mhc-full replication replica-observe
~/mhc-full replication lab-status
```

Đây là lệnh **thay đổi MariaDB**; không chạy để “thử xem” trên instance có dữ liệu. Không chạy `replica-attach` sau lỗi nếu chưa tự đối soát trạng thái channel và rollback.

## Checklist nghiệm thu end-to-end trên hai Android thật

- Ghi nhận `SHOW SLAVE STATUS\G`: Slave_IO_Running=Yes, Slave_SQL_Running=Yes, Using_Gtid=Slave_Pos; `Last_SQL_Errno=0` và `Last_IO_Errno=0`; xác minh server ID khác nhau.
- Tạo một bản ghi thử ở source, quan sát nó xuất hiện trên replica; đối chiếu `@@global.gtid_binlog_pos` nguồn và `@@global.gtid_slave_pos` replica cùng dữ liệu bảng (so sánh bằng truy vấn sau cùng, không chỉ lag=0).
- Ngắt SSH tunnel để thử mất mạng, xác nhận replica ngừng kết nối nhưng không bị thăng Primary; mở tunnel lại rồi kiểm tra tự kết nối, SQL apply, dữ liệu mới, thời gian catch-up.
- Thử restart MariaDB **chỉ trên thiết bị LAB**, xác minh `read_only` và replication guard vẫn đúng. Nếu cấu hình service tự khởi động lại, kiểm tra không tạo ghi cục bộ.
- Không lấy kết quả làm chứng cứ HA/split-brain; phase v0.5/v0.6 đòi hỏi fencing, lease và kiểm tra traffic Cloudflare.

## Dừng/rollback

B3 không xóa dữ liệu khi lỗi. Đừng chạy `RESET MASTER`, `RESET SLAVE ALL`, đổi GTID hoặc xóa relay log theo phỏng đoán. Ngừng kiểm thử ứng dụng LAB nếu sai lệch, lưu log **đã lọc secret**, đối soát, rồi phục hồi instance LAB từ backup trước thí nghiệm nếu cần. Không chỉnh MariaDB production.

Tài liệu MariaDB: https://mariadb.com/docs/server/ha-and-performance/standard-replication/gtid và https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/replication-statements/change-master-to
