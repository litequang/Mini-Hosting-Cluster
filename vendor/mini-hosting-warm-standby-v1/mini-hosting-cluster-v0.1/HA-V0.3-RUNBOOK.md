# Mini Hosting Cluster v0.3 — HA Controller, bidirectional backup (STAGED)

**Dùng chung mã nguồn trên M51 và X7b. KHÔNG tự động kích hoạt failover sau khi cài.**

## Trạng thái tính năng

- ✅ Đã code: `mhc ha status`, `doctor`, cấu hình witness/mode/preferred/RPO, điều kiện chuẩn trước khi ARM, heartbeat lease 30s / term từ Cloudflare Durable Object SQLite, fence (dừng mini-web + named-tunnel và MariaDB read_only), manual release/transfer có khóa mục tiêu, backend auto failover **có chốt GTID + content checksum + RPO**, nhận backup đối chiều SHA256 vào thư mục riêng, monitor web chọn `manual/auto` và máy ưu tiên qua Access.
- ✅ HA agent chỉ được mở bằng `mhc ha arm --confirm=HA_FENCING` sau khi preflight và witness đã sẵn sàng. Installer không động vào ứng dụng/DB/Tunnel đang chạy trên M51. Service `mhc-ha` mặc định OFF; một node đang armed được giữ ON khi cập nhật.
- ⛔ Chưa có: triển khai thực trên M51/X7b/Cloudflare, GTID live replication đã cấu hình, MariaDB canonical database trên X7b, reverse GTID replication X7b→M51 sau switchover, guaranteed 0 RPO, tự động *failback* an toàn không gián đoạn, HA fence ở lớp Cloudflare edge trên mọi request. Những việc này cần triển khai và thử trên thiết bị thật, không thể khẳng định chỉ từ ZIP.
- ⚠️ Snapshot standby hiện tại (`thophuong_standby_a/b`) **không** phải GTID replica có thể được thăng Primary. `mhc ha arm` từ chối nếu `.env` vẫn trỏ tới shadow DB.
- ⚠️ Nếu `RPO=0`, auto failover khi Primary mất liên lạc **bị từ chối** vì async replication không thể chứng minh không mất dữ liệu. Nhưng **manual graceful switchover** vẫn cho phép nếu Primary nhường lease có chứng cứ ngừng ghi, SQL replica bắt kịp GTID cuối cùng và checksum file trùng hoàn toàn. Nếu RPO>0 chỉ là mức chấp nhận sai lệch thời gian checkpoint quan sát, KHÔNG bảo đảm số giây dữ liệu mất chính xác.
- ⚠️ Một bộ điều phối chỉ cấp một lease; **chưa đủ** bảo đảm fencing DB nếu toàn bộ runit/HA process trên một máy chết nhưng Node web vẫn chạy. Muốn HA production cần bắt buộc tất cả write ingress qua proxy/edge kiểm tra term hoặc watchdog không thể bị bỏ qua, và thử phân vùng mạng. Cloudflare Named Tunnel giống nhau không tự chứng minh chỉ một DB writer.

## A. Cài code trên hai điện thoại — AN TOÀN, KHÔNG ĐỔI VAI TRÒ

1. Chép ZIP `Mini-Hosting-Cluster-v0.3-HA-Controller.zip` từ PC vào **cả hai điện thoại**, ví dụ dùng Windows PowerShell:

   ```powershell
   scp -P 8022 "$env:USERPROFILE\Downloads\Mini-Hosting-Cluster-v0.3-HA-Controller.zip" u0_a288@192.168.1.43:~/
   scp -P 8022 "$env:USERPROFILE\Downloads\Mini-Hosting-Cluster-v0.3-HA-Controller.zip" u0_a210@192.168.1.35:~/
   ```

2. Trên **M51 Termux** và **X7b Termux** (chạy từng máy):

   ```bash
   unzip -o ~/Mini-Hosting-Cluster-v0.3-HA-Controller.zip -d ~
   bash ~/mini-hosting-warm-standby-v1/mini-hosting-cluster-v0.1/bin/install.sh
   ~/mhc status
   ~/mhc ha doctor
   ~/mhc ha status
   sv status mhc-ha mhc-peer-backup
   ```

3. **Kết quả an toàn mặc định:** HA mode có thể được cấu hình nhưng `armed:false`, `mhc-ha: down`, không start/stop `mini-web`, không thay đổi MariaDB, không thay đổi `named-tunnel`, không thay đổi Panel 9090, không sửa identity cũ. `mhc ha doctor` sẽ nêu các chốt GTID/DB/Asset chưa thỏa.

