# Runbook v0.4B.4 — Nghiệm thu GTID có chứng cứ trên hai node LAB

## Phạm vi / điều kiện tiên quyết

**Hai Android Termux LAB thực sự độc lập** với MariaDB dành riêng cho thử nghiệm, đã cấu hình B1/B2/B3, seed đúng GTID, `MASTER_USE_GTID=slave_pos`, SSH forward đã xác minh khóa, máy replica read_only ON và đã quan sát IO/SQL. Không dùng M51/X7b production hoặc Vsmart đang phục vụ website `demo` làm môi trường ghi. Không chép `.env`, mật khẩu SQL, private key, DB production hoặc proof chứa metadata nội bộ vào cuộc trò chuyện.

**Chưa có chứng cứ chạy thật:** tất cả lệnh dưới là runbook vận hành trên thiết bị riêng, không phải kết quả đã được thực thi.

## A. SOURCE LAB — chỉ sau khi đã hoàn thành seed + backup

```bash
~/mhc-full replication source-plan mhc_lab_trial
# Nếu PLAN đạt, và chỉ trên SOURCE LAB chuyên biệt:
~/mhc-full replication source-probe mhc_lab_trial --confirm=WRITE_DEDICATED_GTID_LAB_PROBE
```

Lệnh thứ hai CÓ GHI SQL: tạo bảng `mhc_b4_replication_probe` khi chưa tồn tại và INSERT một dòng ngẫu nhiên. Nó trả về đường dẫn tệp proof riêng (quyền 0600) và cờ `sourceGtidAdvanced`. Nếu lỗi, không chạy lại mù quáng vì SQL có thể đã commit. Nên khởi tạo một giao dịch mới chỉ sau khi đối soát trạng thái LAB.

## B. Chuyển proof qua kênh đã tin cậy

Chép tệp `proof-*.json` được tạo đến **HOME của REPLICA LAB** thông qua SSH đã kiểm tra host key và tài khoản LAB riêng. Giữ quyền file 0600; không copy profile/mật khẩu replication. Proof là metadata để đối chiếu một dòng giao dịch, không chứng minh danh tính nguồn nếu kênh trao đổi chưa được xác thực.

## C. REPLICA LAB — kiểm dữ liệu và tiến trình

```bash
~/mhc-full replication replica-observe
~/mhc-full replication replica-check "$HOME/proof-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.json"
```

`replica-check` trả các cờ `rowMatch`, `gtidCaughtUp`, `ioRunning`, `sqlRunning`, `validationPassed`. Nếu chưa bắt kịp, đợi quan sát lại theo giờ thực, không sửa GTID trực tiếp hoặc chạy `RESET SLAVE`.

## D. Thử ngắt và khôi phục kết nối LAB

Trước sự cố, khi IO/SQL và probe đều đã đạt:

```bash
~/mhc-full replication outage-sample baseline "$HOME/proof-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.json"
```

Người quản trị ngắt **chỉ kênh SSH forward LAB** theo quy trình có rollback, không kill runit toàn hệ thống, không chạm WAN/Cloudflare và không ngắt M51/X7b. Khi `replica-observe` ghi nhận IO không chạy, thực hiện:

```bash
~/mhc-full replication outage-sample disconnected "$HOME/proof-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.json"
```

Khôi phục đúng SSH forward, đợi IO/SQL lại chạy, đối chiếu row+GTID và lưu mẫu:

```bash
~/mhc-full replication outage-sample reconnected "$HOME/proof-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.json"
~/mhc-full replication outage-report
```

Ba mẫu phải theo đúng thứ tự. Không chạy lại mẫu cũ để “làm đẹp” kết quả. `completed:true` chỉ là hoàn tất **diễn tập quan sát LAB**, không phải chứng nhận replication full, RPO/RTO, HA hoặc failover.

## E. Nghiệm thu v0.4B trên thiết bị thực

- Hai node thực có ID MariaDB riêng, GTID strict/ROW/binlog, seed đã phục hồi từ đúng snapshot.
- SOURCE phát sinh dữ liệu LAB mới, REPLICA đọc lại đúng một giao dịch và GTID áp dụng tương ứng.
- IO/SQL phục hồi sau ngắt mạng có chủ đích; theo dõi thời điểm quan sát và độ trễ, kiểm tra lỗi SQL.
- So sánh thêm các bảng/row count và checksum dataset riêng, kiểm thử nhiều đợt, chưa được tự động hóa trong B4.
- Không có trạng thái lạ (divergence, local writes trên replica, multiple channels, secret/config public).
- Vẫn **chưa** đạt tiêu chí v0.5/0.6: cần đồng bộ Sheet/files, fencing, lease/edge write gate và chaos tests độc lập.
