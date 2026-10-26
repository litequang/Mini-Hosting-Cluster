# Authority chung M2 — chuẩn bị, chưa chuyển Primary

Source: `reference/cluster-authority/worker.mjs`, `bin/cluster-authority.mjs` và Panel gốc 9090.
Domain mục tiêu người dùng xác nhận: `giaouoc.com`, quản trị dự kiến `panel.giaouoc.com`.

Trạng thái thực thi/test/commit: xem duy nhất [LIVE-PROGRESS.md](LIVE-PROGRESS.md). Tài liệu này mô tả giao thức và các bước cấu hình.

## Phạm vi đã có

Một Durable Object cho một cluster UUID, membership khai báo trước (tối đa 200), token riêng cho agent và Panel của từng node. Agent chỉ gửi heartbeat; Panel có session/CSRF hiện có mới yêu cầu begin/abort. Token chỉ đi server-to-server, không trả về trình duyệt.

Begin cần expectedRevision + requestId UUID + heartbeat đích còn mới. Transaction lưu pending, tăng revision/epoch và ghi receipt/audit cùng lúc. Cùng requestId/cùng nội dung trả receipt cũ; requestId khác nội dung bị từ chối. Pending không tự mất khi process khởi động lại và không tự đổi Primary. Abort chỉ hủy phiên chuẩn bị, không hoàn tác database/route.

Heartbeat dùng sequence tăng dần, timestamp trong 60 giây so với authority, thời điểm nhận do server ghi. Chưa báo cáo/kiểm chứng snapshot; heartbeat không chứng minh website khỏe. Đồng hồ node phải đúng.

Khi có `authority.json`, Panel đọc authority; cấu hình hỏng/mất kết nối hiện AUTHORITY_UNAVAILABLE. Manual/auto/role-accept cũ bị chặn, không fallback về local selection. Guard không cấp quyền writer từ bản ghi authority này. Không bật chế độ này trên một node đang phục vụ rồi kỳ vọng writer tiếp tục chạy.

**M2 chưa hoàn thành nghiệm thu**: chưa deploy Cloudflare, chưa có hai Panel Android dùng chung endpoint thật, chưa có tuyến quản trị chung dự phòng. `declaredPrimary=null`, `writeLeaseGranted=false`, nút complete không có trong chế độ chung. M3 phải bổ sung activation/fencing/route/HTTP identity trước commit. M4 mới dùng lại luồng đó cho Auto.

## Triển khai authority LAB khi sẵn sàng

### Người dùng thao tác Cloudflare; Codex chuẩn bị node

Trong PowerShell, tại checkout đúng branch:

```powershell
Set-Location E:\CODE\MHC\MHC\.work\repository\reference\cluster-authority
npx wrangler@4 login
npx wrangler@4 deploy
```

Chỉ tạo Worker mới `mhc-cluster-authority-lab` theo `wrangler.toml`, không chọn Worker production. Gửi lại URL `https://mhc-cluster-authority-lab.<account-subdomain>.workers.dev`; chưa có secrets thì API từ chối là đúng. Không cần domain riêng hoặc Access browser cho API authority (client dùng bearer riêng).

Trên từng node LAB, sau source upgrade, Codex dùng `~/mhc-full node init LABEL` nếu chưa có identity, rồi `~/mhc-full cluster-authority prepare`. Lệnh prepare tạo private `authority-enrollment.json` 0600, tái chạy giữ nguyên key; chỉ trả nodeId/label/path. Không tạo cluster controller cũ, không bật shared mode, không cấp Primary.

Codex gom các enrollment file qua SSH đã xác minh vào thư mục private 0700 trên một máy LAB, giữ mỗi file 0600. Chạy công cụ sau với UUID cluster cố định và **đầy đủ** danh sách node:

```sh
node reference/cluster-authority/prepare-secrets.mjs /PRIVATE/cloudflare-lab-secrets.json CLUSTER_UUID /PRIVATE/node-A-enrollment.json /PRIVATE/node-B-enrollment.json
```

Output phải ở ngoài source/Git; công cụ từ chối overwrite, duplicate ID/key và file không private. Khi thêm node, tạo file output mới với cùng UUID, giữ node/key cũ; không thay UUID của cluster đã có journal. JSON chứa cả `MHC_CLUSTER_ID` và `MHC_MEMBERS_JSON`, không mở/chép nội dung vào chat/log.