4. Không chạy lại `init-primary`, `join-standby`, `install-new-phone`, `restore-new-phone` hoặc thao tác đổi website ở giai đoạn chỉ cập nhật code.

## B. Nâng cấp nhận backup 2 chiều — KHÔNG GHI ĐÈ DB

Trên X7b để X7b nhận bản backup từ M51:

```bash
~/mhc ha backup-source 192.168.1.43 u0_a288 8022 0a2fa4bf-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

`XXXX` ở trên là **placeholder**, bắt buộc thay bằng `nodeId` M51 thật từ `~/mhc identity-json` trên M51. Trên M51 để nhận backup từ X7b:

```bash
~/mhc ha backup-source 192.168.1.35 u0_a210 8022 534d051b-b9c2-46bb-bbc1-94e4f9328bb1
```

Trên từng máy, sau khi xác minh SSH key và fingerprint hai chiều:

```bash
~/mhc backup-pull
sv-enable mhc-peer-backup
sv up mhc-peer-backup
```

- Backup đích ở `~/hosting-backups/peer-cluster/<source-nodeId>/snapshot-*`, giữ tối đa 7 snapshot, so SHA256 + gzip/tar, KHÔNG nhập SQL vào DB hiện có.
- Kéo mỗi 10 phút; nếu máy nguồn vẫn backup mỗi ngày thì dữ liệu backup thay đổi mỗi ngày, KHÔNG phải near-real-time.
- M51 phải có SSH key riêng được **X7b cho phép** truy cập trước khi lấy backup ngược. Không tắt StrictHostKeyChecking.
- Sau switchover chỉ thêm/repoint nguồn backup; **không** tự động chạy đồng bộ DB ngược trước khi đã giải quyết dữ liệu hai bên.

## C. Cloudflare HA Witness (CHƯA TỰ ĐỘNG TRIỂN KHAI)

Mở Windows PowerShell, giải nén ZIP, đến thư mục `mini-hosting-warm-standby-v1\mini-hosting-cluster-v0.1\ha-witness`:

```powershell
npm install
npx wrangler login
npx wrangler secret put HA_ADMIN_TOKEN
npx wrangler deploy
```

`HA_ADMIN_TOKEN`: ngẫu nhiên, bí mật mạnh >=32 ký tự, không ghi vào Git/ZIP/chat. Domain `ha-control.thophuong.com` phải được Cloudflare chấp nhận trước khi deploy. Không đụng route `pro.thophuong.com` trong bước này.

Để bật các điều khiển trên `monitor.thophuong.com`, vào `online-monitor/cloudflare`, thêm chính xác cùng secret `HA_ADMIN_TOKEN` và `HA_CLUSTER_ID` (cluster UUID); sau đó deploy Worker Monitor đã kiểm tra chính sách Cloudflare Access. *Các thao tác thay đổi trong UI chỉ thay đổi chính sách DO, KHÔNG tự bypass việc ARM trên thiết bị.*

### Đăng ký token cho từng node

Admin gọi POST `/v1/admin/register` tới `https://ha-control.thophuong.com` với JSON:

```json
{"clusterId":"CLUSTER_UUID","nodeId":"NODE_UUID","nodeTokenHash":"SHA256_HEX_OF_RANDOM_NODE_TOKEN"}
```

Header `Authorization: Bearer <HA_ADMIN_TOKEN>`. Cần token riêng cho **mỗi node**; hash SHA256 64 ký tự được ghi vào DO, không lưu token gốc trên Cloudflare. Trên node chạy `~/mhc ha configure https://ha-control.thophuong.com <NODE_TOKEN>` (tránh đưa token trong shell history, dùng terminal riêng/tệp lệnh tạm bảo mật); local lưu `ha.json` chmod600. Khởi tạo chính sách `/v1/admin/config` với `mode=manual`, `preferredNodeId=<M51_UUID>`, `maxRpoSeconds=0` trước.

## D. Đối soát dữ liệu thật trước khi bật HA

**M51 (chỉ kiểm tra, không sửa):**

```bash
mariadb --no-defaults -u root -e "SHOW VARIABLES WHERE Variable_name IN ('log_bin','server_id','binlog_format','read_only','gtid_strict_mode');"
mariadb --no-defaults -u root -e "SELECT @@global.gtid_binlog_pos;"
~/mhc ha doctor
```

