# Hướng dẫn TEST 0.5.0A cho Vsmart và LAB

## Vsmart đã có MHC TEST 0.4.0D (chỉ nâng cấp mã)

1. Tải file `MHC-Full-Installer-TEST-0.5.0A.zip` về thư mục Windows Downloads.
2. Windows PowerShell (IP thực tế có thể đổi theo Wi-Fi):

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0A.zip" "u0_a180@192.168.100.27:~/"
```

3. Trong Termux Vsmart:

```bash
mkdir -p ~/mhc-test-050a
unzip -q ~/MHC-Full-Installer-TEST-0.5.0A.zip -d ~/mhc-test-050a
cd ~/mhc-test-050a/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Chỉ nhập `TEST_SOURCE_ONLY_UPGRADE` sau khi self-test thành công, marker đã cài hợp lệ và không có STOP. Chế độ này không được chạy trên node production/HA; lưu đường dẫn thư mục rollback in ra. Không chạy `switchover start` trên Vsmart đang phục vụ site `demo`.

4. Kiểm tra không hồi quy:

```bash
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
~/mhc-full switchover status
~/mhc-full hosting-panel plan
```

Nếu plan PASS và bạn muốn hiển thị v0.5A trong **Panel gốc 9090**, chạy riêng `~/mhc-full hosting-panel apply`, nhập `UPGRADE_ORIGINAL_PANEL_LAB`, lưu `ROLLBACK_ID`, rồi `sv restart amh-panel`. Có thể hoàn tác giao diện với `hosting-panel rollback ROLLBACK_ID`; không tự restart Nginx/MariaDB/SSH/Tunnel.

## Máy Termux mới hoàn toàn (không phải Vsmart/M51/X7b hiện có)

Chạy `bash install.sh --plan`, `bash bin/self-test.sh`, sau đó `bash install.sh --install` chỉ khi đúng môi trường sạch và không có dữ liệu. Cần CPU ARM64, Termux chính thức, mạng và dung lượng trống đủ.

## Diễn tập v0.5A

Xem tài liệu `docs/MANUAL-SWITCHOVER-LAB-0.5A.md` trong ZIP. Các lệnh switchover chỉ ghi nhật ký LAB, không thay đổi DB, cloud, traffic hay role. Panel báo `NOT_STARTED` trên Vsmart là trạng thái bình thường.

## Không được suy diễn từ mã

- Chưa nghiệm thu GTID/file replication trên hai Android thật, không đủ điều kiện manual switchover.
- Không bật HA, không đổi route `pro.thophuong.com`, không thay đổi M51/X7b.