Với file đã chuẩn bị trên Vsmart tại đường dẫn dưới, người dùng nạp secrets qua stdin trong PowerShell (chỉ sau khi Codex xác nhận file tồn tại). Pipeline không in secrets và không lưu tại repo Windows:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_mhc_lab" -p 8022 -o BatchMode=yes -o StrictHostKeyChecking=yes u0_a180@192.168.1.4 'cat ~/mhc-lab-runs/m1-m2-20261026/cloudflare-lab-secrets.json' | npx wrangler@4 secret bulk
```

Nếu SSH hoặc Wrangler báo lỗi, không tự tiếp tục configure; xem thông báo đã lọc. [Wrangler secret bulk](https://developers.cloudflare.com/workers/wrangler/commands/workers/) hỗ trợ JSON qua stdin, tạo deployment mới. Không bật log debug/request body. Sau upload, Codex kiểm TLS/auth rồi cấu hình từng node:

```sh
~/mhc-full cluster-authority configure https://ACTUAL-LAB.workers.dev CLUSTER_UUID --confirm=CONFIGURE_LAB_PREPARE_ONLY
~/mhc-full cluster-authority heartbeat
~/mhc-full cluster-authority status
~/mhc-full cluster-authority service-install --confirm=INSTALL_LAB_AUTHORITY_AGENT
```

Configure kiểm cả hai credentials agent/Panel với endpoint trước khi ghi config; file existing khác bị từ chối. Runit agent chỉ heartbeat; không thay website, không thực hiện activation. Nếu có guard đang ARM, đánh giá trước vì PREPARE_ONLY không cấp quyền writer. Không coi cấu hình thành công là nghiệm thu M3.

### Tham khảo cấu hình secrets thủ công

1. Người dùng đăng nhập tài khoản Cloudflare quản lý `giaouoc.com`. Dùng Worker mới `mhc-cluster-authority-lab`, namespace DO riêng; không áp lên Worker/witness cũ.
2. Trong `reference/cluster-authority`, dùng Wrangler đã được cài/đăng nhập: `wrangler deploy`. Cấu hình đã khai báo class/migration SQLite.
3. Đặt `MHC_CLUSTER_ID` bằng `wrangler secret put MHC_CLUSTER_ID`: UUID cluster thống nhất.
4. Đặt `MHC_MEMBERS_JSON` bằng `wrangler secret put MHC_MEMBERS_JSON`. Nhập trực tiếp tại máy, không chat/commit. Giá trị là mảng `{nodeId,label,agentKey,panelKey}`; nodeId giữ identity riêng của từng điện thoại, mỗi key ngẫu nhiên base64url ít nhất 43 ký tự và không trùng bất kỳ key nào.
5. Endpoint có thể dùng hostname workers.dev vừa deploy. Chưa cần thêm DNS authority vào giaouoc.com. Client bắt buộc HTTPS, không chấp nhận redirect. Khi thiếu secrets, endpoint fail-closed.

Đừng tạo service token Access cho endpoint này rồi gửi nhầm cho Panel: bản M2 dùng bearer riêng của authority. Panel browser vẫn phải qua Access JWT + mật khẩu/CSRF khi được public.

## Cấu hình từng node LAB

Sau source upgrade, tạo private file `~/.config/mhc-full-installer/authority.json` (0600, directory 0700):

```json
{
  "schema": 1,
  "url": "https://YOUR-LAB-WORKER.workers.dev",
  "clusterId": "CLUSTER_UUID",
  "nodeId": "EXISTING_NODE_UUID",
  "agentTokenFile": "/ABSOLUTE/PRIVATE/PATH/agent-token",
  "panelTokenFile": "/ABSOLUTE/PRIVATE/PATH/panel-token"
}
```

Các token file là 0600, không symlink, không nằm trong source Git. Không copy node identity hay token giữa điện thoại. Membership được quản lý từ Cloudflare ở giai đoạn này; enrollment cũ không tự thêm vào authority.

```sh
~/mhc-full cluster-authority heartbeat
~/mhc-full cluster-authority status
~/mhc-full cluster-authority service-install --confirm=INSTALL_LAB_AUTHORITY_AGENT
```

Runit service `mhc-authority-agent` chỉ heartbeat mỗi 30 giây, không đổi role/services/route. Trên mỗi Panel: Cluster phải cùng revision/pending. Thử hai yêu cầu đồng thời, refresh sau lỗi revision, ngắt authority và kiểm lỗi cụ thể. Không dùng hai HOME giả lập để ghi PASS cho hai Android thật.

## Quản trị giaouoc.com và rollback

### Các thao tác tài khoản cho panel.giaouoc.com

1. Zone `giaouoc.com` phải Active trong tài khoản. Vào **Zero Trust → Access controls → Applications → Create new application → Self-hosted and private**, thêm public hostname `panel.giaouoc.com`.
2. Policy Allow giới hạn email quản trị; không dùng Bypass/Everyone. Chọn cách đăng nhập đang dùng (hoặc email One-time PIN đã cấu hình), lưu ứng dụng.
3. **Team Domain:** Zero Trust → Settings → Team name and domain. **AUD:** Applications → Configure ứng dụng Panel → Additional settings → Application Audience (AUD) Tag. Gửi hai giá trị này cho Codex; không gửi cookie/JWT/API token.
4. Tạo Tunnel LAB riêng `mhc-vsmart-lab` trong Networking → Tunnels (tên menu có thể là Networks → Connectors). Người dùng nhập token trực tiếp trên Vsmart vào private file, không chạy token trong command line/chat. Codex kiểm phiên bản cloudflared và cài runit bằng `--token-file` sau khi file có mặt.
5. Codex cấu hình origin JWT bằng `remote-panel configure panel.giaouoc.com TEAM.cloudflareaccess.com AUD --confirm=ENABLE_CLOUDFLARE_ACCESS_JWT` và restart riêng amh-panel. Sau đó thêm Published application route: hostname `panel.giaouoc.com`, service `http://127.0.0.1:9090`, giữ Host gốc; bật Protect with Access với đúng team/AUD.
6. Kiểm từ mạng ngoài: Access login → Panel login → session/CSRF. Codex kiểm HTTP/JWT trong phạm vi được truy cập. Không tự đổi DNS apex `giaouoc.com` hoặc đưa WordPress lên Internet trong bước Panel.

