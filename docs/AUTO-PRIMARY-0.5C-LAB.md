# MHC TEST 0.5.0C — Manual + Auto Primary LAB

## Mục tiêu
1. **Chọn thủ công** trên Hosting Panel GỐC 9090: bạn backup/restore rồi xác nhận đã khóa writer cũ, kiểm tra node mới và tự chuyển routing. Đây là ghi nhận vận hành, không tự sửa Cloudflare.
2. **Tự bầu chọn**: controller độc lập đánh giá heartbeat SSH đã xác thực (không quá 180 giây), snapshot `snapshot-YYYYMMDD` đã ghi nhận (KHÔNG có nghĩa dữ liệu DB đã đối chiếu), sau đó dung lượng trống và RAM. Không bắt buộc đồng bộ dữ liệu ngang nhau; chấp nhận mất dữ liệu chưa backup.
3. Node Primary cũ được ghi trạng thái `STANDBY_REJOIN_REQUIRES_RESTORE` sau switch thành công, và bị loại khỏi vòng bầu tự động. Điều này chỉ là **vai trò trong controller**; KHÔNG tự ngắt database/web tại máy đã offline. Phải tự cài guard writer/khóa đường ghi tại từng node.

## Rất quan trọng
- **Chưa triển khai trên M51 / X7b / Cloudflare production**. Cloudflare API chưa được cấu hình trong tài khoản bạn.
- Controller phải là **máy thứ ba độc lập**, không thể là Primary sẽ bị mất điện hoặc mất mạng. Nếu controller chết theo Primary, election dừng.
- Rủi ro split-brain vẫn còn nếu Primary cũ bị chia mạng vẫn tiếp tục chạy, đặc biệt khi có người truy cập bằng IP/tunnel riêng.
- Chỉ sử dụng `BEST_EFFORT_ROUTE` sau khi đã cấu hình tự khóa ghi ở các node, các tunnel khỏe và chấp nhận mất dữ liệu. Không tự động bật mode này từ Panel.
- Đổi CNAME DNS theo Cloudflare không bảo đảm backend tự start/restore database. Node mới phải có bản dữ liệu dùng được và dịch vụ đã chạy.

## Nâng cấp trên Vsmart hiện có — chỉ mã nguồn
Trong Windows PowerShell gửi ZIP tới Vsmart qua scp port 8022, trên Termux:
```sh
mkdir -p ~/mhc-test-05c-auto
unzip -q ~/MHC-Full-Installer-TEST-0.5.0C-AUTO-PRIMARY-LAB.zip -d ~/mhc-test-05c-auto
cd ~/mhc-test-05c-auto/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
```
Nhập `TEST_SOURCE_ONLY_UPGRADE` khi các kiểm tra đạt. Không chạy `auto-primary init`, `enable`, `service-install`, `tick` trên Vsmart vì Vsmart có website demo.

## LAB controller độc lập
Tạo cluster bằng `~/mhc-full node cluster-init` trên controller độc lập. Các node join và duy trì `~/mhc-full node service start` (heartbeat); cần xác minh host key và SSH credentials. Sau khi test controller độc lập:
```sh
~/mhc-full auto-primary plan
~/mhc-full auto-primary init
~/mhc-full auto-primary enable --confirm=ENABLE_AUTO_ELECTION_RECOMMEND_ONLY
~/mhc-full auto-primary status
~/mhc-full auto-primary tick
```
Mặc định `tick` chỉ **đề xuất ứng viên**, không đổi DNS; backup phải được ghi nhận, và `primary-select` phải có Primary thủ công ban đầu.

Chạy định kỳ trên Termux controller LAB (chỉ khi sẵn sàng):
```sh
~/mhc-full auto-primary service-install --confirm=INSTALL_LAB_AUTO_WATCH
sv up mhc-auto-primary
sv status mhc-auto-primary
```
Dừng: `sv down mhc-auto-primary` + `~/mhc-full auto-primary disable --confirm=DISABLE_AUTO_ELECTION`.

## Thực hiện lựa chọn thủ công
Trong Panel 9090 → Cluster → Chọn Primary. Hoặc:
```sh
~/mhc-full primary-select status
~/mhc-full primary-select plan <NODE_UUID>
~/mhc-full primary-select begin <NODE_UUID> --confirm=PREPARE_MANUAL_PRIMARY
# tự backup/restore, dừng writer cũ, kiểm tra đích và tự đổi routing rồi:
~/mhc-full primary-select complete <OPERATION_UUID> --confirm=RECORD_OPERATOR_SELECTED_PRIMARY --backup-restored --old-writes-stopped --target-tested --routing-switched
```
Đây là biên nhận do admin khai, KHÔNG thay thế kiểm tra thực tế.

## Optional: Cloudflare DNS CNAME switching — chỉ LAB, rủi ro cao
MHC có adapter API Cloudflare GET → PATCH → GET, kiểm tra record CNAME hiện trỏ về Tunnel cũ và chuyển sang Tunnel đã khai báo cho node mới. Theo tài liệu Cloudflare, tên miền phải trỏ `UUID.cfargotunnel.com`, Tunnel cần chạy thật.

Config private: `~/.config/mhc-full-installer/manual-primary/auto-config.json`, quyền 0600. Mặc định:
```json
{
  "schema": 1, "enabled": true, "mode": "RECOMMEND_ONLY", "timeoutMs": 180000
}
```
Để bật routing LAB thủ công, phải cung cấp **đúng** các trường: `mode=BEST_EFFORT_ROUTE`, `iAcceptSplitBrainRisk=true`, `independentControllerDeclared=true`, `oldNodeRejoinGuardDeclared=true` và đối tượng:
```json
{
 "cloudflare": {
  "zoneId":"32-hex-zone-id",
  "recordId":"32-hex-dns-record-id",
  "hostname":"lab.example.org",
  "nodeTargets": {"node-uuid-A":"tunnel-uuid-A.cfargotunnel.com", "node-uuid-B":"tunnel-uuid-B.cfargotunnel.com"},
  "tokenFile":"/absolute/private/path/cloudflare-dns-write-token"
 }
}
```
**Đây là các trường bổ sung vào JSON trước**, không phải file hoàn chỉnh để copy đè. Hạn chế API token quyền DNS Edit ở đúng zone, chmod 600. Không gửi token trong chat. Chỉ hoạt động nếu bản ghi Cloudflare hiện trỏ đúng tunnel cũ; mismatch phải STOP.

`sv up mhc-auto-primary` chỉ chạy trên controller; nếu thiếu fencing old writer/không có health probe thật, không tuyên bố HA-ready.

## Bước còn thiếu để sử dụng chính thức
- Thiết lập controller hoặc witness luôn online độc lập.
- Bảo đảm node quay lại tự tắt writer trước khi mở dịch vụ; hiện chưa có cơ chế tự khoá toàn bộ MariaDB/PHP ở node cũ.
- Nghiệm thu 2 Android thật + tunnel từng máy + verify health và dữ liệu restore.
- Khi không thể liên hệ controller/witness, mọi node phải fail-closed; bản này **chưa chứng minh** điều đó đối với các writer ngoài Write Gate LAB.
