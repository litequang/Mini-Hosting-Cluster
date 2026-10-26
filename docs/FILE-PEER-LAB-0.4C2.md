# MHC v0.4C.2 — Peer Transfer & Resume: runbook hai node LAB

**Phạm vi:** Hai điện thoại Android/Termux TEST riêng, KHÔNG là M51 hoặc X7b production. Giao thức chỉ chấp nhận delta C1 trong `~/mhc-file-lab/`. Không nhân bản hay ghi file WordPress/Thờ Phượng Pro đang chạy.

## 0. Điều kiện trước

- Cả hai máy cài hoặc nâng cấp **MHC TEST 0.4.0C2** và có `rsync`, `ssh`, Node.js.
- Trên receiver LAB: SSH đang chạy với tài khoản dành riêng cho LAB, khóa SSH công khai nguồn đã được cho phép. Trên sender: SSH host key receiver đã được xác minh thủ công và nằm trong `~/.ssh/known_hosts`. Không dùng `StrictHostKeyChecking=no` hay `accept-new` để bỏ xác minh.
- Mỗi máy có root `~/mhc-file-lab` là thư mục thật, không symlink. Không chạy nếu có `.env` Thờ Phượng Pro hoặc HA config trên máy.
- Chưa tự tạo baseline và chưa có chức năng tự thêm member cluster trong bước C2. Không cấp quyền production cho account nhận.

## 1. Chuẩn bị baseline C1 (một lần)

Máy nhận B (receiver), trước khi thay đổi dữ liệu nguồn:

```bash
mkdir -p ~/mhc-file-lab/replica
printf 'sheet-v1\n' > ~/mhc-file-lab/replica/001.musicxml
~/mhc-full file-sync manifest replica
~/mhc-full file-sync peer-init
```

Lưu tên `replica-<timestamp>-<id>.json` từ output manifest và **receiverId** (32 ký tự hex) từ `peer-init`. Không phải token bí mật, nhưng dùng chính xác để ghim danh tính LAB receiver.

Máy A (source LAB):

```bash
mkdir -p ~/mhc-file-lab/source ~/mhc-file-lab/reports
printf 'sheet-v1\n' > ~/mhc-file-lab/source/001.musicxml
```

Chuyển file baseline `replica-*.json` từ `~/mhc-file-lab/reports/` trên B tới `~/mhc-file-lab/reports/` của A bằng SCP **qua SSH đã ghim khóa**, hoặc PC trung gian tin cậy. Đây còn là bước thủ công của C1; không được dùng baseline không tương ứng thư mục replica B.

## 2. Cấu hình peer từ máy A

```bash
# Trước đó hãy xác minh fingerprint khóa SSH thực tế của B qua kênh tin cậy.
# Không tự động chấp nhận khóa mới.
~/mhc-full file-sync peer-config SSH_USER_B IP_B 8022 RECEIVER_ID_B
~/mhc-full file-sync peer-status
```

Ví dụ `SSH_USER_B`, `IP_B`, `RECEIVER_ID_B` là **placeholder**, phải thay bằng giá trị máy LAB B thật. `peer-config` xác minh đăng nhập SSH **BatchMode**, strict host key, so sánh receiver ID; ghi cấu hình 0600 và không tự ghi đè cấu hình đã tồn tại. Yêu cầu SSH public-key đăng nhập được mà không hỏi mật khẩu.

## 3. Xuất delta ở A, truyền và tự thử lại

```bash
printf 'sheet-v2\n' > ~/mhc-file-lab/source/001.musicxml
printf 'upload-mau\n' > ~/mhc-file-lab/source/anh.png
~/mhc-full file-sync bundle replica-TIMESTAMP-ID.json
~/mhc-full file-sync verify-outbox delta-ID
~/mhc-full file-sync peer-send delta-ID
~/mhc-full file-sync peer-status
```

Thay hai tên ví dụ bằng **basename manifest và delta ID được xuất ra thực tế**, không nhập nguyên `delta-ID`. Khi `peer-send` bị ngắt, có thể chạy **lại cùng lệnh với đúng delta ID**. Chương trình không xóa bản nhận dở; rsync tái sử dụng dữ liệu đã chuyển, receiver chỉ công bố bản nhận hoàn chỉnh sau khi kiểm SHA-256.

## 4. Đối soát máy B

```bash
~/mhc-full file-sync peer-status
~/mhc-full file-sync verify delta-ID
~/mhc-full file-sync stage delta-ID
```

`stage` dựng candidate **offline** ở `~/mhc-file-lab/candidates/<delta-id>` sau khi so baseline với replica B. Nếu B đã có khác biệt, `stage` từ chối. Không có thao tác chuyển candidate vào website phục vụ hoặc áp dụng tombstone lên thư mục replica gốc.

## 5. Diễn tập và phân loại kết quả

- Ngắt Wi-Fi giữa `peer-send` → kết quả `INTERRUPTED_RETRYABLE`; không được có `inbox/<id>` hoàn chỉnh. Khi mạng trở lại chạy lại `peer-send`.
- Tạo symlink hoặc sửa 1 byte trong thư mục `pending-<id>` → receiver từ chối hoàn tất.
- Gửi lại cùng ID đã xác minh → `REMOTE_ALREADY_VERIFIED`, không tạo bản sao trùng hoặc ghi đè.
- Sau khi nhận, sửa B `replica/001.musicxml` → `stage` phải từ chối baseline diverged.
- `peer-status` chỉ phản ánh **journal đã ghi**, không phải polling mạng thời gian thực, chứng nhận DB GTID hoặc RPO.

## 6. Security và hạn chế

- Trao đổi chỉ qua SSH đã xác minh key và receiver identity; `rsync` không giới hạn shell account ở máy nhận. Sử dụng account LAB không có quyền production.
- Không đưa `.env`, wp-config, password, private key, dumps DB vào LAB. C1 có chốt chặn file nhạy cảm, nhưng đây chưa phải công cụ sao chép đầy đủ server.
- Không có tự động chạy nền, phần trăm tiến độ byte, retention/GC, bandwidth cap, mã hóa file riêng tầng ứng dụng, xác thực request bằng token ứng dụng hay phối hợp GTID.
- Không cài sạch/restore/upsert vào M51, X7b; không bật Cloudflare Tunnel, HA, Failover, `CHANGE MASTER`.
