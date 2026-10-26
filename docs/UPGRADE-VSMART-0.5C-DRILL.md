# Nâng cấp MHC TEST 0.5.0C-DRILL — Vsmart chỉ cập nhật mã

MHC `0.5C-DRILL` có thêm công cụ điều phối trên máy quản trị (PC). Không cần khởi chạy drill trên Vsmart đang có website `demo`.

Từ Windows PowerShell:

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0C-DRILL.zip" "u0_a180@192.168.100.27:~/"
```

Trên Vsmart Termux, sau khi có bản sao an toàn và xác nhận đây đúng máy LAB (không thực hiện nếu preflight STOP):

```bash
mkdir -p ~/mhc-test-05c-drill
unzip -q ~/MHC-Full-Installer-TEST-0.5.0C-DRILL.zip -d ~/mhc-test-05c-drill
cd ~/mhc-test-05c-drill/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nhập `TEST_SOURCE_ONLY_UPGRADE` **chỉ nếu** self-test, guard và thiết bị đúng. Installer lưu rollback mã và marker, không restart PHP/Nginx/MariaDB hoặc sửa web root. Sau đó `~/mhc-full doctor`, `~/mhc-full serve probe-static demo local.test`, `~/mhc-full field-drill plan`. Không chạy `collect`, `physical-accept keygen`, `source-probe` hoặc dừng replication trên Vsmart/M51/X7b.

Panel gốc 9090 vẫn giữ nguyên; nếu cần cập nhật riêng, thực hiện `hosting-panel plan`, chỉ `apply` khi PASS, lưu `ROLLBACK_ID` và restart riêng `amh-panel`. Không nhập lại mật khẩu admin hoặc cài sạch.

**Chưa có nghiệm thu hai Android thật; bản này không cho phép chuyển Primary.**
