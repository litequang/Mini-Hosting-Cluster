# MHC v0.4C.1 — Incremental File Delta LAB (STAGED ONLY)

## Mục đích và giới hạn

Bước sau GTID acceptance B4, vẫn **chưa nghiệm thu GTID giữa hai điện thoại LAB thật**. C1 bổ sung cơ chế so manifest SHA-256, đóng gói file thêm/sửa (không truyền lại file không đổi), vận chuyển gói qua SSH do người quản trị thiết lập và dựng **candidate trong thư mục LAB riêng**. Đây **không** phải đồng bộ file liên tục, không cùng checkpoint với MariaDB, không phải full replica hoặc Standby HA.

- **Không thay file website, DB, Sheet của M51, X7b hoặc Vsmart đang phục vụ.** Không khởi động/dừng Nginx/PHP/MariaDB, không đổi Cloudflare, không nhập SQL, không chuyển Primary.
- Chỉ được chạy trong `$HOME/mhc-file-lab/`. Script không cho tham số nguồn/đích tùy ý. Không đọc `~/apps/thophuongpro`, `~/websites` hay `~/.env`.
- Mọi symlink, device/FIFO, tệp/thư mục ẩn và tên bí mật như `.env`, `wp-config.php` bị chặn, không tự sao chép. C1 dành cho **nội dung thử nghiệm không nhạy cảm** như Sheet mẫu, ảnh upload giả lập, bản build tĩnh. Chưa hỗ trợ toàn bộ file ứng dụng/cấu hình cần thiết cho production.
- Metadata và payload đặt trong thư mục thuộc Termux HOME, thường không mã hóa ở tầng ứng dụng. Hạn chế quyền truy cập thiết bị; không chuyển snapshot production qua kênh này.
- File SHA-256 kiểm tra tính toàn vẹn, **không xác nhận người gửi hợp lệ**. Chỉ trao đổi qua SSH dùng known_hosts/host fingerprint đã được xác minh và user được cấp phép; không tắt `StrictHostKeyChecking`.

## Bố trí LAB trên hai node

Node A (source TEST):

```bash
mkdir -p "$HOME/mhc-file-lab/source" "$HOME/mhc-file-lab/reports"
printf 'sheet-v1\n' > "$HOME/mhc-file-lab/source/001.musicxml"
```

Node B (receiver TEST):

```bash
mkdir -p "$HOME/mhc-file-lab/replica" "$HOME/mhc-file-lab/inbox"
printf 'sheet-v1\n' > "$HOME/mhc-file-lab/replica/001.musicxml"
~/mhc-full file-sync manifest replica
```

Báo cáo manifest đặt tại `~/mhc-file-lab/reports/replica-*.json` trên B, quyền riêng tư 0600. Sao chép manifest này **từ B sang `~/mhc-file-lab/reports/` của A** bằng SCP qua đường SSH đã xác minh. Có thể làm qua PC trung gian tin cậy hoặc sao chép trực tiếp. Không ghi đè manifest có sẵn; giữ tên file tạo tự động.

## Tạo gói delta trên node A

```bash
printf 'sheet-v2\n' > "$HOME/mhc-file-lab/source/001.musicxml"
printf 'upload-moi\n' > "$HOME/mhc-file-lab/source/anh.png"
~/mhc-full file-sync bundle replica-TIMESTAMP-ID.json
```

Thay `replica-TIMESTAMP-ID.json` bằng **tên thật** đã copy vào `~/mhc-file-lab/reports/` trên A. Kết quả hiển thị `id`, ví dụ `delta-...`. Gói nằm ở `~/mhc-file-lab/outbox/<id>/` với `payload/` chỉ chứa file thêm/sửa và `meta.json` có manifest của cả bản trước/sau. File đã xóa được thể hiện trong danh sách tombstone `removed` và **chỉ xóa khỏi candidate cách ly**, không chạm vào thư mục replica đang chạy.

Xác minh tại A:

```bash
~/mhc-full file-sync verify delta-ID-THUC-TE
```

## Chuyển gói sang B

Sử dụng `scp -P 8022 -r ...` trên máy tính hoặc máy nguồn, với tài khoản SSH và địa chỉ của **LAB B**, sau khi đã xác minh SSH host key. Đích phải là `~/mhc-file-lab/inbox/`, thư mục được tạo trước. `scp` sao chép nguyên thư mục `delta-ID/`. **Không dùng rsync --delete và không truyền vào thư mục website đang hoạt động.**

Trên B:

```bash
~/mhc-full file-sync verify delta-ID-THUC-TE
~/mhc-full file-sync stage delta-ID-THUC-TE
~/mhc-full file-sync status
```

`stage` từ chối khi nội dung `~/mhc-file-lab/replica/` đã khác manifest nền. Nó chỉ dựng thư mục candidate mới tại `~/mhc-file-lab/candidates/<id>/` và đối chiếu **tất cả file của candidate**. Nó không copy dữ liệu candidate sang thư mục replica, không áp dụng trên website hoặc database và không đánh dấu `HA-ready`. Chạy lại cùng ID sẽ từ chối ghi đè.

## Kiểm thử mất kết nối và xung đột

1. Gửi thiếu một file trong `payload/` → `verify`/`stage` phải từ chối.
2. Sửa một byte của file trong gói → checksum phải từ chối.
3. Sửa file trong `replica/` sau khi xuất baseline → `stage` phải từ chối vì divergence.
4. Sau khi chuyển thành công, ngắt SSH trước khi chạy `stage` → node B vẫn giữ nguyên `replica/`; có thể gửi lại đầy đủ gói (không ghi đè bản đã xác minh).
5. Không được dùng kết quả file candidate để suy ra GTID DB đã bắt kịp, RPO hoặc khả năng chuyển Primary.

## Chức năng còn thiếu sau C1

- Kết nối delta với source snapshot/GTID chính xác, checkpoint version và journal atomic.
- Vận chuyển nền theo lịch có xác thực riêng từng node, resume/retention/tombstone có cơ chế rollback.
- Apply vào standby một cách nhất quán cùng MariaDB, reverify và kiểm tra toàn bộ nội dung.
- Nghiệm thu hai máy Android, mạng gián đoạn, Android Doze, tối ưu danh sách file rất lớn.
- ACL/metadata/symlink policy, file mode/executable, sparse file, đường dẫn Unicode phức tạp, dung lượng và ứng dụng đặc biệt.

Đây là **v0.4C.1 LAB**, không phải v0.4C production hoặc GTID-ready Standby.
