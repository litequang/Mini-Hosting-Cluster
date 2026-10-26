# Mini Hosting Cluster v0.2 — Online Monitor

**Code được đóng gói, CHƯA triển khai vào Cloudflare hay các điện thoại.** Máy M51 vẫn chạy web production. Trong v0.2, Monitor chỉ đọc, chưa có tự động failover, không có nút Promote và không được dùng trạng thái quan sát làm bằng chứng phân xử quyền ghi.

## Kiến trúc

```
M51  -- HTTPS/60s --> telemetry.thophuong.com  --->  Cloudflare Worker + Durable Object (SQLite)
X7b  -- HTTPS/60s --> telemetry.thophuong.com  --->              |
Node03 ...                                                  telemetry
                                                               |
Admin browser -- Cloudflare Access --> monitor.thophuong.com --+ 
```

Monitor KHÔNG phụ thuộc M51 còn online để mở được trang. Mỗi node chủ động gửi thông số, không cần mở port 9090/9091/SSH ra Internet; không cần thêm Cloudflare Named Tunnel trên standby. Trên Cloudflare lưu đúng các số liệu được allowlist, KHÔNG gửi `.env`, mật khẩu, token Cloudflare, command line của tiến trình, tên Wi-Fi hoặc bản sao database.

Trạng thái "Ứng viên đang phục vụ" được suy ra từ mini-web RUN + named-tunnel RUN trên một node đang báo heartbeat gần đây. Đây CHỈ là quan sát, không xác nhận Cloudflare đang định tuyến tới node đó và không có bằng chứng GTID/fencing. Vai trò "primary" trong code v0.2 chỉ là cấu hình local.

## Triển khai Cloudflare bằng Windows PC

**Yêu cầu:** DNS `thophuong.com` do Cloudflare quản lý, quyền Cloudflare Workers + Zero Trust Access, Windows có Node.js/npm, kết nối Internet. Không thực hiện các lệnh này trên Termux M51 hoặc X7b. Không dùng cùng hostnames đã gán Tunnel; nếu `monitor`/`telemetry` đang tồn tại, kiểm tra và xử lý xung đột trước khi deploy.

1. Trên Cloudflare Zero Trust → Access → Applications → Add application → Self-hosted: bảo vệ **chính xác** hostname `monitor.thophuong.com`, Allow duy nhất email quản trị của bạn (hoặc chính sách nghiêm ngặt tương đương). **Không bảo vệ `telemetry.thophuong.com` bằng Access**, vì các agent dùng token ngẫu nhiên riêng. Ingest endpoint của telemetry sẽ tự xác thực token và chỉ nhận POST; mọi URL khác 404.
2. Từ Windows PowerShell giải nén ZIP bản v0.2, đi vào thư mục:

   ```powershell
   cd "$env:USERPROFILE\Downloads\mini-hosting-warm-standby-v1\mini-hosting-cluster-v0.1\online-monitor\cloudflare"
   npm install
   npx wrangler login
   ```

3. Thiết lập bí mật email được phép. Trong cùng PowerShell chạy:

   ```powershell
   npx wrangler secret put ACCESS_ALLOWED_EMAIL
   ```

   Nhập email **đúng email được chính sách Cloudflare Access cho phép**. Không đưa email này vào `wrangler.toml` hoặc code.

4. Triển khai:

   ```powershell
   npx wrangler deploy
   ```

   `wrangler.toml` chứa hai Custom Domains: `monitor.thophuong.com` và `telemetry.thophuong.com` — Cloudflare phải cho phép gán vào zone của bạn. Trường hợp CLI yêu cầu chọn zone/account, chọn đúng tài khoản đang quản lý `thophuong.com`.

5. Mở `https://monitor.thophuong.com`. Nếu chưa đăng nhập Cloudflare Access, phải bị chuyển tới trang đăng nhập, hoặc trả `403`. Chỉ cho tiếp tục khi đăng nhập tài khoản được phép. Ban đầu bảng sẽ chưa có node.

**Lưu ý:** Có hai bước Cloudflare mà ChatGPT không tự làm chỉ bằng file ZIP: tạo chính sách Access trong tài khoản của bạn và `wrangler deploy` qua phiên đăng nhập của bạn. Chưa làm thì URL vẫn chưa hoạt động.

## Cài chung code Cluster Agent trên M51 và X7b (KHÔNG chạy lại installer hạ tầng)

Nếu đây là lần đầu cài Mini Hosting Cluster v0.2:

**Samsung M51** (Termux u0_a288):

```bash
unzip -o ~/Mini-Hosting-Cluster-v0.2-Online-Monitor.zip -d ~
bash ~/mini-hosting-warm-standby-v1/mini-hosting-cluster-v0.1/bin/install.sh
~/mhc init-primary M51 --confirm=PRIMARY
~/mhc status
```

`init-primary` chỉ chạy đúng **một lần** khi node chưa khởi tạo. Nếu đã có cấu hình node v0.1 thì bỏ qua init, chỉ chạy install. `install.sh` không động tới MariaDB, Nginx, mini-web, Named Tunnel, ứng dụng Thờ Phượng Pro, backup hay hiện trạng website M51.

