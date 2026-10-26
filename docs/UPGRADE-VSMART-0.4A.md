# Hướng dẫn MHC TEST 0.4.0A (v0.4A — Replication Observer)

## Giới hạn sử dụng
Dành cho Vsmart LAB, sau khi đã cài thành công TEST 0.3.11. Không chạy bộ cài sạch hoặc upgrade này trên M51/X7b production. Chức năng mới **chỉ đọc dữ liệu**: chưa có đồng bộ MariaDB GTID, file delta, quyền Primary/failover. Quét file SHA256 cần CPU/I/O, chỉ thực hiện khi điện thoại LAB ổn định và đủ dung lượng.

## 1. Chép ZIP sang Vsmart bằng Windows PowerShell

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0A.zip" "u0_a180@192.168.100.27:~/"
```

## 2. Nâng cấp mã MHC (Termux Vsmart)

```bash
mkdir -p ~/mhc-test-040a
unzip -q ~/MHC-Full-Installer-TEST-0.4.0A.zip -d ~/mhc-test-040a
cd ~/mhc-test-040a/MHC-Full-Installer
bash install.sh --plan
bash install.sh --upgrade
```

`--plan` có thể in STOP do phát hiện bản MHC đang cài; **đó là thông tin cho cài sạch, không phải lỗi của chế độ upgrade**. Chỉ chạy `--upgrade` nếu chắc chắn đây là Vsmart LAB đã cài TEST, không có `.env` Thờ Phượng Pro production hay HA đã ARM. Khi được hỏi, nhập `TEST_SOURCE_ONLY_UPGRADE`. Lệnh nâng cấp sẽ chạy self-test và lưu bản source cũ. Nếu thất bại, không xóa marker hay chạy `--install`.

## 3. Thử lệnh mới trước khi quét file

```bash
~/mhc-full doctor
~/mhc-full replication gtid
~/mhc-full replication status
```

`gtid` chỉ mô tả tình trạng MariaDB tại chính Vsmart. Ví dụ `binaryLogEnabled=false` không phải lỗi installer; yêu cầu cấu hình riêng ở giai đoạn v0.4B. `status` ban đầu `NOT_SCANNED` là bình thường.

Tạo manifest mốc đầu tiên cho website `demo` đã đăng ký, rồi xem kết quả:

```bash
~/mhc-full replication scan
~/mhc-full replication status
```

Quét lần 2 sau khi cập nhật nội dung hợp lệ của `demo` để xem `added`, `modified`, `removed` giữa hai lần quét. Scan chỉ chọn nội dung tĩnh đăng ký, WordPress uploads và Sheet storage đã phát hiện. Không bao gồm nội dung `.env`/`wp-config.php`, không truyền snapshot đi đâu, không chạy lịch tự động. Nếu gặp symlink hoặc file thay đổi giữa lúc quét, lệnh từ chối và giữ báo cáo trước. Chưa có gì được gọi là node đồng bộ.

## 4. Gắn vào Hosting Panel gốc 9090 (chỉ khi preflight PASS)

```bash
~/mhc-full hosting-panel plan
```

Chỉ khi báo `PASS`, không có `STOP`:

```bash
~/mhc-full hosting-panel apply
```

Nhập `UPGRADE_ORIGINAL_PANEL_LAB`; **lưu `ROLLBACK_ID`**. Sau đó chủ động khởi động lại riêng Panel 9090:

```bash
sv restart amh-panel
sv status amh-panel
~/mhc-full serve probe-static demo local.test
```

Trên Windows PowerShell giữ SSH forwarding đúng cổng 9090:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:9090:127.0.0.1:9090 -p 8022 u0_a180@192.168.100.27
```

Đăng nhập Panel gốc `http://127.0.0.1:9090`, mở **Cluster** và xem bảng **v0.4A — Replication Observer**. Lưu ý số liệu chỉ phản ánh lần scan đã lưu trên Vsmart, không phải xác nhận trạng thái của node khác. API JSON cần session đăng nhập là `/api/mhc/replication` và không xuất danh sách tên file/hashes.

## 5. Rollback Panel (khi cần)

```bash
~/mhc-full hosting-panel rollback ROLLBACK_ID
sv restart amh-panel
```

Nhập `ROLLBACK_ORIGINAL_PANEL_LAB`. Chỉ dùng `ROLLBACK_ID` thật do lệnh `apply` trả về. Rollback này chỉ hoàn nguyên mã Panel, không phục hồi DB hay site.

## 6. Nghiệm thu thực tế còn thiếu

- Vsmart: kiểm `gtid` với MariaDB socket thật; quét website `demo` 2 lượt và xác nhận thay đổi; Panel 9090 đăng nhập/API/Cluster không hiện lỗi; website HTTP 200 vẫn hoạt động.
- Hai node LAB riêng: thử GTID server_id độc lập và dữ liệu remote, chưa kết luận chỉ từ vị trí GTID local.
- Trước v0.4B/v0.4C cần thiết kế canonical MariaDB replication, chặn dual writer, phiên sao lưu nhất quán, xử lý xóa/sửa file và đối soát checkpoint. Không thử với production.

**Không gửi token Panel, `.env`, nội dung SQL hoặc full manifest chứa đường dẫn dữ liệu vào chat.**
