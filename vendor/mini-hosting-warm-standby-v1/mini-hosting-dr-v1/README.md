# MINI HOSTING — DISASTER RECOVERY KIT v1.0

**Mục tiêu:** Nếu Samsung M51 hỏng, dựng lại Thờ Phượng Pro + Android Mini Hosting Panel trên một điện thoại Android 64-bit khác, từ backup đã xác minh.

**Không phải ứng dụng APK.** Đây là bộ script và mã nguồn để cài trong **Termux từ F-Droid**. Không root. Không sao chép nguyên thư mục ứng dụng Termux giữa các điện thoại.

## 0. Hai thứ PHẢI có bên ngoài M51

1. **Snapshot Thờ Phượng Pro đã xác minh** (`snapshot-...` gồm `database.sql.gz`, `storage.tar.gz`, `app-release.tar.gz`, `SHA256SUMS`, `INFO.txt`). Lần gần nhất đã xác minh: 93 bảng, 5.155 file, khoảng 366 MB. Nên cất **bản mã hóa** bên ngoài M51.
2. **`mini-hosting-recovery.enc`**: xuất **ngay khi M51 còn hoạt động**, chứa mã nguồn/config của Panel thực tế, admin hash, token Named Tunnel, tham chiếu Nginx/Boot/services. Lưu cả **mật khẩu mã hóa** riêng, không gửi qua chat hoặc đính kèm công khai.

Chỉ có backup 366 MB **không đủ** để dựng y nguyên Mini Hosting/Cloudflare; cần cả gói cấu hình mã hóa ở mục 2. Nếu M51 đã hỏng trước khi tạo gói cấu hình, vẫn có thể dựng web từ snapshot và Panel mới, nhưng phải thiết lập lại xác thực/quyền và Cloudflare Tunnel bằng thông tin trong tài khoản Cloudflare.

## 1. Thành phần trong bộ ZIP

- `bin/install-new-phone.sh` — cài Termux packages + Panel dự phòng + services Nginx/SSH/MariaDB/Node, cấu hình nội bộ.
- `bin/export-on-m51.sh` — xuất gói **cấu hình mã hóa AES-256-GCM** từ M51 đang hoạt động.
- `bin/export-snapshot-encrypted.sh` — mã hóa bản snapshot đã VERIFIED để lưu ngoài máy.
- `bin/unpack-encrypted-snapshot.sh` — giải mã và kiểm tra cấu trúc snapshot trên máy mới.
- `bin/restore-new-phone.sh` — phục hồi SQL, Sheet/Sheet+, app release, `node_modules`, Panel mã nguồn hiện tại, khóa và sao lưu định kỳ (ban đầu để tắt).
- `bin/activate-tunnel.sh` — bật Cloudflare **sau khi** kiểm thử nội bộ và xác nhận máy cũ đã ngắt kết nối.
- `bin/health-check.sh` — kiểm tra dịch vụ, HTTP, bảng DB và file Sheet.
- `panel/` — bộ mã nguồn Panel dự phòng v1.3.x, có HTTPS-origin support cho `panel.thophuong.com`.
- `backup/` — các script sao lưu định kỳ hiện đang dùng trên M51.

## 2. Làm NGAY trên Samsung M51 đang hoạt động

Trên **PC Windows PowerShell** (nếu PC cùng LAN với M51, thay IP nếu đổi):

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\mini-hosting-dr-v1.zip" u0_a288@192.168.100.46:~/
```

Sau đó trên **Termux của M51**:

```bash
unzip -o ~/mini-hosting-dr-v1.zip -d ~
bash ~/mini-hosting-dr-v1/bin/export-on-m51.sh
```

Nhập **mật khẩu mã hóa dài ít nhất 16 ký tự**, lưu trong password manager ngoài M51. Kết quả `~/mini-hosting-recovery.enc`.

Mã hóa snapshot VERIFIED mới nhất, ví dụ:

```bash
bash ~/mini-hosting-dr-v1/bin/export-snapshot-encrypted.sh "$(cat ~/hosting-backups/thophuongpro/latest-success-path)"
```

Kết quả `~/snapshot-....tar.gz.enc` (**không** phải `snapshot-...` chưa mã hóa).

Trên **Windows PowerShell** để tải bản mã hóa về PC:

```powershell
scp -P 8022 u0_a288@192.168.100.46:mini-hosting-recovery.enc "$env:USERPROFILE\Downloads\"
scp -P 8022 'u0_a288@192.168.100.46:snapshot-*.tar.gz.enc' "$env:USERPROFILE\Downloads\"
```

Kiểm tra hai file trong Downloads. Lưu thêm một bản trên ổ đĩa khác hoặc kho riêng tư đã bảo vệ; không để bản duy nhất trên điện thoại. Khi snapshot mới được tạo, mã hóa và lưu bản mới ngoài thiết bị hoặc thiết lập Restic/R2 tăng dần.

**Giữ bí mật:** cả backup nguyên gốc và bản mã hóa đều có thể chứa dữ liệu cá nhân. Tuyệt đối không để trong `public_html` hay mở Public Access cho bucket R2.

## 3. Khi M51 hỏng — dựng máy mới

Chuẩn bị **điện thoại Android hiện đại 64-bit ARM (`aarch64`)**. Cài Termux và Termux:Boot cùng nguồn F-Droid. Mở Termux:Boot một lần; tắt giới hạn pin nền cho Termux. Nên sạc và dùng Wi-Fi ổn định.

Chuyển `mini-hosting-dr-v1.zip` sang Termux máy mới (qua PC/SCP khi SSH đã được thiết lập hoặc copy trực tiếp bằng thư mục Download đã cấp quyền), sau đó:

```bash
unzip -o ~/mini-hosting-dr-v1.zip -d ~
bash ~/mini-hosting-dr-v1/bin/install-new-phone.sh
```

**Ghi lại mật khẩu Panel** installer tạo (chỉ hiển thị một lần). Trên máy mới thiết lập mật khẩu SSH nếu cần bằng `passwd`, xác định IP bằng cài đặt Wi-Fi.

Chuyển cả hai file mã hóa từ PC sang `~/recovery-input/` trên máy mới. Ví dụ trong PowerShell:

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\mini-hosting-recovery.enc" TEN_USER@IP_MAY_MOI:~/recovery-input/
scp -P 8022 "$env:USERPROFILE\Downloads\snapshot-XXXX.tar.gz.enc" TEN_USER@IP_MAY_MOI:~/recovery-input/
```