**HONOR X7b** (Termux u0_a210):

```bash
unzip -o ~/Mini-Hosting-Cluster-v0.2-Online-Monitor.zip -d ~
bash ~/mini-hosting-warm-standby-v1/mini-hosting-cluster-v0.1/bin/install.sh
sv-disable mini-web && sv down mini-web
sv-disable named-tunnel && sv down named-tunnel
sv-disable tpp-backup || true
~/mhc status
```

X7b đã khôi phục 93 bảng nên **không chạy lại** `restore-new-phone.sh`, `install-new-phone.sh` hay `bootstrap-new`. Trên X7b chỉ ghép cụm nếu chưa có identity:

```bash
~/mhc join-standby 192.168.1.43 u0_a288 8022 X7b
# Nhập LAN IP 192.168.1.35 khi được hỏi.
```

Trước đó phải xác nhận SSH từ X7b đến M51. Nếu bị từ chối kết nối/host key, kiểm tra `sshd` và đối chiếu fingerprint trên M51; KHÔNG bỏ kiểm tra host key. Ghép cluster này chỉ để đăng ký và đồng bộ snapshot, **không phải điều kiện bắt buộc để vào Cloud Monitor nếu identity đã có**.

Nếu chưa thiết lập snapshot sync, dữ liệu trên X7b vẫn là snapshot ngày 24/10/2026 03:04. Không tự suy ra dữ liệu đã đồng bộ tới hiện tại.

## Ghép Monitor Online cho từng node

1. Đăng nhập `https://monitor.thophuong.com` qua Cloudflare Access.
2. Chọn **Tạo mã ghép 10 phút**. Mã chỉ dùng một lần.
3. Trong **Termux của mỗi node** đang có `~/mhc status` hợp lệ, chạy:

   ```bash
   ~/mhc online-enroll MA_GHEP_TREN_TRANG_MONITOR
   ~/mhc online-status
   ~/mhc online-push
   sv status mhc-online
   ```

4. Khi thêm Node03: cài **cùng** bộ code, ghép cluster/khôi phục dữ liệu theo `README.md` của Cluster Agent, rồi tạo mã ghép Monitor mới. Không giới hạn cứng hai máy.

Sau ghép, dịch vụ `mhc-online` tự gửi số liệu mỗi 60 giây (đường ra HTTPS). Nếu không nhận heartbeat trong 180 giây, trang hiển thị Offline và thông số cuối cùng. Ở X7b không có Termux:API, các ô pin/nhiệt độ/Wi-Fi có thể để `—`; RAM, bộ nhớ, uptime và trạng thái service vẫn hoạt động.

Xem log lỗi nếu cần:

```bash
sv status mhc-online
tail -n 30 "$HOME/.local/state/mini-hosting-cluster/online-log/current"
```

## Bảo mật

- Trang `monitor.thophuong.com` yêu cầu **Cloudflare Access thật** và email khớp secret `ACCESS_ALLOWED_EMAIL`; Worker còn tự deny nếu cấu hình Access bị thiếu.
- Domain `telemetry.thophuong.com` không cung cấp dữ liệu xem, chỉ chấp nhận mã ghép 10 phút một lần và Bearer token riêng trên từng node.
- Các node gửi thông số cho Cloudflare theo phương thức OUTBOUND ONLY. Không thực thi lệnh từ Cloudflare.
- Token chỉ nằm trong `~/.config/mini-hosting-cluster/online.json` với permission 0600. **Không chia sẻ file này**. Nếu lộ token, trước khi tái ghép phải bổ sung cơ chế revoke/rotate credential ở Cloudflare (chưa có UI v0.2).
- Không cấp truy cập công khai vào `panel.thophuong.com` mà bỏ đăng nhập, không công khai API Node hoặc MariaDB.

## Những gì v0.2 KHÔNG làm

- KHÔNG đổi primary sang standby, không điều hướng `pro.thophuong.com`, không can thiệp Cloudflare Named Tunnel hiện hữu, không ngăn split-brain.
- KHÔNG đồng bộ tức thời; standby vẫn phụ thuộc snapshot hiện có (thường backup hàng ngày) cho tới phase MariaDB GTID/file sync.
- KHÔNG bảo đảm tất cả Termux đều chạy khi Android tắt màn hình; cần tắt tối ưu pin, cấp chạy nền, `termux-wake-lock`, Termux:Boot.
- KHÔNG tự bảo vệ khi một node còn online nhưng dữ liệu cũ; Monitor chỉ thể hiện độ trễ snapshot, không thay thế chứng cứ GTID.

## Thử nghiệm đã chạy

- `node --test tests/*.test.mjs online-monitor/cloudflare/tests/*.test.mjs`
- Kiểm tra phân quyền viewer, one-time pairing, auth từng node, allowlist dữ liệu và từ chối init primary trùng.
- Chưa chạy thử trên thiết bị Android thật hoặc Cloudflare tài khoản người dùng.
