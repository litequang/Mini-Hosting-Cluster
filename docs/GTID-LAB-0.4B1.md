# MHC v0.4B.1 — MariaDB GTID LAB: preflight, observer và mẫu cấu hình

**Đối tượng:** Hai máy Android Termux **LAB độc lập, không chứa ứng dụng, khóa hay dữ liệu production**. TEST 0.4.0B1 không tự triển khai replication. M51/X7b production nằm ngoài phạm vi.

## Mã đã hoạt động (ở mức chức năng)

- `~/mhc-full replication gtid`: đọc biến server_id, binlog, read_only và vị trí GTID tại MariaDB local.
- `~/mhc-full replication lab-status`: đọc `SHOW ALL SLAVES STATUS\G` (nếu cần fallback `SHOW SLAVE STATUS\G`), lọc toàn bộ `Master_Host`, `Master_User`, mật khẩu và chuỗi lỗi SQL; chỉ trả về trạng thái IO/SQL, lag, kiểu GTID, số kênh, mã server-id được cho phép. `STREAMS_RUNNING_UNVERIFIED` **không** phải dữ liệu bằng nhau.
- `~/mhc-full replication lab-plan source 101` và `... lab-plan replica 102`: chỉ tạo **file mẫu** cấu hình 0600 trong `~/.local/share/mhc-full-installer/gtid-lab/`. Nếu file trùng tên sẽ từ chối ghi đè. Không thay đổi my.cnf, database, database user, bind-address, mở port, service, tunnel hay HA.
- Panel gốc 9090 → Cluster: mục v0.4B.1 để xem dữ liệu receiver đã lọc, cần nâng cấp Panel qua `hosting-panel plan/apply`, giữ quyền đăng nhập cũ.

## Quy trình nghiệm thu GTID thật trên hai node LAB (thao tác thủ công, có xác minh)

1. **Chọn hai node LAB riêng.** Không dùng M51/X7b hoặc snapshot production Thờ Phượng Pro. Kiểm tra chỉ có database mẫu và dung lượng còn trống. Bảo toàn mỗi node bằng backup được xác minh và thử restore ở schema LAB trước khi tiếp tục.
2. Ở node LAB nguồn: `~/mhc-full replication gtid`, `~/mhc-full replication lab-status` và `~/mhc-full replication lab-plan source 101`. Ở node LAB nhận: tương tự, nhưng `lab-plan replica 102`. ID 101/102 là ví dụ; phải chọn **hai số khác nhau** không trùng server nào trong topology. Đọc file mẫu để biết `server_id`, `log_bin`, ROW, `gtid_strict_mode`, `log_slave_updates`; replica có `read_only=ON`, `skip_slave_start=ON`.
3. Việc đưa file mẫu vào cấu hình MariaDB và khởi động lại mysqld cần **maintenance riêng**, xác định file cấu hình mà bản Termux đang thực sự đọc. Chỉ làm sau khi backup có thể phục hồi. Sau restart kiểm bằng `gtid` thay vì tin `my.cnf`. Không mở cổng MariaDB ra Internet. `read_only` không thay thế lớp fencing quyền ghi.
4. Trên node nguồn tạo database LAB và tài khoản replication **chỉ có quyền replication cần thiết**. Giới hạn tài khoản theo đường kết nối đáng tin cậy. SSH từ replica đến source phải được ghim host key, dùng key riêng được giới hạn quyền; tùy môi trường dùng SSH local forward tới MariaDB chỉ bind localhost. Không gửi password, SSH private key hay SQL dump trong chat, không đưa password vào command history.
5. Chụp **snapshot dữ liệu và GTID đồng nhất tại một thời điểm** từ nguồn (lưu cả tọa độ binlog/GTID). Khôi phục snapshot này vào **database replica rỗng**. Không gán `gtid_slave_pos` theo quan sát phỏng đoán hoặc từ một snapshot khác. Không sử dụng snapshot `thophuong_standby_a/b` làm GTID canonical source.
6. **Chỉ sau khi đối chiếu snapshot + vị trí GTID + điều kiện kết nối**, quản trị viên mới tự cấu hình `CHANGE MASTER TO ... MASTER_USE_GTID=slave_pos` theo phiên bản MariaDB thực tế và `START SLAVE` trên **node LAB nhận**. MHC TEST 0.4.0B1 không chạy hai lệnh này. Tránh `current_pos` khi chưa hiểu hệ quả của giao dịch local.
7. Theo dõi `~/mhc-full replication lab-status`: `ioRunning=true`, `sqlRunning=true`, `usingGtid=SLAVE_POS`, không có errorCode. Tạo một thay đổi nhỏ trong database LAB nguồn, kiểm tra bản ghi thực tế trên replica, đối chiếu checksum, GTID và trễ ở nhiều thời điểm. Thử ngắt/kết nối lại **SSH tunnel trong LAB** rồi so sánh lại. Dù lag 0, chưa đủ chứng minh hai DB bằng nhau.
8. Không mở Tunnel sản xuất, không đưa replica lên Primary và không ARM HA. Sau khi hoàn thành thử nghiệm ghi nhật ký thao tác/GTID trong kho nội bộ an toàn, không gửi secret lên chat.

## Chốt an toàn / Giới hạn

- Chưa có auto-provision MariaDB, replication credentials, source snapshot+coordinate handoff, tự kiểm chứng dữ liệu hay `START SLAVE` qua Panel. Không tự động tái cấu hình nguồn khi mạng đứt.
- `SHOW SLAVE STATUS` có thể không khả dụng tùy phiên bản/đặc quyền MariaDB; trường hợp đó trả `UNOBSERVABLE` và không báo PASS.
- `Seconds_Behind_Master` có thể NULL/0 hoặc không phản ánh dữ liệu đã áp dụng; chỉ là một phép đo cục bộ.
- Một node Standby có SQL/IO thread RUNNING không có nghĩa đủ điều kiện HA. Cần kiểm chứng GTID nguồn/đích cùng tính toàn vẹn files, quyền ghi, lease, edge fencing và thử network partition mới được cân nhắc ở v0.5/v0.6.
- Tiếp theo trong timeline: **v0.4B.2** (LAB provisioning có backup + gắn GTID đồng nhất được xác minh), rồi **v0.4C** (file delta replication an toàn), sau đó v0.5 Manual Switchover.

## Nguồn MariaDB chuẩn để đối chiếu khi thực hành

- MariaDB `CHANGE MASTER TO`: https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/replication-statements/change-master-to
- MariaDB GTID: https://mariadb.com/docs/server/ha-and-performance/standard-replication/gtid