Trong Termux máy mới, giải mã snapshot (nhập đúng mật khẩu đã dùng khi mã hóa snapshot):

```bash
bash ~/mini-hosting-dr-v1/bin/unpack-encrypted-snapshot.sh ~/recovery-input/snapshot-XXXX.tar.gz.enc
```

Thay `snapshot-XXXX...` bằng tên file thực tế; sau đó kiểm tra thư mục `~/recovery-input/snapshot-.../` xuất hiện. Bắt đầu khôi phục (sẽ hỏi mật khẩu mã hóa **cấu hình**):

```bash
bash ~/mini-hosting-dr-v1/bin/restore-new-phone.sh \
  ~/recovery-input/snapshot-TEN_THUC_TE \
  ~/recovery-input/mini-hosting-recovery.enc
```

Script chỉ chấp nhận **database đích đang trống**. Nếu có dữ liệu cũ, script từ chối để tránh xóa nhầm. Đây không phải trình nâng cấp tại chỗ.

## 4. Kiểm tra nội bộ TRƯỚC KHI nối Cloudflare

```bash
bash ~/mini-hosting-dr-v1/bin/health-check.sh
```

Cần có `Node 3000 → HTTP 200`, `Nginx 8080 → HTTP 200`, `Panel 9090 → HTTP 200`, bảng database bằng số lưu trong snapshot; kiểm tra giao diện Dashboard, Google login, ảnh Sheet và Sheet+.

**Phải kiểm tra Panel qua SSH forwarding:**

```powershell
ssh -N -L 9090:127.0.0.1:9090 -p 8022 TEN_USER@IP_MAY_MOI
```

Mở `http://127.0.0.1:9090` trên PC. Panel sẽ dùng hash mật khẩu admin đã được khôi phục từ M51, không phải mật khẩu mới ban đầu. Nếu quên, reset riêng Panel qua công cụ đi kèm sau khi kiểm tra có quyền truy cập hợp lệ.

## 5. Chuyển địa chỉ công khai sang máy mới

- Xác nhận connector Named Tunnel trên M51 cũ **không còn chạy**. Nếu mất máy/nghi lộ token, **xoay vòng token** trong Cloudflare và thay file token trên máy mới trước khi kết nối.
- Trong Zero Trust kiểm tra Published Applications: `pro.thophuong.com` → `http://127.0.0.1:8080`, `panel.thophuong.com` → `http://127.0.0.1:9090`.
- Access app `M51 Hosting Admin` vẫn có policy `Only Owner`, hostname Panel phải bảo vệ bằng Cloudflare Access + Protect with Access/JWT. Không dùng Everyone/Bypass.
- Sau khi kiểm tra:

```bash
bash ~/mini-hosting-dr-v1/bin/activate-tunnel.sh
```

- Truy cập hai domain bằng Chrome ẩn danh. Kiểm tra login, dữ liệu, chức năng upload và quyền.
- Bật dịch vụ backup sau khi toàn bộ kiểm thử đạt:

```bash
sv-enable tpp-backup
sv up "$PREFIX/var/service/tpp-backup"
```

## 6. Giới hạn cần hiểu

- Đây là **bộ cài nguồn/script**, không phải một APK. Đã kiểm tra cú pháp script, mã hóa giải mã và một số cấu trúc file; **chưa kiểm thử phục hồi đầu-cuối trên thiết bị Android mới**. Không cam kết 1-click cho mọi phiên bản Android/Termux.
- Android 32-bit/Android quá cũ, đặc biệt Android 4.x, không thuộc phạm vi hỗ trợ. Công cụ nhắm `aarch64` và Termux hiện đại.
- Nếu package version hoặc Node runtime trên điện thoại mới khác, `npm ci` có thể lỗi native dependencies. Khi đó dừng ở lỗi, không bật Tunnel.
- Script không tự chạy migration schema để tránh sai khác với snapshot. Chỉ phục hồi database đúng snapshot.
- Backup app không bao gồm mọi dữ liệu hệ thống Android và ứng dụng bên ngoài Termux. Termux:API và Termux:Boot APK phải cài thủ công; một số monitor tùy biến có thể cần kiểm tra lại.
- Giữ `mini-hosting-recovery.enc` cập nhật sau khi sửa Panel, Nginx hoặc Named Tunnel; giữ snapshot mới nhất ngoài M51.
- Khôi phục đã VERIFIED về mặt nén không chứng minh mọi tính năng thành công; kiểm tra thật trên điện thoại dự phòng là bắt buộc.
