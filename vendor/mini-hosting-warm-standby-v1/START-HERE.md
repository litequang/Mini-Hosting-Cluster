# Mini Hosting Cluster v0.3 — Update without touching M51 production

1. Find `mini-hosting-cluster-v0.1/HA-V0.3-RUNBOOK.md` for the updated code and safety requirements.
2. Install only the cluster code via `mini-hosting-cluster-v0.1/bin/install.sh` on both existing phones. This DOES NOT activate failover.
3. Inspect `~/mhc ha doctor`, `~/mhc ha status` and `~/mhc status`. HA lease service stays inactive until an explicit safe migration.
4. Bidirectional peer backup receive: `~/mhc ha backup-source ...` then `~/mhc backup-pull`, with independent verified archives, no SQL import.

---

# CLUSTER v0.2 — Bản bổ sung Monitor Online

Trước tiên đọc `mini-hosting-cluster-v0.1/ONLINE-MONITOR-SETUP.md` để cấu hình Monitor Cloudflare. Cùng code trên mọi node; không cài lại website M51.

# Bộ cài máy Android dự phòng — Mini Hosting Warm Standby v1.0

Bộ này gộp hai phần:

- `mini-hosting-dr-v1/`: cài server và khôi phục một lần trên điện thoại Android **mới**, từ bản sao lưu và config M51 đã mã hóa.
- `mini-hosting-standby-sync-v1/`: sau khi phục hồi lần đầu, cài đồng bộ snapshot định kỳ qua SSH từ M51, mỗi 10 phút kiểm tra có bản backup hoàn thành mới.

## Thứ tự sử dụng trên ĐIỆN THOẠI PHỤ

1. Cài Termux, Termux:Boot cùng nguồn F-Droid. Mở Termux và cấp quyền chạy nền. Chuyển ZIP vào Termux home và giải nén.
2. `bash ~/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/bin/install-new-phone.sh`
3. Sao chép `mini-hosting-recovery.enc` và snapshot mã hóa ngoài M51 (đã xuất trên máy M51) vào máy phụ theo hướng dẫn `mini-hosting-dr-v1/README.md`. Giải mã, chạy `restore-new-phone.sh`, thử kiểm tra nội bộ. **Không chạy `activate-tunnel.sh`**.
4. Trên M51 chạy `pkg install rsync`; trên máy phụ chạy `pkg install rsync openssh`.
5. `bash ~/mini-hosting-warm-standby-v1/mini-hosting-standby-sync-v1/bin/setup-standby.sh`
6. Trên máy phụ `~/standby-sync/status.sh`. Đợi dòng `STANDBY PREPARED ...` để xác nhận cập nhật snapshot mới nhất.

## Khi M51 hỏng

Chỉ sau khi chắc chắn M51 không thể tiếp tục nhận ghi dữ liệu thật, trên máy phụ chạy:

`bash ~/mini-hosting-warm-standby-v1/mini-hosting-standby-sync-v1/bin/promote-standby.sh`

Kiểm thử riêng Node + Panel + Sheet/Sheet+. Sau đó mới `bash ~/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/bin/activate-tunnel.sh` (nếu token cũ lộ phải rotate trước).

## GIỚI HẠN

- Đồng bộ snapshot mỗi khi M51 tạo bản backup mới, **không phải dữ liệu từng giây**. M51 hiện backup **mỗi ngày 03:00**, nên dữ liệu dự phòng có thể thiếu thay đổi tối đa gần **24 giờ**.
- Chưa kiểm thử đầu-cuối trên điện thoại Android thứ hai của người dùng. Mã được kiểm tra cú pháp và ZIP. Không cam kết auto failover.
- Tạo 2 DB luân phiên `thophuong_standby_a/b` trên máy phụ, vì vậy phải kiểm thử khả năng app dùng biến `MYSQL_DATABASE` với tên DB này trước khi đưa vào vận hành thật.
- Phải có bản backup + cấu hình được xuất ra ngoài M51, mật khẩu giải mã, kết nối SSH nội bộ và đủ bộ nhớ trống (khuyến nghị >=5 GB).
- Sau khi máy phụ trở thành primary, ngừng đồng bộ từ M51 cũ; không dùng hai Tunnel cùng lúc.

Đọc toàn bộ `mini-hosting-standby-sync-v1/README.md` và `mini-hosting-dr-v1/README.md` để biết đầy đủ các lệnh và lưu ý bảo mật.
