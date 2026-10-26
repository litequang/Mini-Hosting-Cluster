# Nâng cấp MHC TEST 0.4.0C1 trên Vsmart LAB

Bản này là **ZIP All-in-One**, nâng cấp source-only từ TEST 0.3.x hoặc TEST 0.4.0A/B1/B2/B3/B4 đã cài thành công. Vsmart LAB có website `demo`: **không** dùng `--install`, không chạy các thao tác database GTID có ghi, không xóa marker. Nên sao lưu thiết bị/website trước mọi nâng cấp.

## Chuyển ZIP từ Windows

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0C1.zip" "u0_a180@192.168.100.27:~/"
```

## Cập nhật mã trên Vsmart

```bash
mkdir -p ~/mhc-test-040c1
unzip -q ~/MHC-Full-Installer-TEST-0.4.0C1.zip -d ~/mhc-test-040c1
cd ~/mhc-test-040c1/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Chỉ nhập `TEST_SOURCE_ONLY_UPGRADE` nếu preflight/self-test đạt; sẽ hiện đường dẫn bản rollback của mã cũ. Không tự restart MariaDB/Nginx/PHP/SSH. Nếu STOP, không vượt qua cảnh báo.

Xác minh sau khi nâng cấp:

```bash
~/mhc-full doctor
~/mhc-full file-sync status
~/mhc-full serve probe-static demo local.test
```

Khi chưa tạo `~/mhc-file-lab/`, `file-sync status` báo `NOT_CONFIGURED` là bình thường.

## Cập nhật Panel gốc 9090 (tùy chọn)

```bash
~/mhc-full hosting-panel plan
```

Chỉ khi PASS, không STOP mới dùng:

```bash
~/mhc-full hosting-panel apply
```

Nhập `UPGRADE_ORIGINAL_PANEL_LAB`, lưu lại **ROLLBACK_ID** được in ra. Sau đó:

```bash
sv restart amh-panel
sv status amh-panel
~/mhc-full serve probe-static demo local.test
```

Nếu Panel lỗi, dùng `~/mhc-full hosting-panel rollback <ROLLBACK_ID>` theo hướng dẫn Panel, chỉ trên Vsmart LAB; không đưa lệnh này lên M51/X7b. Mục mới nằm trong **Cluster** của Panel cũ 9090; dữ liệu đọc là LAB offline, không báo `HA-ready`.

## Test C1

Đọc `docs/FILE-DELTA-LAB-0.4C1.md`. Chỉ tạo fixture trong `~/mhc-file-lab/` để dùng `file-sync`; không đưa `~/apps/thophuongpro`, `.env`, WordPress thực hoặc dữ liệu M51/X7b vào khu vực test. Tự truyền gói delta qua SSH được xác minh, chỉ stage offline trên node khác.
