# Nâng cấp Vsmart LAB lên TEST 0.4.0C2 (chỉ mã nguồn)

Vsmart trước đó đã chạy Hosting Panel gốc 9090 và static site `demo`. **Không cài sạch trên máy đã có dữ liệu.** Bản C2 giữ nguyên website, MariaDB, SSH, Nginx, token đăng nhập và không tự chạy truyền mạng.

**Windows PowerShell:**

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0C2.zip" "u0_a180@192.168.100.27:~/"
```

**Vsmart Termux:**

```bash
mkdir -p ~/mhc-test-040c2
unzip -q ~/MHC-Full-Installer-TEST-0.4.0C2.zip -d ~/mhc-test-040c2
cd ~/mhc-test-040c2/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nếu self-test đạt và preflight không có STOP, nhập xác nhận `TEST_SOURCE_ONLY_UPGRADE`. Installer sao lưu mã cũ vào `~/.local/share/mhc-full-installer/rollback/<timestamp>/`. Lưu đường dẫn này; **không** xóa dữ liệu hoặc marker khi lỗi.

```bash
~/mhc-full doctor
~/mhc-full file-sync peer-status
~/mhc-full serve probe-static demo local.test
~/mhc-full hosting-panel plan
```

Chỉ khi plan PASS và không STOP mới chạy `~/mhc-full hosting-panel apply`, nhập `UPGRADE_ORIGINAL_PANEL_LAB`, lưu `ROLLBACK_ID`, sau đó `sv restart amh-panel`. Nếu gặp lỗi UI, dùng `~/mhc-full hosting-panel rollback ROLLBACK_ID` và khởi động lại `amh-panel`. Không khởi động lại SSH/MariaDB/Nginx để cập nhật trang Cluster.

Vsmart có thể nâng cấp phần mã mà **chưa có node thứ hai**, `file-sync peer-status` trả `NOT_CONFIGURED` là hợp lệ. Không ghép Vsmart với M51/X7b production chỉ để thử truyền file.
