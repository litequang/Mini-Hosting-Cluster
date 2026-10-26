# Nâng cấp Vsmart TEST 0.4.0B2 — code only, giữ Panel 9090

1. Chỉ chạy trên Vsmart **LAB** đã có MHC hoàn chỉnh, website demo được kiểm tra, marker LAB hợp lệ; KHÔNG dùng trên M51/X7b production. Sao lưu cấu hình/website/data LAB và kiểm thử phục hồi trước khi nâng cấp.
2. Từ Windows PowerShell (ZIP nằm trong Downloads):

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0B2.zip" "u0_a180@192.168.100.27:~/"
```

3. Trong Vsmart Termux:

```bash
mkdir -p ~/mhc-test-040b2
unzip -q ~/MHC-Full-Installer-TEST-0.4.0B2.zip -d ~/mhc-test-040b2
cd ~/mhc-test-040b2/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nhập `TEST_SOURCE_ONLY_UPGRADE` khi được hỏi. Nếu self-test không PASS hoặc installer báo STOP, **không** xóa marker/restore đè, giữ nguyên nguồn hiện tại. Dòng lệnh chỉ cập nhật các script trong `~/.local/share/mhc-full-installer/bin` và `~/mhc-full`, giữ backup script cũ tại `~/.local/share/mhc-full-installer/rollback/<timestamp>/`. Không tự restart services.

4. Kiểm tra chỉ đọc và website đã chạy:

```bash
~/mhc-full doctor
~/mhc-full replication lab-status
~/mhc-full replication seed-summary
~/mhc-full serve probe-static demo local.test
```

5. Nếu muốn cập nhật **Panel gốc 9090**: `~/mhc-full hosting-panel plan`; chỉ khi có PASS và không STOP mới chạy `~/mhc-full hosting-panel apply`, nhập `UPGRADE_ORIGINAL_PANEL_LAB`, ghi lại ROLLBACK_ID và `sv restart amh-panel`. Theo dõi Panel 9090 qua SSH tunnel hiện có; nếu lỗi dùng `~/mhc-full hosting-panel rollback <ROLLBACK_ID>` theo kết quả trong Panel plan/apply.

6. Không chạy `seed-capture` ngay trên Vsmart đang có WordPress DB/ứng dụng khác. Bản đó yêu cầu MariaDB SOURCE LAB riêng chỉ chứa schema thử nghiệm `mhc_lab_*` và preflight GTID strict/ROW/binlog. Cần node thứ hai để nghiệm thu replication thực. Xem `docs/GTID-LAB-0.4B2.md`.
