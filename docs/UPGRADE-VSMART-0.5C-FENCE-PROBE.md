# Nâng cấp mã Vsmart LAB — FENCE-PROBE

**CHỈ SOURCE-ONLY**, trên Vsmart đang có site `demo`; không khởi tạo hoặc dùng `fence-probe capture` trên máy này. Không cài sạch.

Windows PowerShell: `scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0C-FENCE-PROBE.zip" "u0_a180@192.168.100.27:~/"`

Trên Termux Vsmart:

```bash
mkdir -p ~/mhc-test-05c-fence
unzip -q ~/MHC-Full-Installer-TEST-0.5.0C-FENCE-PROBE.zip -d ~/mhc-test-05c-fence
cd ~/mhc-test-05c-fence/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nhập `TEST_SOURCE_ONLY_UPGRADE` **chỉ sau khi các preflight đạt**. Kiểm: `~/mhc-full doctor`, `~/mhc-full serve probe-static demo local.test`, `~/mhc-full fence-probe plan`. Không restart MariaDB, Nginx, PHP hoặc SSH.

Nếu cần cập nhật Panel gốc 9090, dùng `~/mhc-full hosting-panel plan` rồi `apply` nếu không có STOP, lưu `ROLLBACK_ID` và restart riêng `amh-panel`. Không áp dụng cho M51/X7b production.