Tạo Access trước route và xác minh token ở origin theo [Cloudflare self-hosted application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/). Vị trí [Team Domain](https://developers.cloudflare.com/learning-paths/clientless-access/initial-setup/create-zero-trust-org/) và [AUD](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/). `--token-file` yêu cầu cloudflared từ 2025.4.0 theo [run parameters](https://developers.cloudflare.com/tunnel/reference/run-parameters/).

Một Tunnel chỉ trên Vsmart chưa đáp ứng Panel chung dự phòng; nghiệm thu còn cần node thứ hai và cơ chế tuyến quản trị riêng. Không gộp nhiều origin thiếu kiểm soát vào cùng đường ghi website.

Helper nhập token: `bash bin/prepare-panel-tunnel-token.sh` trong source trên Termux LAB (hoặc đường helper đã triển khai do Codex cung cấp). Chạy qua SSH `-t`; chỉ dán chuỗi sau `--token` từ lệnh Cloudflare. Helper ẩn ký tự và ghi `~/.config/mhc-full-installer/cloudflare-lab/tunnel-token` 0600, từ chối ghi đè. File không nằm trong site backup và không đưa lên Git. Nếu đã có token, không xóa mù để thử lại; kiểm đúng Tunnel trước.

Sau token và origin Access config, Codex chạy `bash bin/panel-tunnel-service.sh install --confirm=INSTALL_LAB_PANEL_TUNNEL`. Script chỉ tạo `mhc-panel-tunnel`, không sửa `named-tunnel`; từ chối service tồn tại. `bash bin/panel-tunnel-service.sh status` kiểm runit. Logs xoay vòng 1 MiB × 3 tại `~/.local/state/mhc-panel-tunnel`; không gửi raw logs/token lên Git. Tạm dừng connector này bằng `sv down "$PREFIX/var/service/mhc-panel-tunnel"`, khởi lại bằng `sv up` đúng service; Panel localhost và website vẫn độc lập.

- Giai đoạn một node: Tunnel riêng tới `http://127.0.0.1:9090`, hostname `panel.giaouoc.com`; Access policy cho email được phép; cấu hình origin JWT bằng `remote-panel` sau khi có team/AUD thực. Chưa tạo DNS hoặc nới origin allowlist ở lượt này.
- Giai đoạn nhiều node: tuyến quản trị phải độc lập web và có đích dự phòng. Không coi một CNAME trỏ Vsmart là quản trị còn sống khi Vsmart mất mạng. Chưa triển khai phần router này.
- Không hạ named-tunnel trong guard vì có thể đang chở Panel/agent. Giữ bản cấu hình guard cũ để đối chiếu; chưa ARM guard trên Vsmart.
- Rollback cấu hình shared chỉ thực hiện khi đã dừng agent/auto và đánh giá toàn bộ pending/role; đừng xóa authority.json để âm thầm bật lại local election. Worker/journal giữ nguyên để khôi phục.

## Cơ sở và test

Storage dùng transaction cho state/receipt/audit theo [Cloudflare SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/). Chi phí/quota/tài khoản chưa được thẩm định, không cam kết gói miễn phí đáp ứng vận hành.

`tests/cluster-authority.mjs`: concurrency, role separation, replay, restart, failed transaction, nonce và fail-closed bằng storage/transport fixture. `tests/authority-panel.mjs`: bridge dispatch và chặn legacy. Cloudflare runtime thật vẫn NOT RUN.
