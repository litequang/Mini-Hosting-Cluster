# v0.2 UPDATE — Cloudflare Online Monitor

**Xem `ONLINE-MONITOR-SETUP.md` để triển khai `https://monitor.thophuong.com`.** Bổ sung dịch vụ mhc-online (outbound, chỉ đọc) và worker độc lập để Monitor vẫn hoạt động nếu M51 offline. Chưa có tự động failover/chuyển vai trò.

---

# Mini Hosting Cluster v0.2.0 — Full-Replica Multi-Node (Phase 1A + initial 1B)

**Một code chung cho mọi node Android Termux.** Không giới hạn cứng ở 2 node. Chỉ **một node** được chỉ định đang phục vụ website; các node còn lại dự phòng bằng snapshot đầy đủ. Giao diện localhost/SSH tunnel chỉ đọc, không thao tác chuyển vai trò.

## Những gì ĐÃ CÓ trong bản này

- Một bản Agent/CLI và dashboard cho M51, X7b và các máy khác, không phân nhánh theo model.
- UUID riêng mỗi node, Cluster ID chung, danh bạ node trên primary và tự nhận heartbeat 60 giây/lần qua SSH outbound.
- Đăng ký X7b đã khôi phục vào cluster và tự cấu hình `standby-sync` lấy snapshot từ primary mỗi 600 giây. Sync thực tế **chỉ có dữ liệu mới khi primary đã tạo một snapshot mới** (backup hiện theo ngày). Nhập vào shadow database A/B và đổi symlink cục bộ sau kiểm tra (dựa trên mô-đun v1 hiện có).
- Tạo node **mới tinh** bằng script `bootstrap-new`: tải snapshot đủ app/database/file, kiểm tra SHA256, tải file cấu hình mã hóa, khôi phục tại chỗ qua passphrase, giữ tunnel và website OFF, rồi gia nhập cluster.
- Dashboard **127.0.0.1:9092** trên mỗi máy, không mở cổng Internet, không thay đổi Panel 9090 đang phục vụ.
- Script cài đặt không đụng vào database/website/tunnel hiện tại của M51. Cấu hình node được giữ nguyên khi cài lại code.

## Những gì CHƯA CÓ — QUAN TRỌNG

- **Chưa có replication MariaDB GTID, đồng bộ file realtime, distributed lease/fencing, bầu Primary, auto-failover hoặc đổi vai trò hai chiều.** Không được chuyển Tunnel thủ công sang Standby chỉ vì dashboard báo online. Mọi nhãn Primary/Standby chỉ là danh bạ, không phải bằng chứng an toàn split-brain.
- Mỗi snapshot phải được primary backup/verify thành công trước; độ trễ tối đa có thể gần 24 giờ. Checksum chỉ xác nhận backup nguồn chứ không xác nhận bằng nhau tới *hiện tại*.
- **Chưa thử end-to-end trên HONOR X7b/M51 thật**; đã kiểm tra cú pháp Node/Bash và test các luồng config trên máy phát triển. Khi chạy ngoài thực địa theo từng bước, dừng khi có lỗi.
- Nếu Internet gia đình hoặc Wi-Fi ngừng hoạt động, các node cùng mạng không bảo đảm truy cập từ xa. Muốn HA thực sự cần WAN độc lập và controller/quorum tin cậy.

## Cài trên M51 — không gián đoạn website

Sau khi chuyển gói ZIP vào **M51** và giải nén với `unzip -o Mini-Hosting-Cluster-v0.2-Online-Monitor.zip -d ~`:

```bash
# M51 Termux (u0_a288) — code mới, không chạy installer hạ tầng cũ
bash ~/mini-hosting-warm-standby-v1/mini-hosting-cluster-v0.1/bin/install.sh
~/mhc init-primary M51 --confirm=PRIMARY
~/mhc status
```

**Nếu SSH trên M51 tạm ngừng**, khôi phục SSH bằng Termux M51 trước, không thay đổi nginx/mysqld/named-tunnel. Trên PC, chuyển ZIP qua `scp -P 8022 <zip> u0_a288@192.168.1.43:~/`.

## Cài X7b — ghép bản đã khôi phục

X7b đã restore được app 93 bảng và marker `~/recovery-input/RECOVERED.txt`.

