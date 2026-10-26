# MHC TEST 0.4.0C2 — Release test results

**Nguồn:** MHC-Full-Installer-TEST-0.4.0C1.zip, nâng cấp lên C2. Ngày: 25/10/2026.

## Đã chạy thành công

- Kiểm tra ZIP `ZipFile.testzip()`: PASS; 259 tệp trong bản phát hành.
- Giải nén lại chính ZIP phát hành vào thư mục sạch và chạy `bash bin/self-test.sh`: **PASS, exit code 0**.
- 27 assertions **Peer LAB C2** PASS trong mô phỏng hai `HOME` trên Linux: ghim khóa SSH và receiver ID (SSH giả lập), ngắt rsync giữa chừng rồi thử lại, receiver checksum và receipt, gửi lại cùng ID, chặn gói sửa/symlink/peer đổi ID/source outbox khác inbox, private peer config/journal, không thay đổi replica hoặc websites.
- 22 kiểm tra C1 File Delta LAB: PASS.
- Panel gốc 9090 HTTP test: PASS (session, auth, trường dữ liệu whitelist; có `filePeer` nhưng không xuất địa chỉ SSH hay HA claims).
- GTID B1 85 assertions, GTID Seed B2 66, Replica B3 59, GTID Acceptance B4 40: PASS (theo test giả lập).
- Các bộ test hosting, WordPress LAB, backup/restore, node enrollment, clone, Monitor, Android acceptance cũ: PASS.

## Không được coi là đã nghiệm thu

- Không có SSH/rsync thật qua hai điện thoại Android được thực thi trong container kiểm thử; transport script được thử bằng mock trung thực ở mức argv và hành vi gián đoạn, không phải bài thử mạng thật.
- Chưa đo Throughput, round-trip, Android Doze, Wi-Fi dropout hoặc thử kiểm tra source/receiver filesystem đồng thời trong điều kiện sản xuất.
- Chưa triển khai continuous file sync, chưa tự chọn node nhận, chưa đồng bộ file và MariaDB theo chung checkpoint, chưa mở HA/manual switchover.
- Không gửi ZIP hoặc lệnh nâng cấp tới M51/X7b; không chạy trên Vsmart thật trong lượt này.

**Kết luận:** TEST 0.4.0C2 đủ điều kiện **thử nghiệm trên hai node LAB riêng**, không đủ điều kiện production/HA.
