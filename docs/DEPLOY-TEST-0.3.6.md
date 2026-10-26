# MHC TEST 0.3.6 — cài đặt, nâng cấp và chạy thử bản clone

**Chỉ dành cho Android aarch64/Termux LAB trống. KHÔNG cài sạch hoặc upgrade trên M51/X7b. Không bật Tunnel hay HA.** Đây là bộ cài All-in-One, không ghép patch.

## 1. Máy TEST hoàn toàn mới

Chép ZIP vào Termux HOME rồi chạy:

```bash
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.6.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
```

Installer giữ marker cài dở nếu bị gián đoạn để không ghi đè mù. Bản này chưa nghiệm thu cài thật trên Android. Tự kiểm tra `--plan` trước khi chấp nhận.

## 2. Máy LAB đã có 0.3.5

Backup/verify dữ liệu LAB của chính máy trước. Không copy `.env`, token, SSH private key hoặc SQL lên chat.

```bash
# giải nén ZIP trong thư mục riêng, không đè source ZIP cũ
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --upgrade
```

Chỉ source/launcher Full Installer được thay; giữ file site, DB, configuration. Upgrade chưa được nghiệm thu trên Android và không được dùng cho production. Bản code có sao lưu rollback trong `~/.local/share/mhc-full-installer/rollback/`.

## 3. Điều kiện clone lab

Hoàn thành enrollment 0.3B, `clone offer` + `clone fetch` + `clone stage` theo runbook 0.3.4. Nếu stage từ 0.3.4 thì phải `reverify-stage` ở 0.3.5. Không dùng snapshot chưa xác minh hoặc máy đang có `~/websites` hoạt động.

```bash
~/mhc-full clone readiness
~/mhc-full clone prepare-lab --confirm=OFFLINE_RESTORE_LAB
~/mhc-full clone lab-status
~/mhc-full clone standby-status
```

Các lệnh trên chỉ đánh giá file/SQL ở kho LAB, không chạy Nginx/Tunnel/DB production.

## 4. Xem website tĩnh tại localhost

```bash
~/mhc-full clone serve-static demo 19880 --confirm=SERVE_LAB_STATIC_ONLY
```

Khi đang chạy, chỉ ngay trên điện thoại LAB: `http://127.0.0.1:19880/`. Muốn mở từ PC dùng **SSH local forward** tới 127.0.0.1, không public port. Bấm `Ctrl+C` để dừng. Chỉ HTTP GET/HEAD; không nhận ghi/upload, file ẩn hay PHP.

## 5. Chuẩn bị WordPress preview (mặc định KHÔNG chạy PHP)

Chỉ khi đã nhập SQL WordPress vào database LAB bằng `clone import-sql-lab blog --confirm=CREATE_NEW_LAB_DB`, và đã tự kiểm tra database. Không chạy lệnh nhập SQL nếu chưa chắc máy LAB không có DB quan trọng.

```bash
~/mhc-full clone wp-plan blog
~/mhc-full clone wp-prepare blog --confirm=PREPARE_DISPOSABLE_WP_LAB
~/mhc-full clone standby-status
```

Bước `wp-prepare` sao chép vào `~/hosting-clones/mhc-full/labs/.../previews/blog`, tạo `wp-config.php` mới chỉ trỏ DB lab. Không sửa `~/websites` và không copy credential cũ. Không ghi đè bản preview đã tồn tại.

### Kiểm tra PHP localhost — chỉ trên điện thoại LAB có thể xóa bỏ

**Cảnh báo:** Code PHP trong WordPress/plugin/theme từ snapshot sẽ được chạy với cùng quyền của Termux; localhost **không cô lập được quyền filesystem hoặc outbound network**. Dùng điện thoại LAB mới, không có secrets production, chỉ khi chấp nhận rủi ro này.

```bash
~/mhc-full clone wp-probe blog --confirm=EXECUTE_RESTORED_PHP_ON_DISPOSABLE_LAB
```

Lệnh chạy PHP CLI development server tạm trên loopback, kết nối DB lab, kiểm HTTP, dừng tiến trình; **không thay thế kiểm thử Nginx/PHP-FPM**, không bảo đảm WordPress hoạt động đầy đủ. Nếu prefix trong `wp-config.php` không xác minh được, sẽ từ chối chuẩn bị tự động. Nếu PHP preview có bất kỳ file nào bị sửa sau khi chuẩn bị, probe từ chối.

## 6. Trạng thái và tiêu chí tiếp tục

- `clone standby-status` luôn báo `standbyReady:false`, `haEligible:false`; không gắn “Primary/Standby live” dựa trên HTTP 200.
- Chưa chạy ứng dụng Thờ Phượng Pro từ snapshot; chỉ báo có/mất file và SQL.
- Cần nghiệm thu riêng trên Android thật: PHP-FPM/Nginx, WordPress admin/media/permalinks/restore; SQL, Sheet/Sheet+, ứng dụng Thờ Phượng Pro; reboot/Doze/pin/tự chạy; snapshot consistency.
- Trước v0.4/v0.5: continuous GTID, incremental assets, fencer trên mọi đường ghi, witness/lease, reverse replication và chaos test. Chưa ARM HA, không mở named-tunnel.
