# HƯỚNG DẪN TEST 0.3.11 — VSMART LAB

## Điều kiện
- Máy LAB Termux aarch64 đã cài TEST 0.3.10 thành công, Panel gốc 9090 hoạt động.
- **Không** dùng lệnh dưới đây trên M51/X7b production. Không dùng chế độ cài sạch `--install` trên máy đã cài.
- Không yêu cầu cấu hình Cloudflare; chỉ truy cập 9090 qua SSH forwarding với **cùng cổng 9090**, tránh lỗi `Origin denied`.

## Chuyển ZIP từ Windows
Trong PowerShell ở Windows (không phải Termux):

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.3.11.zip" "u0_a180@192.168.100.27:~/"
```

## Hai bước nâng cấp an toàn trong Termux Vsmart
```bash
mkdir -p ~/mhc-test-0311
unzip -q ~/MHC-Full-Installer-TEST-0.3.11.zip -d ~/mhc-test-0311
cd ~/mhc-test-0311/MHC-Full-Installer
bash install.sh --plan
bash install.sh --upgrade
```
Nhập `TEST_SOURCE_ONLY_UPGRADE` khi được hỏi. Chế độ này tự chạy toàn bộ self-test rồi **chỉ nâng cấp source MHC**, tạo bản lưu tại `~/.local/share/mhc-full-installer/rollback/`, không tự đè Panel 9090.

Kiểm tra kế hoạch chuyển source vào Panel gốc:
```bash
~/mhc-full hosting-panel plan
```
**Chỉ khi có PASS và không có STOP**:
```bash
~/mhc-full hosting-panel apply
```
Nhập `UPGRADE_ORIGINAL_PANEL_LAB`. Ghi lại `ROLLBACK_ID` được lệnh trả về, và chỉ lúc này chạy:
```bash
sv restart amh-panel
sv status amh-panel
~/mhc-full serve probe-static demo local.test
```
Trên Windows, chuyển tiếp cùng cổng (PowerShell riêng):
```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:9090:127.0.0.1:9090 -p 8022 u0_a180@192.168.100.27
```
Vào `http://127.0.0.1:9090`, đăng nhập bằng mật khẩu **Panel gốc**, kiểm tra menu Monitor, Modules, Websites, Backups, Cluster.

## Kiểm tra API (không gửi session cookie vào chat)
- Chưa đăng nhập, `/api/mhc/monitor` phải trả HTTP 401.
- Đăng nhập: Monitor hiển thị phần trăm pin và **nhiệt độ pin**; CPU có thể hiện `—` lúc lấy mẫu đầu.
- Websites phải có `demo` trong nhóm MHC LAB, nhưng không tự gắn nhãn WordPress đã chạy.
- Backups không được tuyên bố checksum đã xác minh nếu mới có bản snapshot.

## Rollback Panel nếu xảy ra lỗi
Nếu đã áp source và có ROLLBACK_ID, dùng chính mã hiện có:
```bash
~/mhc-full hosting-panel rollback ROLLBACK_ID
sv restart amh-panel
```
Nhập `ROLLBACK_ORIGINAL_PANEL_LAB`. Không đoán ROLLBACK_ID, không xóa thư mục marker. Đây là rollback **source Panel**, không hồi phục/ghi đè dữ liệu website hoặc MariaDB.

## Giới hạn nghiệm thu
- Self-test đã chạy trong Linux phát triển; chỉ log/chứng cứ trên chính Vsmart mới xác nhận bản này vận hành thật.
- Các API mới chỉ quan sát, không đổi Primary, không mở Tunnel, không nhập SQL, không tự gia nhập production Cluster.
