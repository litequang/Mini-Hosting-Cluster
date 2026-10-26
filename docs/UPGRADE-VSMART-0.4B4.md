# MHC TEST 0.4.0B4 — Hướng dẫn cài mới / nâng cấp LAB

## Mục tiêu

Phiên bản đầy đủ (không patch), dựa trên B3; chỉ thêm GTID LAB acceptance và bảng trạng thái đọc trong Hosting Panel gốc 9090. Không tự cấu hình replication/Cloudflare/HA.

## Nâng cấp code trên Vsmart LAB (đang chạy website demo)

**Chỉ cập nhật mã!** Không dùng lệnh `source-probe`, `replica-attach` hoặc `outage-sample` trên MariaDB hiện đang phục vụ website. Trên Windows, sau khi tải ZIP vào Downloads:

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0B4.zip" "u0_a180@192.168.100.27:~/"
```

Trong Termux Vsmart:

```bash
mkdir -p ~/mhc-test-040b4
unzip -q ~/MHC-Full-Installer-TEST-0.4.0B4.zip -d ~/mhc-test-040b4
cd ~/mhc-test-040b4/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Chỉ nhập `TEST_SOURCE_ONLY_UPGRADE` khi script xác nhận môi trường LAB hợp lệ và self-test đạt. Installer sao lưu mã trong `.local/share/mhc-full-installer/rollback/`, không đổi DB, website, .env, PHP/Nginx runtime, Tunnel hay trạng thái Primary.

Kiểm tra chỉ đọc:

```bash
~/mhc-full doctor
~/mhc-full replication outage-report
~/mhc-full serve probe-static demo local.test
```

Nếu muốn có mục B4 trong giao diện Panel 9090 hiện có:

```bash
~/mhc-full hosting-panel plan
```

Chỉ khi có PASS, không có STOP, mới chạy `~/mhc-full hosting-panel apply`, nhập xác nhận `UPGRADE_ORIGINAL_PANEL_LAB`, giữ lại `ROLLBACK_ID`, sau đó `sv restart amh-panel`. Không cập nhật Panel production M51/X7b.

## Cài mới trên Termux LAB trống

```bash
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.4.0B4.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
```

Chỉ khi là thiết bị sạch và đủ điều kiện. Những chức năng GTID có ghi MariaDB cần **2 LAB instance khác** với DB `mhc_lab_*` riêng; xem `docs/GTID-LAB-0.4B4.md`.

## Rollback

Source-only upgrade hiển thị thư mục rollback cụ thể. Nếu Panel 9090 thay đổi bị lỗi, dùng hướng dẫn rollback trong `docs/UPGRADE-VSMART-0.4B1.md` và `~/mhc-full hosting-panel rollback <ROLLBACK_ID>` theo khả năng của script bản này, rồi restart riêng Panel. Không xóa các dấu cài đặt bằng tay.