**X7b (chỉ kiểm tra):**

```bash
mariadb --no-defaults -u root -e 'SHOW SLAVE STATUS\G'
~/mhc ha doctor
```

MariaDB GTID cần binlog trên M51, server-id riêng từng máy, replication user tối thiểu qua LAN/SSH, `MASTER_USE_GTID=slave_pos`, chính sách read-only trên replica, GTID catch-up liên tục, X7b phải có bản sao `thophuong_pro` **canonical** và app `.env` trỏ đúng DB đó. Thiết lập này yêu cầu migration có backup + thời gian bảo trì, không thể chỉ đổi `.env` của snapshot hiện tại vì sẽ gây sai lệch dữ liệu.

Sau khi GTID/canonical data hoạt động và website X7b vẫn tắt:

```bash
# X7b (sẽ rsync storage, tính SHA256 tất cả file ở hai máy;
# không xóa file lạ nên mismatch sẽ dừng)
~/mhc sync-assets
```

Tạo checkpoint chứa hash toàn bộ storage; một snapshot import mới tự làm checkpoint trước đó mất hiệu lực. Phải đối soát lại nếu upload sheet/file mới.

## E. ARM/chuyển vai trò — PHẢI LÊN LỊCH BẢO TRÌ, CHƯA DÀNH CHO PRODUCTION

Chỉ sau khi hai máy đã có GTID/canonical DB, Cloudflare HA witness, khóa SSH 2 chiều, checkpoint file mới, và đã nghiệm thu phân vùng mạng:

1. Tại máy cần ARM, website và Tunnel **phải tắt**, MariaDB read_only=ON, `~/mhc ha doctor` báo đủ điều kiện. **KHÔNG thực hiện dừng M51 production chỉ để thử nghiệm package.**
2. `~/mhc ha arm --confirm=HA_FENCING` sau khi đã backup đã xác minh.
3. `sv-enable mhc-ha && sv up mhc-ha`.
4. Sau khi nhận được lease: `~/mhc ha status` và các service phản ánh thực tế; không tin nhãn `node.json.role` là nguồn chân lý.
5. Graceful manual switch: từ node đang giữ lease, đã kiểm tra mục tiêu replica bắt kịp GTID + assets, dùng `~/mhc ha release <TARGET_UUID> --confirm=SWITCH_PRIMARY`. Nó đặt chốt `releasePending` không cho website tự khởi động lại, chặn web/tunnel, đặt DB read_only, tính lại toàn bộ SHA256 của storage và **từ chối nhường** nếu checksum đã thay đổi (phải chạy `~/mhc sync-assets` lại trên X7b rồi gọi lại lệnh), sau đó chuyển `preferred` tới target; chỉ node mục tiêu đủ điều kiện mới được cấp lease. Nếu fail, ngừng, đánh giá lại GTID và có rollback plan.
6. Auto mode chỉ cấp lease theo khi leader cũ hết hạn và candidate thỏa GTID/content checkpoint/RPO; với `RPO=0`, sẽ **không** tự failover khi Primary biến mất; có thể chuyển thủ công không mất dữ liệu sau khi dừng ghi, đối soát GTID/files và nhường lease. Chưa coi là zero-data-loss HA hay automatic failback.

## F. Chức năng/điều kiện còn thiếu để Production HA trọn vẹn

1. Cấu hình MariaDB GTID replication vận hành thật (chưa làm trên hai thiết bị).
2. Khắc phục cùng-Wi-Fi điểm lỗi chung, đảm bảo M51/X7b có WAN hoặc đường truyền dự phòng nếu cần uptime Internet.
3. Phân phối traffic qua một routing/fencing gate bắt buộc để mọi thao tác ghi kiểm tra lease term; Named Tunnel off không đủ khi guard có thể chết mà app còn sống.
4. Reparent replica + reverse storage sync chính xác sau takeover, xác minh không divergence trước automatic failback.
5. End-to-end chaos test trên thiết bị thật (M51 rớt Wi-Fi, X7b offline, Cloudflare DO không trả lời, restart runit, lỗi replicate, DB GTID diverge, restore từ backup).

**Ưu tiên 0 data loss: tự động failover phải fail closed khi không thể chứng minh đủ dữ liệu. Không giảm các chốt bảo vệ chỉ để chuyển nhanh.**
