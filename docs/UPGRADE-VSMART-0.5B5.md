# Nâng cấp source-only trên Vsmart — TEST 0.5.0B5

Máy Vsmart đang chạy website `demo`: **chỉ thay source MHC; không chạy http-gate init/serve, write-gate init, GTID attach hoặc switchover.** Không chạy installer LAB trên M51/X7b production.

## Trên Windows PowerShell

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0B5.zip" "u0_a180@192.168.100.27:~/"
```

## Trong Termux Vsmart

```bash
mkdir -p ~/mhc-test-050b5
unzip -q ~/MHC-Full-Installer-TEST-0.5.0B5.zip -d ~/mhc-test-050b5
cd ~/mhc-test-050b5/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Chỉ nhập `TEST_SOURCE_ONLY_UPGRADE` nếu self-test/preflight đạt. Installer sao lưu code cũ dưới `~/.local/share/mhc-full-installer/rollback/`; không thay MariaDB, WordPress, Cloudflare, Nginx hoặc các website đang chạy. Tuyệt đối không dùng `--install` trên máy đã cấu hình.

Kiểm tra chỉ đọc:

```bash
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
~/mhc-full http-gate plan
~/mhc-full http-gate status
~/mhc-full write-gate plan
```

**Cập nhật Panel gốc 9090 riêng:** `~/mhc-full hosting-panel plan`; chỉ sau PASS/no STOP mới chạy `~/mhc-full hosting-panel apply`, nhập `UPGRADE_ORIGINAL_PANEL_LAB`, lưu lại `ROLLBACK_ID`, rồi `sv restart amh-panel`. Nếu có lỗi, dùng `~/mhc-full hosting-panel rollback ROLLBACK_ID` và restart riêng `amh-panel`. Giữ nguyên admin/password Panel hiện tại. Không cần restart MariaDB hoặc Nginx.

Tính năng HTTP B5 chỉ dùng trên một LAB không chứa website hoặc dấu hiệu production/HA và có witness riêng; xem `docs/HTTP-WRITE-GATE-LAB-0.5B5.md`.