```bash
# HONOR X7b Termux (u0_a210)
unzip -o ~/Mini-Hosting-Cluster-v0.2-Online-Monitor.zip -d ~
bash ~/mini-hosting-warm-standby-v1/mini-hosting-cluster-v0.1/bin/install.sh
# BẮT BUỘC giữ không chạy public tunnel và local web khi standby
sv-disable mini-web && sv down mini-web
sv-disable named-tunnel && sv down named-tunnel
sv-disable tpp-backup || true
~/mhc join-standby 192.168.1.43 u0_a288 8022 X7b
# Khi hỏi Standby LAN IP, nhập: 192.168.1.35
~/mhc status --remote
~/standby-sync/status.sh
```

`join-standby` sẽ xác minh SSH, yêu cầu chấp nhận host fingerprint **sau khi bạn đối chiếu trên M51**, dùng `ssh-copy-id` để trao khóa với user SSH M51, kiểm tra cluster ID, ghi danh bạ trên Primary rồi khởi động sync + heartbeat. **Yêu cầu M51 SSH cổng 8022 đang nhận kết nối từ X7b.** Không dùng `StrictHostKeyChecking=no`.

> Nếu X7b chưa được khôi phục đủ, **không chạy** `join-standby`. Nếu dịch vụ `mini-web` còn chạy, nó sẽ từ chối, không tự tắt ngầm.

## Thêm Node03, Node04... với *cùng* bộ code

Trên điện thoại Termux mới:

```bash
# Lần đầu: cài hạ tầng từ cùng ZIP, dùng installer gốc trước
bash ~/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/bin/install-new-phone.sh
# Sau đó cài Cluster Agent (không ghi đè panel)
bash ~/mini-hosting-warm-standby-v1/mini-hosting-cluster-v0.1/bin/install.sh
# Clone ứng dụng + database + Sheet/Sheet+ đầy đủ và tự ghép cụm
~/mhc bootstrap-new 192.168.1.43 u0_a288 8022 Node03
```

Cần ít nhất ~3 GiB trống, SSH tới primary, snapshot VERIFIED và `~/mini-hosting-recovery.enc` còn trên primary, và **mật khẩu mã hóa** khi được hỏi (không lưu vào cluster). App/DB của node mới phải hoàn toàn **chưa tồn tại**, để không ghi đè. `bootstrap-new` từ chối phone đã có `.env` hay marker restore. Sau clone sẽ bật sync và heartbeat; website/tunnel node mới không được bật.

**Chú ý:** Do script restore ở package hiện tại có thể phục hồi token Cloudflare và tài khoản Panel vào node dự phòng, tuyệt đối giữ file cấu hình mã hóa riêng tư, dùng pin/khóa máy, giữ `named-tunnel` disabled và chưa được tự động promote.

## Xem dashboard từ Windows mà không public port

Mở Windows PowerShell:

```powershell
ssh -N -L 9092:127.0.0.1:9092 -p 8022 u0_a288@192.168.1.43
```

Mở http://127.0.0.1:9092 bằng trình duyệt PC. Nếu port 9092 Windows đã bận, dùng `-L 9192:127.0.0.1:9092` và mở http://127.0.0.1:9192.

## Nâng cấp code chung về sau

Chuyển cùng gói ZIP sang từng node và chạy lại `bin/install.sh`. Nó cập nhật **chỉ** các script của cluster và khởi động lại riêng dashboard 9092; không xóa `~/.config/mini-hosting-cluster/node.json`, không khởi động lại trang web hoặc database. Đừng chạy lại `init-primary` hay `bootstrap-new` trên máy đã được ghép.

## Troubleshooting

- `M51: Connection refused`: mở Termux trên M51, kiểm tra `ss -lnt | grep 8022`, `sv status sshd`, tránh khởi động lại M51 hoặc website.
- `Host key verification failed`: dùng `ssh-keygen -lf "$PREFIX/etc/ssh/ssh_host_ed25519_key.pub"` **trên M51** để so fingerprint; sau đó từ X7b kết nối SSH lần đầu và gõ `yes` nếu đã đối chiếu.
- `STOP: mini-web running`: trên node dự phòng dùng `sv-disable mini-web && sv down mini-web`, không thực hiện trên Primary M51.
- `STANDBY PREPARED`: snapshot được áp dụng vào slot riêng; vẫn cần xem thời điểm snapshot và kiểm tra hậu kỳ. **Không** suy ra đủ điều kiện auto failover.
- Trạng thái OFFLINE: heartbeat trên standby có thể bị hệ thống Android tắt nền, kiểm tra cài đặt pin + `termux-wake-lock`, cũng như dịch vụ `mhc-heartbeat`.
- `Already installed` của standby-sync legacy: script giữ nguyên cấu hình cũ, chưa tự di chuyển, cần nâng cấp có chủ đích; không xóa thư mục `~/standby-sync`.
