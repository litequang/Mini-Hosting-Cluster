# Nâng cấp Vsmart — TEST 0.5.0B2 (chỉ cập nhật mã)

Vsmart `u0_a180@192.168.100.27:8022` đang chạy static site `demo`, vì thế chỉ chạy `self-test` rồi `install.sh --upgrade`. Không chạy `witness bootstrap|renew|freeze` trên Vsmart hay thiết lập Cloudflare Witness production.

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0B2.zip" "u0_a180@192.168.100.27:~/"
```

```bash
mkdir -p ~/mhc-test-050b2
unzip -q ~/MHC-Full-Installer-TEST-0.5.0B2.zip -d ~/mhc-test-050b2
cd ~/mhc-test-050b2/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
# Xác nhận TEST_SOURCE_ONLY_UPGRADE nếu preflight PASS
~/mhc-full doctor
~/mhc-full witness plan
~/mhc-full serve probe-static demo local.test
```

`~/mhc-full witness status` yêu cầu cấu hình và node token LAB; không cần chạy trên Vsmart. Giao diện 9090 là bước độc lập:

```bash
~/mhc-full hosting-panel plan
# Chỉ khi PASS, không STOP:
~/mhc-full hosting-panel apply
# Nhập UPGRADE_ORIGINAL_PANEL_LAB, lưu ROLLBACK_ID
sv restart amh-panel
```

Nếu `hosting-panel plan` cảnh báo, dừng lại; không xóa marker, dữ liệu website hay mật khẩu Panel. `hosting-panel rollback ROLLBACK_ID` áp dụng theo runbook của lệnh tương ứng. Nâng cấp mã không tự restart Nginx/MariaDB, không cài worker và không thay đổi DNS Cloudflare.
