# Nâng cấp MHC TEST 0.4.0B3 cho Vsmart LAB — chỉ mã nguồn

**Không chạy lệnh replica-attach trên MariaDB của Vsmart đang phục vụ Hosting Panel/website demo.** Bản nâng cấp này chỉ cung cấp công cụ LAB cho giai đoạn tiếp theo.

Trên Windows PowerShell, với ZIP đã tải về thư mục Downloads:

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0B3.zip" "u0_a180@192.168.100.27:~/"
```

Trên Termux Vsmart:

```bash
mkdir -p ~/mhc-test-040b3
unzip -q ~/MHC-Full-Installer-TEST-0.4.0B3.zip -d ~/mhc-test-040b3
cd ~/mhc-test-040b3/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nhập `TEST_SOURCE_ONLY_UPGRADE` sau khi kiểm tra trạng thái máy LAB và backup. Khi STOP: không bỏ qua chốt, không cài đè.

Sau nâng cấp (chỉ đọc):

```bash
~/mhc-full doctor
~/mhc-full replication replica-observe
~/mhc-full replication lab-status
~/mhc-full serve probe-static demo local.test
```

Không cần chạy `hosting-panel apply` cho bước B3 nếu Panel 9090 đang ở phiên bản B2; giao diện Cluster đã hiển thị trạng thái lab-status từ các phiên trước. Không restart MariaDB, Nginx, panel, SSH hay Cloudflare.

Đường rollback mã local được in ở cuối `--upgrade`: `~/.local/share/mhc-full-installer/rollback/<timestamp>/`. Chỉ thao tác rollback nếu có kế hoạch kiểm chứng, và không xóa rollback tự động.
