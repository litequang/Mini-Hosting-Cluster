# Hướng dẫn nâng cấp MHC TEST 0.5.0B4 trên Vsmart

**Máy LAB Vsmart có website `demo`: chỉ nâng cấp mã.** Không chạy `write-gate init`, bất cứ lệnh `*-write`, `witness bootstrap`, cấu hình GTID attach hoặc chuyển Primary tại đây. M51/X7b production KHÔNG được nâng cấp từ bản LAB này.

## 1. Chuyển ZIP từ Windows PowerShell

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0B4.zip" "u0_a180@192.168.100.27:~/"
```

## 2. Giải nén và thử mã trước khi nâng cấp

```bash
mkdir -p ~/mhc-test-050b4
unzip -q ~/MHC-Full-Installer-TEST-0.5.0B4.zip -d ~/mhc-test-050b4
cd ~/mhc-test-050b4/MHC-Full-Installer
bash bin/self-test.sh
```

Nếu self-test không hoàn tất thành công thì dừng, không cài tiếp. Trên thiết bị thật có thể cần thời gian chạy các bài test; tuyệt đối không vượt qua preflight, không xóa marker.

## 3. Chỉ nâng cấp mã đã quản lý

```bash
bash install.sh --upgrade
```

Chỉ nhập `TEST_SOURCE_ONLY_UPGRADE` nếu preflight không có STOP. Installer sao lưu trước mã cũ vào `~/.local/share/mhc-full-installer/rollback/<timestamp>`; không chạy `install.sh --install` trên máy đã có dữ liệu.

## 4. Kiểm tra sau nâng cấp (chỉ đọc)

```bash
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
~/mhc-full write-gate plan
~/mhc-full write-gate status
```

Giao diện Panel **gốc 9090** cập nhật riêng qua:

```bash
~/mhc-full hosting-panel plan
```

Chỉ khi PASS/no STOP mới chạy `~/mhc-full hosting-panel apply`, nhập `UPGRADE_ORIGINAL_PANEL_LAB`, lưu `ROLLBACK_ID` để phục hồi khi cần. Sau khi áp mã Panel, khởi động lại riêng dịch vụ bằng `sv restart amh-panel`. Giữ mật khẩu/phiên đăng nhập Panel cũ. Không khởi động lại MariaDB/Nginx hay các dịch vụ hosting chỉ vì nâng cấp source B4.

## 5. Dùng các adapter mới chỉ trên LAB trống hoàn toàn

Đọc `docs/WRITE-PATH-ADAPTERS-0.5B4.md` trong ZIP. LAB phải có witness HTTPS đã cấu hình riêng, private node token, không có website đã đăng ký và không có dấu hiệu HA/production. Các file ghi ra chỉ là **dữ liệu mẫu cách ly**, không được đồng bộ hoặc phục vụ trực tiếp cho website.

## 6. Tình trạng timeline

B4 = triển khai ba adapter file LAB giả lập bổ sung; **chưa hoàn tất All-Write-Path Fencing**. Cần nghiệm thu 2 node Android LAB thật và independent fence trước v0.5C/v0.6.
