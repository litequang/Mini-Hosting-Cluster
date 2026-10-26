# Hướng dẫn TEST 0.4.0B1 — Vsmart LAB

## 1. Chép ZIP từ Windows (PowerShell)

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0B1.zip" "u0_a180@192.168.100.27:~/"
```

## 2. Nâng cấp source MHC trên Vsmart (Termux, không chạy trên M51/X7b)

```bash
mkdir -p ~/mhc-test-040b1
unzip -q ~/MHC-Full-Installer-TEST-0.4.0B1.zip -d ~/mhc-test-040b1
cd ~/mhc-test-040b1/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nhập `TEST_SOURCE_ONLY_UPGRADE`. Bộ cài kiểm thử mã trước khi chép mã mới, giữ lại một bản cũ tại `~/.local/share/mhc-full-installer/rollback/<ID>/`. Không cài sạch lại Termux. `--plan` mô tả cài sạch, có thể liệt kê STOP flag bình thường trên máy đã cài.

**Lưu ý:** `--upgrade` không thay đổi database, Nginx, PHP-FPM, SSH hay site `demo`; không khởi động dịch vụ tự động. Không gửi `.env`, mật khẩu/token, file DB hay private keys vào chat.

## 3. Kiểm tra chức năng v0.4B.1

```bash
~/mhc-full doctor
~/mhc-full replication gtid
~/mhc-full replication lab-status
~/mhc-full replication status
~/mhc-full serve probe-static demo local.test
```

Vsmart đang là node độc lập không cấu hình replica, nên kết quả `NOT_CONFIGURED` của `lab-status` là **đúng**, không phải lỗi. `binaryLogEnabled=false` cũng là bình thường nếu chưa cấu hình nguồn LAB. Trên một máy LAB chưa nối peer, mọi kết luận HA vẫn false.

Để thử sinh **mẫu cấu hình mà không áp dụng** (chỉ trên node LAB, biết chắc nó không chứa DB production):

```bash
~/mhc-full replication lab-plan source 101
```

Lệnh trên sẽ tạo file mẫu chỉ đọc để quản trị viên xem lại. Không tự thay config mysqld, không restart MariaDB hay mở cổng. Không chạy `lab-plan` trên M51/X7b.

## 4. Gắn Panel gốc 9090

```bash
~/mhc-full hosting-panel plan
```

Nếu PASS và không có STOP:

```bash
~/mhc-full hosting-panel apply
# nhập UPGRADE_ORIGINAL_PANEL_LAB; giữ ROLLBACK_ID
sv restart amh-panel
sv status amh-panel
~/mhc-full serve probe-static demo local.test
```

Mở Panel gốc qua SSH tunnel **đúng cổng 9090**:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:9090:127.0.0.1:9090 -p 8022 u0_a180@192.168.100.27
```

Vào `http://127.0.0.1:9090`, đăng nhập tài khoản Panel gốc, mở **Cluster → GTID LAB**. Không cần mở thêm Panel ngoài Internet.

Rollback Panel (khi cần): `~/mhc-full hosting-panel rollback ROLLBACK_ID` rồi `sv restart amh-panel`. Không dùng ID phỏng đoán.

## 5. Mức nghiệm thu

- Self-test môi trường Linux chỉ chứng minh kiểm thử logic, không chứng minh GTID receiver thật.
- Vsmart cần chụp kết quả `lab-status` đã lọc nhạy cảm, xác nhận Panel hiển thị giống CLI và site demo vẫn HTTP 200.
- Muốn MariaDB replication thực phải có **node LAB thứ hai** và runbook riêng (`docs/GTID-LAB-0.4B1.md`). Không dùng source M51/X7b production để thử.
